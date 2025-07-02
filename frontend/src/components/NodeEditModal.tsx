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
  IconButton,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { DialogState, ConditionHandler, IntentHandler, EventHandler } from '../types/scenario';

interface NodeEditModalProps {
  open: boolean;
  dialogState: DialogState | null;
  onClose: () => void;
  onSave: (updatedDialogState: DialogState) => void;
}

const NodeEditModal: React.FC<NodeEditModalProps> = ({
  open,
  dialogState,
  onClose,
  onSave,
}) => {
  const [editedState, setEditedState] = useState<DialogState | null>(null);

  useEffect(() => {
    if (dialogState) {
      setEditedState(JSON.parse(JSON.stringify(dialogState))); // 깊은 복사
    }
  }, [dialogState]);

  if (!editedState) return null;

  const handleSave = () => {
    onSave(editedState);
    onClose();
  };

  const handleNameChange = (value: string) => {
    setEditedState({
      ...editedState,
      name: value,
    });
  };

  const handleEntryActionChange = (value: string) => {
    setEditedState({
      ...editedState,
      entryAction: {
        directives: [
          {
            name: "speak",
            content: value
          }
        ]
      }
    });
  };

  const addConditionHandler = () => {
    const newHandler: ConditionHandler = {
      conditionStatement: "True",
      action: { directives: [] },
      transitionTarget: { scenario: "", dialogState: "" }
    };
    
    setEditedState({
      ...editedState,
      conditionHandlers: [...(editedState.conditionHandlers || []), newHandler]
    });
  };

  const removeConditionHandler = (index: number) => {
    const updated = editedState.conditionHandlers?.filter((_, i) => i !== index) || [];
    setEditedState({
      ...editedState,
      conditionHandlers: updated
    });
  };

  const updateConditionHandler = (index: number, field: string, value: string) => {
    const updated = editedState.conditionHandlers?.map((handler, i) => {
      if (i === index) {
        if (field === 'conditionStatement') {
          return { ...handler, conditionStatement: value };
        } else if (field === 'transitionTarget') {
          return { ...handler, transitionTarget: { ...handler.transitionTarget, dialogState: value } };
        }
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      conditionHandlers: updated
    });
  };

  const addIntentHandler = () => {
    const newHandler: IntentHandler = {
      intent: "",
      action: { directives: [] },
      transitionTarget: { scenario: "", dialogState: "" }
    };
    
    setEditedState({
      ...editedState,
      intentHandlers: [...(editedState.intentHandlers || []), newHandler]
    });
  };

  const removeIntentHandler = (index: number) => {
    const updated = editedState.intentHandlers?.filter((_, i) => i !== index) || [];
    setEditedState({
      ...editedState,
      intentHandlers: updated
    });
  };

  const updateIntentHandler = (index: number, field: string, value: string) => {
    const updated = editedState.intentHandlers?.map((handler, i) => {
      if (i === index) {
        if (field === 'intent') {
          return { ...handler, intent: value };
        } else if (field === 'transitionTarget') {
          return { ...handler, transitionTarget: { ...handler.transitionTarget, dialogState: value } };
        }
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      intentHandlers: updated
    });
  };

  const addEventHandler = () => {
    const newHandler: EventHandler = {
      event: {
        type: "USER_DIALOG_START",
        count: "1"
      },
      action: { directives: [] },
      transitionTarget: { scenario: "", dialogState: "" }
    };
    
    setEditedState({
      ...editedState,
      eventHandlers: [...(editedState.eventHandlers || []), newHandler]
    });
  };

  const removeEventHandler = (index: number) => {
    const updated = editedState.eventHandlers?.filter((_, i) => i !== index) || [];
    setEditedState({
      ...editedState,
      eventHandlers: updated
    });
  };

  const updateEventHandler = (index: number, field: string, value: string) => {
    const updated = editedState.eventHandlers?.map((handler, i) => {
      if (i === index) {
        if (field === 'eventType') {
          return { 
            ...handler, 
            event: { ...handler.event, type: value }
          };
        } else if (field === 'transitionTarget') {
          return { 
            ...handler, 
            transitionTarget: { ...handler.transitionTarget, dialogState: value } 
          };
        }
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      eventHandlers: updated
    });
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        State 편집: {editedState.name}
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {/* 기본 정보 */}
          <TextField
            label="State 이름"
            value={editedState.name}
            onChange={(e) => handleNameChange(e.target.value)}
            fullWidth
          />

          <TextField
            label="Entry Action (발화 내용)"
            value={editedState.entryAction?.directives?.[0]?.content || ''}
            onChange={(e) => handleEntryActionChange(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />

          {/* 조건 핸들러 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">
                조건 핸들러 ({editedState.conditionHandlers?.length || 0})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editedState.conditionHandlers?.map((handler, index) => (
                  <Box key={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">조건 {index + 1}</Typography>
                      <IconButton onClick={() => removeConditionHandler(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    <TextField
                      label="조건문"
                      value={handler.conditionStatement}
                      onChange={(e) => updateConditionHandler(index, 'conditionStatement', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                    <TextField
                      label="전이 대상 State"
                      value={handler.transitionTarget.dialogState}
                      onChange={(e) => updateConditionHandler(index, 'transitionTarget', e.target.value)}
                      fullWidth
                    />
                  </Box>
                ))}
                <Button
                  onClick={addConditionHandler}
                  startIcon={<AddIcon />}
                  variant="outlined"
                  fullWidth
                >
                  조건 핸들러 추가
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* 인텐트 핸들러 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">
                인텐트 핸들러 ({editedState.intentHandlers?.length || 0})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editedState.intentHandlers?.map((handler, index) => (
                  <Box key={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">인텐트 {index + 1}</Typography>
                      <IconButton onClick={() => removeIntentHandler(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    <TextField
                      label="인텐트"
                      value={handler.intent}
                      onChange={(e) => updateIntentHandler(index, 'intent', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                    <TextField
                      label="전이 대상 State"
                      value={handler.transitionTarget.dialogState}
                      onChange={(e) => updateIntentHandler(index, 'transitionTarget', e.target.value)}
                      fullWidth
                    />
                  </Box>
                ))}
                <Button
                  onClick={addIntentHandler}
                  startIcon={<AddIcon />}
                  variant="outlined"
                  fullWidth
                >
                  인텐트 핸들러 추가
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* 이벤트 핸들러 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">
                이벤트 핸들러 ({editedState.eventHandlers?.length || 0})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editedState.eventHandlers?.map((handler, index) => (
                  <Box key={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">이벤트 {index + 1}</Typography>
                      <IconButton onClick={() => removeEventHandler(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    <TextField
                      label="이벤트 타입"
                      value={handler.event.type}
                      onChange={(e) => updateEventHandler(index, 'eventType', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                      helperText="예: USER_DIALOG_START, USER_DIALOG_END, TIMER_EXPIRED 등"
                    />
                    <TextField
                      label="전이 대상 State"
                      value={handler.transitionTarget.dialogState}
                      onChange={(e) => updateEventHandler(index, 'transitionTarget', e.target.value)}
                      fullWidth
                    />
                  </Box>
                ))}
                <Button
                  onClick={addEventHandler}
                  startIcon={<AddIcon />}
                  variant="outlined"
                  fullWidth
                >
                  이벤트 핸들러 추가
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>
        </Box>
      </DialogContent>
      
      <DialogActions>
        <Button onClick={onClose}>취소</Button>
        <Button onClick={handleSave} variant="contained">저장</Button>
      </DialogActions>
    </Dialog>
  );
};

export default NodeEditModal; 