import { EdgeProps, getSmoothStepPath } from 'reactflow';

const CustomEdge = ({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  style = {}, markerEnd, label, selected
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition
  });

  // 화살표 마커 ID (unique per edge)
  const markerId = `custom-arrowhead-${id}`;
  const edgeColor = selected ? '#1565c0' : '#222';
  const edgeShadow = selected ? 'drop-shadow(0 0 6px #1976d2aa)' : undefined;

  return (
    <g>
      {/* 화살표 마커 정의 (크기 1/3로 축소) */}
      <defs>
        <marker
          id={markerId}
          markerWidth="4"
          markerHeight="4"
          refX="4"
          refY="2"
          orient="auto"
          markerUnits="strokeWidth"
        >
          <path d="M0.67,0.67 L4,2 L0.67,3.33 Z" fill={edgeColor} />
        </marker>
      </defs>
      {/* 히트박스 */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={8}
        className="react-flow__edge-interaction"
        data-edgeid={id}
        style={{ cursor: 'pointer' }}
      />
      {/* 실제 에지 */}
      <path
        id={id}
        d={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth: selected ? 2 : 1.5,
          filter: edgeShadow,
          ...style,
        }}
        className="react-flow__edge-path"
        markerEnd={`url(#${markerId})`}
      />
      {label && (
        <text
          x={labelX}
          y={labelY - 8}
          textAnchor="middle"
          style={{
            fontSize: '12px',
            fontWeight: 600,
            fill: edgeColor,
            paintOrder: 'stroke',
            stroke: 'white',
            strokeWidth: 3,
            strokeLinejoin: 'round',
            strokeLinecap: 'round',
            filter: 'drop-shadow(0 1px 2px #fff)'
          }}
        >
          <tspan style={{ stroke: 'none', fill: edgeColor }}>{label}</tspan>
        </text>
      )}
    </g>
  );
};

export default CustomEdge; 