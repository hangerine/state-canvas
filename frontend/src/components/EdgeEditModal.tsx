import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
} from '@mui/material';
import { FlowEdge } from '../types/scenario';

interface EdgeEditModalProps {
  open: boolean;
  edge: FlowEdge | null;
  onClose: () => void;
  onSave: (updatedEdge: FlowEdge) => void;
  onDelete: (edgeId: string) => void;
}

const EdgeEditModal: React.FC<EdgeEditModalProps> = ({
  open,
  edge,
  onClose,
  onSave,
  onDelete,
}) => {
  const [editedEdge, setEditedEdge] = useState<FlowEdge | null>(null);

  useEffect(() => {
    if (edge) {
      setEditedEdge({ ...edge });
    }
  }, [edge]);

  if (!editedEdge) return null;

  const handleSave = () => {
    onSave(editedEdge);
    onClose();
  };

  const handleDelete = () => {
    onDelete(editedEdge.id);
    onClose();
  };

  const handleLabelChange = (value: string) => {
    setEditedEdge({
      ...editedEdge,
      label: value,
    });
  };

  const handleTypeChange = (value: string) => {
    setEditedEdge({
      ...editedEdge,
      type: value,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        연결 편집
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* 연결 정보 */}
          <Box sx={{ 
            backgroundColor: '#f5f5f5', 
            p: 2, 
            borderRadius: 1,
            mb: 2 
          }}>
            <Typography variant="body2" color="text.secondary">
              <strong>출발:</strong> {editedEdge.source}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>도착:</strong> {editedEdge.target}
            </Typography>
          </Box>

          {/* 라벨 편집 */}
          <TextField
            label="연결 라벨 (조건/인텐트/이벤트)"
            value={editedEdge.label || ''}
            onChange={(e) => handleLabelChange(e.target.value)}
            fullWidth
            multiline
            rows={2}
            helperText="예: 조건: True, 인텐트: greeting, 이벤트: USER_DIALOG_START"
          />

          {/* 연결 타입 선택 */}
          <FormControl fullWidth>
            <InputLabel>연결 타입</InputLabel>
            <Select
              value={editedEdge.type || 'smoothstep'}
              onChange={(e) => handleTypeChange(e.target.value)}
              label="연결 타입"
            >
              <MenuItem value="default">기본</MenuItem>
              <MenuItem value="straight">직선</MenuItem>
              <MenuItem value="step">계단형</MenuItem>
              <MenuItem value="smoothstep">부드러운 계단형</MenuItem>
              <MenuItem value="bezier">곡선</MenuItem>
            </Select>
          </FormControl>

          {/* 연결 ID (읽기 전용) */}
          <TextField
            label="연결 ID"
            value={editedEdge.id}
            disabled
            fullWidth
            size="small"
          />
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleDelete} color="error">
          연결 삭제
        </Button>
        <Button onClick={onClose}>
          취소
        </Button>
        <Button onClick={handleSave} variant="contained">
          저장
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EdgeEditModal; 