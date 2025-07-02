import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { Box, Typography, Chip } from '@mui/material';
import { DialogState } from '../types/scenario';

interface CustomNodeData {
  label: string;
  dialogState: DialogState;
  onEdit?: (nodeId: string) => void;
}

const CustomNode: React.FC<NodeProps<CustomNodeData>> = ({ data, selected, id }) => {
  const { dialogState, onEdit } = data;
  
  // 핸들러 개수 계산
  const conditionCount = dialogState.conditionHandlers?.length || 0;
  const intentCount = dialogState.intentHandlers?.length || 0;
  const eventCount = dialogState.eventHandlers?.length || 0;

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
        padding: 2,
        border: selected ? '2px solid #1976d2' : '1px solid #ccc',
        borderRadius: 2,
        backgroundColor: 'white',
        minWidth: 180,
        boxShadow: selected ? 3 : 1,
        cursor: 'pointer',
        '&:hover': {
          boxShadow: 2,
        },
      }}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        style={{
          background: '#1976d2',
          width: 8,
          height: 8,
        }}
      />

      {/* 노드 제목 */}
      <Typography 
        variant="subtitle2" 
        sx={{ 
          fontWeight: 'bold',
          textAlign: 'center',
          mb: 1,
          color: selected ? '#1976d2' : 'inherit'
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
          sx={{ mb: 1, fontSize: '0.7rem', height: 20 }}
        />
      )}

      {/* 핸들러 정보 */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1 }}>
        {conditionCount > 0 && (
          <Chip
            label={`조건 ${conditionCount}`}
            size="small"
            color="primary"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18 }}
          />
        )}
        {intentCount > 0 && (
          <Chip
            label={`인텐트 ${intentCount}`}
            size="small"
            color="secondary"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18 }}
          />
        )}
        {eventCount > 0 && (
          <Chip
            label={`이벤트 ${eventCount}`}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ fontSize: '0.6rem', height: 18 }}
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
          sx={{ fontSize: '0.6rem', height: 18 }}
        />
      )}

      {/* Webhook Actions 표시 */}
      {dialogState.webhookActions && dialogState.webhookActions.length > 0 && (
        <Chip
          label="Webhook"
          size="small"
          color="error"
          variant="outlined"
          sx={{ fontSize: '0.6rem', height: 18, mt: 0.5 }}
        />
      )}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          background: '#1976d2',
          width: 8,
          height: 8,
        }}
      />
    </Box>
  );
};

export default memo(CustomNode); 