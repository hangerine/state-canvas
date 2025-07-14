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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Chip,
  Grid,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { DialogState, ConditionHandler, IntentHandler, EventHandler, ApiCallHandler } from '../types/scenario';

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

  // Response Mappings를 위한 별도 state (문자열로 저장)
  const [responseMappingsStrings, setResponseMappingsStrings] = useState<string[]>([]);

  // JSON validation helper
  const validateJson = (jsonString: string): { isValid: boolean; error?: string } => {
    try {
      JSON.parse(jsonString);
      return { isValid: true };
    } catch (error) {
      return { isValid: false, error: (error as Error).message };
    }
  };

  useEffect(() => {
    if (dialogState) {
      const clonedState = JSON.parse(JSON.stringify(dialogState)); // 깊은 복사
      setEditedState(clonedState);
      
      // Response Mappings 문자열 초기화
      const mappingsStrings = clonedState.apicallHandlers?.map((handler: any) => 
        JSON.stringify(handler.apicall?.formats?.responseMappings || {}, null, 2)
      ) || [];
      setResponseMappingsStrings(mappingsStrings);
    }
  }, [dialogState]);

  // Response Mappings 문자열 배열 길이를 API Call 핸들러 배열과 동기화
  const getSafeResponseMappingString = (index: number): string => {
    if (index < responseMappingsStrings.length) {
      return responseMappingsStrings[index];
    }
    // 배열 길이가 부족한 경우 빈 객체 반환
    return '{}';
  };

  if (!editedState) return null;

  const handleSave = () => {
    // 이벤트 핸들러들을 객체 형태로 정규화
    const normalizedEventHandlers = editedState.eventHandlers?.map(ensureEventObjectFormat) || [];
    
    // Response Mappings 문자열을 JSON 객체로 변환
    const updatedApiCallHandlers = editedState.apicallHandlers?.map((handler, index) => {
      const mappingString = getSafeResponseMappingString(index);
      let parsedMappings = {};
      
      try {
        parsedMappings = JSON.parse(mappingString);
      } catch (e) {
        console.warn(`Invalid JSON in Response Mappings for handler ${index}:`, mappingString);
        // 유효하지 않은 JSON의 경우 빈 객체 사용
        parsedMappings = {};
      }
      
      return {
        ...handler,
        apicall: {
          ...handler.apicall,
          formats: {
            ...handler.apicall.formats,
            responseMappings: parsedMappings
          }
        }
      };
    }) || [];
    
    const normalizedState = {
      ...editedState,
      eventHandlers: normalizedEventHandlers,
      apicallHandlers: updatedApiCallHandlers
    };
    
    console.log('🔧 Event handlers normalized:', normalizedEventHandlers);
    console.log('🔧 API Call handlers normalized:', updatedApiCallHandlers);
    
    onSave(normalizedState);
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
      action: { directives: [], memoryActions: [] },
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

  // Memory Actions 관리 함수들
  const addMemoryActionToConditionHandler = (handlerIndex: number) => {
    const updated = editedState.conditionHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const newMemoryAction = {
          actionType: "ADD",
          memorySlotKey: "",
          memorySlotValue: "",
          actionScope: "SESSION"
        };
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: [...(handler.action.memoryActions || []), newMemoryAction]
          }
        };
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      conditionHandlers: updated
    });
  };

  const removeMemoryActionFromConditionHandler = (handlerIndex: number, memoryActionIndex: number) => {
    const updated = editedState.conditionHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const filteredMemoryActions = handler.action.memoryActions?.filter((_, j) => j !== memoryActionIndex) || [];
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: filteredMemoryActions
          }
        };
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      conditionHandlers: updated
    });
  };

  const updateMemoryActionInConditionHandler = (handlerIndex: number, memoryActionIndex: number, field: string, value: string) => {
    const updated = editedState.conditionHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const updatedMemoryActions = handler.action.memoryActions?.map((memoryAction, j) => {
          if (j === memoryActionIndex) {
            return { ...memoryAction, [field]: value };
          }
          return memoryAction;
        }) || [];
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: updatedMemoryActions
          }
        };
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
      action: { directives: [], memoryActions: [] },
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

  // Memory Actions 관리 함수들
  const addMemoryActionToIntentHandler = (handlerIndex: number) => {
    const updated = editedState.intentHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const newMemoryAction = {
          actionType: "ADD",
          memorySlotKey: "",
          memorySlotValue: "",
          actionScope: "SESSION"
        };
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: [...(handler.action.memoryActions || []), newMemoryAction]
          }
        };
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      intentHandlers: updated
    });
  };

  const removeMemoryActionFromIntentHandler = (handlerIndex: number, memoryActionIndex: number) => {
    const updated = editedState.intentHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const filteredMemoryActions = handler.action.memoryActions?.filter((_, j) => j !== memoryActionIndex) || [];
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: filteredMemoryActions
          }
        };
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      intentHandlers: updated
    });
  };

  const updateMemoryActionInIntentHandler = (handlerIndex: number, memoryActionIndex: number, field: string, value: string) => {
    const updated = editedState.intentHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const updatedMemoryActions = handler.action.memoryActions?.map((memoryAction, j) => {
          if (j === memoryActionIndex) {
            return { ...memoryAction, [field]: value };
          }
          return memoryAction;
        }) || [];
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: updatedMemoryActions
          }
        };
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
        type: "CUSTOM_EVENT",
        count: "1"
      },
      action: { directives: [], memoryActions: [] },
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
          // 항상 객체 형태로 event 필드 보장
          return { 
            ...handler, 
            event: {
              type: value,
              count: "1"
            }
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

  // Memory Actions 관리 함수들
  const addMemoryActionToEventHandler = (handlerIndex: number) => {
    const updated = editedState.eventHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const newMemoryAction = {
          actionType: "ADD",
          memorySlotKey: "",
          memorySlotValue: "",
          actionScope: "SESSION"
        };
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: [...(handler.action.memoryActions || []), newMemoryAction]
          }
        };
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      eventHandlers: updated
    });
  };

  const removeMemoryActionFromEventHandler = (handlerIndex: number, memoryActionIndex: number) => {
    const updated = editedState.eventHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const filteredMemoryActions = handler.action.memoryActions?.filter((_, j) => j !== memoryActionIndex) || [];
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: filteredMemoryActions
          }
        };
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      eventHandlers: updated
    });
  };

  const updateMemoryActionInEventHandler = (handlerIndex: number, memoryActionIndex: number, field: string, value: string) => {
    const updated = editedState.eventHandlers?.map((handler, i) => {
      if (i === handlerIndex) {
        const updatedMemoryActions = handler.action.memoryActions?.map((memoryAction, j) => {
          if (j === memoryActionIndex) {
            return { ...memoryAction, [field]: value };
          }
          return memoryAction;
        }) || [];
        return {
          ...handler,
          action: {
            ...handler.action,
            memoryActions: updatedMemoryActions
          }
        };
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      eventHandlers: updated
    });
  };

  // ApiCall 핸들러 관리 함수들
  const addApiCallHandler = () => {
    const newHandler: ApiCallHandler = {
      name: "API_CALL",
      apicall: {
        url: "",
        timeout: 5000,
        retry: 3,
        formats: {
          method: "POST",
          requestTemplate: "",
          responseSchema: {},
          responseMappings: {},
          headers: {
            "Content-Type": "application/json"
          }
        }
      },
      transitionTarget: { scenario: "", dialogState: "" }
    };
    
    setEditedState({
      ...editedState,
      apicallHandlers: [...(editedState.apicallHandlers || []), newHandler]
    });

    // Response Mappings 문자열 배열도 동기화
    setResponseMappingsStrings([...responseMappingsStrings, '{}']);
  };

  const removeApiCallHandler = (index: number) => {
    const updated = editedState.apicallHandlers?.filter((_, i) => i !== index) || [];
    setEditedState({
      ...editedState,
      apicallHandlers: updated
    });

    // Response Mappings 문자열 배열도 동기화
    const updatedStrings = responseMappingsStrings.filter((_, i) => i !== index);
    setResponseMappingsStrings(updatedStrings);
  };

  // 헤더 관리 함수들
  const addHeaderToApiCall = (apiCallIndex: number, key: string = '', value: string = '') => {
    const handler = editedState.apicallHandlers?.[apiCallIndex];
    if (!handler) return;

    const currentHeaders = handler.apicall.formats.headers || {};
    const newHeaders = { ...currentHeaders, [key]: value };
    
    updateApiCallHandler(apiCallIndex, 'headers', newHeaders);
  };

  const removeHeaderFromApiCall = (apiCallIndex: number, headerKey: string) => {
    const handler = editedState.apicallHandlers?.[apiCallIndex];
    if (!handler) return;

    const currentHeaders = handler.apicall.formats.headers || {};
    const { [headerKey]: removed, ...newHeaders } = currentHeaders;
    
    updateApiCallHandler(apiCallIndex, 'headers', newHeaders);
  };

  const updateHeaderInApiCall = (apiCallIndex: number, oldKey: string, newKey: string, newValue: string) => {
    const handler = editedState.apicallHandlers?.[apiCallIndex];
    if (!handler) return;

    const currentHeaders = handler.apicall.formats.headers || {};
    const newHeaders = { ...currentHeaders };
    
    if (oldKey !== newKey) {
      delete newHeaders[oldKey];
    }
    newHeaders[newKey] = newValue;
    
    updateApiCallHandler(apiCallIndex, 'headers', newHeaders);
  };

  // 기본 헤더 옵션들
  const defaultHeaderOptions = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Accept', value: 'application/json' },
    { key: 'Authorization', value: 'Bearer ' },
    { key: 'User-Agent', value: 'StateCanvas/1.0' },
    { key: 'X-Requested-With', value: 'XMLHttpRequest' },
    { key: 'Cache-Control', value: 'no-cache' },
  ];

  const updateApiCallHandler = (index: number, field: string, value: any) => {
    const updated = editedState.apicallHandlers?.map((handler, i) => {
      if (i === index) {
        if (field === 'name') {
          return { ...handler, name: value };
        } else if (field === 'url') {
          return { ...handler, apicall: { ...handler.apicall, url: value } };
        } else if (field === 'timeout') {
          return { ...handler, apicall: { ...handler.apicall, timeout: parseInt(value) || 5000 } };
        } else if (field === 'retry') {
          return { ...handler, apicall: { ...handler.apicall, retry: parseInt(value) || 3 } };
        } else if (field === 'method') {
          return { 
            ...handler, 
            apicall: { 
              ...handler.apicall, 
              formats: { ...handler.apicall.formats, method: value } 
            } 
          };
        } else if (field === 'requestTemplate') {
          return { 
            ...handler, 
            apicall: { 
              ...handler.apicall, 
              formats: { ...handler.apicall.formats, requestTemplate: value } 
            } 
          };
        } else if (field === 'headers') {
          return { 
            ...handler, 
            apicall: { 
              ...handler.apicall, 
              formats: { ...handler.apicall.formats, headers: value } 
            } 
          };
        } else if (field === 'transitionTarget') {
          return { ...handler, transitionTarget: { ...handler.transitionTarget, dialogState: value } };
        }
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      apicallHandlers: updated
    });
  };

  // Webhook 액션 관리 함수들
  const addWebhookAction = () => {
    const newWebhookAction = {
      name: "NEW_WEBHOOK"
    };
    
    setEditedState({
      ...editedState,
      webhookActions: [...(editedState.webhookActions || []), newWebhookAction]
    });
  };

  const removeWebhookAction = (index: number) => {
    const updated = editedState.webhookActions?.filter((_, i) => i !== index) || [];
    setEditedState({
      ...editedState,
      webhookActions: updated
    });
  };

  const updateWebhookAction = (index: number, value: string) => {
    const updated = editedState.webhookActions?.map((action, i) => {
      if (i === index) {
        return { ...action, name: value };
      }
      return action;
    }) || [];
    
    setEditedState({
      ...editedState,
      webhookActions: updated
    });
  };

  // Slot Filling Form 관리 함수들
  const addSlotFillingForm = () => {
    const newSlot = {
      name: "NEW_SLOT",
      required: "Y",
      memorySlotKey: [],
      fillBehavior: {
        promptAction: {
          directives: [
            {
              name: "customPayload",
              content: {
                record: { text: "" },
                item: [{
                  section: {
                    class: "cb-section section_1",
                    item: [{
                      text: {
                        class: "cb-text text",
                        text: "<p>슬롯 값을 입력해주세요.</p>"
                      }
                    }]
                  }
                }],
                templateId: "TM000000000000000001",
                type: "MESSAGE",
                version: "1.0"
              }
            }
          ]
        },
        repromptEventHandlers: [
          {
            event: {
              type: "NO_MATCH_EVENT",
              count: "0"
            },
            action: {
              directives: [
                {
                  name: "customPayload",
                  content: {
                    record: { text: "" },
                    item: [{
                      section: {
                        class: "cb-section section_1",
                        item: [{
                          text: {
                            class: "cb-text text",
                            text: "<p>올바른 값을 입력해주세요.</p>"
                          }
                        }]
                      }
                    }],
                    templateId: "TM000000000000000001",
                    type: "MESSAGE",
                    version: "1.0"
                  }
                }
              ]
            },
            transitionTarget: {
              scenario: "",
              dialogState: "__CURRENT_DIALOG_STATE__"
            }
          }
        ]
      }
    };
    
    setEditedState({
      ...editedState,
      slotFillingForm: [...(editedState.slotFillingForm || []), newSlot]
    });
  };

  const removeSlotFillingForm = (index: number) => {
    const updated = editedState.slotFillingForm?.filter((_, i) => i !== index) || [];
    setEditedState({
      ...editedState,
      slotFillingForm: updated
    });
  };

  const updateSlotFillingForm = (index: number, field: string, value: any) => {
    const updated = editedState.slotFillingForm?.map((slot, i) => {
      if (i === index) {
        if (field === 'name') {
          return { ...slot, name: value };
        } else if (field === 'required') {
          return { ...slot, required: value };
        } else if (field === 'memorySlotKey') {
          return { ...slot, memorySlotKey: value };
        } else if (field === 'promptContent') {
          return {
            ...slot,
            fillBehavior: {
              ...slot.fillBehavior,
              promptAction: {
                directives: [
                  {
                    name: "customPayload",
                    content: {
                      record: { text: "" },
                      item: [{
                        section: {
                          class: "cb-section section_1",
                          item: [{
                            text: {
                              class: "cb-text text",
                              text: `<p>${value}</p>`
                            }
                          }]
                        }
                      }],
                      templateId: "TM000000000000000001",
                      type: "MESSAGE",
                      version: "1.0"
                    }
                  }
                ]
              }
            }
          };
        } else if (field === 'repromptContent') {
          return {
            ...slot,
            fillBehavior: {
              ...slot.fillBehavior,
              repromptEventHandlers: [
                {
                  event: {
                    type: "NO_MATCH_EVENT",
                    count: "0"
                  },
                  action: {
                    directives: [
                      {
                        name: "customPayload",
                        content: {
                          record: { text: "" },
                          item: [{
                            section: {
                              class: "cb-section section_1",
                              item: [{
                                text: {
                                  class: "cb-text text",
                                  text: `<p>${value}</p>`
                                }
                              }]
                            }
                          }],
                          templateId: "TM000000000000000001",
                          type: "MESSAGE",
                          version: "1.0"
                        }
                      }
                    ]
                  },
                  transitionTarget: {
                    scenario: "",
                    dialogState: "__CURRENT_DIALOG_STATE__"
                  }
                }
              ]
            }
          };
        }
      }
      return slot;
    }) || [];
    
    setEditedState({
      ...editedState,
      slotFillingForm: updated
    });
  };

  // 이벤트 타입 값을 안전하게 가져오는 헬퍼 함수 (개선)
  const getEventType = (event: any): string => {
    if (!event) return '';
    if (typeof event === 'object' && event.type) {
      return event.type;
    } else if (typeof event === 'string') {
      return event;
    }
    return '';
  };

  // 이벤트 핸들러가 객체 형태인지 확인하고 수정하는 헬퍼 함수
  const ensureEventObjectFormat = (handler: any) => {
    if (typeof handler.event === 'string') {
      return {
        ...handler,
        event: {
          type: handler.event,
          count: "1"
        }
      };
    } else if (typeof handler.event === 'object' && !handler.event.count) {
      return {
        ...handler,
        event: {
          type: handler.event.type || '',
          count: "1"
        }
      };
    }
    return handler;
  };

  // Slot Filling Form 헬퍼 함수들
  const getSlotPromptContent = (slot: any): string => {
    try {
      const content = slot.fillBehavior?.promptAction?.directives?.[0]?.content;
      if (typeof content === 'string') {
        return content;
      } else if (typeof content === 'object' && content?.item?.[0]?.section?.item?.[0]?.text?.text) {
        // HTML 태그 제거하고 텍스트만 추출
        return content.item[0].section.item[0].text.text.replace(/<[^>]*>/g, '');
      }
      return '';
    } catch (e) {
      return '';
    }
  };

  const getSlotRepromptContent = (slot: any): string => {
    try {
      const content = slot.fillBehavior?.repromptEventHandlers?.[0]?.action?.directives?.[0]?.content;
      if (typeof content === 'string') {
        return content;
      } else if (typeof content === 'object' && content?.item?.[0]?.section?.item?.[0]?.text?.text) {
        // HTML 태그 제거하고 텍스트만 추출
        return content.item[0].section.item[0].text.text.replace(/<[^>]*>/g, '');
      }
      return '';
    } catch (e) {
      return '';
    }
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
                      sx={{ mb: 2 }}
                    />
                    
                    {/* Memory Actions */}
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Memory Actions</Typography>
                    {handler.action.memoryActions?.map((memoryAction, memoryIndex) => (
                      <Box key={memoryIndex} sx={{ border: 1, borderColor: 'grey.300', p: 1, borderRadius: 1, mb: 1 }}>
                        <Grid container spacing={1} alignItems="center">
                          <Grid item xs={2}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Type</InputLabel>
                              <Select
                                value={memoryAction.actionType}
                                onChange={(e) => updateMemoryActionInConditionHandler(index, memoryIndex, 'actionType', e.target.value)}
                                label="Type"
                              >
                                <MenuItem value="ADD">ADD</MenuItem>
                                <MenuItem value="UPDATE">UPDATE</MenuItem>
                                <MenuItem value="DELETE">DELETE</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Key"
                              value={memoryAction.memorySlotKey}
                              onChange={(e) => updateMemoryActionInConditionHandler(index, memoryIndex, 'memorySlotKey', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Value"
                              value={memoryAction.memorySlotValue}
                              onChange={(e) => updateMemoryActionInConditionHandler(index, memoryIndex, 'memorySlotValue', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                                                     <Grid item xs={2}>
                             <FormControl fullWidth size="small">
                               <InputLabel>Scope</InputLabel>
                               <Select
                                 value={memoryAction.actionScope}
                                 onChange={(e) => updateMemoryActionInConditionHandler(index, memoryIndex, 'actionScope', e.target.value)}
                                 label="Scope"
                               >
                                 <MenuItem value="SESSION">SESSION</MenuItem>
                                 <MenuItem value="GLOBAL">GLOBAL</MenuItem>
                                 <MenuItem value="SCENARIO">SCENARIO</MenuItem>
                                 <MenuItem value="STATE">STATE</MenuItem>
                               </Select>
                             </FormControl>
                           </Grid>
                          <Grid item xs={2}>
                            <IconButton 
                              onClick={() => removeMemoryActionFromConditionHandler(index, memoryIndex)} 
                              size="small"
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>
                      </Box>
                    )) || []}
                    <Button
                      onClick={() => addMemoryActionToConditionHandler(index)}
                      startIcon={<AddIcon />}
                      variant="text"
                      size="small"
                    >
                      Memory Action 추가
                    </Button>
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
                      sx={{ mb: 2 }}
                    />
                    
                    {/* Memory Actions */}
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Memory Actions</Typography>
                    {handler.action.memoryActions?.map((memoryAction, memoryIndex) => (
                      <Box key={memoryIndex} sx={{ border: 1, borderColor: 'grey.300', p: 1, borderRadius: 1, mb: 1 }}>
                        <Grid container spacing={1} alignItems="center">
                          <Grid item xs={2}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Type</InputLabel>
                              <Select
                                value={memoryAction.actionType}
                                onChange={(e) => updateMemoryActionInIntentHandler(index, memoryIndex, 'actionType', e.target.value)}
                                label="Type"
                              >
                                <MenuItem value="ADD">ADD</MenuItem>
                                <MenuItem value="UPDATE">UPDATE</MenuItem>
                                <MenuItem value="DELETE">DELETE</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Key"
                              value={memoryAction.memorySlotKey}
                              onChange={(e) => updateMemoryActionInIntentHandler(index, memoryIndex, 'memorySlotKey', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Value"
                              value={memoryAction.memorySlotValue}
                              onChange={(e) => updateMemoryActionInIntentHandler(index, memoryIndex, 'memorySlotValue', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                                                     <Grid item xs={2}>
                             <FormControl fullWidth size="small">
                               <InputLabel>Scope</InputLabel>
                               <Select
                                 value={memoryAction.actionScope}
                                 onChange={(e) => updateMemoryActionInIntentHandler(index, memoryIndex, 'actionScope', e.target.value)}
                                 label="Scope"
                               >
                                 <MenuItem value="SESSION">SESSION</MenuItem>
                                 <MenuItem value="GLOBAL">GLOBAL</MenuItem>
                                 <MenuItem value="SCENARIO">SCENARIO</MenuItem>
                                 <MenuItem value="STATE">STATE</MenuItem>
                               </Select>
                             </FormControl>
                           </Grid>
                          <Grid item xs={2}>
                            <IconButton 
                              onClick={() => removeMemoryActionFromIntentHandler(index, memoryIndex)} 
                              size="small"
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>
                      </Box>
                    )) || []}
                    <Button
                      onClick={() => addMemoryActionToIntentHandler(index)}
                      startIcon={<AddIcon />}
                      variant="text"
                      size="small"
                    >
                      Memory Action 추가
                    </Button>
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
                      value={getEventType(handler.event)}
                      onChange={(e) => updateEventHandler(index, 'eventType', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                      helperText="예: CUSTOM_EVENT, USER_DIALOG_START, USER_DIALOG_END 등"
                    />
                    <TextField
                      label="전이 대상 State"
                      value={handler.transitionTarget.dialogState}
                      onChange={(e) => updateEventHandler(index, 'transitionTarget', e.target.value)}
                      fullWidth
                      sx={{ mb: 2 }}
                    />
                    
                    {/* Memory Actions */}
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Memory Actions</Typography>
                    {handler.action.memoryActions?.map((memoryAction, memoryIndex) => (
                      <Box key={memoryIndex} sx={{ border: 1, borderColor: 'grey.300', p: 1, borderRadius: 1, mb: 1 }}>
                        <Grid container spacing={1} alignItems="center">
                          <Grid item xs={2}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Type</InputLabel>
                              <Select
                                value={memoryAction.actionType}
                                onChange={(e) => updateMemoryActionInEventHandler(index, memoryIndex, 'actionType', e.target.value)}
                                label="Type"
                              >
                                <MenuItem value="ADD">ADD</MenuItem>
                                <MenuItem value="UPDATE">UPDATE</MenuItem>
                                <MenuItem value="DELETE">DELETE</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Key"
                              value={memoryAction.memorySlotKey}
                              onChange={(e) => updateMemoryActionInEventHandler(index, memoryIndex, 'memorySlotKey', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Value"
                              value={memoryAction.memorySlotValue}
                              onChange={(e) => updateMemoryActionInEventHandler(index, memoryIndex, 'memorySlotValue', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                                                     <Grid item xs={2}>
                             <FormControl fullWidth size="small">
                               <InputLabel>Scope</InputLabel>
                               <Select
                                 value={memoryAction.actionScope}
                                 onChange={(e) => updateMemoryActionInEventHandler(index, memoryIndex, 'actionScope', e.target.value)}
                                 label="Scope"
                               >
                                 <MenuItem value="SESSION">SESSION</MenuItem>
                                 <MenuItem value="GLOBAL">GLOBAL</MenuItem>
                                 <MenuItem value="SCENARIO">SCENARIO</MenuItem>
                                 <MenuItem value="STATE">STATE</MenuItem>
                               </Select>
                             </FormControl>
                           </Grid>
                          <Grid item xs={2}>
                            <IconButton 
                              onClick={() => removeMemoryActionFromEventHandler(index, memoryIndex)} 
                              size="small"
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Grid>
                        </Grid>
                      </Box>
                    )) || []}
                    <Button
                      onClick={() => addMemoryActionToEventHandler(index)}
                      startIcon={<AddIcon />}
                      variant="text"
                      size="small"
                    >
                      Memory Action 추가
                    </Button>
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

          {/* API Call 핸들러 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">
                API Call 핸들러 ({editedState.apicallHandlers?.length || 0})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editedState.apicallHandlers?.map((handler, index) => (
                  <Box key={index} data-api-call-index={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">API Call {index + 1}</Typography>
                      <IconButton onClick={() => removeApiCallHandler(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                    <TextField
                      label="핸들러 이름"
                      value={handler.name}
                      onChange={(e) => updateApiCallHandler(index, 'name', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                    
                    <TextField
                      label="URL"
                      value={handler.apicall.url}
                      onChange={(e) => updateApiCallHandler(index, 'url', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                      placeholder="http://example.com/api/endpoint"
                    />
                    
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <FormControl sx={{ minWidth: 120 }}>
                        <InputLabel>Method</InputLabel>
                        <Select
                          value={handler.apicall.formats.method}
                          label="Method"
                          onChange={(e) => updateApiCallHandler(index, 'method', e.target.value)}
                        >
                          <MenuItem value="GET">GET</MenuItem>
                          <MenuItem value="POST">POST</MenuItem>
                          <MenuItem value="PUT">PUT</MenuItem>
                          <MenuItem value="DELETE">DELETE</MenuItem>
                          <MenuItem value="PATCH">PATCH</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <TextField
                        label="Timeout (ms)"
                        type="number"
                        value={handler.apicall.timeout}
                        onChange={(e) => updateApiCallHandler(index, 'timeout', e.target.value)}
                        sx={{ flex: 1 }}
                      />
                      
                      <TextField
                        label="Retry"
                        type="number"
                        value={handler.apicall.retry}
                        onChange={(e) => updateApiCallHandler(index, 'retry', e.target.value)}
                        sx={{ flex: 1 }}
                      />
                    </Box>
                    
                    <TextField
                      label="Request Template"
                      value={handler.apicall.formats.requestTemplate || ''}
                      onChange={(e) => updateApiCallHandler(index, 'requestTemplate', e.target.value)}
                      multiline
                      rows={3}
                      fullWidth
                      sx={{ mb: 1 }}
                      placeholder='{"text": "{{USER_TEXT_INPUT.[0]}}", "sessionId": "{{sessionId}}", "requestId": "{{requestId}}"}'
                      helperText="사용 가능한 변수: {{sessionId}}, {{requestId}}, {{USER_TEXT_INPUT.[0]}}, {{memorySlots.KEY.value.[0]}}, {{customKey}} 등"
                    />

                    {/* Headers 설정 */}
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        HTTP Headers
                      </Typography>
                      
                      {/* 기본 헤더 선택 */}
                      <Box sx={{ mb: 1 }}>
                        <Typography variant="caption" sx={{ display: 'block', mb: 0.5 }}>
                          기본 헤더 추가:
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {defaultHeaderOptions.map((option) => (
                            <Chip
                              key={option.key}
                              label={`${option.key}: ${option.value}`}
                              variant="outlined"
                              size="small"
                              clickable
                              onClick={() => addHeaderToApiCall(index, option.key, option.value)}
                              sx={{ fontSize: '0.7rem' }}
                            />
                          ))}
                        </Box>
                      </Box>

                      {/* 현재 헤더 목록 */}
                      <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, minHeight: 60, bgcolor: '#f9f9f9' }}>
                        {Object.entries(handler.apicall.formats.headers || {}).length === 0 ? (
                          <Typography variant="caption" color="text.secondary">
                            설정된 헤더가 없습니다. 위의 기본 헤더를 선택하거나 아래에서 커스텀 헤더를 추가하세요.
                          </Typography>
                        ) : (
                          <Grid container spacing={1}>
                            {Object.entries(handler.apicall.formats.headers || {}).map(([key, value]) => (
                              <Grid item xs={12} key={key}>
                                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                                  <TextField
                                    size="small"
                                    label="Key"
                                    value={key}
                                    onChange={(e) => updateHeaderInApiCall(index, key, e.target.value, value as string)}
                                    sx={{ flex: 1 }}
                                  />
                                  <TextField
                                    size="small"
                                    label="Value"
                                    value={value as string}
                                    onChange={(e) => updateHeaderInApiCall(index, key, key, e.target.value)}
                                    sx={{ flex: 2 }}
                                  />
                                  <IconButton
                                    size="small"
                                    onClick={() => removeHeaderFromApiCall(index, key)}
                                    color="error"
                                  >
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        )}
                      </Box>

                      {/* 커스텀 헤더 추가 */}
                      <Box sx={{ mt: 1, display: 'flex', gap: 1, alignItems: 'center' }}>
                        <TextField
                          size="small"
                          placeholder="Header Key"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const target = e.target as HTMLInputElement;
                              const valueInput = target.parentElement?.nextElementSibling?.querySelector('input') as HTMLInputElement;
                              const key = target.value.trim();
                              const value = valueInput?.value.trim() || '';
                              if (key) {
                                addHeaderToApiCall(index, key, value);
                                target.value = '';
                                if (valueInput) valueInput.value = '';
                              }
                            }
                          }}
                          sx={{ flex: 1 }}
                        />
                        <TextField
                          size="small"
                          placeholder="Header Value"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const target = e.target as HTMLInputElement;
                              const keyInput = target.parentElement?.previousElementSibling?.querySelector('input') as HTMLInputElement;
                              const key = keyInput?.value.trim() || '';
                              const value = target.value.trim();
                              if (key) {
                                addHeaderToApiCall(index, key, value);
                                if (keyInput) keyInput.value = '';
                                target.value = '';
                              }
                            }
                          }}
                          sx={{ flex: 2 }}
                        />
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => {
                            const container = document.querySelector(`[data-api-call-index="${index}"]`);
                            const keyInput = container?.querySelector('input[placeholder="Header Key"]') as HTMLInputElement;
                            const valueInput = container?.querySelector('input[placeholder="Header Value"]') as HTMLInputElement;
                            const key = keyInput?.value.trim() || '';
                            const value = valueInput?.value.trim() || '';
                            if (key) {
                              addHeaderToApiCall(index, key, value);
                              if (keyInput) keyInput.value = '';
                              if (valueInput) valueInput.value = '';
                            }
                          }}
                        >
                          추가
                        </Button>
                      </Box>
                    </Box>
                    
                    <TextField
                      label="Response Mappings (JSON)"
                      value={getSafeResponseMappingString(index)}
                      onChange={(e) => {
                        const newStrings = [...responseMappingsStrings];
                        // 배열 길이가 부족한 경우 확장
                        while (newStrings.length <= index) {
                          newStrings.push('{}');
                        }
                        newStrings[index] = e.target.value;
                        setResponseMappingsStrings(newStrings);
                      }}
                      multiline
                      rows={3}
                      fullWidth
                      sx={{ mb: 1 }}
                      placeholder='{"NLU_INTENT": "$.nlu.intent", "STS_CONFIDENCE": "$.nlu.confidence"}'
                      error={(() => {
                        const mappingString = getSafeResponseMappingString(index);
                        return mappingString.trim() !== '' && mappingString !== '{}' && !validateJson(mappingString).isValid;
                      })()}
                      helperText={(() => {
                        const mappingString = getSafeResponseMappingString(index);
                        const validation = validateJson(mappingString);
                        if (!validation.isValid && mappingString.trim() !== '' && mappingString !== '{}') {
                          return `JSON 오류: ${validation.error}`;
                        }
                        return "JSONPath 표현식을 사용한 응답 매핑 (예: NLU_INTENT: $.nlu.intent)";
                      })()}
                    />
                    
                    <TextField
                      label="전이 대상 State"
                      value={handler.transitionTarget.dialogState}
                      onChange={(e) => updateApiCallHandler(index, 'transitionTarget', e.target.value)}
                      fullWidth
                    />
                  </Box>
                ))}
                <Button
                  onClick={addApiCallHandler}
                  startIcon={<AddIcon />}
                  variant="outlined"
                  fullWidth
                >
                  API Call 핸들러 추가
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Webhook 액션 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">
                Webhook 액션 ({editedState.webhookActions?.length || 0})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editedState.webhookActions?.map((action, index) => (
                  <Box key={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">Webhook {index + 1}</Typography>
                      <IconButton onClick={() => removeWebhookAction(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                    <TextField
                      label="Webhook 이름"
                      value={action.name}
                      onChange={(e) => updateWebhookAction(index, e.target.value)}
                      fullWidth
                      placeholder="ACT_01_0212"
                      helperText="표준 형태: ACT_01_0212, ACT_01_0213, ACT_01_0235 등 (TestPanel의 빠른 입력 버튼과 일치)"
                    />
                  </Box>
                ))}
                <Button
                  onClick={addWebhookAction}
                  startIcon={<AddIcon />}
                  variant="outlined"
                  fullWidth
                >
                  Webhook 액션 추가
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Slot Filling Form */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">
                Slot Filling Form ({editedState.slotFillingForm?.length || 0})
              </Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {editedState.slotFillingForm?.map((slot, index) => (
                  <Box key={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">Slot {index + 1}</Typography>
                      <IconButton onClick={() => removeSlotFillingForm(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                    <TextField
                      label="슬롯 이름"
                      value={slot.name}
                      onChange={(e) => updateSlotFillingForm(index, 'name', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                      placeholder="MYCITY"
                    />
                    
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <FormControl sx={{ minWidth: 120 }}>
                        <InputLabel>필수 여부</InputLabel>
                        <Select
                          value={slot.required}
                          label="필수 여부"
                          onChange={(e) => updateSlotFillingForm(index, 'required', e.target.value)}
                        >
                          <MenuItem value="Y">필수 (Y)</MenuItem>
                          <MenuItem value="N">선택 (N)</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <TextField
                        label="Memory Slot Keys (쉼표로 구분)"
                        value={slot.memorySlotKey?.join(', ') || ''}
                        onChange={(e) => updateSlotFillingForm(index, 'memorySlotKey', e.target.value.split(',').map(k => k.trim()).filter(k => k))}
                        sx={{ flex: 1 }}
                        placeholder="CITY:CITY, LOCATION:LOCATION"
                        helperText="쉼표로 구분하여 여러 키 입력 가능"
                      />
                    </Box>
                    
                    <TextField
                      label="Prompt Action Content"
                      value={getSlotPromptContent(slot)}
                      onChange={(e) => updateSlotFillingForm(index, 'promptContent', e.target.value)}
                      multiline
                      rows={3}
                      fullWidth
                      sx={{ mb: 1 }}
                      placeholder="슬롯을 채우기 위한 프롬프트 메시지를 입력하세요"
                      helperText="사용자에게 슬롯 값을 요청할 때 표시되는 메시지"
                    />
                    
                    <TextField
                      label="Reprompt Content (재요청 메시지)"
                      value={getSlotRepromptContent(slot)}
                      onChange={(e) => updateSlotFillingForm(index, 'repromptContent', e.target.value)}
                      multiline
                      rows={2}
                      fullWidth
                      placeholder="슬롯 값을 다시 요청할 때 표시되는 메시지"
                      helperText="NO_MATCH_EVENT 발생 시 표시되는 재요청 메시지"
                    />
                  </Box>
                ))}
                <Button
                  onClick={addSlotFillingForm}
                  startIcon={<AddIcon />}
                  variant="outlined"
                  fullWidth
                >
                  Slot Filling Form 추가
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