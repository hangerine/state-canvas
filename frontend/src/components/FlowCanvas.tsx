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
        type="target"
        position={Position.Left}
        id={`${id}-target`}
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
        type="source"
        position={Position.Right}
        id={`${id}-source`}
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

// 커스텀 노드 타입 정의
const nodeTypes: NodeTypes = {
  custom: CustomNode,
  scenarioTransition: ScenarioTransitionNode,
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
  ...rest
}) => {
  const { project, screenToFlowPosition } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  
  // 로컬 상태
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

  // 자동 레이아웃 모드 상태
  const [autoLayoutEnabled, setAutoLayoutEnabled] = useState(false);

  // 시나리오 전환 모달 상태
  const [scenarioTransitionModal, setScenarioTransitionModal] = useState<{
    open: boolean;
    sourceNode: string;
    targetScenario: string;
    targetState: string;
  }>({ open: false, sourceNode: '', targetScenario: '', targetState: '' });

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
    const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges);
    const typedNodes = layoutedNodes.map(node => ({
      ...node,
      type: node.type || 'custom'
    })) as FlowNode[];
    onNodesChange?.(typedNodes);
  }, [nodes, edges, onNodesChange]);

  // 연결 생성 처리
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return;
    
    const newEdge: FlowEdge = {
      id: `${params.source}-${params.target}-${Date.now()}`,
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle || undefined,
      targetHandle: params.targetHandle || undefined,
      type: 'smoothstep',
      label: '새 연결',
    };
    
    onEdgesChange?.([...edges, newEdge]);
  }, [edges, onEdgesChange]);

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
  }, [edges, onEdgesChange]);

  // 노드 편집 모달 열기
  const handleNodeEdit = useCallback((nodeId: string) => {
    const nodeToEdit = nodes.find(n => n.id === nodeId);
    if (nodeToEdit) {
      setEditingNode(nodeToEdit);
      // Webhook actions 확인
      // console.log('🔍 [DEBUG] FlowCanvas - webhookActions:', nodeToEdit.data.dialogState.webhookActions);
    }
  }, [nodes, scenario]);

  // 노드들로부터 엣지 자동 생성
  const generateEdgesFromNodes = useCallback((nodes: FlowNode[]) => {
    const newEdges: FlowEdge[] = [];
    
    nodes.forEach(node => {
      const state = node.data.dialogState;
      
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
            label: `이벤트: ${handler.event}`,
            type: 'smoothstep'
          };
          newEdges.push(edge);
        }
      });
    });

    return newEdges;
  }, []);

  // 노드 편집 완료 핸들러
  const handleNodeEditSave = useCallback((updated: DialogState | { targetScenario: string; targetState: string }) => {
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
      const flowNode = nodes.find(n => n.id === node.id);
      if (flowNode && onNodeSelect) {
        onNodeSelect(flowNode.id);
      }
      setSelectedNodes([node.id]);
      setSelectedEdges([]);
    },
    [nodes, onNodeSelect]
  );

  // 1. onNodeDoubleClick 핸들러 추가
  const onNodeDoubleClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      event.stopPropagation();
      const flowNode = nodes.find(n => n.id === node.id);
      if (flowNode) {
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
    // 포지션 변경일 경우에만 처리
    const positionChanges = changes.filter(change => change.type === 'position');
    if (positionChanges.length > 0 && onNodesChange) {
      const updatedNodes = applyNodeChanges(changes, nodes) as FlowNode[];
      onNodesChange(updatedNodes);
    }
  }, [nodes, onNodesChange]);

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
    const updatedEdges = edges.filter(e => e.id !== edgeId);
    onEdgesChange?.(updatedEdges);
    setEditingEdge(null);
  }, [edges, onEdgesChange]);

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
    const updatedNodes = nodes.filter(n => n.id !== nodeId);
    const updatedEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    onNodesChange?.(updatedNodes);
    onEdgesChange?.(updatedEdges);
    setContextMenu(null);
  }, [nodes, edges, onNodesChange, onEdgesChange]);

  // 엣지 삭제 버튼 클릭 처리
  const handleEdgeDeleteClick = useCallback((e: React.MouseEvent) => {
    const selectedEdgesList = selectedEdges.length > 0 ? selectedEdges : [];
    if (selectedEdgesList.length > 0) {
      const updatedEdges = edges.filter(edge => !selectedEdgesList.includes(edge.id));
      onEdgesChange?.(updatedEdges);
      setSelectedEdges([]);
      setEdgeButtonAnchor(null);
    }
  }, [edges, selectedEdges, onEdgesChange]);

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
    if (currentState === nodeId) {
      return {
        backgroundColor: '#e3f2fd',
        border: '2px solid #1976d2',
        boxShadow: '0 4px 8px rgba(25, 118, 210, 0.3)',
      };
    }
    return {};
  };

  // 자동 레이아웃 함수 (초기 렌더링 시)
  const applyInitialLayout = useCallback(() => {
    const { nodes: layoutedNodes } = getLayoutedElements(nodes, edges);
    return layoutedNodes;
  }, [nodes, edges]);

  // 초기 레이아웃 적용
  useEffect(() => {
    if (nodes.length > 0 && !nodes.some(n => n.position.x !== 0 || n.position.y !== 0)) {
      const layoutedNodes = applyInitialLayout();
      const typedNodes = layoutedNodes.map(node => ({
        ...node,
        type: node.type || 'custom'
      })) as FlowNode[];
      onNodesChange?.(typedNodes);
    }
  }, []);

  // 시나리오 전환 저장 처리
  const handleScenarioTransitionSave = useCallback(() => {
    const { sourceNode, targetScenario, targetState } = scenarioTransitionModal;
    
    // 새로운 시나리오 전이 노드 생성
    const newNodeId = `scenario-transition-${Date.now()}`;
    const sourceNodeObj = nodes.find(n => n.id === sourceNode);
    
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
      
      onNodesChange?.([...nodes, newNode]);
      onEdgesChange?.([...edges, newEdge]);
    }
    
    setScenarioTransitionModal({ open: false, sourceNode: '', targetScenario: '', targetState: '' });
  }, [scenarioTransitionModal, nodes, edges, onNodesChange, onEdgesChange]);

  // 초기화 버튼 핸들러
  const handleReset = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
    // 필요시 노드/엣지 초기화
  }, []);

  // 노드들을 렌더링용으로 변환 (스타일 적용)
  const styledNodes = nodes.map(node => ({
    ...node,
    data: {
      ...node.data,
      onEdit: handleNodeEdit,
      currentState,
    },
    style: getNodeStyle(node.id),
  }));

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
          nodes={styledNodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange ? handleNodesChangeWithUndo : undefined}
          onEdgesChange={onEdgesChange ? handleEdgesChangeWithUndo : undefined}
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
            <MenuItem disabled>
              여기에 새 노드 추가 (구현 예정)
            </MenuItem>
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
      </Box>

      {/* 노드 편집 모달 */}
      <NodeEditModal
        open={editingNode !== null}
        dialogState={editingNode?.data.dialogState || null}
        onClose={() => setEditingNode(null)}
        onSave={handleNodeEditSave}
        availableWebhooks={scenario?.webhooks || []}
        availableApiCalls={scenario?.apicalls || []}
        scenario={scenario || undefined}
        nodeType={editingNode?.type}
        scenarios={scenarios}
        activeScenarioId={currentScenarioId}
        targetScenario={editingNode?.data.targetScenario}
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