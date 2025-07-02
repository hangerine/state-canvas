import React, { useState, useCallback, useRef } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Box } from '@mui/material';
import Sidebar from './components/Sidebar';
import FlowCanvas from './components/FlowCanvas';
import TestPanel from './components/TestPanel';
import { Scenario, FlowNode, FlowEdge } from './types/scenario';

const theme = createTheme({
  palette: {
    mode: 'light',
  },
});

function App() {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<FlowNode | null>(null);
  const [currentState, setCurrentState] = useState<string>('');
  const [isTestMode, setIsTestMode] = useState(false);
  const [testPanelHeight, setTestPanelHeight] = useState(200);
  const [isResizing, setIsResizing] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(350);
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);
  
  const resizeRef = useRef<HTMLDivElement>(null);
  const sidebarResizeRef = useRef<HTMLDivElement>(null);

  const handleScenarioLoad = useCallback((loadedScenario: Scenario) => {
    setScenario(loadedScenario);
    // JSON을 Flow 노드와 엣지로 변환
    convertScenarioToFlow(loadedScenario);
    
    // 초기 상태 설정 (첫 번째 dialogState)
    if (loadedScenario.plan && loadedScenario.plan.length > 0) {
      const firstDialogState = loadedScenario.plan[0].dialogState[0];
      if (firstDialogState) {
        setCurrentState(firstDialogState.name);
        console.log('🎯 초기 상태 설정:', firstDialogState.name);
      }
    }
  }, []);

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
          const edge: FlowEdge = {
            id: `${state.name}-event-${idx}`,
            source: state.name,
            target: handler.transitionTarget.dialogState,
            label: `이벤트: ${handler.event.type}`,
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
      // 테스트 모드 시작 시 자동으로 USER_DIALOG_START 이벤트 발생
      console.log('🚀 테스트 모드 시작 - USER_DIALOG_START 이벤트 발생');
      
      // Start 상태에서 자동 전이 확인
      const startState = scenario.plan[0]?.dialogState.find(state => state.name === 'Start');
      if (startState) {
        // Event handler 확인
        const dialogStartHandler = startState.eventHandlers?.find(
          handler => handler.event.type === 'USER_DIALOG_START'
        );
        
        if (dialogStartHandler) {
          const targetState = dialogStartHandler.transitionTarget.dialogState;
          console.log(`🎯 자동 전이: Start → ${targetState}`);
          setCurrentState(targetState);
        }
        
        // Condition handler도 확인 (True 조건)
        const trueConditionHandler = startState.conditionHandlers?.find(
          handler => handler.conditionStatement === 'True'
        );
        
        if (trueConditionHandler) {
          const targetState = trueConditionHandler.transitionTarget.dialogState;
          console.log(`⚡ 조건 전이: Start → ${targetState}`);
          setCurrentState(targetState);
        }
      }
    }
  }, [isTestMode, scenario]);

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
              onNodesChange={setNodes}
              onEdgesChange={setEdges}
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
      </Box>
    </ThemeProvider>
  );
}

export default App; 