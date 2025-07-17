import React, { useState, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import Sidebar from './components/Sidebar';
import FlowCanvas from './components/FlowCanvas';
import TestPanel from './components/TestPanel';
import ScenarioSaveModal from './components/ScenarioSaveModal';
// WebhookManager import 제거 (사용하지 않음)
import { Scenario, FlowNode, FlowEdge } from './types/scenario';
import { 
  convertNodesToScenario, 
  compareScenarios, 
  downloadScenarioAsJSON,
  ScenarioChanges 
} from './utils/scenarioUtils';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

function App() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [originalScenario, setOriginalScenario] = useState<Scenario | null>(null); // 원본 시나리오 보관
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [currentState, setCurrentState] = useState<string>('');
  const [isTestMode, setIsTestMode] = useState(false);
  const [testPanelWidth, setTestPanelWidth] = useState(400);
  const [isTestPanelResizing, setIsTestPanelResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(400);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scenarioChanges, setScenarioChanges] = useState<ScenarioChanges>({
    added: [],
    modified: [],
    removed: []
  });
  const [newScenario, setNewScenario] = useState<Scenario | null>(null);
  
  // 로딩 상태 추가
  const [isLoading, setIsLoading] = useState(false);
  const [loadingTime, setLoadingTime] = useState<number | null>(null);
  const loadingStartTimeRef = useRef<number>(0);

  const testPanelResizeRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<HTMLDivElement>(null);

  // 로딩 시작 함수 (파일 선택 시 즉시 호출)
  const handleLoadingStart = useCallback((startTime?: number) => {
    const actualStartTime = startTime || performance.now();
    console.log('🚀 로딩 시작 - 파일 선택됨, 시작 시간:', actualStartTime);
    
    // useRef로 시작 시간 저장
    loadingStartTimeRef.current = actualStartTime;
    
    flushSync(() => {
      setIsLoading(true);
      setLoadingTime(null);
    });
    
    console.log('✅ [TIMING] loadingStartTimeRef.current 설정:', loadingStartTimeRef.current);
  }, []);

  // 초기 상태 결정 함수
  const getInitialState = useCallback((scenario: Scenario): string => {
    if (!scenario.plan || scenario.plan.length === 0) return '';
    
    const dialogStates = scenario.plan[0].dialogState;
    if (!dialogStates || dialogStates.length === 0) return '';
    
    // Start가 있으면 선택
    const startState = dialogStates.find(state => state.name === 'Start');
    if (startState) {
      console.log('🎯 Start 상태를 초기 상태로 설정');
      return 'Start';
    }
    
    // Start가 없으면 첫 번째 상태 선택
    console.log('🎯 첫 번째 상태를 초기 상태로 설정:', dialogStates[0].name);
    return dialogStates[0].name;
  }, []);

  const handleScenarioLoad = useCallback((loadedScenario: Scenario) => {
    const scenarioProcessStartTime = performance.now();
    console.log('🔄 [TIMING] 시나리오 데이터 처리 시작');
    
    // 로딩 상태는 이미 handleLoadingStart에서 설정됨
    // 다음 프레임에서 실제 처리 시작 (UI 업데이트 보장)
    requestAnimationFrame(() => {
      try {
        const rafStartTime = performance.now();
        console.log('⏱️ [TIMING] requestAnimationFrame 실행까지:', (rafStartTime - scenarioProcessStartTime).toFixed(2), 'ms');
        
        // 시나리오 상태 설정
        const stateSetStartTime = performance.now();
        setScenario(loadedScenario);
        setOriginalScenario(JSON.parse(JSON.stringify(loadedScenario))); // 깊은 복사로 원본 보관
        const stateSetTime = performance.now() - stateSetStartTime;
        console.log('⏱️ [TIMING] 시나리오 상태 설정:', stateSetTime.toFixed(2), 'ms');
        
        // JSON을 Flow 노드와 엣지로 변환
        const conversionStartTime = performance.now();
        convertScenarioToFlow(loadedScenario);
        const conversionTime = performance.now() - conversionStartTime;
        console.log('⏱️ [TIMING] Flow 노드/엣지 변환:', conversionTime.toFixed(2), 'ms');
        
        // 초기 상태 설정 (개선된 로직)
        const initialStateStartTime = performance.now();
        const initialState = getInitialState(loadedScenario);
        if (initialState) {
          setCurrentState(initialState);
          console.log('🎯 초기 상태 설정:', initialState);
        }
        const initialStateTime = performance.now() - initialStateStartTime;
        console.log('⏱️ [TIMING] 초기 상태 설정:', initialStateTime.toFixed(2), 'ms');
        
        // 로딩 완료 처리 (최소 800ms는 로딩 상태 유지)
        const endTime = performance.now();
        console.log('⏱️ [TIMING] endTime 설정:', endTime.toFixed(2), 'ms');
        console.log('⏱️ [TIMING] loadingStartTime 설정:', loadingStartTimeRef.current.toFixed(2), 'ms');
        const totalTime = endTime - loadingStartTimeRef.current; // loadingStartTime 사용
        const processingTime = endTime - scenarioProcessStartTime;
        
        console.log('📊 [TIMING] 시나리오 처리 세부 분석:');
        console.log('  - 상태 설정:', stateSetTime.toFixed(2), 'ms', `(${(stateSetTime/processingTime*100).toFixed(1)}%)`);
        console.log('  - Flow 변환:', conversionTime.toFixed(2), 'ms', `(${(conversionTime/processingTime*100).toFixed(1)}%)`);
        console.log('  - 초기 상태:', initialStateTime.toFixed(2), 'ms', `(${(initialStateTime/processingTime*100).toFixed(1)}%)`);
        console.log('⏱️ [TIMING] 총 처리 시간:', processingTime.toFixed(2), 'ms');
        console.log('⏱️ [TIMING] 전체 로딩 시간:', totalTime.toFixed(2), 'ms');
        
        const minLoadingTime = 800; // 최소 800ms 로딩 표시
        const remainingTime = Math.max(0, minLoadingTime - totalTime);
        
        setTimeout(() => {
          setLoadingTime(Math.round(totalTime));
          setIsLoading(false);
          console.log(`✅ [TIMING] 시나리오 로딩 완료: ${totalTime.toFixed(0)}ms (표시: ${Math.round(totalTime + remainingTime)}ms)`);
        }, remainingTime);
        
      } catch (error) {
        console.error('❌ [TIMING] 시나리오 로딩 에러:', error);
        setIsLoading(false);
        setLoadingTime(null);
        alert('❌ 시나리오 로딩 중 오류가 발생했습니다: ' + (error as Error).message);
      }
    });
  }, [getInitialState]);

  const convertScenarioToFlow = (scenario: Scenario) => {
    const convertStartTime = performance.now();
    console.log('🔄 [TIMING] convertScenarioToFlow 시작');
    
    if (!scenario.plan || scenario.plan.length === 0) return;
    
    const dialogStates = scenario.plan[0].dialogState;
    console.log('⏱️ [TIMING] dialogStates 수:', dialogStates.length);
    
    const newNodes: FlowNode[] = [];
    const newEdges: FlowEdge[] = [];
    
    // 노드 생성
    const nodeCreationStartTime = performance.now();
    dialogStates.forEach((state, index) => {
      const node: FlowNode = {
        id: state.name,
        type: 'default',
        position: { 
          x: (index % 3) * 250, 
          y: Math.floor(index / 3) * 150 
        },
        data: {
          label: state.name,
          dialogState: state
        }
      };
      newNodes.push(node);
    });
    const nodeCreationTime = performance.now() - nodeCreationStartTime;
    console.log('⏱️ [TIMING] 노드 생성:', nodeCreationTime.toFixed(2), 'ms');

    // 엣지 생성 (전이 관계 분석)
    const edgeCreationStartTime = performance.now();
    let conditionEdgeCount = 0;
    let intentEdgeCount = 0;
    let eventEdgeCount = 0;
    
    dialogStates.forEach((state) => {
      // Condition handlers에서 전이 관계 추출
      state.conditionHandlers?.forEach((handler, idx) => {
        if (handler.transitionTarget.dialogState && 
            handler.transitionTarget.dialogState !== '__END_SESSION__') {
          const edge: FlowEdge = {
            id: `${state.name}-condition-${idx}`,
            source: state.name,
            target: handler.transitionTarget.dialogState,
            label: `조건: ${handler.conditionStatement}`,
            type: 'smoothstep'
          };
          newEdges.push(edge);
          conditionEdgeCount++;
        }
      });

      // Intent handlers에서 전이 관계 추출
      state.intentHandlers?.forEach((handler, idx) => {
        if (handler.transitionTarget.dialogState) {
          const edge: FlowEdge = {
            id: `${state.name}-intent-${idx}`,
            source: state.name,
            target: handler.transitionTarget.dialogState,
            label: `인텐트: ${handler.intent}`,
            type: 'smoothstep'
          };
          newEdges.push(edge);
          intentEdgeCount++;
        }
      });

      // Event handlers에서 전이 관계 추출
      state.eventHandlers?.forEach((handler, idx) => {
        if (handler.transitionTarget.dialogState && 
            handler.transitionTarget.dialogState !== '__CURRENT_DIALOG_STATE__') {
          // event 필드 안전하게 처리
          let eventType = '';
          if (handler.event) {
            if (typeof handler.event === 'object' && handler.event.type) {
              eventType = handler.event.type;
            } else if (typeof handler.event === 'string') {
              eventType = handler.event;
            }
          }
          
          const edge: FlowEdge = {
            id: `${state.name}-event-${idx}`,
            source: state.name,
            target: handler.transitionTarget.dialogState,
            label: `이벤트: ${eventType}`,
            type: 'smoothstep'
          };
          newEdges.push(edge);
          eventEdgeCount++;
        }
      });
    });
    
    const edgeCreationTime = performance.now() - edgeCreationStartTime;
    console.log('⏱️ [TIMING] 엣지 생성:', edgeCreationTime.toFixed(2), 'ms');
    console.log('📊 [TIMING] 엣지 종류별 개수:');
    console.log('  - Condition 엣지:', conditionEdgeCount);
    console.log('  - Intent 엣지:', intentEdgeCount);
    console.log('  - Event 엣지:', eventEdgeCount);
    console.log('  - 총 엣지:', newEdges.length);

    // 상태 설정
    const stateUpdateStartTime = performance.now();
    setNodes(newNodes);
    setEdges(newEdges);
    const stateUpdateTime = performance.now() - stateUpdateStartTime;
    
    const totalConversionTime = performance.now() - convertStartTime;
    console.log('⏱️ [TIMING] 상태 업데이트:', stateUpdateTime.toFixed(2), 'ms');
    console.log('⏱️ [TIMING] convertScenarioToFlow 총 시간:', totalConversionTime.toFixed(2), 'ms');
    console.log('📊 [TIMING] 변환 세부 분석:');
    console.log('  - 노드 생성:', nodeCreationTime.toFixed(2), 'ms', `(${(nodeCreationTime/totalConversionTime*100).toFixed(1)}%)`);
    console.log('  - 엣지 생성:', edgeCreationTime.toFixed(2), 'ms', `(${(edgeCreationTime/totalConversionTime*100).toFixed(1)}%)`);
    console.log('  - 상태 업데이트:', stateUpdateTime.toFixed(2), 'ms', `(${(stateUpdateTime/totalConversionTime*100).toFixed(1)}%)`);
  };

  const handleNodeSelect = useCallback((node: FlowNode | null) => {
    setSelectedNode(node);
  }, []);

  // 테스트 모드 토글 및 자동 전이 처리
  const handleTestModeToggle = useCallback(async () => {
    const newTestMode = !isTestMode;
    setIsTestMode(newTestMode);
    
    // 테스트 패널 크기 조정
    if (newTestMode) {
      setTestPanelWidth(800); // 테스트 모드 켜질 때 최대 크기로 설정
    } else {
      setTestPanelWidth(400); // 테스트 모드 꺼질 때 기본 크기로 복원
    }
    
    if (newTestMode && scenario) {
      console.log('🚀 테스트 모드 시작 - 현재 상태:', currentState);
      
      // 현재 상태에서 자동 전이 확인
      const currentDialogState = scenario.plan[0]?.dialogState.find(state => state.name === currentState);
      if (currentDialogState) {
        // Event handler가 있는지 확인
        const hasEventHandlers = currentDialogState.eventHandlers && currentDialogState.eventHandlers.length > 0;
        
        if (hasEventHandlers) {
          console.log(`🎯 ${currentState} 상태에 이벤트 핸들러가 있습니다. 사용자가 수동으로 트리거해야 합니다.`);
          return; // 자동 전이하지 않고 사용자 이벤트 대기
        }
        
        // Event handler가 없으면 기존 로직 실행 (조건 핸들러 확인)
        const trueConditionHandler = currentDialogState.conditionHandlers?.find(
          handler => handler.conditionStatement === 'True'
        );
        
        if (trueConditionHandler) {
          const targetState = trueConditionHandler.transitionTarget.dialogState;
          console.log(`⚡ 조건 전이: ${currentState} → ${targetState}`);
          setCurrentState(targetState);
        }
      }
    }
  }, [isTestMode, scenario, currentState]);

  // 테스트 패널 리사이즈 핸들러 (오른쪽 사이드)
  const handleTestPanelMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsTestPanelResizing(true);
    
    const startX = e.clientX;
    const startWidth = testPanelWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startX - e.clientX; // 마우스를 왼쪽으로 이동하면 양수
      const newWidth = Math.max(300, Math.min(800, startWidth + deltaX)); // 최소 300px, 최대 800px
      setTestPanelWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsTestPanelResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [testPanelWidth]);

  // Sidebar 리사이즈 핸들러
  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsSidebarResizing(true);
    
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startX; // 마우스를 오른쪽으로 움직이면 양수
      const newWidth = Math.max(250, Math.min(600, startWidth + deltaX)); // 최소 250px, 최대 600px
      setSidebarWidth(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsSidebarResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidebarWidth]);

  // 노드 변경 시 시나리오 업데이트
  const handleNodesChange = useCallback((newNodes: FlowNode[]) => {
    setNodes(newNodes);
    
    // 시나리오가 있으면 업데이트
    if (scenario) {
      const updatedScenario = { ...scenario };
      if (updatedScenario.plan && updatedScenario.plan.length > 0) {
        // 새로운 dialogState 배열 생성
        const newDialogStates = newNodes.map(node => node.data.dialogState);
        updatedScenario.plan[0].dialogState = newDialogStates;
        setScenario(updatedScenario);
        console.log('🔄 시나리오 업데이트됨:', updatedScenario);
      }
    }
  }, [scenario]);

  // 연결 변경 시 처리 (현재는 UI에서만 관리, 향후 확장 가능)
  const handleEdgesChange = useCallback((newEdges: FlowEdge[]) => {
    setEdges(newEdges);
    console.log('🔗 연결 변경됨:', newEdges);
  }, []);

  // 시나리오 저장 처리
  const handleScenarioSave = useCallback(() => {
    if (!originalScenario && nodes.length === 0) {
      alert('저장할 시나리오가 없습니다.');
      return;
    }

    // 현재 노드들을 시나리오로 변환
    const convertedScenario = convertNodesToScenario(nodes, originalScenario);
    
    // 변경사항 비교
    const changes = compareScenarios(nodes, originalScenario);
    
    setNewScenario(convertedScenario);
    setScenarioChanges(changes);
    setSaveModalOpen(true);
  }, [nodes, originalScenario]);

  // 즉시 반영 저장 처리 (새로운 기능)
  const handleApplyChanges = useCallback(() => {
    if (!originalScenario && nodes.length === 0) {
      alert('적용할 시나리오가 없습니다.');
      return;
    }

    try {
      // 현재 노드들을 시나리오로 변환
      const convertedScenario = convertNodesToScenario(nodes, originalScenario);
      
      // 변경사항 비교
      const changes = compareScenarios(nodes, originalScenario);
      
      // 즉시 현재 시나리오에 반영
      setScenario(convertedScenario);
      
      // 원본 시나리오도 업데이트 (변경사항 표시 초기화를 위해)
      setOriginalScenario(JSON.parse(JSON.stringify(convertedScenario)));
      
      // 엣지 재생성 (전이 관계 업데이트)
      convertScenarioToFlow(convertedScenario);
      
      // 초기 상태 재설정 (새로운 시나리오 기준)
      const newInitialState = getInitialState(convertedScenario);
      if (newInitialState) {
        // 현재 상태가 여전히 존재하는지 확인
        const currentStateExists = convertedScenario.plan[0]?.dialogState.some(state => state.name === currentState);
        if (!currentStateExists) {
          // 현재 상태가 삭제되었다면 새로운 초기 상태로 설정
          setCurrentState(newInitialState);
          console.log('🔄 현재 상태가 삭제되어 새로운 초기 상태로 변경:', newInitialState);
        } else if (currentState !== newInitialState && !currentState) {
          // 현재 상태가 없다면 새로운 초기 상태로 설정
          setCurrentState(newInitialState);
          console.log('🔄 새로운 초기 상태로 변경:', newInitialState);
        }
      }
      
      // 성공 메시지 표시
      const changeCount = changes.added.length + changes.modified.length + changes.removed.length;
      if (changeCount > 0) {
        alert(`✅ 변경사항이 즉시 반영되었습니다!\n- 추가: ${changes.added.length}개\n- 수정: ${changes.modified.length}개\n- 삭제: ${changes.removed.length}개\n\n초기 상태: ${newInitialState}\n이제 테스트 모드에서 변경된 시나리오를 확인할 수 있습니다.`);
      } else {
        alert('ℹ️ 변경사항이 없습니다.');
      }
      
      console.log('🚀 시나리오 즉시 반영 완료:', convertedScenario);
      
    } catch (error) {
      console.error('시나리오 반영 오류:', error);
      alert('❌ 시나리오 반영 중 오류가 발생했습니다: ' + (error as Error).message);
    }
  }, [nodes, originalScenario, currentState, getInitialState]);

  // 모달에서 최종 저장 처리
  const handleSaveConfirm = useCallback((filename: string) => {
    if (newScenario) {
      downloadScenarioAsJSON(newScenario, filename);
      console.log('📁 시나리오 저장 완료:', filename);
    }
  }, [newScenario]);

  // TestPanel에서 시나리오 업데이트 처리
  const handleScenarioUpdate = useCallback((updatedScenario: Scenario) => {
    setScenario(updatedScenario);
    // originalScenario도 업데이트하여 변경사항이 올바르게 반영되도록 함
    setOriginalScenario(JSON.parse(JSON.stringify(updatedScenario)));
    console.log('🔄 시나리오 업데이트됨 (Intent Mapping 포함):', updatedScenario);
  }, []);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ display: 'flex', height: '100vh' }}>
        {/* Sidebar with Resize Handle */}
        <Box sx={{ 
          width: sidebarWidth, 
          minWidth: sidebarWidth,
          maxWidth: sidebarWidth,
          flexShrink: 0,
          position: 'relative',
          borderRight: 1,
          borderColor: 'divider'
        }}>
                    <Sidebar
            scenario={scenario}
            selectedNode={selectedNode}
            onScenarioLoad={handleScenarioLoad}
            onLoadingStart={handleLoadingStart}
            onScenarioSave={handleScenarioSave}
            onApplyChanges={handleApplyChanges}
            nodes={nodes}
            originalScenario={originalScenario}
            onNodeUpdate={(updatedNode) => {
              setNodes(nodes => 
                nodes.map(node => node.id === updatedNode.id ? updatedNode : node)
              );
            }}
            isLoading={isLoading}
            loadingTime={loadingTime}
          />
          
          {/* Sidebar Resize Handle */}
          <Box
            ref={sidebarResizeRef}
            onMouseDown={handleSidebarMouseDown}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: '6px',
              cursor: 'ew-resize',
              backgroundColor: isSidebarResizing ? '#1976d2' : 'transparent',
              borderRight: isSidebarResizing ? '2px solid #1976d2' : '1px solid #e0e0e0',
              zIndex: 1000,
              '&:hover': {
                backgroundColor: '#f0f0f0',
                borderRight: '2px solid #1976d2',
              },
              '&::before': {
                content: '""',
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '4px',
                height: '40px',
                backgroundColor: isSidebarResizing ? '#1976d2' : '#ccc',
                borderRadius: '2px',
                transition: 'background-color 0.2s ease',
              },
              '&:hover::before': {
                backgroundColor: '#1976d2',
              }
            }}
          />
        </Box>

        {/* Main Content - Canvas */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row' }}>
          {/* Canvas */}
          <Box sx={{ 
            flex: 1, 
            height: '100vh'
          }}>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodeSelect={handleNodeSelect}
              currentState={currentState}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              scenario={scenario || undefined}
            />
          </Box>

          {/* Test Panel - Right Side */}
          {isTestMode && (
            <Box sx={{ 
              width: testPanelWidth, 
              minWidth: testPanelWidth,
              maxWidth: testPanelWidth,
              flexShrink: 0,
              position: 'relative',
              borderLeft: 1,
              borderColor: 'divider'
            }}>
              {/* Test Panel Resize Handle */}
              <Box
                ref={testPanelResizeRef}
                onMouseDown={handleTestPanelMouseDown}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  bottom: 0,
                  width: '6px',
                  cursor: 'ew-resize',
                  backgroundColor: isTestPanelResizing ? '#1976d2' : 'transparent',
                  borderLeft: isTestPanelResizing ? '2px solid #1976d2' : '1px solid #e0e0e0',
                  zIndex: 1000,
                  '&:hover': {
                    backgroundColor: '#f0f0f0',
                    borderLeft: '2px solid #1976d2',
                  },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '4px',
                    height: '40px',
                    backgroundColor: isTestPanelResizing ? '#1976d2' : '#ccc',
                    borderRadius: '2px',
                    transition: 'background-color 0.2s ease',
                  },
                  '&:hover::before': {
                    backgroundColor: '#1976d2',
                  }
                }}
              />
              
              {/* Test Panel Content */}
              <Box sx={{ flex: 1, paddingLeft: '6px', height: '100vh', overflow: 'hidden' }}>
                          <TestPanel
            scenario={scenario}
            currentState={currentState}
            onStateChange={setCurrentState}
            onScenarioUpdate={handleScenarioUpdate}
          />
              </Box>
            </Box>
          )}
        </Box>

        {/* Test Mode Toggle */}
        <Box 
          sx={{ 
            position: 'fixed', 
            bottom: 16, 
            left: 16,
            zIndex: 1000 
          }}
        >
          <button
            onClick={handleTestModeToggle}
            style={{
              padding: '12px 24px',
              backgroundColor: isTestMode ? '#1976d2' : '#f5f5f5',
              color: isTestMode ? 'white' : 'black',
              border: '1px solid #ccc',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
          >
            {isTestMode ? '테스트 모드 OFF' : '테스트 모드 ON'}
          </button>
        </Box>

        {/* 현재 상태 표시 */}
        {currentState && (
          <Box 
            sx={{ 
              position: 'fixed', 
              left: 16,
              bottom: 80,
              zIndex: 1001,
              backgroundColor: '#1976d2',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 'bold',
              boxShadow: 2,
            }}
          >
            현재 상태: {currentState}
          </Box>
        )}

        {/* 시나리오 저장 확인 모달 */}
        <ScenarioSaveModal
          open={saveModalOpen}
          onClose={() => setSaveModalOpen(false)}
          onSave={handleSaveConfirm}
          changes={scenarioChanges}
          newScenario={newScenario || scenario || {
            plan: [{ name: "MainPlan", dialogState: [] }],
            botConfig: { botType: "CONVERSATIONAL" },
            intentMapping: [],
            multiIntentMapping: [],
            handlerGroups: [],
            webhooks: [],
            dialogResult: "END_SESSION"
          }}
        />
      </Box>
    </ThemeProvider>
  );
}

export default App; 