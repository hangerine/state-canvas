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
const ScenarioTransitionNode: React.FC<any> = ({ data }) => {
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
        overflow: 'hidden',
      }}
    >
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
  scenario?: Scenario;
  scenarios?: { [key: string]: Scenario };
  currentScenarioId?: string;
  onNodeSelect?: (node: FlowNode | null) => void;
  onNodesChange?: (nodes: FlowNode[]) => void;
  onEdgesChange?: (edges: FlowEdge[]) => void;
  isTestMode?: boolean;
}

// 새로운 DialogState 생성 함수
const createNewDialogState = (name: string): DialogState => ({
  name,
  entryAction: {
    directives: [
      {
        name: "speak",
        content: `${name} 상태에 진입했습니다.`
      }
    ]
  },
  conditionHandlers: [],
  eventHandlers: [],
  intentHandlers: [],
  webhookActions: [],
  slotFillingForm: []
});

const FlowCanvasContent: React.FC<FlowCanvasProps> = ({
  nodes,
  edges,
  currentState,
  scenario,
  scenarios = {},
  currentScenarioId = '',
  onNodeSelect,
  onNodesChange,
  onEdgesChange,
  isTestMode = false,
  ...rest
}) => {
  useEffect(() => {
    console.log('FlowCanvas nodes', nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.data.label,
      targetScenario: n.data.targetScenario,
      targetState: n.data.targetState
    })));
  }, [nodes]);
  // 내부 상태 제거
  // const [nodes, setNodes, onNodesStateChange] = useNodesState(initialNodes || []);
  // const [edges, setEdges, onEdgesStateChange] = useEdgesState(initialEdges || []);
  const [contextMenu, setContextMenu] = useState<{
    mouseX: number;
    mouseY: number;
    position: { x: number; y: number };
    nodeId?: string;
  } | null>(null);
  const [editingNode, setEditingNode] = useState<FlowNode | null>(null);
  const [editingEdge, setEditingEdge] = useState<FlowEdge | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [selectedEdges, setSelectedEdges] = useState<string[]>([]);
  const [edgeButtonAnchor, setEdgeButtonAnchor] = useState<{ x: number; y: number } | null>(null);
  const [isEditable, setIsEditable] = useState(true);
  
  const { project, fitView, screenToFlowPosition } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Undo/Redo 스택 (Node[], Edge[])
  const [undoStack, setUndoStack] = useState<{nodes: Node[]; edges: Edge[]}[]>([]);
  const [redoStack, setRedoStack] = useState<{nodes: Node[]; edges: Edge[]}[]>([]);

  // 이전 propNodes/propEdges를 기억하기 위한 ref
  const prevNodesRef = useRef<FlowNode[]>(nodes);
  const prevEdgesRef = useRef<FlowEdge[]>(edges);

  // 최초 시나리오 업로드 시의 노드/에지 상태 저장
  const initialNodesRef = useRef<Node[]>(nodes);
  const initialEdgesRef = useRef<Edge[]>(edges);

  // 최초 마운트 시 초기 상태 push 및 setNodes/setEdges
  useEffect(() => {
    setUndoStack([{ nodes, edges }]);
    setRedoStack([]);
    prevNodesRef.current = nodes;
    prevEdgesRef.current = edges;
    initialNodesRef.current = nodes;
    initialEdgesRef.current = edges;
    // eslint-disable-next-line
  }, []); // 최초 마운트 시에만 실행

  // 노드/에지 변경 래퍼 (NodeChange[], EdgeChange[])
  // 1. onNodesChange에서는 상태만 업데이트 (Undo push X, App의 onNodesChange도 호출 X)
  const handleNodesChangeWithUndo = useCallback((changes: NodeChange[]) => {
    if (!onNodesChange) return;
    const updated = applyNodeChanges(changes, nodes);
    onNodesChange(
      updated
        .filter(n => n && typeof n.id === 'string' && typeof n.data === 'object')
        .map(n => ({ ...n, type: typeof n.type === 'string' ? n.type : 'custom' }))
    );
  }, [nodes, onNodesChange]);

  // 2. onNodeDragStop에서만 Undo 스택에 push + App의 onNodesChange 호출
  const handleNodeDragStop = useCallback(() => {
    // 이전 위치와 비교해서 실제로 바뀐 노드가 있는지 확인
    const hasMoved = nodes.some((node) => {
      const orig = nodes.find(n => n.id === node.id);
      return orig && (orig.position.x !== node.position.x || orig.position.y !== node.position.y);
    });
    if (hasMoved) {
      setUndoStack((stack) => [...stack, { nodes, edges }]);
      setRedoStack([]);
      // onNodesChange(nodes as any); // 이 부분은 외부로 전달하지 않음
    }
  }, [nodes, edges]);

  const handleEdgesChangeWithUndo = useCallback((changes: EdgeChange[]) => {
    if (!onEdgesChange) return;
    const updated = applyEdgeChanges(changes, edges);
    onEdgesChange(updated.map(e => ({ ...e, label: typeof e.label === 'string' ? e.label : '' })));
  }, [edges, onEdgesChange]);

  // Undo 동작
  const handleUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length <= 1) return stack;
      const prev = stack[stack.length - 2];
      setRedoStack((redo) => [{ nodes, edges }, ...redo]);
      onNodesChange?.(prev.nodes.map(n => ({ ...n, type: typeof n.type === 'string' ? n.type : 'custom' })));
      onEdgesChange?.(prev.edges.map(e => ({ ...e, label: typeof e.label === 'string' ? e.label : '' })));
      return stack.slice(0, -1);
    });
  }, [nodes, edges, onNodesChange, onEdgesChange]);

  // Redo 동작
  const handleRedo = useCallback(() => {
    setRedoStack((redo) => {
      if (redo.length === 0) return redo;
      const next = redo[0];
      setUndoStack((stack) => [...stack, { nodes: next.nodes, edges: next.edges }]);
      onNodesChange?.(next.nodes.map(n => ({ ...n, type: typeof n.type === 'string' ? n.type : 'custom' })));
      onEdgesChange?.(next.edges.map(e => ({ ...e, label: typeof e.label === 'string' ? e.label : '' })));
      return redo.slice(1);
    });
  }, [onNodesChange, onEdgesChange]);

  // 단축키 핸들러 (Ctrl+Z, Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y')) {
        handleRedo();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  // 컨테이너 크기 변화 감지 및 자동 fitView
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      // 약간의 지연을 두고 fitView 호출 (레이아웃 완료 후)
      setTimeout(() => {
        fitView({ duration: 300 });
      }, 100);
    });

    resizeObserver.observe(container);
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [fitView]);

  // 노드 또는 엣지가 변경되면 뷰를 자동으로 맞춤
  useEffect(() => {
    if (nodes.length > 0) {
      fitView({ duration: 300 });
    }
  }, [nodes, edges, fitView]);

  // 선택된 노드/연결 삭제
  const handleDeleteSelected = useCallback(() => {
    let updatedNodes = nodes;
    let updatedEdges = edges;
    let changed = false;
    if (selectedNodes.length > 0) {
      updatedNodes = nodes.filter(node => !selectedNodes.includes(node.id));
      updatedEdges = edges.filter(edge => 
        !selectedNodes.includes(edge.source) && !selectedNodes.includes(edge.target)
      );
      changed = true;
      // onNodeSelect(null); // 외부로 전달하지 않음
    }
    
    if (selectedEdges.length > 0) {
      updatedEdges = updatedEdges.filter(edge => !selectedEdges.includes(edge.id));
      changed = true;
    }
    if (changed) {
      setUndoStack((stack) => [...stack, { nodes: updatedNodes, edges: updatedEdges }]);
      setRedoStack([]);
      // onNodesChange(updatedNodes); // 외부로 전달하지 않음
      // onEdgesChange(updatedEdges); // 외부로 전달하지 않음
      setSelectedNodes([]);
      setSelectedEdges([]);
    }
  }, [selectedNodes, selectedEdges, nodes, edges]);

  // 특정 노드 삭제
  const handleDeleteNode = useCallback((nodeId: string) => {
    const updatedNodes = nodes.filter(node => node.id !== nodeId);
    const updatedEdges = edges.filter(edge => 
      edge.source !== nodeId && edge.target !== nodeId
    );
    setUndoStack((stack) => [...stack, { nodes: updatedNodes, edges: updatedEdges }]);
    setRedoStack([]);
    // onNodesChange(updatedNodes); // 외부로 전달하지 않음
    // onEdgesChange(updatedEdges); // 외부로 전달하지 않음
    // onNodeSelect(null); // 외부로 전달하지 않음
    setContextMenu(null);
  }, [nodes, edges]);

  // 노드 편집 핸들러
  const handleNodeEdit = useCallback((nodeId: string) => {
    const nodeToEdit = nodes.find(node => node.id === nodeId);
    if (nodeToEdit) {
      setEditingNode(nodeToEdit);
      
      // Webhook 디버깅 로그 추가
      // console.log('🔍 [DEBUG] FlowCanvas - scenario:', scenario);
      // console.log('🔍 [DEBUG] FlowCanvas - scenario.webhooks:', scenario?.webhooks);
      // console.log('🔍 [DEBUG] FlowCanvas - nodeToEdit.data.dialogState:', nodeToEdit.data.dialogState);
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
    // 기존 DialogState 업데이트 로직 + 에지 자동 생성
    if (editingNode) {
      const updatedNode = {
        ...editingNode,
        data: {
          ...editingNode.data,
          dialogState: updated as DialogState,
        },
      };
      const updatedNodes = nodes.map(n => n.id === updatedNode.id ? updatedNode : n);
      // --- 에지 자동 생성 로직 ---
      const newEdges: FlowEdge[] = [...edges];
      const state = (updated as DialogState);
      const sourceId = updatedNode.id;
      // Condition Handlers
      state.conditionHandlers?.forEach((handler, idx) => {
        const target = handler.transitionTarget?.dialogState;
        if (target && target !== '__END_SESSION__' && target !== '') {
          if (!newEdges.some(e => e.source === sourceId && e.target === target && e.type === 'custom')) {
            newEdges.push({
              id: `${sourceId}-condition-${idx}-${target}-${Date.now()}`,
              source: sourceId,
              target,
              label: `조건: ${handler.conditionStatement}`,
              type: 'custom',
            });
          }
        }
      });
      // Intent Handlers
      state.intentHandlers?.forEach((handler, idx) => {
        const target = handler.transitionTarget?.dialogState;
        if (target && target !== '') {
          if (!newEdges.some(e => e.source === sourceId && e.target === target && e.type === 'custom')) {
            newEdges.push({
              id: `${sourceId}-intent-${idx}-${target}-${Date.now()}`,
              source: sourceId,
              target,
              label: `인텐트: ${handler.intent}`,
              type: 'custom',
            });
          }
        }
      });
      // Event Handlers
      state.eventHandlers?.forEach((handler, idx) => {
        const target = handler.transitionTarget?.dialogState;
        let eventType = '';
        if (handler.event) {
          if (typeof handler.event === 'object' && handler.event.type) {
            eventType = handler.event.type;
          } else if (typeof handler.event === 'string') {
            eventType = handler.event;
          }
        }
        if (target && target !== '' && target !== '__CURRENT_DIALOG_STATE__') {
          if (!newEdges.some(e => e.source === sourceId && e.target === target && e.type === 'custom')) {
            newEdges.push({
              id: `${sourceId}-event-${idx}-${target}-${Date.now()}`,
              source: sourceId,
              target,
              label: `이벤트: ${eventType}`,
              type: 'custom',
            });
          }
        }
      });
      // ApiCall Handlers
      state.apicallHandlers?.forEach((handler, idx) => {
        const target = handler.transitionTarget?.dialogState;
        if (target && target !== '') {
          if (!newEdges.some(e => e.source === sourceId && e.target === target && e.type === 'custom')) {
            newEdges.push({
              id: `${sourceId}-apicall-${idx}-${target}-${Date.now()}`,
              source: sourceId,
              target,
              label: `API콜: ${handler.name}`,
              type: 'custom',
            });
          }
        }
      });
      onNodesChange?.(updatedNodes);
      onEdgesChange?.(newEdges);
      setEditingNode(null);
    }
  }, [editingNode, nodes, edges, onNodesChange, onEdgesChange]);

  // 렌더링 시 style은 currentState 등으로 동적으로 계산해서 적용
  useEffect(() => {
    const updatedNodes = nodes.map(node => ({
      ...node,
      type: 'custom',
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
          const scenarioName = targetScenario?.plan[0]?.name || `Scenario ${targetScenarioId}`;
          enhancedLabel = `🚀 ${scenarioName}`;
        }
      }
      
      return {
        ...e,
        type: 'smoothstep',
        markerEnd: 'arrowclosed',
        label: enhancedLabel,
        labelStyle: {
          fontSize: '12px',
          fontWeight: 'bold',
          fill: isScenarioTransition ? '#ff6b35' : '#333',
          backgroundColor: isScenarioTransition ? '#fff3e0' : 'white',
          padding: '4px 8px',
          borderRadius: '4px',
          border: isScenarioTransition ? '1px solid #ff6b35' : '1px solid #ccc',
        },
        style: {
          ...(e.style || {}),
          stroke: isScenarioTransition ? '#ff6b35' : (isSelected ? '#1976d2' : '#888'),
          strokeWidth: isSelected ? 5 : (isScenarioTransition ? 3 : 2.5),
          filter: isSelected ? 'drop-shadow(0 0 6px #1976d2)' : (isScenarioTransition ? 'drop-shadow(0 0 4px #ff6b35)' : 'none'),
          transition: 'stroke 0.15s, stroke-width 0.15s, filter 0.15s',
          strokeDasharray: isScenarioTransition ? '5,5' : 'none',
        },
      };
    });
    // onEdges(styledEdges); // 내부 상태 업데이트 제거
  }, [edges, selectedEdgeIds, scenarios]);

  // 핸들 id 접미사 변환 유틸리티
  function swapHandleSuffix(handleId: string | null | undefined): string | null {
    if (!handleId) return null;
    if (handleId.endsWith('-source')) return handleId.replace(/-source$/, '-target');
    if (handleId.endsWith('-target')) return handleId.replace(/-target$/, '-source');
    return handleId;
  }

  // 연결 생성 처리
  const [conditionModalEdge, setConditionModalEdge] = useState<FlowEdge | null>(null);
  const [conditionModalOpen, setConditionModalOpen] = useState(false);
  const [selectedCondition, setSelectedCondition] = useState('');

  // onConnect에서 에지 id 유일성 보장
  const onConnect = useCallback(
    (params: Connection) => {
      let { source, target, sourceHandle, targetHandle } = params;
      sourceHandle = sourceHandle ?? null;
      targetHandle = targetHandle ?? null;
      if (sourceHandle && targetHandle) {
        if (sourceHandle.endsWith('-target') && targetHandle.endsWith('-source')) {
          [source, target] = [target, source];
          [sourceHandle, targetHandle] = [targetHandle, sourceHandle];
        }
      }
      if (sourceHandle && !sourceHandle.endsWith('-source')) {
        sourceHandle = sourceHandle.replace(/-target$/, '-source');
      }
      if (targetHandle && !targetHandle.endsWith('-target')) {
        targetHandle = targetHandle.replace(/-source$/, '-target');
      }
      // id에 Date.now() 추가로 유일성 보장
      const edgeId = `${source}-${target}-${sourceHandle || 'sh'}-${targetHandle || 'th'}-${Date.now()}`;
      const newEdge: FlowEdge = {
        id: edgeId,
        source: source!,
        target: target!,
        sourceHandle: sourceHandle ?? null,
        targetHandle: targetHandle ?? null,
        type: 'custom',
        label: '', // 조건 선택 후 label 지정
      };
      onEdgesChange?.([...edges, newEdge]);
      setConditionModalEdge(newEdge);
      setConditionModalOpen(true);
    }, [edges, onEdgesChange]);

  // ConditionModal 저장
  const handleConditionModalSave = () => {
    if (conditionModalEdge && selectedCondition) {
      onEdgesChange?.(edges.map(e =>
        e.id === conditionModalEdge.id ? { ...e, label: selectedCondition } : e
      ));
    }
    setConditionModalOpen(false);
    setConditionModalEdge(null);
    setSelectedCondition('');
  };
  // ConditionModal 취소(에지 삭제)
  const handleConditionModalCancel = () => {
    if (conditionModalEdge) {
      onEdgesChange?.(edges.filter(e => e.id !== conditionModalEdge.id).map(e => ({ ...e, label: typeof e.label === 'string' ? e.label : '' })));
    }
    setConditionModalOpen(false);
    setConditionModalEdge(null);
    setSelectedCondition('');
  };

  // onEdgeUpdate에서 id 유일성 보장
  const handleEdgeUpdate = useCallback(
    (oldEdge: Edge, newConnection: Connection) => {
      // id에 Date.now() 추가로 유일성 보장
      const edgeId = `${newConnection.source}-${newConnection.target}-${newConnection.sourceHandle || 'sh'}-${newConnection.targetHandle || 'th'}-${Date.now()}`;
      const updatedEdge: FlowEdge = {
        ...oldEdge,
        ...newConnection,
        id: edgeId,
        type: 'custom',
        source: newConnection.source!,
        target: newConnection.target!,
        sourceHandle: newConnection.sourceHandle ?? null,
        targetHandle: newConnection.targetHandle ?? null,
        label: (newConnection as any).label ?? oldEdge.label ?? undefined,
      };
      onEdgesChange?.([...edges.filter(e => e.id !== oldEdge.id), updatedEdge]);
      setUndoStack((stack) => [...stack, { nodes, edges }]);
      setRedoStack([]);
    }, [edges, nodes, onEdgesChange]);

  // 노드 선택 처리
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const flowNode = nodes.find(n => n.id === node.id);
      if (onNodeSelect) {
        onNodeSelect(flowNode || null);
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

  // 빈 공간 클릭 시 선택 해제
  const handlePaneClick = useCallback(() => {
    if (onNodeSelect) {
      onNodeSelect(null);
    }
    setSelectedNodes([]);
    setSelectedEdges([]);
    setEdgeButtonAnchor(null);
  }, [onNodeSelect]);

  // 노드 위치 변경 처리
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      // onNodesStateChange(changes); // 내부 상태 업데이트 제거
      
      // 위치 변경된 노드들을 업데이트
      const updatedNodes: FlowNode[] = nodes.map(node => {
        const change = changes.find(c => c.id === node.id && c.type === 'position');
        if (change && change.position) {
          return { 
            ...node, 
            position: change.position,
            type: node.type || 'custom'
          };
        }
        return { ...node, type: node.type || 'custom' };
      });
      
      if (updatedNodes.some((node, idx) => 
        node.position.x !== nodes[idx]?.position.x || 
        node.position.y !== nodes[idx]?.position.y
      )) {
        // onNodesChange(updatedNodes); // 외부로 전달하지 않음
      }
    },
    [nodes]
  );

  // 연결 더블클릭 핸들러
  const onEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      const flowEdge = edges.find(e => e.id === edge.id);
      if (flowEdge) {
        setEditingEdge(flowEdge);
      }
    },
    [edges]
  );

  // 연결 편집 완료 핸들러
  const handleEdgeEditSave = useCallback((updatedEdge: FlowEdge) => {
    const updatedEdges = edges.map(edge => 
      edge.id === updatedEdge.id ? updatedEdge : edge
    );
    // onEdgesChange(updatedEdges); // 외부로 전달하지 않음
    setEditingEdge(null);
  }, [edges]);

  // 연결 삭제 핸들러
  const handleEdgeDelete = useCallback((edgeId: string) => {
    const updatedEdges = edges.filter(edge => edge.id !== edgeId);
    // onEdgesChange(updatedEdges); // 외부로 전달하지 않음
    setEditingEdge(null);
  }, [edges]);

  // --- Edge Z-Index 조정 함수 ---
  const bringEdgeToFront = useCallback((edgeId: string) => {
    const idx = edges.findIndex(e => e.id === edgeId);
    if (idx === -1) return;
    const newEdges = [...edges];
    const [edge] = newEdges.splice(idx, 1);
    newEdges.push(edge); // 맨 앞으로(맨 뒤에 push)
    onEdgesChange?.(newEdges);
  }, [edges, onEdgesChange]);

  const sendEdgeToBack = useCallback((edgeId: string) => {
    const idx = edges.findIndex(e => e.id === edgeId);
    if (idx === -1) return;
    const newEdges = [...edges];
    const [edge] = newEdges.splice(idx, 1);
    newEdges.unshift(edge); // 맨 뒤로(맨 앞에 unshift)
    onEdgesChange?.(newEdges);
  }, [edges, onEdgesChange]);

  // 우클릭 컨텍스트 메뉴 처리
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // React Flow 좌표계로 변환 (deprecated된 project 대신 screenToFlowPosition 사용)
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    
    // 클릭된 요소가 노드인지 확인
    const target = event.target as HTMLElement;
    const nodeElement = target.closest('[data-id]');
    const nodeId = nodeElement?.getAttribute('data-id');
    
    setContextMenu({
      mouseX: event.clientX,
      mouseY: event.clientY,
      position,
      nodeId: nodeId || undefined
    });
  }, [screenToFlowPosition]);

  // 컨텍스트 메뉴 닫기
  const handleContextMenuClose = useCallback(() => {
    setContextMenu(null);
  }, []);

  // 새 노드 추가
  const handleAddNode = useCallback(() => {
    if (!contextMenu) return;

    const nodeId = `State_${Date.now()}`;
    const newDialogState = createNewDialogState(nodeId);
    
    const newNode: FlowNode = {
      id: nodeId,
      type: 'custom',
      position: contextMenu.position,
      data: {
        label: nodeId,
        dialogState: newDialogState
      }
    };

    // 현재 nodes 상태에 새 노드 추가
    onNodesChange?.(nodes.concat(newNode));
    setContextMenu(null);
  }, [contextMenu, nodes, onNodesChange]);

  // --- Edge 선택 시 버튼 UI ---
  const selectedEdgeObj = edges.find(e => selectedEdges.length === 1 && e.id === selectedEdges[0]);

  // --- 선택한 에지의 중간 위치 계산 ---
  let edgeButtonPos = { top: 16, left: 16 };
  if (selectedEdgeObj) {
    const sourceNode = nodes.find(n => n.id === selectedEdgeObj.source);
    const targetNode = nodes.find(n => n.id === selectedEdgeObj.target);
    if (sourceNode && targetNode) {
      // 노드의 position은 {x, y} (좌상단 기준), 노드 크기(220x120) 반영
      const sx = sourceNode.position.x + 110; // center x
      const sy = sourceNode.position.y + 60;  // center y
      const tx = targetNode.position.x + 110;
      const ty = targetNode.position.y + 60;
      edgeButtonPos = {
        top: Math.min(sy, ty) + Math.abs(ty - sy) / 2 - 24, // 버튼 높이 보정
        left: Math.min(sx, tx) + Math.abs(tx - sx) / 2 - 60, // 버튼 너비 보정
      };
    } else if (sourceNode) {
      // sourceNode만 있을 때 (예: Start node)
      edgeButtonPos = {
        top: sourceNode.position.y + 60 - 24,
        left: sourceNode.position.x + 110 - 60,
      };
    } else if (targetNode) {
      // targetNode만 있을 때
      edgeButtonPos = {
        top: targetNode.position.y + 60 - 24,
        left: targetNode.position.x + 110 - 60,
      };
    }
  }

  // --- 버튼 위치 계산 (마우스 클릭 위치 기준) ---
  if (edgeButtonAnchor) {
    // 캔버스의 bounding rect 기준으로 보정
    const container = containerRef.current;
    if (container) {
      const rect = container.getBoundingClientRect();
      edgeButtonPos = {
        top: edgeButtonAnchor.y - rect.top + 8, // 아래로 약간 띄움
        left: edgeButtonAnchor.x - rect.left - 40, // 버튼 너비 보정
      };
    }
  }

  // MiniMap에서 노드 색상 지정 함수
  const getNodeColor = (node: Node) => {
    return node.id === currentState ? '#1976d2' : '#ccc';
  };

  // 자동정렬 함수 (dagre)
  const applyAutoLayout = useCallback(() => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'LR', nodesep: 60, ranksep: 80 });

    // 노드 추가
    nodes.forEach((node) => {
      g.setNode(node.id, { width: 220, height: 120 });
    });
    // 엣지 추가
    edges.forEach((edge) => {
      g.setEdge(edge.source, edge.target);
    });

    dagre.layout(g);

    // 노드 위치 갱신
    const newNodes = nodes.map((node) => {
      const pos = g.node(node.id);
      if (!pos) return node;
      return {
        ...node,
        position: {
          x: pos.x - 110, // center to top-left
          y: pos.y - 60,
        },
        // dagre는 positionAbsolute를 사용하지 않으므로 필요시 추가
      };
    });
    onNodesChange?.(newNodes);
    // onSetNodes(newNodes); // 내부 상태 업데이트 제거
    // onSetUndoStack((stack) => [...stack, { nodes: newNodes, edges }]); // 내부 상태 업데이트 제거
    // onSetRedoStack([]); // 내부 상태 업데이트 제거
  }, [nodes, edges, onNodesChange]);

  // 레이아웃 리셋 핸들러
  const handleLayoutReset = useCallback(() => {
    // onSetNodes(initialNodesRef.current as any); // 외부로 전달하지 않음
    // onSetEdges(initialEdgesRef.current as any); // 외부로 전달하지 않음
    onNodesChange?.(nodes);
    onEdgesChange?.(edges);
    setUndoStack([{ nodes, edges }]);
    setRedoStack([]);
  }, [nodes, edges, onNodesChange, onEdgesChange]);

  // --- ReactFlow 렌더링 부분 바로 위에 ConditionModal 추가 ---
  // source 노드의 conditionHandlers 목록 추출
  const sourceNode = conditionModalEdge ? nodes.find(n => n.id === conditionModalEdge.source) : null;
  const conditionHandlers = sourceNode?.data?.dialogState?.conditionHandlers || [];

  return (
    <>
      {/* Condition 선택 모달 */}
      <Dialog open={conditionModalOpen} onClose={handleConditionModalCancel}>
        <DialogTitle>전이 조건 선택</DialogTitle>
        <DialogContent>
          {conditionHandlers.length === 0 ? (
            <div>조건 핸들러가 없습니다.</div>
          ) : (
            <RadioGroup
              value={selectedCondition}
              onChange={e => setSelectedCondition(e.target.value)}
            >
              {conditionHandlers.map((handler: any, idx: number) => (
                <FormControlLabel
                  key={idx}
                  value={handler.name || `Condition${idx+1}`}
                  control={<Radio />}
                  label={handler.name || handler.condition || `Condition${idx+1}`}
                />
              ))}
            </RadioGroup>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConditionModalCancel} color="error">취소</Button>
          <Button onClick={handleConditionModalSave} color="primary" disabled={!selectedCondition}>저장</Button>
        </DialogActions>
      </Dialog>
      {/* React Flow 메인 뷰 + 팝업 위치 개선 */}
      <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
        <ReactFlow
          nodes={nodes.map(node => ({
            ...node,
            data: {
              ...node.data,
              currentState,
            }
          }))}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange ? handleNodesChangeWithUndo : undefined}
          onNodeDragStop={onNodesChange ? handleNodeDragStop : undefined}
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
        >
          {/* Undo/Redo 버튼 (드로잉 영역 좌상단, Controls 위) */}
          <Stack direction="row" spacing={1} sx={{
            position: 'absolute',
            top: 24,
            left: 24,
            zIndex: 10,
            background: 'rgba(255,255,255,0.97)',
            borderRadius: 2,
            boxShadow: 2,
            p: 1,
            pointerEvents: 'auto',
          }}>
            <IconButton size="small" onClick={handleUndo} disabled={undoStack.length <= 1}>
              <UndoIcon />
            </IconButton>
            <IconButton size="small" onClick={handleRedo} disabled={redoStack.length === 0}>
              <RedoIcon />
            </IconButton>
          </Stack>
          {/* 커스텀 arrow marker 복구 */}
          <svg width="0" height="0">
            <defs>
              <marker
                id="arrowclosed"
                markerWidth="10"
                markerHeight="10"
                refX="5"
                refY="5"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path d="M2,2 L8,5 L2,8 Z" fill="#1976d2" />
              </marker>
            </defs>
          </svg>
          <Controls />
          <MiniMap nodeColor={getNodeColor} nodeStrokeWidth={3} zoomable pannable />
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        </ReactFlow>
        {/* Edge z-index 조정 버튼 (에지 1개 선택 시만 표시, 클릭 위치 기준) */}
        {selectedEdgeObj && edgeButtonAnchor && (
          <Stack direction="row" spacing={0.5} sx={{
            position: 'absolute',
            top: edgeButtonPos.top,
            left: edgeButtonPos.left,
            zIndex: 30,
            background: 'rgba(255,255,255,0.97)',
            borderRadius: 2,
            boxShadow: 2,
            p: 0.5,
            pointerEvents: 'auto',
          }}>
            <IconButton size="small" onClick={() => bringEdgeToFront(selectedEdgeObj.id)} sx={{ fontSize: 16, p: 0.5, minWidth: 24, minHeight: 24 }} title="맨앞으로">
              ▲
            </IconButton>
            <IconButton size="small" onClick={() => sendEdgeToBack(selectedEdgeObj.id)} sx={{ fontSize: 16, p: 0.5, minWidth: 24, minHeight: 24 }} title="맨뒤로">
              ▼
            </IconButton>
          </Stack>
        )}
      </div>

      {/* 자동정렬/레이아웃/편집기능 버튼 (상단 우측) */}
      {!isTestMode && (
        <Stack direction="row" spacing={2} sx={{
          position: 'absolute',
          top: 16,
          right: 16,
          zIndex: 2000,
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 3,
          boxShadow: 3,
          p: 1.2,
          alignItems: 'center',
          minHeight: 48,
        }}>
          <Button
            size="medium"
            variant="contained"
            startIcon={<AutoFixHighIcon />}
            sx={{
              background: 'linear-gradient(90deg, #1976d2 0%, #42a5f5 100%)',
              color: 'white',
              fontWeight: 700,
              letterSpacing: 1,
              borderRadius: 2,
              boxShadow: 2,
              height: 40,
              px: 2.5,
              fontSize: '1rem',
              textTransform: 'none',
              transition: 'all 0.18s',
              '&:hover': {
                background: 'linear-gradient(90deg, #1565c0 0%, #64b5f6 100%)',
                boxShadow: 4,
                transform: 'scale(1.04)',
              },
            }}
            onClick={applyAutoLayout}
          >
            자동정렬
          </Button>
          <Button
            size="medium"
            variant="outlined"
            startIcon={<ReplayIcon />}
            sx={{
              background: 'white',
              color: '#1976d2',
              fontWeight: 700,
              borderRadius: 2,
              boxShadow: 1,
              height: 40,
              px: 2.2,
              fontSize: '1rem',
              textTransform: 'none',
              border: '2px solid #1976d2',
              transition: 'all 0.18s',
              '&:hover': {
                background: '#e3f2fd',
                color: '#1565c0',
                border: '2px solid #1565c0',
                boxShadow: 2,
                transform: 'scale(1.04)',
              },
            }}
            onClick={handleLayoutReset}
          >
            레이아웃 리셋
          </Button>
          <FormControlLabel
            control={
              <Switch
                checked={isEditable}
                onChange={() => setIsEditable(v => !v)}
                color="primary"
                icon={<EditOffIcon sx={{ fontSize: 22 }} />}
                checkedIcon={<EditIcon sx={{ fontSize: 22 }} />}
                sx={{
                  mx: 1,
                  '& .MuiSwitch-thumb': {
                    boxShadow: '0 2px 6px rgba(25, 118, 210, 0.15)',
                  },
                }}
              />
            }
            label={<span style={{fontWeight:600, fontSize:'1rem', color:isEditable?'#1976d2':'#888'}}>편집모드</span>}
            sx={{
              ml: 0,
              mr: 0,
              color: isEditable ? '#1976d2' : '#888',
              fontWeight: 'bold',
              userSelect: 'none',
              '.MuiSwitch-root': { verticalAlign: 'middle' },
              height: 40,
              pl: 1.5,
            }}
            labelPlacement="end"
          />
        </Stack>
      )}

      {/* 컨텍스트 메뉴 */}
      <Menu
        open={contextMenu !== null}
        onClose={handleContextMenuClose}
        anchorReference="anchorPosition"
        anchorPosition={
          contextMenu !== null
            ? { top: contextMenu.mouseY, left: contextMenu.mouseX }
            : undefined
        }
        disablePortal={false}
        slotProps={{
          root: {
            onContextMenu: (e) => {
              e.preventDefault();
              handleContextMenuClose();
            },
          },
        }}
      >
        {!contextMenu?.nodeId && (
          <>
            <MenuItem onClick={handleAddNode}>
              <Typography variant="body2">새 State 추가</Typography>
            </MenuItem>
            <MenuItem onClick={() => {
              // 시나리오 간 전이 노드 추가
              const newNodeId = `scenario-transition-${Date.now()}`;
              const newNode: FlowNode = {
                id: newNodeId,
                type: 'scenarioTransition',
                position: contextMenu?.position || { x: 0, y: 0 },
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
                  targetScenario: '선택된 시나리오',
                  targetState: 'Start',
                }
              };
              onNodesChange?.(nodes.concat(newNode));
              handleContextMenuClose();
            }}>
              <Typography variant="body2" sx={{ color: '#ff6b35' }}>
                🚀 시나리오 전이 노드 추가
              </Typography>
            </MenuItem>
          </>
        )}
        {contextMenu?.nodeId && (
          <MenuItem onClick={() => handleDeleteNode(contextMenu.nodeId!)}>
            <Typography variant="body2" color="error">State 삭제</Typography>
          </MenuItem>
        )}
        {(selectedNodes.length > 0 || selectedEdges.length > 0) && (
          <MenuItem onClick={handleDeleteSelected}>
            <Typography variant="body2" color="error">
              선택된 항목 삭제 (Delete)
            </Typography>
          </MenuItem>
        )}
      </Menu>

      {/* 노드 편집 모달 */}
      <NodeEditModal
        open={editingNode !== null}
        dialogState={editingNode?.data.dialogState || null}
        onClose={() => setEditingNode(null)}
        onSave={handleNodeEditSave}
        availableWebhooks={scenario?.webhooks || []}
        availableApiCalls={scenario?.apicalls || []}
        scenario={scenario}
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
        onDelete={handleEdgeDelete}
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