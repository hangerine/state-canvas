import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
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
import { Menu, MenuItem, Typography, Button, Stack, IconButton } from '@mui/material';
import UndoIcon from '@mui/icons-material/Undo';
import RedoIcon from '@mui/icons-material/Redo';
import dagre from 'dagre';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import EditOffIcon from '@mui/icons-material/EditOff';
import EditIcon from '@mui/icons-material/Edit';
import { Switch, FormControlLabel } from '@mui/material';
import ReplayIcon from '@mui/icons-material/Replay';

// 커스텀 노드 타입 정의
const nodeTypes: NodeTypes = {
  custom: CustomNode,
};

interface FlowCanvasProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  onNodeSelect: (node: FlowNode | null) => void;
  currentState: string;
  onNodesChange: (nodes: FlowNode[]) => void;
  onEdgesChange: (edges: FlowEdge[]) => void;
  scenario?: Scenario;
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
  nodes: propNodes,
  edges: propEdges,
  onNodeSelect,
  currentState,
  onNodesChange,
  onEdgesChange,
  scenario,
}) => {
  const [nodes, setNodes, onNodesStateChange] = useNodesState([]);
  const [edges, setEdges, onEdgesStateChange] = useEdgesState([]);
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
  
  const { project, fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);

  // Undo/Redo 스택 (Node[], Edge[])
  const [undoStack, setUndoStack] = useState<{nodes: Node[]; edges: Edge[]}[]>([]);
  const [redoStack, setRedoStack] = useState<{nodes: Node[]; edges: Edge[]}[]>([]);

  // 이전 propNodes/propEdges를 기억하기 위한 ref
  const prevNodesRef = useRef<FlowNode[]>(propNodes);
  const prevEdgesRef = useRef<FlowEdge[]>(propEdges);

  // 최초 시나리오 업로드 시의 노드/에지 상태 저장
  const initialNodesRef = useRef<Node[]>(propNodes);
  const initialEdgesRef = useRef<Edge[]>(propEdges);

  // 최초 마운트 시 초기 상태 push
  useEffect(() => {
    setUndoStack([{ nodes: propNodes, edges: propEdges }]);
    setRedoStack([]);
    prevNodesRef.current = propNodes;
    prevEdgesRef.current = propEdges;
    // eslint-disable-next-line
  }, []);

  // propNodes/propEdges가 완전히 바뀔 때(시나리오 업로드 등) 최초 상태도 갱신
  useEffect(() => {
    const nodesChanged = JSON.stringify(prevNodesRef.current.map(n => n.id)) !== JSON.stringify(propNodes.map(n => n.id));
    const edgesChanged = JSON.stringify(prevEdgesRef.current.map(e => e.id)) !== JSON.stringify(propEdges.map(e => e.id));
    if (nodesChanged || edgesChanged) {
      setUndoStack([{ nodes: propNodes, edges: propEdges }]);
      setRedoStack([]);
      prevNodesRef.current = propNodes;
      prevEdgesRef.current = propEdges;
      initialNodesRef.current = propNodes;
      initialEdgesRef.current = propEdges;
    }
  }, [propNodes, propEdges]);

  // 노드/에지 변경 래퍼 (NodeChange[], EdgeChange[])
  // 1. onNodesChange에서는 상태만 업데이트 (Undo push X, App의 onNodesChange도 호출 X)
  const handleNodesChangeWithUndo = useCallback((changes: NodeChange[]) => {
    setNodes((nds) => {
      const updated = applyNodeChanges(changes, nds);
      return updated;
    });
  }, []);

  // 2. onNodeDragStop에서만 Undo 스택에 push + App의 onNodesChange 호출
  const handleNodeDragStop = useCallback(() => {
    setUndoStack((stack) => [...stack, { nodes, edges }]);
    setRedoStack([]);
    onNodesChange(nodes as any);
  }, [nodes, edges, onNodesChange]);

  const handleEdgesChangeWithUndo = useCallback((changes: EdgeChange[]) => {
    setEdges((eds) => {
      const updated = applyEdgeChanges(changes, eds);
      setUndoStack((stack) => [...stack, { nodes, edges: updated }]);
      setRedoStack([]);
      onEdgesChange(updated as any); // prop 타입이 FlowEdge[]이지만 실제 Edge[] 전달
      return updated;
    });
  }, [nodes, onEdgesChange]);

  // Undo 동작
  const handleUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length <= 1) return stack;
      const prev = stack[stack.length - 2];
      setRedoStack((redo) => [{ nodes, edges }, ...redo]);
      setNodes(prev.nodes);
      setEdges(prev.edges);
      onNodesChange(prev.nodes as any);
      onEdgesChange(prev.edges as any);
      return stack.slice(0, -1);
    });
  }, [nodes, edges, onNodesChange, onEdgesChange, setNodes, setEdges]);

  // Redo 동작
  const handleRedo = useCallback(() => {
    setRedoStack((redo) => {
      if (redo.length === 0) return redo;
      const next = redo[0];
      setUndoStack((stack) => [...stack, { nodes: next.nodes, edges: next.edges }]);
      setNodes(next.nodes);
      setEdges(next.edges);
      onNodesChange(next.nodes as any);
      onEdgesChange(next.edges as any);
      return redo.slice(1);
    });
  }, [onNodesChange, onEdgesChange, setNodes, setEdges]);

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

  // 선택된 노드/연결 삭제
  const handleDeleteSelected = useCallback(() => {
    if (selectedNodes.length > 0) {
      const updatedNodes = propNodes.filter(node => !selectedNodes.includes(node.id));
      const updatedEdges = propEdges.filter(edge => 
        !selectedNodes.includes(edge.source) && !selectedNodes.includes(edge.target)
      );
      onNodesChange(updatedNodes);
      onEdgesChange(updatedEdges);
      setSelectedNodes([]);
      onNodeSelect(null);
    }
    
    if (selectedEdges.length > 0) {
      const updatedEdges = propEdges.filter(edge => !selectedEdges.includes(edge.id));
      onEdgesChange(updatedEdges);
      setSelectedEdges([]);
    }
  }, [selectedNodes, selectedEdges, propNodes, propEdges, onNodesChange, onEdgesChange, onNodeSelect]);

  // 키보드 이벤트 핸들러 (Delete 키)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Modal이나 컨텍스트 메뉴가 열려있으면 키보드 이벤트 무시
      if (editingNode !== null || editingEdge !== null || contextMenu !== null) {
        return;
      }
      
      // input, textarea 등에 포커스가 있으면 키보드 이벤트 무시
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'SELECT' ||
        activeElement.getAttribute('contenteditable') === 'true'
      )) {
        return;
      }
      
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleDeleteSelected, editingNode, editingEdge, contextMenu]);

  // 특정 노드 삭제
  const handleDeleteNode = useCallback((nodeId: string) => {
    const updatedNodes = propNodes.filter(node => node.id !== nodeId);
    const updatedEdges = propEdges.filter(edge => 
      edge.source !== nodeId && edge.target !== nodeId
    );
    onNodesChange(updatedNodes);
    onEdgesChange(updatedEdges);
    onNodeSelect(null);
    setContextMenu(null);
  }, [propNodes, propEdges, onNodesChange, onEdgesChange, onNodeSelect]);

  // 노드 편집 핸들러
  const handleNodeEdit = useCallback((nodeId: string) => {
    const nodeToEdit = propNodes.find(node => node.id === nodeId);
    if (nodeToEdit) {
      setEditingNode(nodeToEdit);
      
      // Webhook 디버깅 로그 추가
      console.log('🔍 [DEBUG] FlowCanvas - scenario:', scenario);
      console.log('🔍 [DEBUG] FlowCanvas - scenario.webhooks:', scenario?.webhooks);
      console.log('🔍 [DEBUG] FlowCanvas - nodeToEdit.data.dialogState:', nodeToEdit.data.dialogState);
      console.log('🔍 [DEBUG] FlowCanvas - webhookActions:', nodeToEdit.data.dialogState.webhookActions);
    }
  }, [propNodes, scenario]);

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
  const handleNodeEditSave = useCallback((updatedDialogState: DialogState) => {
    if (!editingNode) return;

    const updatedNode: FlowNode = {
      ...editingNode,
      data: {
        ...editingNode.data,
        label: updatedDialogState.name,
        dialogState: updatedDialogState,
      }
    };

    const updatedNodes = propNodes.map(node => 
      node.id === editingNode.id ? updatedNode : node
    );

    // 새로운 엣지 생성 (전이 관계 기반)
    const newEdges = generateEdgesFromNodes(updatedNodes);

    onNodesChange(updatedNodes);
    onEdgesChange(newEdges);
    setEditingNode(null);
  }, [editingNode, propNodes, onNodesChange, onEdgesChange, generateEdgesFromNodes]);

  // props로 받은 nodes, edges를 상태에 동기화
  useEffect(() => {
    const updatedNodes = propNodes.map(node => ({
      ...node,
      type: 'custom',
      data: {
        ...node.data,
        onEdit: handleNodeEdit,
      },
      style: {
        ...node.style,
        backgroundColor: currentState === node.id ? '#e3f2fd' : '#ffffff',
        border: currentState === node.id ? '2px solid #1976d2' : '1px solid #ccc',
      }
    }));
    setNodes(updatedNodes);
  }, [propNodes, currentState, setNodes, handleNodeEdit]);

  // --- 모든 에지 type을 'smoothstep' + markerEnd: 'arrowclosed'로 강제 적용 ---
  useEffect(() => {
    // propEdges의 type을 모두 'smoothstep'으로, markerEnd를 'arrowclosed'로 변경
    const arrowEdges = propEdges.map(e => ({
      ...e,
      type: 'smoothstep',
      markerEnd: 'arrowclosed',
    }));
    setEdges(arrowEdges);
  }, [propEdges, setEdges]);

  // 연결 생성 처리
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: FlowEdge = {
        id: `${params.source}-${params.target}`,
        source: params.source!,
        target: params.target!,
        type: 'smoothstep',
        label: '새 연결',
      };
      setEdges((eds) => addEdge(newEdge, eds));
      onEdgesChange([...propEdges, newEdge]);
    },
    [propEdges, onEdgesChange, setEdges]
  );

  // 노드 선택 처리
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      const flowNode = propNodes.find(n => n.id === node.id);
      onNodeSelect(flowNode || null);
      setSelectedNodes([node.id]);
      setSelectedEdges([]);
    },
    [propNodes, onNodeSelect]
  );

  // 연결 클릭 처리
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    // React Flow의 onEdgeClick은 (event, edge) 순서
    setSelectedEdges([edge.id]);
    setEdgeButtonAnchor({ x: event.clientX, y: event.clientY });
  }, []);

  // 빈 공간 클릭 시 선택 해제
  const handlePaneClick = useCallback(() => {
    onNodeSelect(null);
    setSelectedNodes([]);
    setSelectedEdges([]);
    setEdgeButtonAnchor(null);
  }, [onNodeSelect]);

  // 노드 위치 변경 처리
  const handleNodesChange = useCallback(
    (changes: any[]) => {
      onNodesStateChange(changes);
      
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
        onNodesChange(updatedNodes);
      }
    },
    [nodes, onNodesChange, onNodesStateChange]
  );

  // 연결 더블클릭 핸들러
  const onEdgeDoubleClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      event.stopPropagation();
      const flowEdge = propEdges.find(e => e.id === edge.id);
      if (flowEdge) {
        setEditingEdge(flowEdge);
      }
    },
    [propEdges]
  );

  // 연결 편집 완료 핸들러
  const handleEdgeEditSave = useCallback((updatedEdge: FlowEdge) => {
    const updatedEdges = propEdges.map(edge => 
      edge.id === updatedEdge.id ? updatedEdge : edge
    );
    onEdgesChange(updatedEdges);
    setEditingEdge(null);
  }, [propEdges, onEdgesChange]);

  // 연결 삭제 핸들러
  const handleEdgeDelete = useCallback((edgeId: string) => {
    const updatedEdges = propEdges.filter(edge => edge.id !== edgeId);
    onEdgesChange(updatedEdges);
    setEditingEdge(null);
  }, [propEdges, onEdgesChange]);

  // --- Edge Z-Index 조정 함수 ---
  const bringEdgeToFront = useCallback((edgeId: string) => {
    const idx = propEdges.findIndex(e => e.id === edgeId);
    if (idx === -1) return;
    const newEdges = [...propEdges];
    const [edge] = newEdges.splice(idx, 1);
    newEdges.push(edge); // 맨 앞으로(맨 뒤에 push)
    onEdgesChange(newEdges);
  }, [propEdges, onEdgesChange]);

  const sendEdgeToBack = useCallback((edgeId: string) => {
    const idx = propEdges.findIndex(e => e.id === edgeId);
    if (idx === -1) return;
    const newEdges = [...propEdges];
    const [edge] = newEdges.splice(idx, 1);
    newEdges.unshift(edge); // 맨 뒤로(맨 앞에 unshift)
    onEdgesChange(newEdges);
  }, [propEdges, onEdgesChange]);

  // 우클릭 컨텍스트 메뉴 처리
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    
    // React Flow 좌표계로 변환
    const position = project({ x: event.clientX, y: event.clientY });
    
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
  }, [project]);

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

    const updatedNodes = [...propNodes, newNode];
    onNodesChange(updatedNodes);
    setContextMenu(null);
  }, [contextMenu, propNodes, onNodesChange]);

  // --- Edge 선택 시 버튼 UI ---
  const selectedEdgeObj = propEdges.find(e => selectedEdges.length === 1 && e.id === selectedEdges[0]);

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
    setNodes(newNodes);
    setUndoStack((stack) => [...stack, { nodes: newNodes, edges }]);
    setRedoStack([]);
    onNodesChange(newNodes as any);
  }, [nodes, edges, setNodes, setUndoStack, setRedoStack, onNodesChange]);

  // 레이아웃 리셋 핸들러
  const handleLayoutReset = useCallback(() => {
    onNodesChange(initialNodesRef.current as any);
    onEdgesChange(initialEdgesRef.current as any);
    setUndoStack([{ nodes: initialNodesRef.current, edges: initialEdgesRef.current }]);
    setRedoStack([]);
  }, [onNodesChange, onEdgesChange]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }} onContextMenu={handleContextMenu}>
      {/* React Flow 메인 뷰 */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={isEditable ? handleNodesChangeWithUndo : undefined}
        onNodeDragStop={isEditable ? handleNodeDragStop : undefined}
        onEdgesChange={isEditable ? handleEdgesChangeWithUndo : undefined}
        onConnect={isEditable ? onConnect : undefined}
        onNodeClick={isEditable ? onNodeClick : undefined}
        onEdgeClick={isEditable ? handleEdgeClick : undefined}
        onPaneClick={isEditable ? handlePaneClick : undefined}
        onEdgeDoubleClick={isEditable ? onEdgeDoubleClick : undefined}
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
        <Controls />
        <MiniMap nodeColor={getNodeColor} nodeStrokeWidth={3} zoomable pannable />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>

      {/* Undo/Redo 버튼 (상단 좌측) */}
      <Stack direction="row" spacing={1} sx={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 2000,
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

      {/* 자동정렬/레이아웃/편집기능 버튼 (상단 우측) */}
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

      {/* Edge z-index 조정 버튼 (에지 1개 선택 시만 표시, 클릭 위치 기준) */}
      {selectedEdgeObj && edgeButtonAnchor && (
        <Stack direction="row" spacing={1} sx={{
          position: 'absolute',
          top: edgeButtonPos.top,
          left: edgeButtonPos.left,
          zIndex: 2000,
          background: 'rgba(255,255,255,0.97)',
          borderRadius: 2,
          boxShadow: 2,
          p: 1,
          pointerEvents: 'auto',
        }}>
          <Button size="small" variant="outlined" onClick={() => bringEdgeToFront(selectedEdgeObj.id)}>
            맨앞으로
          </Button>
          <Button size="small" variant="outlined" onClick={() => sendEdgeToBack(selectedEdgeObj.id)}>
            맨뒤로
          </Button>
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
          <MenuItem onClick={handleAddNode}>
            <Typography variant="body2">새 State 추가</Typography>
          </MenuItem>
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
      />

      {/* 연결 편집 모달 */}
      <EdgeEditModal
        open={editingEdge !== null}
        edge={editingEdge}
        onClose={() => setEditingEdge(null)}
        onSave={handleEdgeEditSave}
        onDelete={handleEdgeDelete}
      />
    </div>
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