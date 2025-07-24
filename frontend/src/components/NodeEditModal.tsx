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
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { DialogState, ConditionHandler, IntentHandler, EventHandler, ApiCallHandler, Webhook, ApiCallWithName } from '../types/scenario';

interface NodeEditModalProps {
  open: boolean;
  dialogState: DialogState | null;
  onClose: () => void;
  onSave: (updatedDialogState: DialogState | { targetScenario: string; targetState: string }) => void;
  availableWebhooks?: Webhook[];
  availableApiCalls?: ApiCallWithName[];
  scenario?: import('../types/scenario').Scenario;
  nodeType?: string;
  scenarios?: { [key: string]: import('../types/scenario').Scenario };
  activeScenarioId?: string;
  targetScenario?: string;
  targetState?: string;
  nodes?: import('../types/scenario').FlowNode[]; // FlowNode[] nodes prop 추가
}

const NodeEditModal: React.FC<NodeEditModalProps> = ({
  open,
  dialogState,
  onClose,
  onSave,
  availableWebhooks = [],
  availableApiCalls = [],
  scenario,
  nodeType,
  scenarios = {},
  activeScenarioId,
  targetScenario: initialTargetScenario = '',
  targetState: initialTargetState = '',
  nodes, // nodes prop 추가
}) => {
  const [editedState, setEditedState] = useState<DialogState | null>(null);
  // 시나리오 전이 노드용 state
  const [selectedScenario, setSelectedScenario] = useState<string>(initialTargetScenario);
  const [selectedState, setSelectedState] = useState<string>(initialTargetState);

  // Response Mappings를 위한 별도 state (문자열로 저장)
  const [responseMappingsStrings, setResponseMappingsStrings] = useState<string[]>([]);

  // 시나리오 내 상태 이름 목록 + 시나리오 전이 노드 목록 추출
  const stateAndTransitionOptions = React.useMemo(() => {
    if (!nodes) return [];
    // 일반 state: [시나리오이름]::[스테이트이름]
    const scenarioName = scenario?.plan?.[0]?.name || activeScenarioId || '';
    const stateOptions = nodes
      .filter((n: any) => n.type !== 'scenarioTransition')
      .map((n: any) => ({
        key: `${scenarioName}::${n.data.dialogState.name}`,
        label: `${scenarioName} → ${n.data.dialogState.name}`,
        scenario: scenarioName,
        state: n.data.dialogState.name,
      }));
    // 시나리오 전이 노드
    const transitionOptions = nodes
      .filter((n: any) => n.type === 'scenarioTransition')
      .map((n: any) => {
        const tScenario = n.data.targetScenario || '';
        const tState = n.data.targetState || '';
        const label = `${n.data.label || '시나리오 전이'}: ${tScenario} → ${tState}`;
        return {
          key: `${tScenario}::${tState}`,
          label,
          scenario: tScenario,
          state: tState,
        };
      });
    return [...stateOptions, ...transitionOptions];
  }, [nodes, scenario, activeScenarioId]);

  // 시나리오 전이 노드용: 시나리오 목록
  const scenarioOptions = React.useMemo(() => Object.entries(scenarios).map(([id, s]) => ({ id, name: s.plan[0]?.name || id })), [scenarios]);
  // 시나리오 전이 노드용: 선택된 시나리오의 상태 목록
  const scenarioStateOptions = React.useMemo(() => {
    if (!selectedScenario || !scenarios[selectedScenario]) return [];
    return scenarios[selectedScenario].plan[0]?.dialogState.map(ds => ds.name) || [];
  }, [selectedScenario, scenarios]);

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
    if (nodeType === 'scenarioTransition') {
      setSelectedScenario(initialTargetScenario || Object.keys(scenarios)[0] || '');
      setSelectedState(initialTargetState || (scenarios[initialTargetScenario]?.plan[0]?.dialogState[0]?.name || ''));
    }
  }, [open, nodeType, scenarios, initialTargetScenario, initialTargetState]);

  useEffect(() => {
    if (dialogState) {
      const clonedState = JSON.parse(JSON.stringify(dialogState)); // 깊은 복사
      setEditedState(clonedState);
      
      // Response Mappings 문자열 초기화
      const mappingsStrings = clonedState.apicallHandlers?.map((handler: any) => 
        JSON.stringify(handler.apicall?.formats?.responseMappings || {}, null, 2)
      ) || [];
      setResponseMappingsStrings(mappingsStrings);
      
      // Webhook 디버깅 로그 추가
      // console.log('🔍 [DEBUG] NodeEditModal - availableWebhooks:', availableWebhooks);
      // console.log('🔍 [DEBUG] NodeEditModal - webhookActions:', clonedState.webhookActions);
      if (clonedState.webhookActions && clonedState.webhookActions.length > 0) {
        clonedState.webhookActions.forEach((action: any, index: number) => {
          // console.log(`🔍 [DEBUG] Webhook Action ${index}:`, action);
          // console.log(`🔍 [DEBUG] Webhook Action ${index} name:`, action.name);
          // console.log(`🔍 [DEBUG] Webhook Action ${index} name type:`, typeof action.name);
        });
      }
      
      // Webhook action name 자동 수정 로직 추가
      if (clonedState.webhookActions && availableWebhooks.length > 0) {
        const availableWebhookNames = availableWebhooks.map(w => w.name);
        let hasInvalidWebhook = false;
        
        clonedState.webhookActions = clonedState.webhookActions.map((action: any) => {
          const actionName = getWebhookActionName(action);
          if (!availableWebhookNames.includes(actionName)) {
            // console.log(`🔧 [FIX] Invalid webhook name "${actionName}" found, fixing to "${availableWebhookNames[0]}"`);
            hasInvalidWebhook = true;
            return { ...action, name: availableWebhookNames[0] };
          }
          return action;
        });
        
        if (hasInvalidWebhook) {
          setEditedState(clonedState);
        }
      }
    }
  }, [dialogState, availableWebhooks]);

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
        // console.warn(`Invalid JSON in Response Mappings for handler ${index}:`, mappingString);
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
    
    // console.log('🔧 Event handlers normalized:', normalizedEventHandlers);
    // console.log('🔧 API Call handlers normalized:', updatedApiCallHandlers);
    
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

  const updateConditionHandler = (
    index: number,
    field: string,
    value: string | { scenario: string; dialogState: string }
  ) => {
    const updated = editedState.conditionHandlers?.map((handler, i) => {
      if (i === index) {
        if (field === 'conditionStatement') {
          return { ...handler, conditionStatement: value as string };
        } else if (field === 'transitionTarget') {
          if (typeof value === 'string') {
            return { ...handler, transitionTarget: { ...handler.transitionTarget, dialogState: value } };
          } else {
            return { ...handler, transitionTarget: value };
          }
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
        } else if (field === 'responseMappings') {
          return {
            ...handler,
            apicall: {
              ...handler.apicall,
              formats: {
                ...handler.apicall.formats,
                responseMappings: value
              }
            }
          };
        } else if (field === 'responseSchema') {
          return {
            ...handler,
            apicall: {
              ...handler.apicall,
              formats: {
                ...handler.apicall.formats,
                responseSchema: value
              }
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
      name: availableWebhooks.length > 0 ? availableWebhooks[0].name : "NEW_WEBHOOK"
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

  // Webhook action name을 안전하게 가져오는 함수 추가
  const getWebhookActionName = (action: any): string => {
    if (typeof action.name === 'string') {
      return action.name;
    }
    // name이 문자열이 아닌 경우 (배열, 객체 등) 문자열로 변환
    if (Array.isArray(action.name)) {
      return action.name.join(', ');
    }
    if (typeof action.name === 'object') {
      return JSON.stringify(action.name);
    }
    return String(action.name || '');
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

  if (nodeType === 'scenarioTransition') {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
        <DialogTitle>시나리오 전이 노드 편집</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>전이할 시나리오</InputLabel>
              <Select
                label="전이할 시나리오"
                value={selectedScenario}
                onChange={e => {
                  const scenarioId = e.target.value;
                  // 시나리오 이름으로 변환
                  let scenarioName = scenarioId;
                  if (scenarios && scenarios[scenarioId]) {
                    scenarioName = scenarios[scenarioId].plan[0]?.name || scenarioId;
                  }
                  setSelectedScenario(scenarioId); // UI용
                  setEditedState(prev => ({
                    ...prev,
                    targetScenario: scenarioName // 항상 이름으로 저장
                  }));
                }}
              >
                {Object.entries(scenarios).map(([id, s]) => (
                  <MenuItem key={id} value={id}>{s.plan[0]?.name || id}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>전이할 상태</InputLabel>
              <Select
                label="전이할 상태"
                value={selectedState}
                onChange={e => setSelectedState(e.target.value)}
              >
                {scenarioStateOptions.map(name => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>취소</Button>
          <Button onClick={() => {
            // 저장 시에도 항상 이름으로 변환
            let scenarioName = selectedScenario;
            if (scenarios && scenarios[selectedScenario]) {
              scenarioName = scenarios[selectedScenario].plan[0]?.name || selectedScenario;
            }
            onSave({ targetScenario: scenarioName, targetState: selectedState });
          }} variant="contained" color="primary" disabled={!selectedScenario || !selectedState}>저장</Button>
        </DialogActions>
      </Dialog>
    );
  }

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
            value={String(editedState.name ?? '')}
            onChange={(e) => handleNameChange(e.target.value)}
            fullWidth
          />

          <TextField
            label="Entry Action (발화 내용)"
            value={String(editedState.entryAction?.directives?.[0]?.content ?? '')}
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
                      value={String(handler.conditionStatement ?? '')}
                      onChange={(e) => updateConditionHandler(index, 'conditionStatement', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>전이 대상 State</InputLabel>
                      <Select
                        label="전이 대상 State"
                        value={(() => {
                          const t = handler.transitionTarget;
                          if (t && typeof t === 'object' && t.scenario && t.dialogState) {
                            return `${t.scenario}::${t.dialogState}`;
                          }
                          if (typeof t === 'string' && t) return t;
                          return '';
                        })()}
                        onChange={e => {
                          const value = e.target.value;
                          // scenarioTransition 노드 id는 nodes에서 type이 scenarioTransition인 노드의 id와 일치
                          const isScenarioTransitionId = nodes?.some((n: any) => n.type === 'scenarioTransition' && n.id === value);
                          if (isScenarioTransitionId) {
                            // scenarioTransition 노드 선택 시 id(string)로 저장
                            updateConditionHandler(index, 'transitionTarget', value);
                          } else if (typeof value === 'string' && value.includes('::')) {
                            // 일반 state 선택 시 {scenario, dialogState}로 저장
                            const [scenario, dialogState] = value.split('::');
                            updateConditionHandler(index, 'transitionTarget', { scenario, dialogState });
                          } else {
                            // 특수값 (__END_SESSION__ 등)
                            updateConditionHandler(index, 'transitionTarget', value);
                          }
                        }}
                      >
                        <MenuItem value="__END_SESSION__">__END_SESSION__</MenuItem>
                        <MenuItem value="__END_SCENARIO__">__END_SCENARIO__</MenuItem>
                        {stateAndTransitionOptions.map(opt => (
                          <MenuItem key={opt.key} value={opt.key}>{opt.label || opt.key}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    {/* 조건 핸들러 Accordion 내 전이 대상 State 표시 부분 */}
                    <Grid container spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                    <Grid item xs={6}>
                      <Typography variant="caption" display="block">
                        {(() => {
                          const t = handler.transitionTarget;
                          if (t && typeof t === 'object' && t.dialogState) {
                            return t.dialogState;
                          }
                          return typeof t === 'string' ? t : '';
                        })()}
                      </Typography>
                    </Grid>
                    <Grid item xs={6}>
                      {(() => {
                        const t = handler.transitionTarget;
                        if (t && typeof t === 'object' && t.scenario) {
                          let scenarioName = t.scenario;
                          if (scenarios && scenarios[t.scenario]) {
                            scenarioName = scenarios[t.scenario].plan[0]?.name || t.scenario;
                          }
                          return <Chip label={scenarioName} size="small" color="warning" sx={{ fontWeight: 600 }} />;
                        }
                        return null;
                      })()}
                    </Grid>
                  </Grid>
                    
                    {/* Memory Actions */}
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Memory Actions</Typography>
                    {handler.action.memoryActions?.map((memoryAction, memoryIndex) => (
                      <Box key={memoryIndex} sx={{ border: 1, borderColor: 'grey.300', p: 1, borderRadius: 1, mb: 1 }}>
                        <Grid container spacing={1} alignItems="center">
                          <Grid item xs={2}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Type</InputLabel>
                              <Select
                                value={String(memoryAction.actionType ?? '')}
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
                              value={String(memoryAction.memorySlotKey ?? '')}
                              onChange={(e) => updateMemoryActionInConditionHandler(index, memoryIndex, 'memorySlotKey', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Value"
                              value={String(memoryAction.memorySlotValue ?? '')}
                              onChange={(e) => updateMemoryActionInConditionHandler(index, memoryIndex, 'memorySlotValue', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                                                     <Grid item xs={2}>
                             <FormControl fullWidth size="small">
                               <InputLabel>Scope</InputLabel>
                               <Select
                                 value={String(memoryAction.actionScope ?? '')}
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
                      value={String(handler.intent ?? '')}
                      onChange={(e) => updateIntentHandler(index, 'intent', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>전이 대상 State</InputLabel>
                      <Select
                        label="전이 대상 State"
                        value={(() => {
                          const t = handler.transitionTarget;
                          if (t && typeof t === 'object' && t.scenario && t.dialogState) {
                            return `${t.scenario}::${t.dialogState}`;
                          }
                          if (typeof t === 'string' && t) return t;
                          return '';
                        })()}
                        onChange={e => {
                          const value = e.target.value;
                          // scenarioTransition 노드 id는 nodes에서 type이 scenarioTransition인 노드의 id와 일치
                          const isScenarioTransitionId = nodes?.some((n: any) => n.type === 'scenarioTransition' && n.id === value);
                          if (isScenarioTransitionId) {
                            // scenarioTransition 노드 선택 시 id(string)로 저장
                            updateConditionHandler(index, 'transitionTarget', value);
                          } else if (typeof value === 'string' && value.includes('::')) {
                            // 일반 state 선택 시 {scenario, dialogState}로 저장
                            const [scenario, dialogState] = value.split('::');
                            updateConditionHandler(index, 'transitionTarget', { scenario, dialogState });
                          } else {
                            // 특수값 (__END_SESSION__ 등)
                            updateConditionHandler(index, 'transitionTarget', value);
                          }
                        }}
                      >
                        <MenuItem value="__END_SESSION__">__END_SESSION__</MenuItem>
                        <MenuItem value="__END_SCENARIO__">__END_SCENARIO__</MenuItem>
                        {stateAndTransitionOptions.map(opt => (
                          <MenuItem key={opt.key} value={opt.key}>{opt.label || opt.key}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    
                    {/* Memory Actions */}
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Memory Actions</Typography>
                    {handler.action.memoryActions?.map((memoryAction, memoryIndex) => (
                      <Box key={memoryIndex} sx={{ border: 1, borderColor: 'grey.300', p: 1, borderRadius: 1, mb: 1 }}>
                        <Grid container spacing={1} alignItems="center">
                          <Grid item xs={2}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Type</InputLabel>
                              <Select
                                value={String(memoryAction.actionType ?? '')}
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
                              value={String(memoryAction.memorySlotKey ?? '')}
                              onChange={(e) => updateMemoryActionInIntentHandler(index, memoryIndex, 'memorySlotKey', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Value"
                              value={String(memoryAction.memorySlotValue ?? '')}
                              onChange={(e) => updateMemoryActionInIntentHandler(index, memoryIndex, 'memorySlotValue', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                                                     <Grid item xs={2}>
                             <FormControl fullWidth size="small">
                               <InputLabel>Scope</InputLabel>
                               <Select
                                 value={String(memoryAction.actionScope ?? '')}
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
                      value={String(getEventType(handler.event) ?? '')}
                      onChange={(e) => updateEventHandler(index, 'eventType', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                      helperText="예: CUSTOM_EVENT, USER_DIALOG_START, USER_DIALOG_END 등"
                    />
                    <FormControl fullWidth sx={{ mb: 2 }}>
                      <InputLabel>전이 대상 State</InputLabel>
                      <Select
                        label="전이 대상 State"
                        value={(() => {
                          const t = handler.transitionTarget;
                          if (t && typeof t === 'object' && t.scenario && t.dialogState) {
                            return `${t.scenario}::${t.dialogState}`;
                          }
                          if (typeof t === 'string' && t) return t;
                          return '';
                        })()}
                        onChange={e => {
                          const value = e.target.value;
                          // scenarioTransition 노드 id는 nodes에서 type이 scenarioTransition인 노드의 id와 일치
                          const isScenarioTransitionId = nodes?.some((n: any) => n.type === 'scenarioTransition' && n.id === value);
                          if (isScenarioTransitionId) {
                            // scenarioTransition 노드 선택 시 id(string)로 저장
                            updateConditionHandler(index, 'transitionTarget', value);
                          } else if (typeof value === 'string' && value.includes('::')) {
                            // 일반 state 선택 시 {scenario, dialogState}로 저장
                            const [scenario, dialogState] = value.split('::');
                            updateConditionHandler(index, 'transitionTarget', { scenario, dialogState });
                          } else {
                            // 특수값 (__END_SESSION__ 등)
                            updateConditionHandler(index, 'transitionTarget', value);
                          }
                        }}
                      >
                        <MenuItem value="__END_SESSION__">__END_SESSION__</MenuItem>
                        <MenuItem value="__END_SCENARIO__">__END_SCENARIO__</MenuItem>
                        {stateAndTransitionOptions.map(opt => (
                          <MenuItem key={opt.key} value={opt.key}>{opt.label || opt.key}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    
                    {/* Memory Actions */}
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Memory Actions</Typography>
                    {handler.action.memoryActions?.map((memoryAction, memoryIndex) => (
                      <Box key={memoryIndex} sx={{ border: 1, borderColor: 'grey.300', p: 1, borderRadius: 1, mb: 1 }}>
                        <Grid container spacing={1} alignItems="center">
                          <Grid item xs={2}>
                            <FormControl fullWidth size="small">
                              <InputLabel>Type</InputLabel>
                              <Select
                                value={String(memoryAction.actionType ?? '')}
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
                              value={String(memoryAction.memorySlotKey ?? '')}
                              onChange={(e) => updateMemoryActionInEventHandler(index, memoryIndex, 'memorySlotKey', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                          <Grid item xs={3}>
                            <TextField
                              label="Memory Value"
                              value={String(memoryAction.memorySlotValue ?? '')}
                              onChange={(e) => updateMemoryActionInEventHandler(index, memoryIndex, 'memorySlotValue', e.target.value)}
                              size="small"
                              fullWidth
                            />
                          </Grid>
                                                     <Grid item xs={2}>
                             <FormControl fullWidth size="small">
                               <InputLabel>Scope</InputLabel>
                               <Select
                                 value={String(memoryAction.actionScope ?? '')}
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
                    
                    {/* 글로벌 API Call 선택 드롭다운 */}
                    <FormControl fullWidth sx={{ mb: 1 }}>
                      <InputLabel>API Call 선택</InputLabel>
                      <Select
                        value={(() => {
                          // handler.name이 apicall 목록에 없으면 ''로 처리
                          if (!handler.name) return '';
                          const found = availableApiCalls.find(a => a.name === handler.name);
                          return found ? found.name : '';
                        })()}
                        label="API Call 선택"
                        onChange={e => {
                          const selected = availableApiCalls.find(a => a.name === e.target.value);
                          setEditedState(prev => {
                            if (!prev) return prev;
                            const updatedHandlers = (prev.apicallHandlers || []).map((h, i) => {
                              if (i !== index) return h;
                              if (selected) {
                                return {
                                  ...h,
                                  name: selected.name,
                                  apicall: {
                                    ...h.apicall,
                                    url: selected.url,
                                    timeout: selected.timeout,
                                    retry: selected.retry,
                                    formats: {
                                      ...h.apicall.formats,
                                      method: selected.formats.method,
                                      requestTemplate: selected.formats.requestTemplate || '',
                                      headers: selected.formats.headers || {},
                                    }
                                  }
                                };
                              } else {
                                // 선택 해제 시 빈 값으로 초기화
                                return {
                                  ...h,
                                  name: '',
                                  apicall: {
                                    ...h.apicall,
                                    url: '',
                                  }
                                };
                              }
                            });
                            return { ...prev, apicallHandlers: updatedHandlers };
                          });
                        }}
                        displayEmpty
                        renderValue={selected => {
                          if (!selected) return <span style={{ color: '#aaa' }}>API Call을 선택하세요</span>;
                          return selected;
                        }}
                      >
                        <MenuItem value="">
                          <em>API Call을 선택하세요</em>
                        </MenuItem>
                        {availableApiCalls.map((apicall) => (
                          <MenuItem key={apicall.name} value={apicall.name}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{apicall.name}</Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{apicall.url}</Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>method: {apicall.formats.method}</Typography>
                            </Box>
                          </MenuItem>
                        ))}
                        {availableApiCalls.length === 0 && (
                          <MenuItem value="NEW_APICALL" disabled>
                            -- API Call이 없습니다 (외부 연동 관리 탭에서 등록) --
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>

                    {/* url만 readonly, 나머지는 기존 편집 UI 복원 */}
                    <TextField
                      label="URL"
                      value={handler.apicall.url}
                      fullWidth
                      sx={{ mb: 1 }}
                      InputProps={{ readOnly: true }}
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

                    {/* Headers 설정 (기존 UI 복원) */}
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
                      label="Response Schema (JSON)"
                      value={JSON.stringify(handler.apicall.formats.responseSchema || {}, null, 2)}
                      onChange={(e) => {
                        let parsed = {};
                        try { parsed = JSON.parse(e.target.value); } catch {}
                        updateApiCallHandler(index, 'responseSchema', parsed);
                      }}
                      multiline
                      rows={3}
                      fullWidth
                      sx={{ mb: 1 }}
                      placeholder='{"field1": "string", "field2": "number"}'
                      helperText="API 응답의 스키마를 JSON 형식으로 입력하세요."
                    />

                    <TextField
                      label="Response Mappings (JSON)"
                      value={getSafeResponseMappingString(index)}
                      onChange={(e) => {
                        const newStrings = [...responseMappingsStrings];
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
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    <strong>Webhook 동작 방식:</strong><br/>
                    1. 시나리오의 webhook 설정에서 URL 및 설정 정보를 읽어옴<br/>
                    2. 사용자 입력을 포함한 표준 webhook 요청을 REST API로 전송<br/>
                    3. 응답에서 NLU_INTENT를 추출하여 memory에 저장<br/>
                    4. Condition Handler를 통해 다음 상태로 전이<br/>
                    <br/>
                    <strong>주의:</strong> Webhook Action이 있는 상태에서는 API Call Handler가 동작하지 않습니다.
                  </Typography>
                </Alert>
                
                {editedState.webhookActions?.map((action, index) => (
                  <Box key={index} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">Webhook {index + 1}</Typography>
                      <IconButton onClick={() => removeWebhookAction(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    
                    <FormControl fullWidth>
                      <InputLabel>Webhook 선택</InputLabel>
                      <Select
                        value={availableWebhooks.find(w => w.name === getWebhookActionName(action)) ? getWebhookActionName(action) : ''}
                        label="Webhook 선택"
                        onChange={(e) => updateWebhookAction(index, e.target.value)}
                      >
                        {availableWebhooks.map((webhook) => (
                          <MenuItem key={webhook.name} value={webhook.name}>
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {webhook.name}
                              </Typography>
                              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                                {webhook.url}
                              </Typography>
                              {webhook.timeoutInMilliSecond && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                                  timeout: {webhook.timeoutInMilliSecond}ms
                                </Typography>
                              )}
                              {webhook.retry !== undefined && (
                                <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>
                                  retry: {webhook.retry}
                                </Typography>
                              )}
                            </Box>
                          </MenuItem>
                        ))}
                        {availableWebhooks.length === 0 && (
                          <MenuItem value="NEW_WEBHOOK" disabled>
                            -- 웹훅이 없습니다 (Webhook 관리 탭에서 등록) --
                          </MenuItem>
                        )}
                      </Select>
                    </FormControl>
                    
                    {availableWebhooks.length === 0 && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          등록된 웹훅이 없습니다. "Webhook 관리" 탭에서 웹훅을 먼저 등록해주세요.
                        </Typography>
                      </Alert>
                    )}
                    
                    {availableWebhooks.length > 0 && !availableWebhooks.find(w => w.name === getWebhookActionName(action)) && (
                      <Alert severity="error" sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          선택된 웹훅 "{getWebhookActionName(action)}"이 등록된 웹훅 목록에 없습니다. 올바른 웹훅을 선택해주세요.
                        </Typography>
                      </Alert>
                    )}
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
                      value={String(slot.name ?? '')}
                      onChange={(e) => updateSlotFillingForm(index, 'name', e.target.value)}
                      fullWidth
                      sx={{ mb: 1 }}
                      placeholder="MYCITY"
                    />
                    
                    <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                      <FormControl sx={{ minWidth: 120 }}>
                        <InputLabel>필수 여부</InputLabel>
                        <Select
                          value={String(slot.required ?? '')}
                          label="필수 여부"
                          onChange={(e) => updateSlotFillingForm(index, 'required', e.target.value)}
                        >
                          <MenuItem value="Y">필수 (Y)</MenuItem>
                          <MenuItem value="N">선택 (N)</MenuItem>
                        </Select>
                      </FormControl>
                      
                      <TextField
                        label="Memory Slot Keys (쉼표로 구분)"
                        value={String(slot.memorySlotKey?.join(', ') ?? '')}
                        onChange={(e) => updateSlotFillingForm(index, 'memorySlotKey', e.target.value.split(',').map(k => k.trim()).filter(k => k))}
                        sx={{ flex: 1 }}
                        placeholder="CITY:CITY, LOCATION:LOCATION"
                        helperText="쉼표로 구분하여 여러 키 입력 가능"
                      />
                    </Box>
                    
                    <TextField
                      label="Prompt Action Content"
                      value={String(getSlotPromptContent(slot) ?? '')}
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
                      value={String(getSlotRepromptContent(slot) ?? '')}
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