import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  validateScenarioTransition,
  ScenarioChanges,
  removeApiCallUrlsFromScenario,
  cleanScenarioForSave
} from './utils/scenarioUtils';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

function App() {
  const [scenarios, setScenarios] = useState<{ [key: string]: Scenario }>({});
  const [activeScenarioId, setActiveScenarioId] = useState<string>('');
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
  // convertScenarioToFlow 호출을 안전하게 래핑하기 위한 ref
  const convertScenarioToFlowRef = useRef<(scenario: Scenario) => void>();
  const invokeConvertScenarioToFlow = useCallback((scenario: Scenario) => {
    if (convertScenarioToFlowRef.current) {
      convertScenarioToFlowRef.current(scenario);
    }
  }, []);
  // 최초 레이아웃 위치 기억용
  const initialPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    // scenarios가 변경될 때마다 로그 출력 (디버깅용)
    if (Object.keys(scenarios).length > 0) {
      console.log('전체 시나리오 구조:', scenarios);
      Object.entries(scenarios).forEach(([id, scenario]) => {
        console.log(`[${id}] 시나리오 정보:`, {
          name: scenario.plan[0]?.name,
          dialogStateCount: scenario.plan[0]?.dialogState?.length || 0,
          botType: scenario.botConfig?.botType
        });
      });
    }
  }, [scenarios]);

  // 새 시나리오 생성 함수
    const createNewScenario = useCallback(() => {
    const scenarioId = `scenario-${Date.now()}`;
    const startDialogState = {
      name: 'Start',
      entryAction: {
        directives: [
          {
            name: "speak",
            content: "새로운 시나리오가 시작되었습니다."
          }
        ],
        webhookActions: []
      },
      conditionHandlers: [],
      eventHandlers: [],
      intentHandlers: [],
      webhookActions: [],
      slotFillingForm: []
    };
    const newScenario: Scenario = {
      plan: [{
        name: `새 시나리오 ${Object.keys(scenarios).length + 1}`,
        dialogState: [startDialogState]
      }],
      botConfig: { botType: 'CONVERSATIONAL' },
      intentMapping: [],
      multiIntentMapping: [],
      handlerGroups: [],
      webhooks: [],
      dialogResult: 'END_SESSION'
    };

    setScenarios(prev => ({
      ...prev,
      [scenarioId]: newScenario
    }));
    setActiveScenarioId(scenarioId);
    setScenario(newScenario);
    setOriginalScenario(JSON.parse(JSON.stringify(newScenario)));
    
    // Start node를 FlowNode로 생성
    setNodes([
      {
        id: 'Start',
        type: 'custom',
        position: { x: 300, y: 200 },
        data: {
          label: 'Start',
          dialogState: startDialogState
        }
      }
    ]);
    setEdges([]);
    setCurrentState('Start');
    
    console.log('🆕 새 시나리오 생성됨:', scenarioId);
  }, [scenarios]);

  

  // 시나리오 전환 함수
  // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-use-before-define
  const switchScenario = useCallback((scenarioId: string) => {
    const targetScenario = scenarios[scenarioId];
    if (targetScenario && activeScenarioId !== scenarioId) {
      // 현재 시나리오의 변경사항을 임시 저장
      let currentChanges = null;
      if (activeScenarioId && nodes.length > 0) {
        try {
          currentChanges = convertNodesToScenario(nodes, edges, originalScenario, scenarios[activeScenarioId]?.plan[0]?.name, scenarios);
          console.log('💾 현재 시나리오 변경사항 임시 저장:', currentChanges);
        } catch (error) {
          console.warn('⚠️ 현재 시나리오 변경사항 저장 실패:', error);
        }
      }
      
      setActiveScenarioId(scenarioId);
      setScenario(targetScenario);
      
      // 기존 노드와 엣지를 완전히 초기화 (동기 플러시)
      console.log('🧹 [INFO] 기존 상태 초기화 시작 (flushSync)');
      flushSync(() => {
        setNodes([]);
        setEdges([]);
      });
      
      // 새 시나리오를 플로우로 변환 (기존 상태 무시)
      invokeConvertScenarioToFlow(targetScenario);
      
      // convertScenarioToFlow 완료 후 originalScenario 설정
      // 원본 시나리오만 설정 (자동 생성된 종료 노드는 포함하지 않음)
      setOriginalScenario(JSON.parse(JSON.stringify(targetScenario)));
      
      console.log('🔄 시나리오 전환됨:', scenarioId);
      console.log('📊 새 시나리오 노드 수:', targetScenario.plan[0]?.dialogState?.length || 0);
      
      // 이전 시나리오의 변경사항이 있었다면 경고
      if (currentChanges) {
        const changeCount = (currentChanges.plan[0]?.dialogState?.length || 0) - (originalScenario?.plan[0]?.dialogState?.length || 0);
        if (changeCount > 0) {
          console.warn(`⚠️ 이전 시나리오에 ${changeCount}개의 변경사항이 있었습니다. 저장 후 전환하는 것을 권장합니다.`);
        }
      }
    } else {
      console.log('⚠️ 이미 활성화된 시나리오이거나 시나리오를 찾을 수 없습니다:', scenarioId);
    }
  }, [scenarios, activeScenarioId, nodes, edges, originalScenario, invokeConvertScenarioToFlow]);

  // 시나리오 이름 변경 함수
  const updateScenarioName = useCallback((scenarioId: string, newName: string) => {
    if (!newName.trim()) {
      alert('시나리오 이름을 입력해주세요.');
      return;
    }

    setScenarios(prev => {
      const newScenarios = { ...prev };
      const scenario = newScenarios[scenarioId];
      if (scenario && scenario.plan && scenario.plan.length > 0) {
        scenario.plan[0].name = newName.trim();
      }
      return newScenarios;
    });

    // 현재 활성 시나리오의 이름이 변경되었다면 현재 시나리오도 업데이트
    if (activeScenarioId === scenarioId) {
      setScenario(prev => {
        if (prev && prev.plan && prev.plan.length > 0) {
          return {
            ...prev,
            plan: [
              {
                ...prev.plan[0],
                name: newName.trim()
              },
              ...prev.plan.slice(1)
            ]
          };
        }
        return prev;
      });
      setOriginalScenario(prev => {
        if (prev && prev.plan && prev.plan.length > 0) {
          return {
            ...prev,
            plan: [
              {
                ...prev.plan[0],
                name: newName.trim()
              },
              ...prev.plan.slice(1)
            ]
          };
        }
        return prev;
      });
    }

    console.log('✏️ 시나리오 이름 변경됨:', scenarioId, '→', newName);
  }, [activeScenarioId]);

  // 시나리오 삭제 함수
  const deleteScenario = useCallback((scenarioId: string) => {
    if (Object.keys(scenarios).length <= 1) {
      alert('최소 하나의 시나리오는 유지해야 합니다.');
      return;
    }

    setScenarios(prev => {
      const newScenarios = { ...prev };
      delete newScenarios[scenarioId];
      return newScenarios;
    });

    // 삭제된 시나리오가 현재 활성 시나리오였다면 다른 시나리오로 전환
    if (activeScenarioId === scenarioId) {
      const remainingScenarioIds = Object.keys(scenarios).filter(id => id !== scenarioId);
      if (remainingScenarioIds.length > 0) {
        switchScenario(remainingScenarioIds[0]);
      }
    }

    console.log('🗑️ 시나리오 삭제됨:', scenarioId);
  }, [scenarios, activeScenarioId, switchScenario]);

  // 로딩 시작 함수 (파일 선택 시 즉시 호출)
  const handleLoadingStart = useCallback((startTime?: number) => {
    const actualStartTime = startTime || performance.now();
    // console.log('🚀 로딩 시작 - 파일 선택됨, 시작 시간:', actualStartTime);
    
    // useRef로 시작 시간 저장
    loadingStartTimeRef.current = actualStartTime;
    
    flushSync(() => {
      setIsLoading(true);
      setLoadingTime(null);
    });
    
    // console.log('✅ [TIMING] loadingStartTimeRef.current 설정:', loadingStartTimeRef.current);
  }, []);

  // 초기 상태 결정 함수
  const getInitialState = useCallback((scenario: Scenario): string => {
    if (!scenario.plan || scenario.plan.length === 0) return '';
    
    const dialogStates = scenario.plan[0].dialogState;
    if (!dialogStates || dialogStates.length === 0) return '';
    
    // Start가 있으면 선택
    const startState = dialogStates.find(state => state.name === 'Start');
    if (startState) {
      // console.log('🎯 Start 상태를 초기 상태로 설정');
      return 'Start';
    }
    
    // Start가 없으면 첫 번째 상태 선택
    // console.log('🎯 첫 번째 상태를 초기 상태로 설정:', dialogStates[0].name);
    return dialogStates[0].name;
  }, []);

  // handleScenarioLoad가 기존 id로만 시나리오를 등록/활성화하도록 개선
  // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-use-before-define
  const handleScenarioLoad = useCallback((loadedScenario: Scenario, loadedId?: string) => {
    const scenarioId = loadedId || `scenario-${Date.now()}`;

    // 기존에 동일 ID가 있더라도 항상 교체하여 화면을 초기화
    setScenarios(prev => ({
      ...prev,
      [scenarioId]: loadedScenario
    }));

    setActiveScenarioId(scenarioId);
    setScenario(loadedScenario);
    setOriginalScenario(JSON.parse(JSON.stringify(loadedScenario)));

    // 완전 리셋 후 변환 적용
    flushSync(() => {
      setNodes([]);
      setEdges([]);
    });
    invokeConvertScenarioToFlow(loadedScenario);
    // 업로드 직후 초기 상태도 재설정하여 화면 반응을 명확히 함
    const initial = getInitialState(loadedScenario);
    setCurrentState(initial);

    console.log('시나리오 로드 완료:', {
      name: loadedScenario.plan[0]?.name,
      dialogStateCount: loadedScenario.plan[0]?.dialogState?.length || 0,
      botType: loadedScenario.botConfig?.botType
    });
  }, [invokeConvertScenarioToFlow, getInitialState]);

  // 여러 시나리오 업로드 시 모두 등록하고 첫 번째 시나리오만 활성화
  // eslint-disable-next-line no-use-before-define, @typescript-eslint/no-use-before-define
  const handleAllScenariosLoad = useCallback((scenarioMap: Record<string, Scenario>) => {
    // 재업로드 시에도 항상 전체 교체 및 화면 리셋
    setScenarios(scenarioMap);

    const firstId = Object.keys(scenarioMap)[0];
    if (firstId) {
      const firstScenario = scenarioMap[firstId];

      setActiveScenarioId(firstId);
      setScenario(firstScenario);
      setOriginalScenario(JSON.parse(JSON.stringify(firstScenario)));

      // 완전 리셋 후 변환 적용
      flushSync(() => {
        setNodes([]);
        setEdges([]);
      });
      invokeConvertScenarioToFlow(firstScenario);
      // 여러 시나리오 업로드 시에도 초기 상태 재설정
      const initial = getInitialState(firstScenario);
      setCurrentState(initial);
    }
  }, [invokeConvertScenarioToFlow, getInitialState]);

  // 두 노드 간의 최적 핸들 조합을 반환하는 함수
  const getOptimalHandles = useCallback((sourceNode: FlowNode, targetNode: FlowNode) => {
    // 소스 노드의 위치
    const sourcePos = sourceNode.position;
    // 타겟 노드의 위치
    const targetPos = targetNode.position;
    
    // 두 노드 간의 상대적 위치 계산
    const deltaX = targetPos.x - sourcePos.x;
    const deltaY = targetPos.y - sourcePos.y;
    
    // Source는 항상 right 또는 bottom, Target은 항상 left 또는 top
    let sourceHandle: string | undefined;
    let targetHandle: string | undefined;
    
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // 수평 연결이 더 적절
      if (deltaX > 0) {
        // 소스가 왼쪽, 타겟이 오른쪽
        sourceHandle = 'right-source';
        targetHandle = 'left-target';
      } else {
        // 소스가 오른쪽, 타겟이 왼쪽
        sourceHandle = 'right-source';
        targetHandle = 'left-target';
      }
    } else {
      // 수직 연결이 더 적절
      if (deltaY > 0) {
        // 소스가 위쪽, 타겟이 아래쪽
        sourceHandle = 'bottom-source';
        targetHandle = 'top-target';
      } else {
        // 소스가 아래쪽, 타겟이 위쪽
        sourceHandle = 'bottom-source';
        targetHandle = 'top-target';
      }
    }
    
    return { sourceHandle, targetHandle };
  }, []);

  // 연결 개수를 고려한 핸들 선택 함수
  const getHandlesWithConnectionCount = useCallback((sourceNode: FlowNode, targetNode: FlowNode, existingEdges: FlowEdge[]) => {
    // 소스 노드의 각 핸들별 사용 개수 계산
    const rightSourceCount = existingEdges.filter(edge => 
      edge.source === sourceNode.id && edge.sourceHandle === 'right-source'
    ).length;
    const bottomSourceCount = existingEdges.filter(edge => 
      edge.source === sourceNode.id && edge.sourceHandle === 'bottom-source'
    ).length;
    
    // 타겟 노드의 각 핸들별 사용 개수 계산
    const leftTargetCount = existingEdges.filter(edge => 
      edge.target === targetNode.id && edge.targetHandle === 'left-target'
    ).length;
    const topTargetCount = existingEdges.filter(edge => 
      edge.target === targetNode.id && edge.targetHandle === 'top-target'
    ).length;
    
    // 사용 가능한 핸들 조합 찾기
    const availableCombinations = [];
    
    // right-source -> top-target 조합이 사용 가능한지 확인
    if (rightSourceCount === 0 && topTargetCount === 0) {
      availableCombinations.push({
        sourceHandle: 'right-source',
        targetHandle: 'top-target',
        priority: 1 // right -> top 우선
      });
    }
    
    // bottom-source -> left-target 조합이 사용 가능한지 확인
    if (bottomSourceCount === 0 && leftTargetCount === 0) {
      availableCombinations.push({
        sourceHandle: 'bottom-source',
        targetHandle: 'left-target',
        priority: 2 // bottom -> left
      });
    }
    
    // 사용 가능한 조합이 있으면 우선순위에 따라 선택
    if (availableCombinations.length > 0) {
      // 우선순위가 높은 것부터 선택 (right -> top 우선)
      availableCombinations.sort((a, b) => a.priority - b.priority);
      return availableCombinations[0];
    }
    
    // 모든 핸들이 사용 중인 경우, 가장 적게 사용된 조합 선택
    const combination1 = {
      sourceHandle: 'right-source',
      targetHandle: 'top-target',
      usage: rightSourceCount + topTargetCount
    };
    const combination2 = {
      sourceHandle: 'bottom-source',
      targetHandle: 'left-target',
      usage: bottomSourceCount + leftTargetCount
    };
    
    return combination1.usage <= combination2.usage ? combination1 : combination2;
  }, []);

  // 엣지 생성 (전이 관계 분석)
  const convertScenarioToFlowImpl = useCallback((scenario: Scenario) => {
    // 시작 시간 측정 (디버그용)
    // const convertStartTime = performance.now();
    console.log('🔄 [TIMING] convertScenarioToFlow 시작 - 시나리오:', scenario.plan[0]?.name);
    
    if (!scenario.plan || scenario.plan.length === 0) {
      console.log('⚠️ [WARNING] 시나리오에 plan이 없거나 dialogState가 비어있습니다.');
      return;
    }
    
    // 주의: 이 로직은 제거하고 항상 새로운 시나리오로 변환하도록 수정
    console.log('✅ [INFO] 새로운 시나리오 변환 시작');
    console.log('  - 시나리오 이름:', scenario.plan[0]?.name);
    // 기존 nodes/edges 수 로깅은 제거하여 외부 상태 의존성을 낮춤
    
    // 🔥 핵심 수정: 기존 상태를 완전히 무시하고 새로 시작
    console.log('🧹 [INFO] 기존 상태 무시하고 새로 시작');
    
    // 🔥 핵심 수정: nodes와 edges 상태를 직접 참조하지 않고 빈 배열에서 시작
    const newNodes: FlowNode[] = [];
    const newEdges: FlowEdge[] = [];
    
    const dialogStates = scenario.plan[0].dialogState;
    console.log('⏱️ [TIMING] dialogStates 수:', dialogStates.length);
    
    // 노드 생성 타이밍 측정
    
    
    // dialogState 노드들 생성
    const dialogStateNodes: FlowNode[] = [
      // dialogState 노드만 생성 (시나리오 전이 노드는 아래에서 동적으로 생성)
      ...dialogStates.map((state, index) => ({
        id: state.name,
        type: 'custom',
        position: { 
          x: (index % 3) * 250, 
          y: Math.floor(index / 3) * 150 
        },
        data: {
          label: state.name,
          dialogState: state
        }
      }))
    ];
    
    // newNodes에 dialogState 노드들 추가
    newNodes.push(...dialogStateNodes);
    
    // 종료 노드들을 자동으로 생성 (__END_SCENARIO__, __END_SESSION__)
    const endNodes: FlowNode[] = [];
    const endNodePositions = new Map<string, { x: number; y: number }>();
    
    // 종료 노드 위치 계산 (기존 노드들 옆에 배치)
    let endNodeIndex = 0;
    const baseX = Math.max(...newNodes.map(n => n.position.x)) + 300;
    const baseY = 100;
    
    const getTransition = (tt: any): { dialogState?: string; scenario?: string } => {
      if (!tt) return {};
      if (typeof tt === 'string') return { dialogState: tt };
      if (typeof tt === 'object') {
        let dialogState = (tt as any).dialogState;
        let scenarioNameOrId = (tt as any).scenario;
        
        // 시나리오 ID가 들어온 경우 이름으로 정규화
        if (scenarioNameOrId && typeof scenarioNameOrId === 'string') {
          // 시나리오 ID 패턴 확인 (scenario-로 시작하는 경우)
          if (scenarioNameOrId.startsWith('scenario-')) {
            // scenarios에서 해당 ID로 시나리오 찾기
            const targetScenario = (scenarios as any)[scenarioNameOrId];
            if (targetScenario && targetScenario.plan && targetScenario.plan[0]) {
              scenarioNameOrId = targetScenario.plan[0].name;
            }
          }
          // 시나리오 이름이 직접 들어온 경우 (예: "Scene1")
          else if (scenarioNameOrId && !scenarioNameOrId.startsWith('scenario-')) {
            // 그대로 사용 (이미 시나리오 이름)
            // scenarioNameOrId is already set
          }
        }
        
        return { dialogState, scenario: scenarioNameOrId };
      }
      return {};
    };

    const getEndNodeVisual = (special: string) => {
      if (special === '__END_SCENARIO__') {
        return { bg: '#e8f5e9', border: '#4CAF50', stroke: '#4CAF50' };
      }
      if (special === '__END_SESSION__' || special === '__END_PROCESS__') {
        return { bg: '#eeeeee', border: '#9e9e9e', stroke: '#9e9e9e' };
      }
      // fallback
      return { bg: '#f5f5f5', border: '#9e9e9e', stroke: '#9e9e9e' };
    };

    dialogStates.forEach((state) => {
      // Condition handlers에서 종료 전이 분석
      state.conditionHandlers?.forEach((handler) => {
        const { dialogState: targetState } = getTransition(handler.transitionTarget);
        if (targetState === '__END_SCENARIO__' || targetState === '__END_SESSION__' || targetState === '__END_PROCESS__') {
          const endNodeId = `end-${targetState.toLowerCase().replace(/__/g, '')}-${state.name}`;
          
          // 이미 생성된 종료 노드인지 확인
          if (!endNodes.find(n => n.id === endNodeId)) {
            const v = getEndNodeVisual(targetState);
            const endNode: FlowNode = {
              id: endNodeId,
              type: 'custom',
              position: { 
                x: baseX + (endNodeIndex % 2) * 200, 
                y: baseY + Math.floor(endNodeIndex / 2) * 150 
              },
              data: {
                label: targetState,
                dialogState: {
                  name: targetState,
                  conditionHandlers: [],
                  eventHandlers: [],
                  intentHandlers: [],
                  webhookActions: [],
                  slotFillingForm: []
                }
              },
              style: {
                backgroundColor: v.bg,
                border: `2px dashed ${v.border}`,
                borderRadius: '8px',
              }
            };
            endNodes.push(endNode);
            endNodePositions.set(endNodeId, endNode.position);
            endNodeIndex++;
          }
        }
      });
      
      // Intent handlers에서 종료 전이 분석
      state.intentHandlers?.forEach((handler) => {
        const { dialogState: targetState } = getTransition(handler.transitionTarget);
        if (targetState === '__END_SCENARIO__' || targetState === '__END_SESSION__' || targetState === '__END_PROCESS__') {
          const endNodeId = `end-${targetState.toLowerCase().replace(/__/g, '')}-${state.name}`;
          
          if (!endNodes.find(n => n.id === endNodeId)) {
            const v = getEndNodeVisual(targetState);
            const endNode: FlowNode = {
              id: endNodeId,
              type: 'custom',
              position: { 
                x: baseX + (endNodeIndex % 2) * 200, 
                y: baseY + Math.floor(endNodeIndex / 2) * 150 
              },
              data: {
                label: targetState,
                dialogState: {
                  name: targetState,
                  conditionHandlers: [],
                  eventHandlers: [],
                  intentHandlers: [],
                  webhookActions: [],
                  slotFillingForm: []
                }
              },
              style: {
                backgroundColor: v.bg,
                border: `2px dashed ${v.border}`,
                borderRadius: '8px',
              }
            };
            endNodes.push(endNode);
            endNodePositions.set(endNodeId, endNode.position);
            endNodeIndex++;
          }
        }
      });
      
      // Event handlers에서 종료 전이 분석
      state.eventHandlers?.forEach((handler) => {
        const { dialogState: targetState } = getTransition(handler.transitionTarget);
        if (targetState === '__END_SCENARIO__' || targetState === '__END_SESSION__' || targetState === '__END_PROCESS__') {
          const endNodeId = `end-${targetState.toLowerCase().replace(/__/g, '')}-${state.name}`;
          
          if (!endNodes.find(n => n.id === endNodeId)) {
            const v = getEndNodeVisual(targetState);
            const endNode: FlowNode = {
              id: endNodeId,
              type: 'custom',
              position: { 
                x: baseX + (endNodeIndex % 2) * 200, 
                y: baseY + Math.floor(endNodeIndex / 2) * 150 
              },
              data: {
                label: targetState,
                dialogState: {
                  name: targetState,
                  conditionHandlers: [],
                  eventHandlers: [],
                  intentHandlers: [],
                  webhookActions: [],
                  slotFillingForm: []
                }
              },
              style: {
                backgroundColor: v.bg,
                border: `2px dashed ${v.border}`,
                borderRadius: '8px',
              }
            };
            endNodes.push(endNode);
            endNodePositions.set(endNodeId, endNode.position);
            endNodeIndex++;
          }
        }
      });
    });
    
    // 종료 노드들을 메인 노드 배열에 추가
    newNodes.push(...endNodes);
    
    console.log('🔚 자동 생성된 종료 노드들:', endNodes.length, '개');
    endNodes.forEach(node => {
      console.log(`  - ${node.id}: ${node.data.label} (${node.position.x}, ${node.position.y})`);
    });

    // console.log('⏱️ [TIMING] 노드 생성 완료');

    // 엣지 생성 (전이 관계 분석)
    
    
    // newEdges는 이미 위에서 선언됨

    dialogStates.forEach((state) => {
      // Condition handlers에서 전이 관계 추출
      state.conditionHandlers?.forEach((handler, idx) => {
        const { dialogState: targetState, scenario: targetScenario } = getTransition(handler.transitionTarget);
        if (
          targetState &&
          targetState !== '__CURRENT_DIALOG_STATE__' &&
          targetState !== '__END_SESSION__' &&
          targetState !== '__END_SCENARIO__' &&
          targetState !== '__END_PROCESS__'
        ) {
          
          const currentScenarioName = scenario.plan[0].name;
          
          // 디버깅 로그 추가
          console.log(`🔍 시나리오 전이 분석:`, {
            sourceState: state.name,
            targetState,
            targetScenario,
            currentScenarioName,
            isDifferentScenario: targetScenario !== currentScenarioName
          });
          
          // 시나리오 간 전이인 경우
          if (targetScenario && targetScenario !== currentScenarioName) {
            console.log(`🚀 시나리오 전이 감지: ${currentScenarioName} → ${targetScenario}`);
            const isPlanInSameScenario = Array.isArray(scenario.plan) && scenario.plan.some(pl => pl.name === targetScenario);
            if (isPlanInSameScenario) {
              console.log(`📋 같은 시나리오 내 플랜 전이: ${targetScenario}`);
              let planTransitionNodeId = `plan-transition-${state.name}-${targetScenario}-${handler.transitionTarget.dialogState}`;
              const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
              const targetNode = newNodes.find(n => n.id === planTransitionNodeId);
              let sourceHandle: string | undefined;
              let targetHandle: string | undefined;
              if (sourceNode && targetNode) {
                const handles = getHandlesWithConnectionCount(sourceNode, targetNode, newEdges);
                sourceHandle = handles.sourceHandle;
                targetHandle = handles.targetHandle;
              }
              const edge: FlowEdge = {
                id: `${state.name}-condition-${idx}-${planTransitionNodeId}`,
                source: state.name,
                target: planTransitionNodeId,
                sourceHandle,
                targetHandle,
                label: `조건: ${handler.conditionStatement}`,
                type: 'custom',
                style: { stroke: '#6a1b9a', strokeWidth: 2 }
              };
              newEdges.push(edge);
              const existingTransitionNode = newNodes.find(n => 
                n.type === 'planTransition' && 
                n.data.targetPlan === targetScenario && 
                n.data.targetState === handler.transitionTarget.dialogState
              );
              if (!existingTransitionNode) {
                const transitionNode: any = {
                  id: planTransitionNodeId,
                  type: 'planTransition',
                  position: { x: (dialogStates.length % 3) * 250 + 100, y: Math.floor(dialogStates.length / 3) * 150 + 100 },
                  data: {
                    label: `→ ${targetScenario}:${handler.transitionTarget.dialogState}`,
                    dialogState: { name: '플랜 전이', conditionHandlers: [], eventHandlers: [], intentHandlers: [], webhookActions: [], slotFillingForm: [] },
                    targetPlan: targetScenario,
                    targetState: handler.transitionTarget.dialogState
                  }
                };
                newNodes.push(transitionNode);
              } else {
                planTransitionNodeId = existingTransitionNode.id;
              }
            } else {
              console.log(`🌐 다른 시나리오로 전이: ${targetScenario}`);
              // 시나리오 전이: 주황
              let scenarioTransitionNodeId = `scenario-transition-${state.name}-${targetScenario}-${handler.transitionTarget.dialogState}`;
              const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
              const targetNode = newNodes.find(n => n.id === scenarioTransitionNodeId);
              let sourceHandle: string | undefined;
              let targetHandle: string | undefined;
              if (sourceNode && targetNode) {
                const handles = getHandlesWithConnectionCount(sourceNode, targetNode, newEdges);
                sourceHandle = handles.sourceHandle;
                targetHandle = handles.targetHandle;
              }
              const edge: FlowEdge = {
                id: `${state.name}-condition-${idx}-${scenarioTransitionNodeId}`,
                source: state.name,
                target: scenarioTransitionNodeId,
                sourceHandle,
                targetHandle,
                label: `조건: ${handler.conditionStatement}`,
                type: 'custom',
                style: { stroke: '#ff6b35', strokeWidth: 2 }
              };
              newEdges.push(edge);
              const existingTransitionNode = newNodes.find(n => 
                n.type === 'scenarioTransition' && 
                n.data.targetScenario === targetScenario && 
                n.data.targetState === handler.transitionTarget.dialogState
              );
              if (!existingTransitionNode) {
                const transitionNode: FlowNode = {
                  id: scenarioTransitionNodeId,
                  type: 'scenarioTransition',
                  position: { x: (dialogStates.length % 3) * 250 + 100, y: Math.floor(dialogStates.length / 3) * 150 + 100 },
                  data: {
                    label: `→ ${targetScenario}:${handler.transitionTarget.dialogState}`,
                    dialogState: { name: '시나리오 전이', conditionHandlers: [], eventHandlers: [], intentHandlers: [], webhookActions: [], slotFillingForm: [] },
                    targetScenario: targetScenario,
                    targetState: handler.transitionTarget.dialogState
                  }
                };
                newNodes.push(transitionNode);
              } else {
                scenarioTransitionNodeId = existingTransitionNode.id;
              }
            }
          } 
          // 같은 시나리오 내 전이
          else if (!targetScenario || targetScenario === currentScenarioName) {
            
            
            // 소스 노드와 타겟 노드 찾기
            const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
            const targetNode = newNodes.find(n => n.data.dialogState.name === targetState);
            
            let sourceHandle: string | undefined;
            let targetHandle: string | undefined;
            
            if (sourceNode && targetNode) {
              const handles = getHandlesWithConnectionCount(sourceNode, targetNode, newEdges);
              sourceHandle = handles.sourceHandle;
              targetHandle = handles.targetHandle;
            }
            
            const edge: FlowEdge = {
              id: `${state.name}-condition-${idx}-${targetState}`,
              source: state.name,
              target: targetState,
              sourceHandle,
              targetHandle,
              label: `조건: ${handler.conditionStatement}`,
              type: 'custom'
            };
            newEdges.push(edge);
          }
        }
        // 종료 노드로의 전이 처리
        else if (targetState === '__END_SCENARIO__' || targetState === '__END_SESSION__' || targetState === '__END_PROCESS__') {
          
          const endNodeId = `end-${targetState.toLowerCase().replace(/__/g, '')}-${state.name}`;
          
          // 소스 노드와 종료 노드 찾기
          const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
          const targetNode = newNodes.find(n => n.id === endNodeId);
          
          if (sourceNode && targetNode) {
            let sourceHandle: string | undefined;
            let targetHandle: string | undefined;
            
            const handles = getHandlesWithConnectionCount(sourceNode, targetNode, newEdges);
            sourceHandle = handles.sourceHandle;
            targetHandle = handles.targetHandle;
            
            const edge: FlowEdge = {
              id: `${state.name}-condition-${idx}-${endNodeId}`,
              source: state.name,
              target: endNodeId,
              sourceHandle,
              targetHandle,
              label: `조건: ${handler.conditionStatement}`,
              type: 'custom',
              style: { 
                stroke: getEndNodeVisual(targetState!).stroke,
                strokeWidth: 2 
              }
            };
            newEdges.push(edge);
            console.log(`🔚 종료 전이 엣지 생성: ${state.name} → ${endNodeId}`);
          }
        }
      });

      // Intent handlers에서 전이 관계 추출
      state.intentHandlers?.forEach((handler, idx) => {
        const { dialogState: targetState, scenario: targetScenario } = getTransition(handler.transitionTarget);
        if (
          targetState &&
          targetState !== '__CURRENT_DIALOG_STATE__' &&
          targetState !== '__END_SESSION__' &&
          targetState !== '__END_SCENARIO__' &&
          targetState !== '__END_PROCESS__'
        ) {
          const currentScenarioName = scenario.plan[0].name;
          
          // 디버깅 로그 추가
          console.log(`🔍 시나리오 전이 분석:`, {
            sourceState: state.name,
            targetState,
            targetScenario,
            currentScenarioName,
            isDifferentScenario: targetScenario !== currentScenarioName
          });
          
          // 시나리오/플랜 간 전이인 경우
          if (targetScenario && targetScenario !== currentScenarioName) {
            console.log(`🚀 시나리오 전이 감지: ${currentScenarioName} → ${targetScenario}`);
            const isPlanInSameScenario = Array.isArray(scenario.plan) && scenario.plan.some(pl => pl.name === targetScenario);
            if (isPlanInSameScenario) {
              console.log(`📋 같은 시나리오 내 플랜 전이: ${targetScenario}`);
              let planTransitionNodeId = `plan-transition-${state.name}-${targetScenario}-${handler.transitionTarget.dialogState}`;
              const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
              const targetNode = newNodes.find(n => n.id === planTransitionNodeId);
              let sourceHandle: string | undefined;
              let targetHandle: string | undefined;
              if (sourceNode && targetNode) {
                const handles = getHandlesWithConnectionCount(sourceNode, targetNode, newEdges);
                sourceHandle = handles.sourceHandle;
                targetHandle = handles.targetHandle;
              }
              const edge: FlowEdge = {
                id: `${state.name}-intent-${idx}-${planTransitionNodeId}`,
                source: state.name,
                target: planTransitionNodeId,
                sourceHandle,
                targetHandle,
                label: `인텐트: ${handler.intent}`,
                type: 'custom',
                style: { stroke: '#6a1b9a', strokeWidth: 2 }
              };
              newEdges.push(edge);
              const existingTransitionNode = newNodes.find(n => 
                n.type === 'planTransition' && 
                n.data.targetPlan === targetScenario && 
                n.data.targetState === handler.transitionTarget.dialogState
              );
              if (!existingTransitionNode) {
                const transitionNode: any = {
                  id: planTransitionNodeId,
                  type: 'planTransition',
                  position: { x: 0, y: 0 },
                  data: {
                    label: `→ ${targetScenario}:${handler.transitionTarget.dialogState}`,
                    dialogState: { name: '플랜 전이', conditionHandlers: [], eventHandlers: [], intentHandlers: [], webhookActions: [], slotFillingForm: [] },
                    targetPlan: targetScenario,
                    targetState: handler.transitionTarget.dialogState
                  }
                };
                newNodes.push(transitionNode);
              } else {
                planTransitionNodeId = existingTransitionNode.id;
              }
            } else {
              console.log(`🌐 다른 시나리오로 전이: ${targetScenario}`);
              // 기존 시나리오 전이 로직 유지
              let scenarioTransitionNodeId = `scenario-transition-${state.name}-${targetScenario}-${handler.transitionTarget.dialogState}`;
              const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
              const targetNode = newNodes.find(n => n.id === scenarioTransitionNodeId);
              let sourceHandle: string | undefined;
              let targetHandle: string | undefined;
              if (sourceNode && targetNode) {
                const handles = getHandlesWithConnectionCount(sourceNode, targetNode, newEdges);
                sourceHandle = handles.sourceHandle;
                targetHandle = handles.targetHandle;
              }
              const edge: FlowEdge = {
                id: `${state.name}-intent-${idx}-${scenarioTransitionNodeId}`,
                source: state.name,
                target: scenarioTransitionNodeId,
                sourceHandle,
                targetHandle,
                label: `인텐트: ${handler.intent}`,
                type: 'custom',
                style: { stroke: '#ff6b35', strokeWidth: 2 }
              };
              newEdges.push(edge);
              const existingTransitionNode = newNodes.find(n => 
                n.type === 'scenarioTransition' && 
                n.data.targetScenario === targetScenario && 
                n.data.targetState === handler.transitionTarget.dialogState
              );
              if (!existingTransitionNode) {
                const transitionNode: FlowNode = {
                  id: scenarioTransitionNodeId,
                  type: 'scenarioTransition',
                  position: { x: 0, y: 0 },
                  data: {
                    label: `→ ${targetScenario}:${handler.transitionTarget.dialogState}`,
                    dialogState: { name: '시나리오 전이', conditionHandlers: [], eventHandlers: [], intentHandlers: [], webhookActions: [], slotFillingForm: [] },
                    targetScenario: targetScenario,
                    targetState: handler.transitionTarget.dialogState
                  }
                };
                newNodes.push(transitionNode);
              } else {
                scenarioTransitionNodeId = existingTransitionNode.id;
              }
            }
          }
          // 같은 시나리오 내 전이
          else if (!targetScenario || targetScenario === currentScenarioName) {
            
            const edge: FlowEdge = {
              id: `${state.name}-intent-${idx}-${targetState}`,
              source: state.name,
              target: targetState,
              label: `인텐트: ${handler.intent}`,
              type: 'custom'
            };
            newEdges.push(edge);
          }
        }
        // 종료 노드로의 전이 처리
        else if (targetState === '__END_SCENARIO__' || targetState === '__END_SESSION__' || targetState === '__END_PROCESS__') {
          
          const endNodeId = `end-${targetState.toLowerCase().replace(/__/g, '')}-${state.name}`;
          
          // 소스 노드와 종료 노드 찾기
          const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
          const targetNode = newNodes.find(n => n.id === endNodeId);
          
          if (sourceNode && targetNode) {
            let sourceHandle: string | undefined;
            let targetHandle: string | undefined;
            
            const handles = getHandlesWithConnectionCount(sourceNode, targetNode, newEdges);
            sourceHandle = handles.sourceHandle;
            targetHandle = handles.targetHandle;
            
            const edge: FlowEdge = {
              id: `${state.name}-intent-${idx}-${endNodeId}`,
              source: state.name,
              target: endNodeId,
              sourceHandle,
              targetHandle,
              label: `인텐트: ${handler.intent}`,
              type: 'custom',
              style: { 
                stroke: getEndNodeVisual(targetState!).stroke,
                strokeWidth: 2 
              }
            };
            newEdges.push(edge);
            console.log(`🔚 인텐트 종료 전이 엣지 생성: ${state.name} → ${endNodeId}`);
          }
        }
      });

      // Event handlers에서 전이 관계 추출
      state.eventHandlers?.forEach((handler, idx) => {
        const { dialogState: targetState, scenario: targetScenario } = getTransition(handler.transitionTarget);
        if (targetState && targetState !== '__CURRENT_DIALOG_STATE__' && targetState !== '__END_SESSION__' && targetState !== '__END_SCENARIO__' && targetState !== '__END_PROCESS__') {
          // event 필드 안전하게 처리
          let eventType = '';
          if (handler.event) {
            if (typeof handler.event === 'object' && handler.event.type) {
              eventType = handler.event.type;
            } else if (typeof handler.event === 'string') {
              eventType = handler.event;
            }
          }
          
          const currentScenarioName = scenario.plan[0].name;
          
          // 디버깅 로그 추가
          console.log(`🔍 시나리오 전이 분석:`, {
            sourceState: state.name,
            targetState,
            targetScenario,
            currentScenarioName,
            isDifferentScenario: targetScenario !== currentScenarioName
          });
          
          // 시나리오 간 전이인 경우
          if (targetScenario && targetScenario !== currentScenarioName) {
            console.log(`🚀 시나리오 전이 감지: ${currentScenarioName} → ${targetScenario}`);
            const isPlanInSameScenario = Array.isArray(scenario.plan) && scenario.plan.some(pl => pl.name === targetScenario);
            if (isPlanInSameScenario) {
              console.log(`📋 같은 시나리오 내 플랜 전이: ${targetScenario}`);
              let planTransitionNodeId = `plan-transition-${state.name}-${targetScenario}-${handler.transitionTarget.dialogState}`;
              const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
              const targetNode = newNodes.find(n => n.id === planTransitionNodeId);
              let sourceHandle: string | undefined;
              let targetHandle: string | undefined;
              if (sourceNode && targetNode) {
                const handles = getOptimalHandles(sourceNode, targetNode);
                sourceHandle = handles.sourceHandle;
                targetHandle = handles.targetHandle;
              }
              const edge: FlowEdge = {
                id: `${state.name}-event-${idx}-${planTransitionNodeId}`,
                source: state.name,
                target: planTransitionNodeId,
                sourceHandle,
                targetHandle,
                label: `이벤트: ${eventType}`,
                type: 'custom',
                style: { stroke: '#6a1b9a', strokeWidth: 2 }
              };
              newEdges.push(edge);
              const existingTransitionNode = newNodes.find(n => 
                n.type === 'planTransition' && 
                n.data.targetPlan === targetScenario && 
                n.data.targetState === handler.transitionTarget.dialogState
              );
              if (!existingTransitionNode) {
                const transitionNode: any = {
                  id: planTransitionNodeId,
                  type: 'planTransition',
                  position: { x: 0, y: 0 },
                  data: {
                    label: `→ ${targetScenario}:${handler.transitionTarget.dialogState}`,
                    dialogState: { name: '플랜 전이', conditionHandlers: [], eventHandlers: [], intentHandlers: [], webhookActions: [], slotFillingForm: [] },
                    targetPlan: targetScenario,
                    targetState: handler.transitionTarget.dialogState
                  }
                };
                newNodes.push(transitionNode);
              } else {
                planTransitionNodeId = existingTransitionNode.id;
              }
            } else {
              console.log(`🌐 다른 시나리오로 전이: ${targetScenario}`);
              let scenarioTransitionNodeId = `scenario-transition-${state.name}-${targetScenario}-${handler.transitionTarget.dialogState}`;
              const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
              const targetNode = newNodes.find(n => n.id === scenarioTransitionNodeId);
              let sourceHandle: string | undefined;
              let targetHandle: string | undefined;
              if (sourceNode && targetNode) {
                const handles = getOptimalHandles(sourceNode, targetNode);
                sourceHandle = handles.sourceHandle;
                targetHandle = handles.targetHandle;
              }
              const edge: FlowEdge = {
                id: `${state.name}-event-${idx}-${scenarioTransitionNodeId}`,
                source: state.name,
                target: scenarioTransitionNodeId,
                sourceHandle,
                targetHandle,
                label: `이벤트: ${eventType}`,
                type: 'custom',
                style: { stroke: '#ff6b35', strokeWidth: 2 }
              };
              newEdges.push(edge);
              const existingTransitionNode = newNodes.find(n => 
                n.type === 'scenarioTransition' && 
                n.data.targetScenario === targetScenario && 
                n.data.targetState === handler.transitionTarget.dialogState
              );
              if (!existingTransitionNode) {
                const transitionNode: FlowNode = {
                  id: scenarioTransitionNodeId,
                  type: 'scenarioTransition',
                  position: { x: 0, y: 0 },
                  data: {
                    label: `→ ${targetScenario}:${handler.transitionTarget.dialogState}`,
                    dialogState: { name: '시나리오 전이', conditionHandlers: [], eventHandlers: [], intentHandlers: [], webhookActions: [], slotFillingForm: [] },
                    targetScenario: targetScenario,
                    targetState: handler.transitionTarget.dialogState
                  }
                };
                newNodes.push(transitionNode);
              } else {
                scenarioTransitionNodeId = existingTransitionNode.id;
              }
            }
          }
          // 같은 시나리오 내 전이
          else if (!handler.transitionTarget.scenario || handler.transitionTarget.scenario === currentScenarioName) {
            
            
            // 소스 노드와 타겟 노드 찾기
            const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
            const targetNode = newNodes.find(n => n.data.dialogState.name === targetState);
            
            let sourceHandle: string | undefined;
            let targetHandle: string | undefined;
            
            if (sourceNode && targetNode) {
              const handles = getOptimalHandles(sourceNode, targetNode);
              sourceHandle = handles.sourceHandle;
              targetHandle = handles.targetHandle;
            }
            
            const edge: FlowEdge = {
              id: `${state.name}-event-${idx}-${targetState}`,
              source: state.name,
              target: targetState,
              sourceHandle,
              targetHandle,
              label: `이벤트: ${eventType}`,
              type: 'custom'
            };
            newEdges.push(edge);
          }
        }
        // 종료 노드로의 전이 처리
        else if (targetState === '__END_SCENARIO__' || targetState === '__END_SESSION__' || targetState === '__END_PROCESS__') {
          
          // event 필드 안전하게 처리
          let eventType = '';
          if (handler.event) {
            if (typeof handler.event === 'object' && handler.event.type) {
              eventType = handler.event.type;
            } else if (typeof handler.event === 'string') {
              eventType = handler.event;
            }
          }
          
          const endNodeId = `end-${targetState!.toLowerCase().replace(/__/g, '')}-${state.name}`;
          
          // 소스 노드와 종료 노드 찾기
          const sourceNode = newNodes.find(n => n.data.dialogState.name === state.name);
          const targetNode = newNodes.find(n => n.id === endNodeId);
          
          if (sourceNode && targetNode) {
            let sourceHandle: string | undefined;
            let targetHandle: string | undefined;
            
            const handles = getOptimalHandles(sourceNode, targetNode);
            sourceHandle = handles.sourceHandle;
            targetHandle = handles.targetHandle;
            
            const edge: FlowEdge = {
              id: `${state.name}-event-${idx}-${endNodeId}`,
              source: state.name,
              target: endNodeId,
              sourceHandle,
              targetHandle,
              label: `이벤트: ${eventType}`,
              type: 'custom'
            };
            newEdges.push(edge);
            console.log(`🔚 이벤트 종료 전이 엣지 생성: ${state.name} → ${endNodeId}`);
          }
        }
      });
    });
    
    // console.log('⏱️ [TIMING] 엣지 생성 완료');
    // console.log('📊 [TIMING] 엣지 종류별 개수:');
    // console.log('  - Condition 엣지:', conditionEdgeCount);
    // console.log('  - Intent 엣지:');
    // console.log('  - Event 엣지:');
    // console.log('  - 총 엣지:', newEdges.length);

    // 상태 설정
    
    console.log('📊 [INFO] 상태 업데이트 시작:');
    console.log('  - 새로 생성된 노드 수:', newNodes.length);
    console.log('  - 새로 생성된 엣지 수:', newEdges.length);
    
    // 🔥 핵심: 기존 상태를 완전히 대체 (누적 방지)
    console.log('🔄 [INFO] 기존 상태 완전 대체 시작');
    // 상태를 먼저 반영한 뒤 다음 프레임에서 캔버스 fitView가 동작하도록 함
    setNodes(newNodes);
    setEdges(newEdges);
    console.log('✅ [INFO] 기존 상태 완전 대체 완료');
    
    console.log('✅ [INFO] 상태 업데이트 완료:');
    console.log('  - 새 노드들:', newNodes.map(n => ({ id: n.id, type: n.type, label: n.data.label })));
    console.log('  - 새 엣지들:', newEdges.map(e => ({ id: e.id, source: e.source, target: e.target, label: e.label })));
    
    // console.log('⏱️ [TIMING] 상태 업데이트 완료');
    // console.log('📊 [TIMING] 변환 세부 분석:');
    // console.log('  - 노드 생성:', nodeCreationTime.toFixed(2), 'ms', `(${(nodeCreationTime/totalConversionTime*100).toFixed(1)}%)`);
    // console.log('  - 엣지 생성:', edgeCreationTime.toFixed(2), 'ms', `(${(edgeCreationTime/totalConversionTime*100).toFixed(1)}%)`);
    // console.log('  - 상태 업데이트:', stateUpdateTime.toFixed(2), 'ms', `(${(stateUpdateTime/totalConversionTime*100).toFixed(1)}%)`);
    // 최초 업로드 레이아웃 좌표 저장 (노드 id 기준)
    const posMap: Record<string, { x: number; y: number }> = {};
    newNodes.forEach(n => { posMap[n.id] = { x: n.position.x, y: n.position.y }; });
    initialPositionsRef.current = posMap;
  }, [getHandlesWithConnectionCount, getOptimalHandles]);

  useEffect(() => {
    convertScenarioToFlowRef.current = convertScenarioToFlowImpl;
  }, [convertScenarioToFlowImpl]);

  // 레이아웃 리셋: 초기 업로드 시 좌표로만 복원
  const handleLayoutReset = useCallback(() => {
    setNodes(prev => prev.map(n => {
      const pos = initialPositionsRef.current[n.id];
      return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
    }));
  }, []);

  const handleNodeSelect = useCallback((nodeName: string | null) => {
    const node = nodeName ? nodes.find(n => n.id === nodeName) || null : null;
    setSelectedNode(node);
  }, [nodes]);

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
      // console.log('🚀 테스트 모드 시작 - 현재 상태:', currentState);
      
      // 현재 상태에서 자동 전이 확인
      const currentDialogState = scenario.plan[0]?.dialogState.find(state => state.name === currentState);
      if (currentDialogState) {
        // Event handler가 있는지 확인
        const hasEventHandlers = currentDialogState.eventHandlers && currentDialogState.eventHandlers.length > 0;
        
        if (hasEventHandlers) {
          // console.log(`🎯 ${currentState} 상태에 이벤트 핸들러가 있습니다. 사용자가 수동으로 트리거해야 합니다.`);
          return; // 자동 전이하지 않고 사용자 이벤트 대기
        }
        
        // Event handler가 없으면 기존 로직 실행 (조건 핸들러 확인)
        const trueConditionHandler = currentDialogState.conditionHandlers?.find(
          handler => handler.conditionStatement === 'True'
        );
        
        if (trueConditionHandler) {
          const targetState = trueConditionHandler.transitionTarget.dialogState;
          // console.log(`⚡ 조건 전이: ${currentState} → ${targetState}`);
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

  // FlowCanvas에서 노드가 변경될 때 scenario와 nodes를 동기화
  const handleNodesChange = useCallback((updatedNodes: FlowNode[]) => {
    // 내부에서 추가/삭제/이동된 구조를 그대로 반영
    setNodes(updatedNodes);
  }, []);

  // 연결 변경 시 처리 (현재는 UI에서만 관리, 향후 확장 가능)
  const handleEdgesChange = useCallback((newEdges: FlowEdge[]) => {
    setEdges(newEdges);
    // console.log('🔗 연결 변경됨:', newEdges);
  }, []);

  // 시나리오 저장 처리
  const handleScenarioSave = useCallback(() => {
    if (!originalScenario && nodes.length === 0) {
      alert('저장할 시나리오가 없습니다.');
      return;
    }

    // 현재 노드들을 시나리오로 변환
    const latestName = scenarios[activeScenarioId]?.plan[0]?.name || originalScenario?.plan[0].name;
    if (!latestName) {
      console.error('시나리오 이름을 찾을 수 없습니다.');
      return;
    }
    const convertedScenario = convertNodesToScenario(nodes, edges, originalScenario, latestName, scenarios);
    
    // 시나리오 저장 시 불필요한 필드 제거
    const cleanedScenario = cleanScenarioForSave(convertedScenario);
    
    // 시나리오 전이 검증 (transitionTarget의 scenarioName으로 판단)
    const scenarioTransitions = nodes.flatMap(node => {
      if (!node.data.dialogState) return [];
      
      const transitions: Array<{nodeId: string, targetScenario: string, targetState: string, handlerType: string, validation: any}> = [];
      
      // conditionHandlers에서 시나리오 전이 확인
      if (node.data.dialogState.conditionHandlers) {
        node.data.dialogState.conditionHandlers.forEach((handler: any, index: number) => {
          if (handler.transitionTarget?.scenario && handler.transitionTarget.scenario !== latestName) {
            const validation = validateScenarioTransition(
              handler.transitionTarget.scenario,
              scenarios,
              latestName
            );
            transitions.push({
              nodeId: node.id,
              targetScenario: handler.transitionTarget.scenario,
              targetState: handler.transitionTarget.dialogState,
              handlerType: 'conditionHandler',
              validation
            });
          }
        });
      }
      
      // intentHandlers에서 시나리오 전이 확인
      if (node.data.dialogState.intentHandlers) {
        node.data.dialogState.intentHandlers.forEach((handler: any, index: number) => {
          if (handler.transitionTarget?.scenario && handler.transitionTarget.scenario !== latestName) {
            const validation = validateScenarioTransition(
              handler.transitionTarget.scenario,
              scenarios,
              latestName
            );
            transitions.push({
              nodeId: node.id,
              targetScenario: handler.transitionTarget.scenario,
              targetState: handler.transitionTarget.dialogState,
              handlerType: 'intentHandler',
              validation
            });
          }
        });
      }
      
      // eventHandlers에서 시나리오 전이 확인
      if (node.data.dialogState.eventHandlers) {
        node.data.dialogState.eventHandlers.forEach((handler: any, index: number) => {
          if (handler.transitionTarget?.scenario && handler.transitionTarget.scenario !== latestName) {
            const validation = validateScenarioTransition(
              handler.transitionTarget.scenario,
              scenarios,
              latestName
            );
            transitions.push({
              nodeId: node.id,
              targetScenario: handler.transitionTarget.scenario,
              targetState: handler.transitionTarget.dialogState,
              handlerType: 'eventHandler',
              validation
            });
          }
        });
      }
      
      return transitions;
    });
    
    if (scenarioTransitions.length > 0) {
      console.log('🔍 즉시 반영 - 시나리오 전이 검증:', scenarioTransitions.length, '개');
      
      // 제약사항 위반 체크
      const invalidTransitions = scenarioTransitions.filter(transition => !transition.validation.isValid);
      if (invalidTransitions.length > 0) {
        const errorMessage = `시나리오 전이 검증 실패:\n${invalidTransitions.map(t => 
          `- ${t.targetScenario} → ${t.targetState}: ${t.validation.errorMessage}`
        ).join('\n')}`;
        
        alert(`❌ 즉시 반영 실패\n\n${errorMessage}\n\n참조하는 시나리오가 존재하지 않습니다.`);
        return;
      }
      
      scenarioTransitions.forEach((transition, index) => {
        console.log(`  [${index}] ${transition.nodeId}: ${transition.targetScenario} → ${transition.targetState} (${transition.handlerType})`);
        
        // 시나리오 전이 검증 결과 확인
        if (transition.validation.isScenarioTransition) {
          console.log(`✅ 시나리오 전이 검증 성공: ${transition.targetScenario} → ${transition.targetState}`);
        } else {
          console.log(`ℹ️ 플랜 전이: ${transition.targetScenario} → ${transition.targetState}`);
        }
      });
    }
    
    // 변경사항 비교
    const changes = compareScenarios(nodes, originalScenario);
    
    // 새로 추가된 노드 정보 확인
    if (changes.added.length > 0) {
      console.log('🆕 즉시 반영 - 새로 추가된 노드:', changes.added.length, '개');
      changes.added.forEach((node, index) => {
        console.log(`  [${index}] ${node.name} (타입: ${node.conditionHandlers ? '상태' : '전이'})`);
      });
    }
    
    setNewScenario(cleanedScenario);
    setScenarioChanges(changes);
    setSaveModalOpen(true);
    
    console.log('💾 시나리오 저장 준비 완료:', {
      총노드수: nodes.length,
      상태노드수: nodes.filter(n => n.type !== 'scenarioTransition').length,
      전이노드수: scenarioTransitions.length,
      변경사항: changes
    });
  }, [nodes, originalScenario, scenarios, activeScenarioId, edges]);

  // 즉시 반영 저장 처리 (새로운 기능)
  const handleApplyChanges = useCallback(() => {
    if (!originalScenario && nodes.length === 0) {
      alert('적용할 시나리오가 없습니다.');
      return;
    }

    try {
      // 현재 노드들을 시나리오로 변환
      const latestName = scenarios[activeScenarioId]?.plan[0]?.name || originalScenario?.plan[0].name;
      if (!latestName) {
        console.error('시나리오 이름을 찾을 수 없습니다.');
        return;
      }
      const convertedScenario = convertNodesToScenario(nodes, edges, originalScenario, latestName, scenarios);
      
      // 시나리오 전이 검증 (transitionTarget의 scenarioName으로 판단)
      const scenarioTransitions = nodes.flatMap(node => {
        if (!node.data.dialogState) return [];
        
        const transitions: Array<{nodeId: string, targetScenario: string, targetState: string, handlerType: string, validation: any}> = [];
        
        // conditionHandlers에서 시나리오 전이 확인
        if (node.data.dialogState.conditionHandlers) {
          node.data.dialogState.conditionHandlers.forEach((handler: any, index: number) => {
            if (handler.transitionTarget?.scenario && handler.transitionTarget.scenario !== latestName) {
              const validation = validateScenarioTransition(
                handler.transitionTarget.scenario,
                scenarios,
                latestName
              );
              transitions.push({
                nodeId: node.id,
                targetScenario: handler.transitionTarget.scenario,
                targetState: handler.transitionTarget.dialogState,
                handlerType: 'conditionHandler',
                validation
              });
            }
          });
        }
        
        // intentHandlers에서 시나리오 전이 확인
        if (node.data.dialogState.intentHandlers) {
          node.data.dialogState.intentHandlers.forEach((handler: any, index: number) => {
            if (handler.transitionTarget?.scenario && handler.transitionTarget.scenario !== latestName) {
              const validation = validateScenarioTransition(
                handler.transitionTarget.scenario,
                scenarios,
                latestName
              );
              transitions.push({
                nodeId: node.id,
                targetScenario: handler.transitionTarget.scenario,
                targetState: handler.transitionTarget.dialogState,
                handlerType: 'intentHandler',
                validation
              });
            }
          });
        }
        
        // eventHandlers에서 시나리오 전이 확인
        if (node.data.dialogState.eventHandlers) {
          node.data.dialogState.eventHandlers.forEach((handler: any, index: number) => {
            if (handler.transitionTarget?.scenario && handler.transitionTarget.scenario !== latestName) {
              const validation = validateScenarioTransition(
                handler.transitionTarget.scenario,
                scenarios,
                latestName
              );
              transitions.push({
                nodeId: node.id,
                targetScenario: handler.transitionTarget.scenario,
                targetState: handler.transitionTarget.dialogState,
                handlerType: 'eventHandler',
                validation
              });
            }
          });
        }
        
        return transitions;
      });
      
      if (scenarioTransitions.length > 0) {
        console.log('🔍 시나리오 전이 검증:', scenarioTransitions.length, '개');
        scenarioTransitions.forEach((transition, index) => {
          console.log(`  [${index}] ${transition.nodeId}: ${transition.targetScenario} → ${transition.targetState} (${transition.handlerType})`);
          
          // 시나리오 전이 검증 결과 확인
          if (!transition.validation.isValid) {
            console.error(`❌ 시나리오 전이 검증 실패 ${transition.nodeId}:`, transition.validation.errorMessage);
          } else if (transition.validation.isScenarioTransition) {
            console.log(`✅ 시나리오 전이 검증 성공: ${transition.targetScenario} → ${transition.targetState}`);
          } else {
            console.log(`ℹ️ 플랜 전이: ${transition.targetScenario} → ${transition.targetState}`);
          }
        });
      }
      
      // 변경사항 비교
      const changes = compareScenarios(nodes, originalScenario);
      
      // 새로 추가된 노드 정보 확인
      if (changes.added.length > 0) {
        console.log('🆕 즉시 반영 - 새로 추가된 노드:', changes.added.length, '개');
        changes.added.forEach((node, index) => {
          console.log(`  [${index}] ${node.name} (타입: ${node.conditionHandlers ? '상태' : '전이'})`);
        });
      }
      
      // 즉시 현재 시나리오에 반영
      setScenario(convertedScenario);
      
      // 원본 시나리오도 업데이트 (변경사항 표시 초기화를 위해)
      setOriginalScenario(JSON.parse(JSON.stringify(convertedScenario)));
      
      // 엣지 재생성 (전이 관계 업데이트)
      invokeConvertScenarioToFlow(convertedScenario);
      
      // 초기 상태 재설정 (새로운 시나리오 기준)
      const newInitialState = getInitialState(convertedScenario);
      if (newInitialState) {
        // 현재 상태가 여전히 존재하는지 확인
        const currentStateExists = convertedScenario.plan[0]?.dialogState.some((state: any) => state.name === currentState);
        if (!currentStateExists) {
          // 현재 상태가 삭제되었다면 새로운 초기 상태로 설정
          setCurrentState(newInitialState);
          // console.log('🔄 현재 상태가 삭제되어 새로운 초기 상태로 변경:', newInitialState);
        } else if (currentState !== newInitialState && !currentState) {
          // 현재 상태가 없다면 새로운 초기 상태로 설정
          setCurrentState(newInitialState);
          // console.log('🔄 새로운 초기 상태로 변경:', newInitialState);
        }
      }
      
      // 성공 메시지 표시
      const changeCount = changes.added.length + changes.modified.length + changes.removed.length;
      if (changeCount > 0) {
        alert(`✅ 변경사항이 즉시 반영되었습니다!\n- 추가: ${changes.added.length}개\n- 수정: ${changes.modified.length}개\n- 삭제: ${changes.removed.length}개\n\n초기 상태: ${newInitialState}\n이제 테스트 모드에서 변경된 시나리오를 확인할 수 있습니다.`);
      } else {
        alert('ℹ️ 변경사항이 없습니다.');
      }
      
      console.log('🚀 시나리오 즉시 반영 완료:', {
        총노드수: nodes.length,
        상태노드수: nodes.filter(n => n.type !== 'scenarioTransition').length,
        전이노드수: scenarioTransitions.length,
        변경사항: changes,
        변환된시나리오: convertedScenario
      });
      
    } catch (error) {
      // console.error('시나리오 반영 오류:', error);
      alert('❌ 시나리오 반영 중 오류가 발생했습니다: ' + (error as Error).message);
    }
  }, [nodes, originalScenario, currentState, getInitialState, scenarios, activeScenarioId, edges, invokeConvertScenarioToFlow]);

  // 모달에서 최종 저장 처리
  const handleSaveConfirm = useCallback((filename: string) => {
    if (newScenario) {
      downloadScenarioAsJSON(newScenario, filename);
      // console.log('📁 시나리오 저장 완료:', filename);
    }
  }, [newScenario]);

  // 전체 시나리오 저장 함수
  const handleSaveAllScenarios = useCallback(() => {
    if (Object.keys(scenarios).length === 0) return;
    
    // 모든 시나리오를 하나의 배열로 구성
    const allScenarios = Object.entries(scenarios).map(([id, scenario]) => ({
      id,
      name: scenario.plan[0]?.name || `Scenario ${id}`,
      scenario
    }));

    // 통합 변환: apicalls -> webhooks(type='APICALL'), webhook의 type 지정
    const unifyScenario = (src: any) => {
      const s = JSON.parse(JSON.stringify(src || {}));
      const webhooks: any[] = Array.isArray(s.webhooks) ? s.webhooks : [];
      webhooks.forEach((w) => { if (!w.type) w.type = 'WEBHOOK'; });
      const apicalls: any[] = Array.isArray(s.apicalls) ? s.apicalls : [];
      if (apicalls.length > 0) {
        const existing = new Set((webhooks || []).filter((w: any) => String(w.type || 'WEBHOOK').toUpperCase() === 'APICALL').map((w: any) => w.name));
        apicalls.forEach((a) => {
          if (existing.has(a.name)) return;
          
          // 새로운 spec에 맞춰 변환
          const formats = a.formats || {};
          // Convert legacy/old responseMappings to new group array
          const toGroups = (m: any): any[] => {
            if (!m) return [];
            if (Array.isArray(m) && m.length > 0 && (m[0] as any).expressionType) return m;
            const memory: Record<string, string> = {};
            const directive: Record<string, string> = {};
            if (Array.isArray(m)) {
              m.forEach((item: any) => {
                const t = String(item?.type || 'memory').toLowerCase();
                Object.entries(item?.map || {}).forEach(([k, v]) => {
                  if (t === 'directive') directive[k] = String(v);
                  else memory[k] = String(v);
                });
              });
            } else if (typeof m === 'object') {
              Object.entries(m).forEach(([key, conf]: any) => {
                if (typeof conf === 'string') memory[key] = conf;
                else if (conf && typeof conf === 'object') {
                  const t = String(conf.type || 'memory').toLowerCase();
                  let expr: string | null = typeof conf[key] === 'string' ? conf[key] : null;
                  if (!expr) {
                    for (const [kk, vv] of Object.entries(conf)) {
                      if (kk !== 'type' && typeof vv === 'string') { expr = vv as string; break; }
                    }
                  }
                  if (expr) {
                    if (t === 'directive') directive[key] = expr; else memory[key] = expr;
                  }
                }
              });
            }
            const groups: any[] = [];
            if (Object.keys(memory).length) groups.push({ expressionType: 'JSON_PATH', targetType: 'MEMORY', mappings: memory });
            if (Object.keys(directive).length) groups.push({ expressionType: 'JSON_PATH', targetType: 'DIRECTIVE', mappings: directive });
            return groups;
          };
          const newFormats = {
            contentType: formats.contentType || 'application/json',
            requestTemplate: formats.requestTemplate,

            responseProcessing: formats.responseProcessing || {},
            responseMappings: toGroups(formats.responseMappings),
            headers: formats.headers || {},
            queryParams: formats.queryParams || []
          };
          
          webhooks.push({
            type: 'APICALL',
            name: a.name,
            url: a.url,
            timeoutInMilliSecond: a.timeoutInMilliSecond || a.timeout || 5000,
            retry: a.retry,
            
            headers: formats.headers || {},
            method: formats.method || 'POST',
            formats: newFormats
          });
        });
        s.webhooks = webhooks;
        delete s.apicalls;
      } else {
        s.webhooks = webhooks;
        delete s.apicalls;
      }
      return s;
    };

    const unifiedScenarios = allScenarios.map(s => ({ ...s, scenario: unifyScenario(s.scenario) }));

    // apicallHandlers의 url 필드 삭제 (보안)
    removeApiCallUrlsFromScenario(unifiedScenarios.map(s => s.scenario));
    
    const dataStr = JSON.stringify(unifiedScenarios, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `all_scenarios_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('💾 전체 시나리오 저장됨:', allScenarios.length, '개');
  }, [scenarios]);

  // TestPanel에서 시나리오 업데이트 처리
  const handleScenarioUpdate = useCallback((updatedScenario: Scenario) => {
    setScenario(updatedScenario);
    setOriginalScenario(JSON.parse(JSON.stringify(updatedScenario)));
    // scenarios map도 함께 업데이트
    setScenarios(prev => {
      if (!activeScenarioId) return prev;
      return {
        ...prev,
        [activeScenarioId]: updatedScenario
      };
    });
    // console.log('🔄 시나리오 업데이트됨 (Intent Mapping 포함):', updatedScenario);
  }, [activeScenarioId]);

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
              onCreateNewScenario={createNewScenario}
              onSaveAllScenarios={handleSaveAllScenarios}
              scenarios={scenarios}
              activeScenarioId={activeScenarioId}
              onSwitchScenario={switchScenario}
              onDeleteScenario={deleteScenario}
              onUpdateScenarioName={updateScenarioName}
              nodes={nodes}
              originalScenario={originalScenario}
              onNodeUpdate={(updatedNode) => {
                setNodes(nodes => 
                  nodes.map(node => node.id === updatedNode.id ? updatedNode : node)
                );
              }}
              isLoading={isLoading}
              loadingTime={loadingTime}
              onAllScenariosLoad={handleAllScenariosLoad}
              setIsLoading={setIsLoading}
              setLoadingTime={setLoadingTime}
              onBotInfoDetected={(id, ver) => {
                // Store to localStorage so TestPanel can read initial values
                try {
                  localStorage.setItem('SC_BOT_ID', id);
                  localStorage.setItem('SC_BOT_VERSION', ver);
                } catch {}
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
              currentState={currentState}
              scenario={scenario || null}
              scenarios={scenarios}
              currentScenarioId={activeScenarioId}
              onNodeSelect={handleNodeSelect}
              onNodesChange={handleNodesChange}
              onEdgesChange={handleEdgesChange}
              isTestMode={isTestMode}
              onLayoutReset={handleLayoutReset}
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
            scenarios={scenarios}
          />
              </Box>
            </Box>
          )}
        </Box>

        {/* Test Mode Toggle + 현재 상태 표시 (나란히) */}
        <Box sx={{ position: 'fixed', bottom: 16, left: 16, zIndex: 1000, display: 'flex', gap: 1, alignItems: 'center' }}>
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
          {currentState && (
            <Box
              sx={{
                backgroundColor: '#1976d2',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '14px',
                fontWeight: 'bold',
                boxShadow: 2,
                whiteSpace: 'nowrap'
              }}
            >
              현재 상태: {currentState}
            </Box>
          )}
        </Box>

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
