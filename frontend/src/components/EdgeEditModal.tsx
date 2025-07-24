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
  Chip,
  Divider,
} from '@mui/material';
import { FlowEdge, Scenario } from '../types/scenario';

interface EdgeEditModalProps {
  open: boolean;
  edge: FlowEdge | null;
  onClose: () => void;
  onSave: (updatedEdge: FlowEdge) => void;
  onDelete: (edgeId: string) => void;
  scenarios?: { [key: string]: Scenario };
  currentScenarioId?: string;
}

const EdgeEditModal: React.FC<EdgeEditModalProps> = ({
  open,
  edge,
  onClose,
  onSave,
  onDelete,
  scenarios = {},
  currentScenarioId,
}) => {
  const [editedEdge, setEditedEdge] = useState<FlowEdge | null>(null);
  const [isScenarioTransition, setIsScenarioTransition] = useState(false);
  const [targetScenarioId, setTargetScenarioId] = useState<string>('');
  const [targetState, setTargetState] = useState<string>('');

  useEffect(() => {
    if (edge) {
      setEditedEdge({ ...edge });
      // 시나리오 간 전이인지 확인
      const isScenarioEdge = edge.label?.includes('시나리오 전이') || edge.target.includes('scenario-');
      setIsScenarioTransition(isScenarioEdge);
      
      if (isScenarioEdge) {
        // 기존 시나리오 전이 정보 파싱
        const scenarioMatch = edge.target.match(/scenario-(\d+)/);
        if (scenarioMatch) {
          setTargetScenarioId(scenarioMatch[1]);
        }
      }
    }
  }, [edge]);

  if (!editedEdge) return null;

  const handleSave = () => {
    let updatedEdge = { ...editedEdge };
    
    if (isScenarioTransition) {
      // 시나리오 간 전이인 경우 타겟을 시나리오 ID로 설정
      updatedEdge.target = `scenario-${targetScenarioId}`;
      updatedEdge.label = `시나리오 전이: ${targetState}`;
    }
    
    onSave(updatedEdge);
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

  const handleScenarioTransitionToggle = () => {
    setIsScenarioTransition(!isScenarioTransition);
    if (!isScenarioTransition) {
      // 시나리오 전이로 변경하는 경우
      setEditedEdge({
        ...editedEdge,
        target: '',
        label: '시나리오 전이',
      });
    } else {
      // 일반 전이로 변경하는 경우
      setEditedEdge({
        ...editedEdge,
        target: '',
        label: '',
      });
    }
  };

  const availableScenarios = Object.entries(scenarios).filter(([id]) => id !== currentScenarioId);
  const targetScenario = scenarios[targetScenarioId];
  const availableStates = targetScenario?.plan[0]?.dialogState?.map(state => state.name) || [];

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

          {/* 시나리오 전이 토글 */}
          <Box sx={{ mb: 2 }}>
            <Button
              variant={isScenarioTransition ? "contained" : "outlined"}
              color={isScenarioTransition ? "secondary" : "primary"}
              onClick={handleScenarioTransitionToggle}
              fullWidth
            >
              {isScenarioTransition ? "시나리오 간 전이" : "일반 전이"}
            </Button>
          </Box>

          {isScenarioTransition ? (
            /* 시나리오 간 전이 설정 */
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Typography variant="subtitle2" color="primary">
                🚀 시나리오 간 전이 설정
              </Typography>
              
              {/* 타겟 시나리오 선택 */}
              <FormControl fullWidth>
                <InputLabel>타겟 시나리오</InputLabel>
                <Select
                  value={targetScenarioId}
                  onChange={(e) => setTargetScenarioId(e.target.value)}
                  label="타겟 시나리오"
                >
                  {availableScenarios.map(([id, scenario]) => (
                    <MenuItem key={id} value={id}>
                      {scenario.plan[0]?.name || `Scenario ${id}`}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* 타겟 상태 선택 */}
              {targetScenarioId && (
                <FormControl fullWidth>
                  <InputLabel>타겟 상태</InputLabel>
                  <Select
                    value={targetState}
                    onChange={(e) => setTargetState(e.target.value)}
                    label="타겟 상태"
                  >
                    {availableStates.map((stateName) => (
                      <MenuItem key={stateName} value={stateName}>
                        {stateName}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}

              {/* 조건 설정 */}
              <TextField
                label="전이 조건"
                value={editedEdge.label?.replace('시나리오 전이: ', '') || ''}
                onChange={(e) => handleLabelChange(`시나리오 전이: ${e.target.value}`)}
                fullWidth
                multiline
                rows={2}
                helperText="예: True, 조건문, 특정 인텐트 등"
              />
            </Box>
          ) : (
            /* 일반 전이 설정 */
            <>
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

              {/* 타겟 상태 선택 */}
              <TextField
                label="도착 상태"
                value={editedEdge.target}
                onChange={(e) => setEditedEdge({
                  ...editedEdge,
                  target: e.target.value,
                })}
                fullWidth
                helperText="전이할 상태 이름을 입력하세요"
              />

              {/* 연결 타입 선택 */}
              <FormControl fullWidth>
                <InputLabel>연결 타입</InputLabel>
                <Select
                  value={editedEdge.type || 'smoothstep'}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  label="연결 타입"
                >
                  <MenuItem value="smoothstep">부드러운 곡선</MenuItem>
                  <MenuItem value="straight">직선</MenuItem>
                  <MenuItem value="step">계단형</MenuItem>
                </Select>
              </FormControl>
            </>
          )}

          {/* 미리보기 */}
          <Divider />
          <Box sx={{ 
            backgroundColor: '#f8f9fa', 
            p: 2, 
            borderRadius: 1,
            border: '1px solid #e9ecef'
          }}>
            <Typography variant="subtitle2" gutterBottom>
              미리보기
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>출발:</strong> {editedEdge.source}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>도착:</strong> {isScenarioTransition ? `시나리오: ${targetScenarioId} (${targetState})` : editedEdge.target}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>라벨:</strong> {editedEdge.label || '없음'}
            </Typography>
            {isScenarioTransition && (
              <Chip 
                label="시나리오 간 전이" 
                color="secondary" 
                size="small" 
                sx={{ mt: 1 }}
              />
            )}
          </Box>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          취소
        </Button>
        <Button onClick={handleDelete} color="error">
          삭제
        </Button>
        <Button onClick={handleSave} variant="contained">
          저장
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EdgeEditModal; 