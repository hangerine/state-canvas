import React, { useState, useCallback, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import Sidebar from './components/Sidebar';
import FlowCanvas from './components/FlowCanvas';
import TestPanel from './components/TestPanel';
import ScenarioSaveModal from './components/ScenarioSaveModal';
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
  const [testPanelHeight, setTestPanelHeight] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [scenarioChanges, setScenarioChanges] = useState<ScenarioChanges>({
    added: [],
    modified: [],
    removed: []
  });
  const [newScenario, setNewScenario] = useState<Scenario | null>(null);
  
  const resizeRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<HTMLDivElement>(null);

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
    setScenario(loadedScenario);
    setOriginalScenario(JSON.parse(JSON.stringify(loadedScenario))); // 깊은 복사로 원본 보관
    // JSON을 Flow 노드와 엣지로 변환
    convertScenarioToFlow(loadedScenario);
    
    // 초기 상태 설정 (개선된 로직)
    const initialState = getInitialState(loadedScenario);
    if (initialState) {
      setCurrentState(initialState);
      console.log('🎯 초기 상태 설정:', initialState);
    }
  }, [getInitialState]);

  const convertScenarioToFlow = (scenario: Scenario) => {
    if (!scenario.plan || scenario.plan.length === 0) return;
    
    const dialogStates = scenario.plan[0].dialogState;
    const newNodes: FlowNode[] = [];
    const newEdges: FlowEdge[] = [];
    
    // 노드 생성
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

    // 엣지 생성 (전이 관계 분석)
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
        }
      });
    });

    setNodes(newNodes);
    setEdges(newEdges);
  };

  const handleNodeSelect = useCallback((node: FlowNode | null) => {
    setSelectedNode(node);
  }, []);

  // 테스트 모드 토글 및 자동 전이 처리
  const handleTestModeToggle = useCallback(async () => {
    const newTestMode = !isTestMode;
    setIsTestMode(newTestMode);
    
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

  // 테스트 패널 리사이즈 핸들러
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startY = e.clientY;
    const startHeight = testPanelHeight;
    
    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = startY - e.clientY; // 마우스를 위로 올리면 양수
      const newHeight = Math.max(150, Math.min(600, startHeight + deltaY)); // 최소 150px, 최대 600px
      setTestPanelHeight(newHeight);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [testPanelHeight]);

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
            onScenarioSave={handleScenarioSave}
            onApplyChanges={handleApplyChanges}
            nodes={nodes}
            originalScenario={originalScenario}
            onNodeUpdate={(updatedNode) => {
              setNodes(nodes => 
                nodes.map(node => node.id === updatedNode.id ? updatedNode : node)
              );
            }}
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

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          {/* Canvas */}
          <Box sx={{ 
            flex: 1, 
            // 테스트 모드일 때 Canvas 높이를 조정
            height: isTestMode ? `calc(100vh - ${testPanelHeight}px)` : '100vh'
          }}>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodeSelect={handleNodeSelect}
              currentState={currentState}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
            />
          </Box>

          {/* Test Panel */}
          {isTestMode && (
            <Box 
              sx={{ 
                height: testPanelHeight, 
                minHeight: testPanelHeight,
                maxHeight: testPanelHeight,
                borderTop: 1, 
                borderColor: 'divider',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
              }}
            >
              {/* Test Panel Resize Handle */}
              <Box
                ref={resizeRef}
                onMouseDown={handleMouseDown}
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: '6px',
                  cursor: 'ns-resize',
                  backgroundColor: isResizing ? '#1976d2' : 'transparent',
                  borderTop: isResizing ? '2px solid #1976d2' : '1px solid #e0e0e0',
                  zIndex: 1000,
                  '&:hover': {
                    backgroundColor: '#f0f0f0',
                    borderTop: '2px solid #1976d2',
                  },
                  '&::before': {
                    content: '""',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '40px',
                    height: '4px',
                    backgroundColor: isResizing ? '#1976d2' : '#ccc',
                    borderRadius: '2px',
                    transition: 'background-color 0.2s ease',
                  },
                  '&:hover::before': {
                    backgroundColor: '#1976d2',
                  }
                }}
              />
              
              {/* Test Panel Content */}
              <Box sx={{ flex: 1, paddingTop: '6px' }}>
                <TestPanel
                  scenario={scenario}
                  currentState={currentState}
                  onStateChange={setCurrentState}
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
            right: 16, 
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
              top: 16, 
              right: 16, 
              zIndex: 1000,
              backgroundColor: '#1976d2',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: 'bold'
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