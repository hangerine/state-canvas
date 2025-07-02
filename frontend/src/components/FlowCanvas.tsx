import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  Node,
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FlowNode, FlowEdge } from '../types/scenario';
import CustomNode from './CustomNode';

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

  // props로 받은 nodes, edges를 상태에 동기화
  useEffect(() => {
    const updatedNodes = propNodes.map(node => ({
      ...node,
      type: 'custom',
      style: {
        ...node.style,
        backgroundColor: currentState === node.id ? '#e3f2fd' : '#ffffff',
        border: currentState === node.id ? '2px solid #1976d2' : '1px solid #ccc',
      }
    }));
    setNodes(updatedNodes);
  }, [propNodes, currentState, setNodes]);

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
    },
    [propNodes, onNodeSelect]
  );

  // 빈 공간 클릭 시 선택 해제
  const onPaneClick = useCallback(() => {
    onNodeSelect(null);
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

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesStateChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
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