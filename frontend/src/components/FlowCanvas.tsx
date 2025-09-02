import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Connection,
  Controls,
  Background,
  MiniMap,
  NodeTypes,
  ReactFlowProvider,
  BackgroundVariant,
  useReactFlow,
  ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FlowNode, FlowEdge, DialogState, Scenario } from '../types/scenario';
import CustomNode from './CustomNode';
import NodeEditModal from './NodeEditModal';
import EdgeEditModal from './EdgeEditModal';
import { Menu, MenuItem, Typography, Button, Stack, IconButton, Box, Chip, FormControlLabel } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import dagre from 'dagre';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import EditOffIcon from '@mui/icons-material/EditOff';
import EditIcon from '@mui/icons-material/Edit';
import { Switch } from '@mui/material';
import ReplayIcon from '@mui/icons-material/Replay';
import SwapHorizIcon from '@mui/icons-material/SwapHoriz';
import AltRouteIcon from '@mui/icons-material/AltRoute';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import CustomEdge from './CustomEdge';

// 시나리오 전이 노드 컴포넌트
const ScenarioTransitionNode: React.FC<any> = ({ data, id }) => {
  return (
    <Box
      sx={{
        width: 120,
        height: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 1,
        border: '2px dashed #ff6b35',
        borderRadius: 2,
        backgroundColor: '#fff3e0',
        boxShadow: 2,
        position: 'relative',
        overflow: 'visible', // Handle이 보이도록 변경
      }}
    >
      {/* Input Handle (왼쪽) */}
      <Handle
        id="left-target"
        type="target"
        position={Position.Left}
        style={{
          background: '#ff6b35',
          width: 8,
          height: 8,
          border: '2px solid #fff',
        }}
      />
      
      {/* Input Handle (위쪽) */}
      <Handle
        id="top-target"
        type="target"
        position={Position.Top}
        style={{
          background: '#ff6b35',
          width: 8,
          height: 8,
          border: '2px solid #fff',
        }}
      />
      
      <SwapHorizIcon sx={{ color: '#ff6b35', fontSize: 20, mb: 0.5 }} />
      <Typography 
        variant="caption" 
        sx={{ 
          fontWeight: 'bold',
          textAlign: 'center',
          color: '#ff6b35',
          fontSize: '0.7rem',
          lineHeight: 1.2,
        }}
      >
        {data.targetScenario || '시나리오 전이'}
      </Typography>
      {data.targetState && (
        <Typography 
          variant="caption" 
          sx={{ 
            textAlign: 'center',
            color: '#ff6b35',
            fontSize: '0.6rem',
            opacity: 0.8,
          }}
        >
          → {data.targetState}
        </Typography>
      )}
      
      {/* Output Handle (오른쪽) */}
      <Handle
        id="right-source"
        type="source"
        position={Position.Right}
        style={{
          background: '#ff6b35',
          width: 8,
          height: 8,
          border: '2px solid #fff',
        }}
      />
      
      {/* Output Handle (아래쪽) */}
      <Handle
        id="bottom-source"
        type="source"
        position={Position.Bottom}
        style={{
          background: '#ff6b35',
          width: 8,
          height: 8,
          border: '2px solid #fff',
        }}
      />
    </Box>
  );
};

// 플랜 전이 노드 컴포넌트
const PlanTransitionNode: React.FC<any> = ({ data, id }) => {
  return (
    <Box
      sx={{
        width: 120,
        height: 60,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 1,
        border: '2px dashed #6a1b9a',
        borderRadius: 2,
        backgroundColor: '#f3e5f5',
        boxShadow: 2,
        position: 'relative',
        overflow: 'visible',
      }}
    >
      {/* Input Handle (왼쪽/위) */}
      <Handle id="left-target" type="target" position={Position.Left} style={{ background: '#6a1b9a', width: 8, height: 8, border: '2px solid #fff' }} />
      <Handle id="top-target" type="target" position={Position.Top} style={{ background: '#6a1b9a', width: 8, height: 8, border: '2px solid #fff' }} />

      <AltRouteIcon sx={{ color: '#6a1b9a', fontSize: 20, mb: 0.5 }} />
      <Typography variant="caption" sx={{ fontWeight: 'bold', textAlign: 'center', color: '#6a1b9a', fontSize: '0.7rem', lineHeight: 1.2 }}>
        {data.targetPlan || '플랜 전이'}
      </Typography>
      {data.targetState && (
        <Typography variant="caption" sx={{ textAlign: 'center', color: '#6a1b9a', fontSize: '0.6rem', opacity: 0.8 }}>
          → {data.targetState}
        </Typography>
      )}

      {/* Output Handle (오른쪽/아래) */}
      <Handle id="right-source" type="source" position={Position.Right} style={{ background: '#6a1b9a', width: 8, height: 8, border: '2px solid #fff' }} />
      <Handle id="bottom-source" type="source" position={Position.Bottom} style={{ background: '#6a1b9a', width: 8, height: 8, border: '2px solid #fff' }} />
    </Box>
  );
};

// 커스텀 노드 타입 정의
const nodeTypes: NodeTypes = {
  custom: CustomNode,
  scenarioTransition: ScenarioTransitionNode,
  planTransition: PlanTransitionNode,
};

const edgeTypes = {
  custom: CustomEdge,
};

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  currentState: string;
  scenario: Scenario | null;
  scenarios: { [key: string]: Scenario };
  currentScenarioId: string;
  onNodeSelect?: (nodeName: string | null) => void;
  onNodesChange?: (nodes: FlowNode[]) => void;
  onEdgesChange?: (edges: FlowEdge[]) => void;
  isTestMode?: boolean;
  onLayoutReset?: () => void;
}

const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ 
    rankdir: 'LR', 
    nodesep: 100, 
    ranksep: 150,
    edgesep: 50,
    ranker: 'network-simplex'
  });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 150, height: 50 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    const layoutedNode = {
      ...node,
      position: {
        x: nodeWithPosition.x - 75,
        y: nodeWithPosition.y - 25,
      },
    };

    return layoutedNode;
  });

  return { nodes: layoutedNodes, edges };
};

