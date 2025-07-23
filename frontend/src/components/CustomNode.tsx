import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Box, Typography, Chip } from '@mui/material';
import { DialogState } from '../types/scenario';

interface CustomNodeData {
  label: string;
  dialogState: DialogState;
  onEdit?: (nodeId: string) => void;
  handleRefs?: {
    top?: React.Ref<HTMLDivElement>;
    bottom?: React.Ref<HTMLDivElement>;
    left?: React.Ref<HTMLDivElement>;
    right?: React.Ref<HTMLDivElement>;
  };
}

const CustomNode: React.FC<NodeProps<CustomNodeData>> = ({ data, selected, id }) => {
  const { dialogState, onEdit, handleRefs } = data;
  
  // 핸들러 개수 계산
  const conditionCount = dialogState.conditionHandlers?.length || 0;
  const intentCount = dialogState.intentHandlers?.length || 0;
  const eventCount = dialogState.eventHandlers?.length || 0;
  const apicallCount = dialogState.apicallHandlers?.length || 0;

  // 더블클릭 핸들러
  const handleDoubleClick = () => {
    if (onEdit) {
      onEdit(id);
    }
  };

  return (
    <Box
      onDoubleClick={handleDoubleClick}
      sx={{
        width: 220,
        height: 120,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 1.5,
        border: selected ? '2px solid #1976d2' : '1px solid #ccc',
        borderRadius: 2,
        backgroundColor: 'white',
        boxShadow: selected ? 3 : 1,
        cursor: 'pointer',
        position: 'relative',
        overflow: 'hidden',
        '&:hover': {
          boxShadow: 2,
        },
      }}
    >
      {/* Input Handle (Top) */}
      <Handle
        id="top"
        type="target"
        position={Position.Top}
        style={{
          background: '#1976d2',
          width: 10,
          height: 10,
          left: '50%',
          top: -5,
          transform: 'translateX(-50%)',
          border: '2px solid #fff',
          zIndex: 10,
          pointerEvents: 'all',
        }}
        ref={handleRefs?.top}
      />

      {/* Input Handle (Left) */}
      <Handle
        id="left"
        type="target"
        position={Position.Left}
        style={{
          background: '#1976d2',
          width: 10,
          height: 10,
          left: -5,
          top: '50%',
          transform: 'translateY(-50%)',
          border: '2px solid #fff',
          zIndex: 10,
          pointerEvents: 'all',
        }}
        ref={handleRefs?.left}
      />

      {/* 노드 제목 */}
      <Typography 
        variant="subtitle2" 
        sx={{ 
          fontWeight: 'bold',
          textAlign: 'center',
          mb: 0.5,
          color: selected ? '#1976d2' : 'inherit',
          fontSize: '1.1rem',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          width: '100%',
        }}
      >
        {data.label}
      </Typography>

      {/* Entry Action 표시 */}
      {dialogState.entryAction && (
        <Chip
          label="Entry Action"
          size="small"
          color="success"
          variant="outlined"
          sx={{ mb: 0.5, fontSize: '0.7rem', height: 20, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis' }}
        />
      )}

      {/* 핸들러 정보 */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5, justifyContent: 'center', width: '100%' }}>
        {conditionCount > 0 && (
          <Chip
            label={`조건 ${conditionCount}`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}
          />
        )}
        {intentCount > 0 && (
          <Chip
            label={`인텐트 ${intentCount}`}
            size="small"
            color="secondary"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}
          />
        )}
        {eventCount > 0 && (
          <Chip
            label={`이벤트 ${eventCount}`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}
          />
        )}
      </Box>

      {/* Slot Filling 표시 */}
      {dialogState.slotFillingForm && dialogState.slotFillingForm.length > 0 && (
        <Chip
          label="Slot Filling"
          size="small"
          color="info"
          variant="filled"
          sx={{ fontSize: '0.6rem', height: 18, maxWidth: '90%', overflow: 'hidden', textOverflow: 'ellipsis' }}
        />
      )}

      {/* Actions 표시 */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5, justifyContent: 'center', width: '100%' }}>
        {dialogState.webhookActions && dialogState.webhookActions.length > 0 && (
          <Chip
            label="Webhook"
            size="small"
            color="error"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}
          />
        )}
        {apicallCount > 0 && (
          <Chip
            label={`API Call ${apicallCount}`}
            size="small"
            color="success"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis' }}
          />
        )}
      </Box>

      {/* Output Handle (Right) */}
      <Handle
        id="right"
        type="source"
        position={Position.Right}
        style={{
          background: '#1976d2',
          width: 10,
          height: 10,
          right: -5,
          top: '50%',
          transform: 'translateY(-50%)',
          border: '2px solid #fff',
          zIndex: 10,
          pointerEvents: 'all',
        }}
        ref={handleRefs?.right}
      />
      {/* Output Handle (Bottom) */}
      <Handle
        id="bottom"
        type="source"
        position={Position.Bottom}
        style={{
          background: '#1976d2',
          width: 10,
          height: 10,
          left: '50%',
          bottom: -5,
          transform: 'translateX(-50%)',
          border: '2px solid #fff',
          zIndex: 10,
          pointerEvents: 'all',
        }}
        ref={handleRefs?.bottom}
      />
    </Box>
  );
};

export default memo(CustomNode); 