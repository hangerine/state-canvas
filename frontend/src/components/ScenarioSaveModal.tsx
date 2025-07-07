import React, { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  TextField,
} from '@mui/material';
import { Scenario } from '../types/scenario';
import { ScenarioChanges } from '../utils/scenarioUtils';

interface ScenarioSaveModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (filename: string) => void;
  changes: ScenarioChanges;
  newScenario: Scenario;
}

const ScenarioSaveModal: React.FC<ScenarioSaveModalProps> = ({
  open,
  onClose,
  onSave,
  changes,
  newScenario,
}) => {
  const [filename, setFilename] = useState('scenario_modified.json');

  const handleSave = () => {
    onSave(filename);
    onClose();
  };

  const hasChanges = changes.added.length > 0 || changes.modified.length > 0 || changes.removed.length > 0;

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle>
        <Typography variant="h6">
          🔄 시나리오 저장 확인
        </Typography>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <TextField
            label="저장할 파일명"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            fullWidth
            size="small"
            helperText="새로운 파일로 저장됩니다 (기존 파일은 덮어쓰지 않음)"
          />
        </Box>

        {!hasChanges ? (
          <Alert severity="info" sx={{ mb: 2 }}>
            변경사항이 없습니다. 현재 상태 그대로 저장됩니다.
          </Alert>
        ) : (
          <>
            <Alert severity="warning" sx={{ mb: 2 }}>
              다음 변경사항이 저장됩니다:
            </Alert>

            {/* 추가된 상태들 */}
            {changes.added.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="success.main" sx={{ mb: 1 }}>
                  ✅ 추가된 상태 ({changes.added.length}개):
                </Typography>
                <List dense>
                  {changes.added.map((state, idx) => (
                    <ListItem key={idx} sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={state.name} size="small" color="success" />
                            <Typography variant="body2">
                              새로운 상태
                            </Typography>
                          </Box>
                        }
                        secondary={state.entryAction?.directives?.[0]?.content || '설명 없음'}
                      />
                    </ListItem>
                  ))}
                </List>
                <Divider sx={{ my: 1 }} />
              </Box>
            )}

            {/* 수정된 상태들 */}
            {changes.modified.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="warning.main" sx={{ mb: 1 }}>
                  🔄 수정된 상태 ({changes.modified.length}개):
                </Typography>
                <List dense>
                  {changes.modified.map((state, idx) => (
                    <ListItem key={idx} sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={state.name} size="small" color="warning" />
                            <Typography variant="body2">
                              상태 내용 변경됨
                            </Typography>
                          </Box>
                        }
                        secondary={state.entryAction?.directives?.[0]?.content || '설명 없음'}
                      />
                    </ListItem>
                  ))}
                </List>
                <Divider sx={{ my: 1 }} />
              </Box>
            )}

            {/* 삭제된 상태들 */}
            {changes.removed.length > 0 && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle2" color="error.main" sx={{ mb: 1 }}>
                  ❌ 삭제된 상태 ({changes.removed.length}개):
                </Typography>
                <List dense>
                  {changes.removed.map((state, idx) => (
                    <ListItem key={idx} sx={{ py: 0.5 }}>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Chip label={state.name} size="small" color="error" />
                            <Typography variant="body2">
                              상태 삭제됨
                            </Typography>
                          </Box>
                        }
                        secondary={state.entryAction?.directives?.[0]?.content || '설명 없음'}
                      />
                    </ListItem>
                  ))}
                </List>
              </Box>
            )}
          </>
        )}

        {/* 시나리오 요약 정보 */}
        <Box sx={{ mt: 2, p: 2, bgcolor: '#f5f5f5', borderRadius: 1 }}>
          <Typography variant="subtitle2" gutterBottom>
            📊 저장될 시나리오 정보:
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip 
              label={`총 상태: ${newScenario.plan[0]?.dialogState.length || 0}개`} 
              size="small" 
              variant="outlined" 
            />
            <Chip 
              label={`웹훅: ${newScenario.webhooks?.length || 0}개`} 
              size="small" 
              variant="outlined" 
            />
            <Chip 
              label={`인텐트 매핑: ${newScenario.intentMapping?.length || 0}개`} 
              size="small" 
              variant="outlined" 
            />
          </Box>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} color="inherit">
          취소
        </Button>
        <Button 
          onClick={handleSave} 
          variant="contained" 
          color="primary"
          disabled={!filename.trim()}
        >
          저장하기
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ScenarioSaveModal; 