const FlowCanvasContent: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  currentState,
  scenario,
  scenarios,
  currentScenarioId,
  onNodeSelect,
  onNodesChange,
  onEdgesChange,
  isTestMode,
  onLayoutReset,
  ...rest
}) => {
  const { project, screenToFlowPosition, getNodes: rfGetNodes, fitView, setNodes, setEdges } = useReactFlow();
  const rfInstanceRef = useRef<ReactFlowInstance | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 로컬 상태
  const [internalNodes, setInternalNodes] = useState<FlowNode[]>(nodes);
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [editingEdge, setEditingEdge] = useState<FlowEdge | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    type: 'node' | 'pane';
    nodeId?: string;
  } | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [edgeButtonAnchor, setEdgeButtonAnchor] = useState<{ x: number; y: number } | null>(null);
  const [undoStack, setUndoStack] = useState<{ nodes: FlowNode[]; edges: FlowEdge[] }[]>([]);
  const [redoStack, setRedoStack] = useState<{ nodes: FlowNode[]; edges: FlowEdge[] }[]>([]);

  // 편집 가능 여부
  const [isEditable, setIsEditable] = useState(true);
  useEffect(() => {
    setInternalNodes(nodes);
  }, [nodes]);

  // 자동 레이아웃 모드 상태
  const [autoLayoutEnabled, setAutoLayoutEnabled] = useState(false);

  // 시나리오 전환 모달 상태
  const [scenarioTransitionModal, setScenarioTransitionModal] = useState<{
    open: boolean;
    sourceNode: string;
    targetScenario: string;
    targetState: string;
  }>({ open: false, sourceNode: '', targetScenario: '', targetState: '' });

  // 플랜 전환 모달 상태
  const [planTransitionModal, setPlanTransitionModal] = useState<{
    open: boolean;
    sourceNode: string;
    targetPlan: string;
    targetState: string;
  }>({ open: false, sourceNode: '', targetPlan: '', targetState: '' });

  // Undo 동작
  const handleUndo = useCallback(() => {
    if (undoStack.length > 0) {
      const prevState = undoStack[undoStack.length - 1];
      setRedoStack([...redoStack, { nodes, edges }]);
      setUndoStack(undoStack.slice(0, -1));
      onNodesChange?.(prevState.nodes);
      onEdgesChange?.(prevState.edges);
    }
  }, [undoStack, redoStack, nodes, edges, onNodesChange, onEdgesChange]);

  // Redo 동작
  const handleRedo = useCallback(() => {
    if (redoStack.length > 0) {
      const nextState = redoStack[redoStack.length - 1];
      setUndoStack([...undoStack, { nodes, edges }]);
      setRedoStack(redoStack.slice(0, -1));
      onNodesChange?.(nextState.nodes);
      onEdgesChange?.(nextState.edges);
    }
  }, [undoStack, redoStack, nodes, edges, onNodesChange, onEdgesChange]);

  // 자동 레이아웃 함수
  const handleAutoLayout = useCallback(() => {
    setUndoStack(stack => [...stack, { nodes: internalNodes, edges }]);
    setRedoStack([]);
    const { nodes: layoutedNodes } = getLayoutedElements(internalNodes as unknown as Node[], edges as unknown as Edge[]);
    const typedNodes = (layoutedNodes as any).map((node: any) => ({
      ...node,
      type: node.type || 'custom'
    })) as FlowNode[];
    setInternalNodes(typedNodes);
    onNodesChange?.(typedNodes);
    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }, [internalNodes, edges, onNodesChange, fitView]);

  // 두 노드 간의 최적 핸들 조합을 반환하는 함수
  const getOptimalHandles = useCallback((sourceNode: FlowNode, targetNode: FlowNode) => {
    // 소스 노드의 위치
    const sourcePos = sourceNode.position;
    // 타겟 노드의 위치
    const targetPos = targetNode.position;
    
    // 두 노드 간의 상대적 위치 계산
    const deltaX = targetPos.x - sourcePos.x;
    const deltaY = targetPos.y - sourcePos.y;
    
    // Source는 항상 right 또는 bottom, Target은 항상 top 또는 left
    let sourceHandle: string | undefined;
    let targetHandle: string | undefined;
    
    if (Math.abs(deltaX) > Math.abs(deltaY)) {
      // 수평 연결이 더 적절
      if (deltaX > 0) {
        // 소스가 왼쪽, 타겟이 오른쪽
        sourceHandle = 'right-source';
        targetHandle = 'top-target';
      } else {
        // 소스가 오른쪽, 타겟이 왼쪽
        sourceHandle = 'right-source';
        targetHandle = 'top-target';
      }
    } else {
      // 수직 연결이 더 적절
      if (deltaY > 0) {
        // 소스가 위쪽, 타겟이 아래쪽
        sourceHandle = 'bottom-source';
        targetHandle = 'left-target';
      } else {
        // 소스가 아래쪽, 타겟이 위쪽
        sourceHandle = 'bottom-source';
        targetHandle = 'left-target';
      }
    }
    
    return { sourceHandle, targetHandle };
  }, []);

  // 연결 개수를 고려한 핸들 선택 함수
  const getHandlesWithConnectionCount = useCallback((sourceNode: FlowNode, targetNode: FlowNode) => {
    // 소스 노드의 각 핸들별 사용 개수 계산
    const rightSourceCount = edges.filter(edge => 
      edge.source === sourceNode.id && edge.sourceHandle === 'right-source'
    ).length;
    const bottomSourceCount = edges.filter(edge => 
      edge.source === sourceNode.id && edge.sourceHandle === 'bottom-source'
    ).length;
    
    // 타겟 노드의 각 핸들별 사용 개수 계산
    const leftTargetCount = edges.filter(edge => 
      edge.target === targetNode.id && edge.targetHandle === 'left-target'
    ).length;
    const topTargetCount = edges.filter(edge => 
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
  }, [edges]);

  // 연결 생성 처리
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return;
    
    // 가장 가까운 핸들끼리 연결하기 위한 핸들 선택 로직
    const sourceNode = internalNodes.find(n => n.id === params.source);
    const targetNode = internalNodes.find(n => n.id === params.target);
    
    if (!sourceNode || !targetNode) return;
    
    // 최적 핸들 조합 선택
    const { sourceHandle, targetHandle } = getHandlesWithConnectionCount(sourceNode, targetNode);
    
    setUndoStack(stack => [...stack, { nodes, edges }]);
    setRedoStack([]);
    const newEdge: FlowEdge = {
      id: `${params.source}-${params.target}-${Date.now()}`,
      source: params.source,
      target: params.target,
      sourceHandle: sourceHandle,
      targetHandle: targetHandle,
      type: 'smoothstep',
      label: '새 연결',
    };
    
    onEdgesChange?.([...edges, newEdge]);
  }, [edges, onEdgesChange, internalNodes, getHandlesWithConnectionCount]);

  // 노드 변경 처리 - Undo 스택 추가
  const handleNodesChangeWithUndo = useCallback((changes: NodeChange[]) => {
    setUndoStack(stack => [...stack, { nodes, edges }]);
    setRedoStack([]);
    const updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];
    onNodesChange?.(updatedNodes);
  }, [nodes, edges, onNodesChange]);

  // 엣지 변경 처리 - Undo 스택 추가
  const handleEdgesChangeWithUndo = useCallback((changes: EdgeChange[]) => {
    setUndoStack(stack => [...stack, { nodes, edges }]);
    setRedoStack([]);
    const updatedEdges = applyEdgeChanges(changes, edges) as FlowEdge[];
    onEdgesChange?.(updatedEdges);
  }, [nodes, edges, onEdgesChange]);

  // 엣지 업데이트 처리 
  const handleEdgeUpdate = useCallback((oldEdge: Edge, newConnection: Connection) => {
    if (!newConnection.source || !newConnection.target) return;
    
    setUndoStack(stack => [...stack, { nodes: internalNodes, edges }]);
    setRedoStack([]);
    const updatedEdges = edges.map(e => 
      e.id === oldEdge.id 
        ? { 
            ...e, 
            source: newConnection.source, 
            target: newConnection.target,
            sourceHandle: newConnection.sourceHandle || undefined,
            targetHandle: newConnection.targetHandle || undefined,
          }
        : e
    ) as FlowEdge[];
    
    onEdgesChange?.(updatedEdges);
  }, [edges, onEdgesChange, internalNodes]);

  // 노드 편집 모달 열기
  const handleNodeEdit = useCallback((nodeId: string) => {
    const nodeToEdit = internalNodes.find(n => n.id === nodeId);
    if (nodeToEdit) {
      setEditingNode(nodeToEdit);
      // Webhook actions 확인
      // console.log('🔍 [DEBUG] FlowCanvas - webhookActions:', nodeToEdit.data.dialogState.webhookActions);
    }
  }, [internalNodes, scenario]);

  // 노드들로부터 엣지 자동 생성
  const generateEdgesFromNodes = useCallback((nodes: FlowNode[]) => {
    const newEdges: FlowEdge[] = [];
    
    nodes.forEach(node => {
      const state = node.data.dialogState;
      
      // Condition handlers에서 전이 관계 추출
      state.conditionHandlers?.forEach((handler: any, idx: number) => {
        if (handler.transitionTarget.dialogState && 
            handler.transitionTarget.dialogState !== '__CURRENT_DIALOG_STATE__' &&
            handler.transitionTarget.dialogState !== '__END_SESSION__') {
          const targetNode = nodes.find(n => n.data.dialogState.name === handler.transitionTarget.dialogState);
          if (targetNode) {
            const { sourceHandle, targetHandle } = getOptimalHandles(node, targetNode);
            const edge: FlowEdge = {
              id: `${state.name}-condition-${idx}`,
              source: state.name,
              target: handler.transitionTarget.dialogState,
              sourceHandle,
              targetHandle,
              label: `조건: ${handler.conditionStatement}`,
              type: 'smoothstep'
            };
            newEdges.push(edge);
          }
        }
      });

      // Intent handlers에서 전이 관계 추출
      state.intentHandlers?.forEach((handler: any, idx: number) => {
        if (handler.transitionTarget.dialogState && handler.transitionTarget.dialogState !== '__CURRENT_DIALOG_STATE__') {
          const targetNode = nodes.find(n => n.data.dialogState.name === handler.transitionTarget.dialogState);
          if (targetNode) {
            const { sourceHandle, targetHandle } = getOptimalHandles(node, targetNode);
            const edge: FlowEdge = {
              id: `${state.name}-intent-${idx}`,
              source: state.name,
              target: handler.transitionTarget.dialogState,
              sourceHandle,
              targetHandle,
              label: `인텐트: ${handler.intent}`,
              type: 'smoothstep'
            };
            newEdges.push(edge);
          }
        }
      });

      // Event handlers에서 전이 관계 추출
      state.eventHandlers?.forEach((handler: any, idx: number) => {
        if (handler.transitionTarget.dialogState && 
            handler.transitionTarget.dialogState !== '__CURRENT_DIALOG_STATE__') {
          const targetNode = nodes.find(n => n.data.dialogState.name === handler.transitionTarget.dialogState);
          if (targetNode) {
            const { sourceHandle, targetHandle } = getOptimalHandles(node, targetNode);
            const edge: FlowEdge = {
              id: `${state.name}-event-${idx}`,
              source: state.name,
              target: handler.transitionTarget.dialogState,
              sourceHandle,
              targetHandle,
              label: `이벤트: ${handler.event}`,
              type: 'smoothstep'
            };
            newEdges.push(edge);
          }
        }
      });
    });

    return newEdges;
  }, []);

  // 노드 편집 완료 핸들러
  const handleNodeEditSave = useCallback((updated: DialogState | { targetScenario: string; targetState: string } | { targetPlan: string; targetState: string }) => {
    // 스냅샷 저장
    setUndoStack(stack => [...stack, { nodes, edges }]);
    setRedoStack([]);
    if (editingNode?.type === 'scenarioTransition' && 'targetScenario' in updated && 'targetState' in updated) {
      const updatedNode = {
        ...editingNode,
        data: {
          ...editingNode.data,
          targetScenario: updated.targetScenario,
          targetState: updated.targetState,
        },
      };
      onNodesChange?.(nodes.map(n => n.id === updatedNode.id ? updatedNode : n));
      setEditingNode(null);
      return;
    }
    if (editingNode?.type === 'planTransition' && 'targetPlan' in updated && 'targetState' in updated) {
      const updatedNode = {
        ...editingNode,
        data: {
          ...editingNode.data,
          targetPlan: updated.targetPlan,
          targetState: updated.targetState,
        },
      };
      onNodesChange?.(nodes.map(n => n.id === updatedNode.id ? updatedNode : n));
      setEditingNode(null);
      return;
    }
    // 기존 DialogState 업데이트 로직
    if (editingNode) {
      const updatedNode = {
        ...editingNode,
        data: {
          ...editingNode.data,
          dialogState: updated as DialogState,
        },
      };
      const updatedNodes = nodes.map(n => n.id === updatedNode.id ? updatedNode : n);
      // --- 에지 자동 생성 로직 제거 (App.tsx에서 처리) ---
      // 노드 업데이트만 수행
      onNodesChange?.(updatedNodes);
      setEditingNode(null);
    }
  }, [editingNode, nodes, onNodesChange]);

  // 렌더링 시 style은 currentState 등으로 동적으로 계산해서 적용
  useEffect(() => {
    const updatedNodes = nodes.map(node => ({
      ...node,
      type: node.type || 'custom',
      data: {
        ...node.data,
        onEdit: handleNodeEdit,
        currentState, // 현재 상태 이름 전달
      },
      style: {
        ...node.style,
        backgroundColor: currentState === node.id ? '#e3f2fd' : '#ffffff',
        border: currentState === node.id ? '2px solid #1976d2' : '1px solid #ccc',
      }
    }));
    // onNodesChange(updatedNodes); // 내부 상태 업데이트 제거
  }, [nodes, currentState, handleNodeEdit]);

  // --- 선택된 에지 id 추적 ---
  const selectedEdgeIds = selectedEdges;

  // --- 모든 에지 type을 'smoothstep' + markerEnd: 'arrowclosed'로 강제 적용 ---
  useEffect(() => {
    // edges의 type을 모두 'smoothstep'으로, markerEnd를 'arrowclosed'로 지정 (공식 권장 방식)
    const styledEdges = edges.map(e => {
      const isSelected = selectedEdgeIds.includes(e.id);
      const isScenarioTransition = (typeof e.label === 'string' && e.label.includes('시나리오 전이')) || e.target.includes('scenario-');
      
      // 시나리오 간 전이인 경우 라벨 스타일 개선
      let enhancedLabel = e.label;
      if (isScenarioTransition && typeof e.label === 'string') {
        const targetScenarioMatch = e.target.match(/scenario-(\d+)/);
        if (targetScenarioMatch) {
          const targetScenarioId = targetScenarioMatch[1];
          const targetScenario = scenarios[targetScenarioId];
          if (targetScenario) {
            // 시나리오 이름과 상태를 더 명확하게 표시
            enhancedLabel = e.label; // 이미 포맷팅된 라벨 유지
          }
        }
      }
      
      return {
        ...e,
        type: 'custom',
        markerEnd: {
          type: 'arrowclosed' as const,
          width: 20,
          height: 20,
          color: isSelected ? '#1565c0' : '#222',
        },
        style: {
          ...e.style,
          stroke: isSelected ? '#1565c0' : e.style?.stroke || '#222',
          strokeWidth: isSelected ? 2.5 : e.style?.strokeWidth || 1.5,
          strokeDasharray: isScenarioTransition ? '5,5' : undefined,
        },
        label: enhancedLabel,
        labelStyle: {
          fill: '#000',
          fontWeight: 500,
          fontSize: 11,
          background: 'rgba(255, 255, 255, 0.9)',
          padding: '2px 4px',
          borderRadius: '3px',
          border: isScenarioTransition ? '1px solid #ff9800' : '1px solid #ccc',
        },
        labelBgStyle: {
          fill: 'rgba(255, 255, 255, 0.9)',
        },
      };
    });
    // onEdgesChange?.(styledEdges); // 상태 업데이트 제거하여 무한 루프 방지
  }, [edges, selectedEdgeIds, scenarios]);

  // 자동 레이아웃 모드가 활성화되면 레이아웃 적용
  useEffect(() => {
    if (autoLayoutEnabled && nodes.length > 0) {
      handleAutoLayout();
    }
  }, [autoLayoutEnabled, nodes.length, handleAutoLayout]);

  // Handle 표시 스위칭을 위한 함수
  const swapHandleSuffix = (handle: string | undefined): string | undefined => {
    if (!handle) return undefined;
    if (handle.endsWith('-source')) {
      return handle.replace('-source', '-target');
    } else if (handle.endsWith('-target')) {
      return handle.replace('-target', '-source');
    }
    return handle;
  };

  // 노드 클릭 처리
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const flowNode = internalNodes.find(n => n.id === node.id);
      if (flowNode && onNodeSelect) {
        onNodeSelect(flowNode.id);
      }
      setSelectedNodes([node.id]);
      setSelectedEdges([]);
    },
    [internalNodes, onNodeSelect]
  );

  // 1. onNodeDoubleClick 핸들러 추가
  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation();
      const flowNode = nodes.find(n => n.id === node.id);
      if (flowNode) {
        console.log('🔍 [DEBUG] FlowCanvas - 노드 더블클릭:', flowNode);
        console.log('🔍 [DEBUG] FlowCanvas - 노드 타입:', flowNode.type);
        console.log('🔍 [DEBUG] FlowCanvas - 노드 데이터:', flowNode.data);
        if (flowNode.type === 'scenarioTransition') {
          console.log('🔍 [DEBUG] FlowCanvas - 시나리오 전이 노드 데이터:', {
            targetScenario: flowNode.data.targetScenario,
            targetState: flowNode.data.targetState
          });
          setEditingNode({ ...flowNode, type: 'scenarioTransition' });
        } else if (flowNode.type === 'planTransition') {
          console.log('🔍 [DEBUG] FlowCanvas - 플랜 전이 노드 데이터:', {
            targetPlan: flowNode.data.targetPlan,
            targetState: flowNode.data.targetState
          });
          setEditingNode({ ...flowNode, type: 'planTransition' });
          return;
        }
        setEditingNode({ ...flowNode, type: flowNode.type || 'custom' });
      }
    },
    [nodes]
  );

  // 연결 클릭 처리
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    // React Flow의 onEdgeClick은 (event, edge) 순서
    setSelectedEdges([edge.id]);
    setEdgeButtonAnchor({ x: event.clientX, y: event.clientY });
    
    // 시나리오 간 전이인 경우 더블클릭으로 편집 모달 열기
    const isScenarioTransition = (typeof edge.label === 'string' && edge.label.includes('시나리오 전이')) || edge.target.includes('scenario-');
    if (isScenarioTransition) {
      setEditingEdge(edge as FlowEdge);
    }
  }, []);

  // Pane 클릭 처리
  const handlePaneClick = useCallback(() => {
    if (onNodeSelect) {
      onNodeSelect(null);
    }
    setSelectedNodes([]);
    setSelectedEdges([]);
    setEdgeButtonAnchor(null);
  }, [onNodeSelect]);

  // 노드 변경 처리
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    // ReactFlow 내부 state를 유지하면서 position/selection 등은 내부 상태로만 반영
    setInternalNodes(prev => applyNodeChanges(changes, prev) as FlowNode[]);
  }, []);

  const handleNodeDragStop = useCallback((evt: React.MouseEvent, node: Node) => {
    if (!onNodesChange) return;
    // 스냅샷 저장
    setUndoStack(stack => [...stack, { nodes, edges }]);
    setRedoStack([]);
    const rfNodes = rfGetNodes();
    const updatedNodes = internalNodes.map(n => {
      const rn = rfNodes.find(r => r.id === n.id);
      return rn ? { ...n, position: rn.position } : n;
    }) as FlowNode[];
    onNodesChange(updatedNodes);
  }, [internalNodes, onNodesChange, rfGetNodes, edges, nodes]);

  // 엣지 더블클릭 처리
  const onEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation();
    setEditingEdge(edge as FlowEdge);
  }, []);

  // 엣지 편집 저장 처리
  const handleEdgeEditSave = useCallback((updatedEdge: FlowEdge) => {
    const updatedEdges = edges.map(e => e.id === updatedEdge.id ? updatedEdge : e);
    onEdgesChange?.(updatedEdges);
    setEditingEdge(null);
  }, [edges, onEdgesChange]);

  // 엣지 삭제 처리
  const handleEdgeDelete = useCallback((edgeId: string) => {
    setUndoStack(stack => [...stack, { nodes: internalNodes, edges }]);
    setRedoStack([]);
    const updatedEdges = edges.filter(e => e.id !== edgeId);
    onEdgesChange?.(updatedEdges);
    setEditingEdge(null);
  }, [edges, onEdgesChange, internalNodes]);

  // 컨텍스트 메뉴 처리
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    // 어떤 요소 위에서 클릭했는지 확인
    const target = e.target as HTMLElement;
    const nodeElement = target.closest('.react-flow__node');
    
    if (nodeElement) {
      const nodeId = nodeElement.getAttribute('data-id');
      const position = screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });
      if (nodeId) {
        setContextMenu({
          x: e.clientX,
          y: e.clientY,
          type: 'node',
          nodeId: nodeId,
        });
      }
    } else {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        type: 'pane',
      });
    }
  }, [screenToFlowPosition]);

  // 컨텍스트 메뉴 닫기
  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 노드 삭제 처리
  const handleNodeDelete = useCallback((nodeId: string) => {
    setUndoStack(stack => [...stack, { nodes: internalNodes, edges }]);
    setRedoStack([]);
    const updatedNodes = internalNodes.filter(n => n.id !== nodeId);
    const updatedEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    onNodesChange?.(updatedNodes);
    onEdgesChange?.(updatedEdges);
    setContextMenu(null);
  }, [internalNodes, edges, onNodesChange, onEdgesChange]);

  // 엣지 삭제 버튼 클릭 처리
  const handleEdgeDeleteClick = useCallback((e: React.MouseEvent) => {
    const selectedEdgesList = selectedEdges.length > 0 ? selectedEdges : [];
    if (selectedEdgesList.length > 0) {
      setUndoStack(stack => [...stack, { nodes, edges }]);
      setRedoStack([]);
      const updatedEdges = edges.filter(edge => !selectedEdgesList.includes(edge.id));
      onEdgesChange?.(updatedEdges);
      setSelectedEdges([]);
      setEdgeButtonAnchor(null);
    }
  }, [edges, nodes, selectedEdges, onEdgesChange]);

  // 엣지 버튼 위치 계산
  const getEdgeButtonPosition = () => {
    if (!edgeButtonAnchor || !containerRef.current) return null;
    
    const rect = containerRef.current.getBoundingClientRect();
    return {
      x: edgeButtonAnchor.x - rect.left,
      y: edgeButtonAnchor.y - rect.top,
    };
  };

  const edgeButtonPosition = getEdgeButtonPosition();

  // 노드 스타일 계산
  const getNodeStyle = (nodeId: string) => {
    const node = internalNodes.find(n => n.id === nodeId);
    let baseStyle = {};
    
    // 노드 타입에 따른 기본 스타일
    if (node?.type === 'state') {
      baseStyle = {
        backgroundColor: '#e3f2fd',
        border: '2px solid #2196f3',
        borderRadius: '8px',
      };
    } else if (node?.type === 'scenarioTransition') {
      baseStyle = {
        backgroundColor: '#fff3e0',
        border: '2px solid #ff9800',
        borderRadius: '8px',
      };
    } else if (node?.type === 'custom' && (node.data.label === '__END_SCENARIO__' || node.data.label === '__END_SESSION__')) {
      baseStyle = {
        backgroundColor: '#e8f5e9',
        border: '2px dashed #4CAF50',
        borderRadius: '8px',
      };
    } else if (node?.type === 'custom' && node.data.label === '__END_PROCESS__') {
      baseStyle = {
        backgroundColor: '#eeeeee',
        border: '2px dashed #9e9e9e',
        borderRadius: '8px',
      };
    } else {
      // custom 타입 (기본)
      baseStyle = {
        backgroundColor: '#ffffff',
        border: '1px solid #ccc',
        borderRadius: '4px',
      };
    }
    
    // 현재 상태인 경우 강조 스타일 추가
    if (currentState === nodeId) {
      return {
        ...baseStyle,
        boxShadow: '0 4px 8px rgba(25, 118, 210, 0.3)',
        border: '2px solid #1976d2',
      };
    }
    
    return baseStyle;
  };

  // 자동 레이아웃 함수 (초기 렌더링 시)
  const applyInitialLayout = useCallback(() => {
    const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges);
    return layoutedNodes;
  }, [nodes, edges]);

  // 초기 레이아웃 적용
  useEffect(() => {
    if (internalNodes.length === 0) return;
    // 화면 맞춤만 수행 (초기 자동 레이아웃은 버튼으로 실행)
    requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }, [internalNodes.length, fitView]);

  // 시나리오 전환 저장 처리
  const handleScenarioTransitionSave = useCallback(() => {
    const { sourceNode, targetScenario, targetState } = scenarioTransitionModal;
    
    // 새로운 시나리오 전이 노드 생성
    const newNodeId = `scenario-transition-${Date.now()}`;
    const sourceNodeObj = internalNodes.find(n => n.id === sourceNode);
    
    if (sourceNodeObj) {
      const newNode: FlowNode = {
        id: newNodeId,
        type: 'scenarioTransition',
        position: { 
          x: sourceNodeObj.position.x + 200, 
          y: sourceNodeObj.position.y 
        },
        data: {
          label: `→ ${targetScenario}:${targetState}`,
          dialogState: {
            name: '시나리오 전이',
            conditionHandlers: [],
            eventHandlers: [],
            intentHandlers: [],
            webhookActions: [],
            slotFillingForm: []
          },
          targetScenario,
          targetState
        }
      };
      
      const newEdge: FlowEdge = {
        id: `${sourceNode}-${newNodeId}`,
        source: sourceNode,
        target: newNodeId,
        type: 'smoothstep',
        label: '시나리오 전이'
      };
      
      onNodesChange?.([...internalNodes, newNode]);
      onEdgesChange?.([...edges, newEdge]);
    }
    
    setScenarioTransitionModal({ open: false, sourceNode: '', targetScenario: '', targetState: '' });
  }, [scenarioTransitionModal, nodes, edges, onNodesChange, onEdgesChange]);

  // 플랜 전환 저장 처리
  const handlePlanTransitionSave = useCallback(() => {
    const { sourceNode, targetPlan, targetState } = planTransitionModal;
    const newNodeId = `plan-transition-${sourceNode}-${targetPlan}-${targetState}`;
    // 중복 체크
    if (!nodes.find(n => n.id === newNodeId)) {
      const newNode: FlowNode = {
        id: newNodeId,
        type: 'planTransition',
        position: { x: 0, y: 0 },
        data: { targetPlan, targetState },
      } as any;
      setNodes(prev => [...prev, newNode]);
      const newEdge: FlowEdge = { id: `${sourceNode}-to-${newNodeId}`, source: sourceNode, target: newNodeId } as any;
      setEdges(prev => [...prev, newEdge]);
    }
    setPlanTransitionModal({ open: false, sourceNode: '', targetPlan: '', targetState: '' });
  }, [planTransitionModal, nodes, setNodes, setEdges]);

  // 초기화 버튼 핸들러
  const handleReset = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    if (typeof onLayoutReset === 'function') {
      onLayoutReset();
    }
  }, [onLayoutReset]);

  // 노드들을 렌더링용으로 변환 (스타일 적용)
  const styledNodes = internalNodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      onEdit: handleNodeEdit,
      currentState,
    },
    style: {
      ...node.style, // 노드의 기본 스타일 유지
      ...getNodeStyle(node.id), // 타입별 스타일과 현재 상태 강조 스타일 적용
    },
  }));

  // 새 노드 추가 함수
  const handleAddNewNode = useCallback((x: number, y: number, nodeType: 'state' | 'scenarioTransition' | 'planTransition' | 'endScenario' | 'endSession' | 'endProcess' = 'state') => {
    // 스냅샷 저장
    setUndoStack(stack => [...stack, { nodes, edges }]);
    setRedoStack([]);
    const timestamp = Date.now();
    let newNode: FlowNode;
    
    if (nodeType === 'state') {
      // State 노드 생성
      const newNodeId = `state-node-${timestamp}`;
      newNode = {
        id: newNodeId,
        type: 'state',
        position: { x, y },
        data: {
          label: '새 상태',
          dialogState: {
            name: '새 상태',
            conditionHandlers: [],
            eventHandlers: [],
            intentHandlers: [],
            webhookActions: [],
            slotFillingForm: []
          },
          onEdit: handleNodeEdit,
          handleRefs: {},
        },
        style: {
          backgroundColor: '#e3f2fd',
          border: '2px solid #2196f3',
          borderRadius: '8px',
        },
      };
      console.log('🆕 상태 노드 생성:', newNodeId, newNode);
    } else if (nodeType === 'scenarioTransition') {
      // Scenario 전이 노드 생성
      const newNodeId = `scenario-transition-${timestamp}`;
      newNode = {
        id: newNodeId,
        type: 'scenarioTransition',
        position: { x, y },
        data: {
          label: '시나리오 전이',
          dialogState: {
            name: '시나리오 전이',
            conditionHandlers: [],
            eventHandlers: [],
            intentHandlers: [],
            webhookActions: [],
            slotFillingForm: []
          },
          onEdit: handleNodeEdit,
          handleRefs: {},
        },
        style: {
          backgroundColor: '#fff3e0',
          border: '2px solid #ff9800',
          borderRadius: '8px',
        },
      };
      console.log('🔄 시나리오 전이 노드 생성:', newNodeId, newNode);
    } else if (nodeType === 'planTransition') {
      // 플랜 전이 노드 생성 (시나리오 저장에는 포함하지 않음)
      const newNodeId = `plan-transition-${timestamp}`;
      newNode = {
        id: newNodeId,
        type: 'planTransition',
        position: { x, y },
        data: {
          label: '플랜 전이',
          dialogState: { name: '플랜 전이', conditionHandlers: [], eventHandlers: [], intentHandlers: [], webhookActions: [], slotFillingForm: [] },
          onEdit: handleNodeEdit,
          handleRefs: {},
          targetPlan: '',
          targetState: ''
        },
        style: { backgroundColor: '#f3e5f5', border: '2px solid #6a1b9a', borderRadius: '8px' },
      } as any;
      setPlanTransitionModal({ open: true, sourceNode: '', targetPlan: '', targetState: '' });
      console.log('🔄 플랜 전이 노드 생성:', newNodeId, newNode);
    } else if (nodeType === 'endScenario') {
      // 시나리오 종료 노드 생성
      const newNodeId = `end-scenario-${timestamp}`;
      newNode = {
        id: newNodeId,
        type: 'custom', // 특별한 노드 타입
        position: { x, y },
        data: {
          label: '__END_SCENARIO__',
          dialogState: {
            name: '__END_SCENARIO__',
            conditionHandlers: [],
            eventHandlers: [],
            intentHandlers: [],
            webhookActions: [],
            slotFillingForm: []
          },
          onEdit: handleNodeEdit,
          handleRefs: {},
        },
        style: {
          backgroundColor: '#f44336', // 빨간색으로 표시
          border: '2px solid #d32f2f',
          borderRadius: '8px',
        },
      };
      console.log('🔚 시나리오 종료 노드 생성:', newNodeId, newNode);
    } else if (nodeType === 'endSession') {
      // 세션 종료 노드 생성
      const newNodeId = `end-session-${timestamp}`;
      newNode = {
        id: newNodeId,
        type: 'custom', // 특별한 노드 타입
        position: { x, y },
        data: {
          label: '__END_SESSION__',
          dialogState: {
            name: '__END_SESSION__',
            conditionHandlers: [],
            eventHandlers: [],
            intentHandlers: [],
            webhookActions: [],
            slotFillingForm: []
          },
          onEdit: handleNodeEdit,
          handleRefs: {},
        },
        style: {
          backgroundColor: '#4CAF50', // 초록색으로 표시
          border: '2px solid #388E3C',
          borderRadius: '8px',
        },
      };
      console.log('🔚 세션 종료 노드 생성:', newNodeId, newNode);
    } else if (nodeType === 'endProcess') {
      // 프로세스 종료 노드 생성
      const newNodeId = `end-process-${timestamp}`;
      newNode = {
        id: newNodeId,
        type: 'custom', // 특별한 노드 타입
        position: { x, y },
        data: {
          label: '__END_PROCESS__',
          dialogState: {
            name: '__END_PROCESS__',
            conditionHandlers: [],
            eventHandlers: [],
            intentHandlers: [],
            webhookActions: [],
            slotFillingForm: []
          },
          onEdit: handleNodeEdit,
          handleRefs: {},
        },
        style: {
          backgroundColor: '#eeeeee', // 회색으로 표시
          border: '2px dashed #9e9e9e',
          borderRadius: '8px',
        },
      };
      console.log('🔚 프로세스 종료 노드 생성:', newNodeId, newNode);
    } else {
      // 기본 상태 노드 생성 (fallback)
      const newNodeId = `state-node-${timestamp}`;
      newNode = {
        id: newNodeId,
        type: 'state',
        position: { x, y },
        data: {
          label: '새 상태',
          dialogState: {
            name: '새 상태',
            conditionHandlers: [],
            eventHandlers: [],
            intentHandlers: [],
            webhookActions: [],
            slotFillingForm: []
          },
          onEdit: handleNodeEdit,
          handleRefs: {},
        },
        style: {
          backgroundColor: '#e3f2fd',
          border: '2px solid #2196f3',
          borderRadius: '8px',
        },
      };
      console.log('�� 기본 상태 노드 생성:', newNodeId, newNode);
    }
    
    onNodesChange?.(nodes.concat(newNode));
    
    // 새로 생성된 노드 정보 요약
    console.log('📊 노드 생성 완료:', {
      타입: nodeType,
      ID: newNode.id,
      위치: { x: newNode.position.x, y: newNode.position.y },
      총노드수: nodes.length + 1
    });
    
    // 노드 생성 후 상태 확인
    console.log('🔍 생성된 노드 상세 정보:', {
      노드타입: newNode.type,
      노드ID: newNode.id,
      노드라벨: newNode.data.label,
      노드스타일: newNode.style,
      전체노드수: nodes.length + 1
    });
    
    // onNodesChange 호출 확인
    console.log('📞 onNodesChange 호출됨:', {
      함수존재여부: !!onNodesChange,
      전달된노드수: nodes.concat(newNode).length,
      새노드포함여부: nodes.concat(newNode).some(n => n.id === newNode.id)
    });
    
    // 새 노드가 실제로 추가되었는지 확인
    setTimeout(() => {
      console.log('⏰ 노드 생성 후 상태 확인:', {
        현재노드수: nodes.length,
        새노드ID: newNode.id,
        새노드존재여부: nodes.some(n => n.id === newNode.id)
      });
    }, 100);
  }, [nodes, onNodesChange, handleNodeEdit]);

  // Undo/Redo 단축키
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isInput = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable="true"]');
      if (isInput) return;
      const meta = e.metaKey || e.ctrlKey;
      if (!meta) return;
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  // 시나리오 전환 시 로컬 상태 초기화 (undo/redo 등)
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [currentScenarioId]);

  // 노드 세트/시나리오 변경 시 화면 자동 맞춤
  useEffect(() => {
    if (internalNodes.length > 0) {
      // ReactFlow 내부 레이아웃 반영 이후 실행
      requestAnimationFrame(() => {
        // 우선 훅의 fitView 사용
        try { fitView({ padding: 0.2, includeHiddenNodes: true }); } catch {}
        // 인스턴스가 있다면 인스턴스 기반으로 한 번 더 보장
        if (rfInstanceRef.current) {
          rfInstanceRef.current.fitView({ padding: 0.2, includeHiddenNodes: true });
        }
      });
      // 비동기 반영 지연 대비 재시도
      const timeoutId = setTimeout(() => {
        try { fitView({ padding: 0.2, includeHiddenNodes: true }); } catch {}
        if (rfInstanceRef.current) {
          rfInstanceRef.current.fitView({ padding: 0.2, includeHiddenNodes: true });
        }
      }, 60);
      return () => clearTimeout(timeoutId);
    }
  }, [currentScenarioId, internalNodes, edges.length, fitView]);

  // 테스트 모드 토글 시 화면 자동 맞춤 (패널 폭 변화 반영)
  useEffect(() => {
    // 패널 열림/닫힘 이후 레이아웃이 바뀌므로 두 번 호출로 보장
    requestAnimationFrame(() => {
      try { fitView({ padding: 0.2, includeHiddenNodes: true }); } catch {}
      if (rfInstanceRef.current) {
        rfInstanceRef.current.fitView({ padding: 0.2, includeHiddenNodes: true });
      }
    });
    const t = setTimeout(() => {
      try { fitView({ padding: 0.2, includeHiddenNodes: true }); } catch {}
      if (rfInstanceRef.current) {
        rfInstanceRef.current.fitView({ padding: 0.2, includeHiddenNodes: true });
      }
    }, 120);
    return () => clearTimeout(t);
  }, [isTestMode, fitView]);

  return (
    <>
      <Box ref={containerRef} sx={{ position: 'relative', width: '100%', height: '100%' }}>
        {/* 상단 툴바 */}
        <Box
          sx={{
            position: 'absolute',
            top: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 10,
            display: 'flex',
            gap: 1,
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '8px',
            borderRadius: '8px',
            boxShadow: 2,
          }}
        >
          <FormControlLabel
            control={
              <Switch
                checked={isEditable}
                onChange={(e) => setIsEditable(e.target.checked)}
                size="small"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {isEditable ? <EditIcon fontSize="small" /> : <EditOffIcon fontSize="small" />}
                <Typography variant="body2">
                  {isEditable ? '편집 모드' : '읽기 전용'}
                </Typography>
              </Box>
            }
            sx={{ margin: 0 }}
          />
          
          <IconButton
            onClick={handleAutoLayout}
            title="자동 레이아웃"
            size="small"
            sx={{ 
              backgroundColor: autoLayoutEnabled ? 'primary.light' : 'transparent',
              '&:hover': { backgroundColor: 'primary.light' }
            }}
          >
            <AutoFixHighIcon />
          </IconButton>
          
          <IconButton
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            title="실행 취소"
            size="small"
          >
            <UndoIcon />
          </IconButton>
          
          <IconButton
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            title="다시 실행"
            size="small"
          >
            <RedoIcon />
          </IconButton>
          
          <IconButton
            onClick={handleReset}
            title="초기화"
            size="small"
          >
            <ReplayIcon />
          </IconButton>
        </Box>

        <ReactFlow
          key={currentScenarioId || 'default'}
          nodes={styledNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={(inst) => { rfInstanceRef.current = inst; requestAnimationFrame(() => inst.fitView({ padding: 0.2 })); }}
          onNodesChange={handleNodesChange}
          onNodeDragStop={handleNodeDragStop}
          onEdgesChange={handleEdgesChangeWithUndo}
          onConnect={onEdgesChange ? onConnect : undefined}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onEdgeClick={handleEdgeClick}
          onPaneClick={handlePaneClick}
          onEdgeDoubleClick={onEdgeDoubleClick}
          onEdgeUpdate={onEdgesChange ? handleEdgeUpdate : undefined}
          onPaneContextMenu={handleContextMenu}
          fitView
          minZoom={0.2}
          maxZoom={2}
          selectionOnDrag={isEditable}
          multiSelectionKeyCode={['Shift', 'Meta']}
          style={{ width: '100%', height: '100%' }}
          panOnDrag={true}
          panOnScroll={true}
          zoomOnScroll={true}
          zoomOnPinch={true}
          elementsSelectable={isEditable}
          nodesDraggable={isEditable}
          nodesConnectable={isEditable}
          edgesFocusable={isEditable}
          edgesUpdatable={isEditable}
          {...rest}
        >
          <Background variant={BackgroundVariant.Dots} />
          <Controls />
          <MiniMap />
        </ReactFlow>

        {/* 엣지 삭제 버튼 */}
        {edgeButtonPosition && selectedEdges.length > 0 && (
          <Button
            variant="contained"
            color="error"
            size="small"
            onClick={handleEdgeDeleteClick}
            sx={{
              position: 'absolute',
              left: edgeButtonPosition.x,
              top: edgeButtonPosition.y + 10,
              zIndex: 10,
              minWidth: 'auto',
              padding: '4px 8px',
            }}
          >
            삭제
          </Button>
        )}

        {/* 컨텍스트 메뉴 */}
        <Menu
          open={contextMenu !== null}
          onClose={handleCloseContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={
            contextMenu !== null
              ? { top: contextMenu.y, left: contextMenu.x }
              : undefined
          }
        >
          {contextMenu?.type === 'node' && contextMenu.nodeId && (
            <>
              <MenuItem onClick={() => {
                handleNodeEdit(contextMenu.nodeId!);
                handleCloseContextMenu();
              }}>
                노드 편집
              </MenuItem>
              <MenuItem onClick={() => {
                handleNodeDelete(contextMenu.nodeId!);
                handleCloseContextMenu();
              }}>
                노드 삭제
              </MenuItem>
            </>
          )}
          {contextMenu?.type === 'pane' && (
            <>
              <MenuItem onClick={() => {
                handleAddNewNode(contextMenu.x, contextMenu.y, 'state');
                handleCloseContextMenu();
              }}>
                상태 노드 추가
              </MenuItem>
              <MenuItem onClick={() => {
                handleAddNewNode(contextMenu.x, contextMenu.y, 'scenarioTransition');
                handleCloseContextMenu();
              }}>
                시나리오 전이 노드 추가
              </MenuItem>
              <MenuItem onClick={() => {
                handleAddNewNode(contextMenu.x, contextMenu.y, 'planTransition');
                handleCloseContextMenu();
              }}>
                플랜 전이 노드 추가
              </MenuItem>
              <MenuItem onClick={() => {
                handleAddNewNode(contextMenu.x, contextMenu.y, 'endScenario');
                handleCloseContextMenu();
              }}>
                시나리오 종료 노드 추가
              </MenuItem>
              <MenuItem onClick={() => {
                handleAddNewNode(contextMenu.x, contextMenu.y, 'endSession');
                handleCloseContextMenu();
              }}>
                세션 종료 노드 추가
              </MenuItem>
              <MenuItem onClick={() => {
                handleAddNewNode(contextMenu.x, contextMenu.y, 'endProcess');
                handleCloseContextMenu();
              }}>
                프로세스 종료 노드 추가
              </MenuItem>
            </>
          )}
        </Menu>

        {/* 시나리오 전환 모달 */}
        <Dialog
          open={scenarioTransitionModal.open}
          onClose={() => setScenarioTransitionModal({ open: false, sourceNode: '', targetScenario: '', targetState: '' })}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>시나리오 전환 설정</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
              <Typography variant="body2">
                소스 노드: {scenarioTransitionModal.sourceNode}
              </Typography>
              
              <Typography variant="subtitle2">전환할 시나리오 선택:</Typography>
              <RadioGroup
                value={scenarioTransitionModal.targetScenario}
                onChange={(e) => setScenarioTransitionModal({
                  ...scenarioTransitionModal,
                  targetScenario: e.target.value
                })}
              >
                {Object.entries(scenarios).map(([id, scenario]) => (
                  <FormControlLabel
                    key={id}
                    value={id}
                    control={<Radio />}
                    label={scenario.plan[0]?.name || id}
                  />
                ))}
              </RadioGroup>
              
              {scenarioTransitionModal.targetScenario && (
                <>
                  <Typography variant="subtitle2">시작 상태 선택:</Typography>
                  <RadioGroup
                    value={scenarioTransitionModal.targetState}
                    onChange={(e) => setScenarioTransitionModal({
                      ...scenarioTransitionModal,
                      targetState: e.target.value
                    })}
                  >
                    {scenarios[scenarioTransitionModal.targetScenario]?.plan[0]?.dialogState.map(state => (
                      <FormControlLabel
                        key={state.name}
                        value={state.name}
                        control={<Radio />}
                        label={state.name}
                      />
                    ))}
                  </RadioGroup>
                </>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setScenarioTransitionModal({ open: false, sourceNode: '', targetScenario: '', targetState: '' })}>
              취소
            </Button>
            <Button
              onClick={handleScenarioTransitionSave}
              disabled={!scenarioTransitionModal.targetScenario || !scenarioTransitionModal.targetState}
              variant="contained"
            >
              저장
            </Button>
          </DialogActions>
        </Dialog>

        {/* 플랜 전환 모달 */}
        <Dialog
          open={planTransitionModal.open}
          onClose={() => setPlanTransitionModal({ open: false, sourceNode: '', targetPlan: '', targetState: '' })}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>플랜 전환 설정</DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
              <Typography variant="body2">소스 노드: {planTransitionModal.sourceNode}</Typography>
              <Typography variant="subtitle2">전환할 플랜 선택:</Typography>
              <RadioGroup
                value={planTransitionModal.targetPlan}
                onChange={(e) => setPlanTransitionModal({ ...planTransitionModal, targetPlan: e.target.value })}
              >
                {(scenario?.plan || []).map((pl) => (
                  <FormControlLabel key={pl.name} value={pl.name} control={<Radio />} label={pl.name} />
                ))}
              </RadioGroup>
              {planTransitionModal.targetPlan && (
                <>
                  <Typography variant="subtitle2">시작 상태 선택:</Typography>
                  <RadioGroup
                    value={planTransitionModal.targetState}
                    onChange={(e) => setPlanTransitionModal({ ...planTransitionModal, targetState: e.target.value })}
                  >
                    {(scenario?.plan || []).find(pl => pl.name === planTransitionModal.targetPlan)?.dialogState?.map(state => (
                      <FormControlLabel key={state.name} value={state.name} control={<Radio />} label={state.name} />
                    ))}
                  </RadioGroup>
                </>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setPlanTransitionModal({ open: false, sourceNode: '', targetPlan: '', targetState: '' })}>취소</Button>
            <Button onClick={handlePlanTransitionSave} disabled={!planTransitionModal.targetPlan || !planTransitionModal.targetState} variant="contained">저장</Button>
          </DialogActions>
        </Dialog>
      </Box>

      {/* 노드 편집 모달 */}
      <NodeEditModal
        open={editingNode !== null}
        dialogState={editingNode?.data.dialogState || null}
        onClose={() => setEditingNode(null)}
        onSave={handleNodeEditSave}
        availableWebhooks={(scenario?.webhooks || []).filter(w => !w.type || String(w.type || 'WEBHOOK').toUpperCase() === 'WEBHOOK') as any}
        availableApiCalls={((scenario?.webhooks || []).filter(w => String(w.type || 'WEBHOOK').toUpperCase() === 'APICALL') as any).map((w: any) => ({
          name: w.name,
          url: w.url,
          timeoutInMilliSecond: w.timeoutInMilliSecond || w.timeout || 5000,
          retry: w.retry || 3,
          method: w.method || w.formats?.method || 'POST',
          formats: w.formats || { headers: {}, requestTemplate: '', responseMappings: [] }
        }))}
        scenario={scenario || undefined}
        nodeType={editingNode?.type}
        scenarios={scenarios}
        activeScenarioId={currentScenarioId}
        targetScenario={editingNode?.type === 'planTransition' ? editingNode?.data.targetPlan : editingNode?.data.targetScenario}
        targetState={editingNode?.data.targetState}
        nodes={nodes}
      />

      {/* 연결 편집 모달 */}
      <EdgeEditModal
        open={editingEdge !== null}
        edge={editingEdge}
        onClose={() => setEditingEdge(null)}
        onSave={handleEdgeEditSave}
        onDelete={() => editingEdge && handleEdgeDelete(editingEdge.id)}
        scenarios={scenarios}
        currentScenarioId={currentScenarioId}
      />
    </>
  );
};

const FlowCanvas: React.FC<FlowCanvasProps> = (props) => {
  return (
    <ReactFlowProvider>
      <FlowCanvasContent {...props} />
    </ReactFlowProvider>
  );
};

export default FlowCanvas;
