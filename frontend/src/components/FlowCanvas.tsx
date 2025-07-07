import React, { useCallback, useEffect, useState } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FlowNode, FlowEdge, DialogState } from '../types/scenario';
import CustomNode from './CustomNode';
import NodeEditModal from './NodeEditModal';
import EdgeEditModal from './EdgeEditModal';
import { Menu, MenuItem, Typography } from '@mui/material';

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
  
  const { project } = useReactFlow();

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
    }
  }, [propNodes]);

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

  useEffect(() => {
    setEdges(propEdges);
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
  const onEdgeClick = useCallback(
    (event: React.MouseEvent, edge: Edge) => {
      setSelectedEdges([edge.id]);
      setSelectedNodes([]);
      onNodeSelect(null);
    },
    [onNodeSelect]
  );

  // 빈 공간 클릭 시 선택 해제
  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
    setSelectedNodes([]);
    setSelectedEdges([]);
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

  return (
    <div style={{ width: '100%', height: '100%' }} onContextMenu={handleContextMenu}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesStateChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        nodeTypes={nodeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
      >
        <Controls />
        <MiniMap 
          nodeColor={(node) => {
            if (node.id === currentState) return '#1976d2';
            return '#ccc';
          }}
          style={{
            backgroundColor: '#f5f5f5',
          }}
        />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>

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