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
    // 플랜 전이 노드
    const planTransitionOptions = nodes
      .filter((n: any) => n.type === 'planTransition')
      .map((n: any) => {
        const tPlan = n.data.targetPlan || '';
        const tState = n.data.targetState || '';
        const label = `${n.data.label || '플랜 전이'}: ${tPlan} → ${tState}`;
        return {
          key: `${tPlan}::${tState}`,
          label,
          scenario: tPlan,
          state: tState,
        };
      });
    // 각 플랜의 Start를 옵션으로 추가
    const planStartOptions = (scenario?.plan || []).map((pl: any) => {
      const startName = pl?.dialogState?.find((ds: any) => ds?.name === 'Start')?.name || pl?.dialogState?.[0]?.name || '';
      return {
        key: `${pl.name}::${startName}`,
        label: `${pl.name} → ${startName}`,
        scenario: pl.name,
        state: startName,
      };
    });
    
    // 특수 종료 노드들 추가
    const endNodes = nodes
      .filter((n: any) => n.type === 'custom' && (n.data.label === '__END_SCENARIO__' || n.data.label === '__END_SESSION__'))
      .map((n: any) => ({
        key: n.data.label, // __END_SCENARIO__ 또는 __END_SESSION__
        label: n.data.label,
        scenario: '',
        state: n.data.label,
      }));
    
    return [...stateOptions, ...transitionOptions, ...planTransitionOptions, ...planStartOptions, ...endNodes];
  }, [nodes, scenario, activeScenarioId]);

  // 시나리오 전이 노드용: 선택된 시나리오의 상태 목록
  const scenarioStateOptions = React.useMemo(() => {
    if (!selectedScenario || !scenarios[selectedScenario]) return [];
    return scenarios[selectedScenario].plan[0]?.dialogState.map(ds => ds.name) || [];
  }, [selectedScenario, scenarios]);

  useEffect(() => {
    if (nodeType === 'scenarioTransition' || nodeType === 'planTransition') {
      console.log('🔍 [DEBUG] NodeEditModal - 시나리오 전이 노드 편집 모드');
      console.log('🔍 [DEBUG] NodeEditModal - initialTargetScenario:', initialTargetScenario);
      console.log('🔍 [DEBUG] NodeEditModal - initialTargetState:', initialTargetState);
      console.log('🔍 [DEBUG] NodeEditModal - scenarios:', scenarios);
      
      // 전이 노드의 경우 targetScenario/targetPlan 과 targetState를 직접 사용
      // initialTargetScenario와 initialTargetState가 비어있으면 dialogState에서 추출 시도
      let targetScenarioValue = initialTargetScenario;
      let targetStateValue = initialTargetState;
      
      // dialogState에서 targetScenario와 targetState를 추출 시도
      if (!targetScenarioValue && dialogState) {
        // dialogState가 시나리오 전이 노드의 경우 targetScenario와 targetState를 포함할 수 있음
        const dialogStateAny = dialogState as any; // 타입 단언 사용
        if (nodeType === 'planTransition' && dialogStateAny.targetPlan) {
          targetScenarioValue = dialogStateAny.targetPlan;
        } else if (dialogStateAny.targetScenario) {
          targetScenarioValue = dialogStateAny.targetScenario;
        }
        if (dialogStateAny.targetState) {
          targetStateValue = dialogStateAny.targetState;
        }
      }
      
      let targetScenarioId = targetScenarioValue;
      if (nodeType === 'scenarioTransition') {
        // targetScenario가 시나리오 이름인 경우 해당하는 시나리오 ID를 찾기
        if (targetScenarioValue && !scenarios[targetScenarioValue]) {
          const foundScenarioId = Object.entries(scenarios).find(([id, scenario]) => 
            scenario.plan[0]?.name === targetScenarioValue
          )?.[0];
          if (foundScenarioId) {
            targetScenarioId = foundScenarioId;
            console.log('🔍 [DEBUG] NodeEditModal - 시나리오 이름을 ID로 변환:', targetScenarioValue, '→', targetScenarioId);
          } else {
            console.warn('⚠️ [WARNING] NodeEditModal - 시나리오 이름에 해당하는 ID를 찾을 수 없음:', targetScenarioValue);
            targetScenarioId = Object.keys(scenarios)[0] || '';
          }
        }
      }
      
      // 여전히 값이 없으면 기본값 사용
      if (!targetScenarioId) {
        targetScenarioId = Object.keys(scenarios)[0] || '';
      }
      
      console.log('🔍 [DEBUG] NodeEditModal - targetScenarioValue:', targetScenarioValue);
      console.log('🔍 [DEBUG] NodeEditModal - targetStateValue:', targetStateValue);
      console.log('🔍 [DEBUG] NodeEditModal - targetScenarioId:', targetScenarioId);
      
      setSelectedScenario(targetScenarioId);
      
      // targetState가 있으면 해당 시나리오의 상태 목록에서 첫 번째 상태를 기본값으로 설정
      if (nodeType === 'planTransition') {
        if (targetStateValue && Array.isArray(scenario?.plan)) {
          setSelectedState(targetStateValue);
        } else {
          const first = (scenario?.plan || []).find(pl => pl.name === targetScenarioValue)?.dialogState?.[0]?.name || '';
          setSelectedState(first);
        }
      } else {
        if (targetStateValue && scenarios[targetScenarioId]) {
          setSelectedState(targetStateValue);
        } else if (scenarios[targetScenarioId]) {
          setSelectedState(scenarios[targetScenarioId].plan[0]?.dialogState[0]?.name || '');
        } else {
          setSelectedState('');
        }
      }
      
      console.log('🔍 [DEBUG] NodeEditModal - selectedScenario:', targetScenarioId);
      console.log('🔍 [DEBUG] NodeEditModal - selectedState:', targetStateValue || scenarios[targetScenarioId]?.plan[0]?.dialogState[0]?.name || '');
    }
  }, [nodeType, scenarios, initialTargetScenario, initialTargetState, dialogState]); // dialogState 의존성 추가

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
      // Convert any input JSON (legacy object/old array/new groups) to new groups
      let parsedGroups: Array<{ expressionType: 'JSON_PATH'; targetType: 'MEMORY' | 'DIRECTIVE'; mappings: Record<string, string> }> = [];
      
      try {
        const parsed = JSON.parse(mappingString);
        if (Array.isArray(parsed)) {
          // If already new groups
          if (parsed.length > 0 && (parsed[0] as any).expressionType) {
            parsedGroups = parsed as any;
          } else {
            // old array [{type,map}]
            const memory: Record<string, string> = {};
            const directive: Record<string, string> = {};
            (parsed as any[]).forEach((m: any) => {
              const t = String(m?.type || 'memory').toLowerCase();
              Object.entries(m?.map || {}).forEach(([k, v]) => {
                if (t === 'directive') directive[k] = String(v); else memory[k] = String(v);
              });
            });
            if (Object.keys(memory).length) parsedGroups.push({ expressionType: 'JSON_PATH', targetType: 'MEMORY', mappings: memory });
            if (Object.keys(directive).length) parsedGroups.push({ expressionType: 'JSON_PATH', targetType: 'DIRECTIVE', mappings: directive });
          }
        } else if (typeof parsed === 'object' && parsed !== null) {
          // legacy object { KEY: path | {type, KEY: path} }
          const memory: Record<string, string> = {};
          const directive: Record<string, string> = {};
          Object.entries(parsed as any).forEach(([key, conf]: any) => {
            if (typeof conf === 'string') memory[key] = conf;
            else if (conf && typeof conf === 'object') {
              const t = String(conf.type || 'memory').toLowerCase();
              let expr: string | null = typeof conf[key] === 'string' ? conf[key] : null;
              if (!expr) {
                for (const [kk, vv] of Object.entries(conf)) {
                  if (kk !== 'type' && typeof vv === 'string') { expr = vv as string; break; }
                }
              }
              if (expr) {
                if (t === 'directive') directive[key] = expr; else memory[key] = expr;
              }
            }
          });
          if (Object.keys(memory).length) parsedGroups.push({ expressionType: 'JSON_PATH', targetType: 'MEMORY', mappings: memory });
          if (Object.keys(directive).length) parsedGroups.push({ expressionType: 'JSON_PATH', targetType: 'DIRECTIVE', mappings: directive });
        }
      } catch (e) {
        parsedGroups = [];
      }
      
      return {
        ...handler,
        apicall: {
          ...handler.apicall!,
          method: (handler.apicall as any)?.method || (handler.apicall as any)?.formats?.method || 'POST',
          formats: {
            ...handler.apicall!.formats,
            responseMappings: parsedGroups
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

  const updateIntentHandler = (index: number, field: string, value: string | { scenario: string; dialogState: string }) => {
    const updated = editedState.intentHandlers?.map((handler, i) => {
      if (i === index) {
        if (field === 'intent') {
          return { ...handler, intent: value as string };
        } else if (field === 'transitionTarget') {
          // value가 문자열인 경우 (__END_SESSION__, __END_SCENARIO__ 등)
          if (typeof value === 'string') {
            return { ...handler, transitionTarget: value as any };
          }
          // value가 객체인 경우 (scenario, dialogState)
          if (typeof value === 'object' && value.scenario && value.dialogState) {
            return { ...handler, transitionTarget: value };
          }
        }
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      intentHandlers: updated as any
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

  const updateEventHandler = (index: number, field: string, value: string | { scenario: string; dialogState: string }) => {
    const updated = editedState.eventHandlers?.map((handler, i) => {
      if (i === index) {
        if (field === 'eventType') {
          // 항상 객체 형태로 event 필드 보장
          return { 
            ...handler, 
            event: {
              type: value as string,
              count: "1"
            }
          };
        } else if (field === 'transitionTarget') {
          // value가 문자열인 경우 (__END_SESSION__, __END_SCENARIO__ 등)
          if (typeof value === 'string') {
            return { ...handler, transitionTarget: value as any };
          }
          // value가 객체인 경우 (scenario, dialogState)
          if (typeof value === 'object' && value.scenario && value.dialogState) {
            return { ...handler, transitionTarget: value };
          }
        }
      }
      return handler;
    }) || [];
    
    setEditedState({
      ...editedState,
      eventHandlers: updated as any
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
        method: "POST",
        url: "",
        timeoutInMilliSecond: 5000,
        retry: 3,
        formats: {
          contentType: "application/json",
          requestTemplate: "",
          responseMappings: [],
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

  // 노드 편집에서는 헤더 편집을 지원하지 않고 읽기 전용으로 표시만 하므로, 관련 편집 함수 및 옵션 제거

  // 노드 편집에서는 API Call 상세 설정을 읽기 전용으로만 표시하므로 업데이트 로직 제거

  // Helper to read/write webhookActions under entryAction (spec) with root-level fallback for compatibility
  const readWebhookActions = (): any[] => {
    const ea = (editedState as any)?.entryAction;
    if (ea && typeof ea === 'object' && Array.isArray((ea as any).webhookActions)) {
      return (ea as any).webhookActions as any[];
    }
    return [];
  };
  const writeWebhookActions = (actions: any[]) => {
    const next = { ...(editedState as any) };
    next.entryAction = next.entryAction && typeof next.entryAction === 'object' ? next.entryAction : { directives: [] };
    // Always store actions without type, only name
    const sanitized = (actions || []).map((a: any) => {
      let nm: string;
      if (typeof a?.name === 'string') nm = a.name as string;
      else if (Array.isArray(a?.name)) nm = (a.name as any[]).join(', ');
      else nm = String(a?.name ?? '');
      return { name: nm } as any;
    });
    next.entryAction.webhookActions = sanitized;
    // root-level webhookActions deprecated; do not mirror
    setEditedState(next);
  };

  // Webhook action name을 안전하게 가져오는 함수 (위치 이동: 상단에 배치하여 아래 로직들에서 사용)
  const getWebhookActionName = (action: any): string => {
    if (typeof action?.name === 'string') {
      return action.name;
    }
    if (Array.isArray(action?.name)) {
      return (action.name as any[]).join(', ');
    }
    if (typeof action?.name === 'object' && action?.name) {
      try { return JSON.stringify(action.name); } catch { return String(action.name); }
    }
    return String(action?.name || '');
  };

  // Webhook 액션 관리 함수들 (WEBHOOK 전용)
  const addWebhookAction = () => {
    const newWebhookAction = {
      name: availableWebhooks.length > 0 ? availableWebhooks[0].name : "NEW_WEBHOOK",
    } as any;
    const curr = readWebhookActions();
    writeWebhookActions([...(curr || []), newWebhookAction]);
  };

  const removeWebhookAction = (index: number) => {
    const all = readWebhookActions();
    const isWebhook = (a: any) => availableWebhooks.some(w => w.name === getWebhookActionName(a));
    const isApi = (a: any) => availableApiCalls.some(ap => ap.name === getWebhookActionName(a));
    const webhookOnly = (all || []).filter(isWebhook);
    const apiOnly = (all || []).filter(isApi);
    const updatedNonApi = (webhookOnly || []).filter((_: any, i: number) => i !== index);
    writeWebhookActions([...(updatedNonApi || []), ...(apiOnly || [])]);
  };

  const updateWebhookAction = (index: number, value: string) => {
    const curr = readWebhookActions();
    const isWebhook = (a: any) => availableWebhooks.some(w => w.name === getWebhookActionName(a));
    const isApi = (a: any) => availableApiCalls.some(ap => ap.name === getWebhookActionName(a));
    const nonApi = (curr || []).filter(isWebhook);
    const apiOnly = (curr || []).filter(isApi);
    const updatedNonApi = nonApi.map((action: any, i: number) => (i === index ? { name: value } : { name: getWebhookActionName(action) }));
    writeWebhookActions([...(updatedNonApi || []), ...(apiOnly || [])]);
  };

  // API Call 액션 (APICALL 전용) 관리
  const readApiCallActions = (): any[] => {
    const all = readWebhookActions();
    const names = new Set(availableApiCalls.map(a => a.name));
    return (all || []).filter((a: any) => names.has(getWebhookActionName(a)));
  };
  const writeApiCallActions = (apiActions: any[]) => {
    const all = readWebhookActions();
    const namesWebhook = new Set(availableWebhooks.map(w => w.name));
    const nonApi = (all || []).filter((a: any) => namesWebhook.has(getWebhookActionName(a)));
    const sanitizedApi = (apiActions || []).map((a: any) => ({ name: getWebhookActionName(a) }));
    writeWebhookActions([...(nonApi || []), ...(sanitizedApi || [])]);
  };
  const addApiCallAction = () => {
    const first = availableApiCalls?.[0];
    const newAction = { name: first ? first.name : 'NEW_APICALL' } as any;
    const curr = readApiCallActions();
    writeApiCallActions([...(curr || []), newAction]);
  };
  const removeApiCallAction = (index: number) => {
    const curr = readApiCallActions();
    const updated = (curr || []).filter((_: any, i: number) => i !== index);
    writeApiCallActions(updated);
  };
  const updateApiCallAction = (index: number, value: string) => {
    const curr = readApiCallActions();
    const updated = (curr || []).map((action: any, i: number) => (i === index ? { name: value } : { name: getWebhookActionName(action) }));
    writeApiCallActions(updated);
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

  if (nodeType === 'scenarioTransition' || nodeType === 'planTransition') {
    return (
      <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
        <DialogTitle>{nodeType === 'planTransition' ? '플랜 전이 노드 편집' : '시나리오 전이 노드 편집'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="노드 이름"
              value={editedState?.name || (nodeType === 'planTransition' ? '플랜 전이' : '시나리오 전이')}
              onChange={(e) => {
                if (editedState) {
                  setEditedState({
                    ...editedState,
                    name: e.target.value
                  });
                }
              }}
              fullWidth
              sx={{ mb: 2 }}
            />
            
            {nodeType === 'scenarioTransition' ? (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>전이할 시나리오</InputLabel>
                <Select
                  label="전이할 시나리오"
                  value={selectedScenario}
                  onChange={e => {
                    const scenarioId = e.target.value;
                    setSelectedScenario(scenarioId);
                  }}
                >
                  {Object.entries(scenarios).map(([id, s]) => (
                    <MenuItem key={id} value={id}>{s.plan[0]?.name || id}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <FormControl fullWidth sx={{ mb: 2 }}>
                <InputLabel>전이할 플랜</InputLabel>
                <Select
                  label="전이할 플랜"
                  value={selectedScenario}
                  onChange={e => setSelectedScenario(e.target.value)}
                >
                  {(scenario?.plan || []).map(pl => (
                    <MenuItem key={pl.name} value={pl.name}>{pl.name}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            
            <FormControl fullWidth>
              <InputLabel>전이할 상태</InputLabel>
              <Select
                label="전이할 상태"
                value={selectedState}
                onChange={e => setSelectedState(e.target.value)}
              >
                {(nodeType === 'scenarioTransition'
                  ? scenarioStateOptions
                  : ((scenario?.plan || []).find(pl => pl.name === selectedScenario)?.dialogState || []).map(ds => ds.name)
                ).map(name => (
                  <MenuItem key={name} value={name}>{name}</MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <Alert severity="info" sx={{ mt: 2 }}>
              {nodeType === 'planTransition' 
                ? '플랜 전이 노드는 같은 시나리오의 다른 플랜으로 전환을 담당합니다.'
                : '시나리오 전이 노드는 다른 시나리오로의 전환을 담당합니다.'}
              조건 핸들러나 이벤트 핸들러는 연결된 엣지에서 설정할 수 있습니다.
            </Alert>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>취소</Button>
          <Button onClick={() => {
            if (!selectedScenario || !selectedState) {
              console.error('❌ 시나리오 전이 노드 정보 누락:', {
                targetScenario: selectedScenario,
                targetState: selectedState
              });
              alert('시나리오와 상태를 모두 선택해주세요.');
              return;
            }
            
            if (nodeType === 'planTransition') {
              console.log('💾 플랜 전이 노드 저장:', { targetPlan: selectedScenario, targetState: selectedState });
              onSave({ targetPlan: selectedScenario, targetState: selectedState } as any);
            } else {
              // 저장 시에도 항상 이름으로 변환
              let scenarioName = selectedScenario;
              if (scenarios && scenarios[selectedScenario]) {
                scenarioName = scenarios[selectedScenario].plan[0]?.name || selectedScenario;
              }
              console.log('💾 시나리오 전이 노드 저장:', { targetScenario: scenarioName, targetState: selectedState });
              onSave({ targetScenario: scenarioName, targetState: selectedState });
            }
          }} variant="contained" color="primary" disabled={!selectedScenario || !selectedState}>저장</Button>
        </DialogActions>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {nodeType === 'state' ? 'State 편집' : '노드 편집'}: {editedState.name}
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

          {/* 조건 핸들러 - 시나리오 전이 노드가 아닌 경우에만 표시 */}
          {nodeType !== 'scenarioTransition' && (
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
                            console.log('🔍 [DEBUG] 전이 대상 State value 계산:', {
                              handlerIndex: index,
                              transitionTarget: t,
                              type: typeof t,
                              isObject: t && typeof t === 'object',
                              isString: typeof t === 'string'
                            });
                            
                            if (t && typeof t === 'object' && t.scenario && t.dialogState) {
                              // 특수값인 경우 (__END_SESSION__, __END_SCENARIO__)
                              if (t.dialogState === '__END_SESSION__' || t.dialogState === '__END_SCENARIO__') {
                                console.log('  → 특수값 객체:', t.dialogState);
                                return t.dialogState;
                              }
                              // 일반 시나리오/상태 전이만 표시
                              const result = `${t.scenario}::${t.dialogState}`;
                              console.log('  → 객체 타입 전이:', result);
                              return result;
                            }
                            if (typeof t === 'string' && t) {
                              console.log('  → 문자열 타입 전이:', t);
                              return t;
                            }
                            console.log('  → 기본값: 빈 문자열');
                            return '';
                          })()}
                          onChange={e => {
                            const value = e.target.value;
                            console.log('🔄 [DEBUG] 전이 대상 State 변경:', {
                              handlerIndex: index,
                              oldValue: handler.transitionTarget,
                              newValue: value
                            });
                            
                            // scenarioTransition 노드 id는 nodes에서 type이 scenarioTransition인 노드의 id와 일치
                            const isScenarioTransitionId = nodes?.some((n: any) => n.type === 'scenarioTransition' && n.id === value);
                            if (isScenarioTransitionId) {
                              // scenarioTransition 노드 선택 시 id(string)로 저장
                              console.log('  → 시나리오 전이 노드로 설정');
                              updateConditionHandler(index, 'transitionTarget', value);
                            } else if (typeof value === 'string' && value.includes('::')) {
                              // 일반 state 선택 시 {scenario, dialogState}로 저장
                              const [scenario, dialogState] = value.split('::');
                              console.log('  → 일반 state로 설정:', { scenario, dialogState });
                              updateConditionHandler(index, 'transitionTarget', { scenario, dialogState });
                            } else {
                              // 특수값 (__END_SESSION__, __END_SCENARIO__ 등)
                              console.log('  → 특수값으로 설정:', value);
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
          )}

          {/* 인텐트 핸들러 - 시나리오 전이 노드가 아닌 경우에만 표시 */}
          {nodeType !== 'scenarioTransition' && (
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
                          console.log('🔍 [DEBUG] 인텐트 핸들러 전이 대상 State value 계산:', {
                            handlerIndex: index,
                            transitionTarget: t,
                            type: typeof t,
                            isObject: t && typeof t === 'object',
                            isString: typeof t === 'string'
                          });
                          
                          if (t && typeof t === 'object' && t.scenario && t.dialogState) {
                            const result = `${t.scenario}::${t.dialogState}`;
                            console.log('  → 객체 타입 전이:', result);
                            return result;
                          }
                          if (typeof t === 'string' && t) {
                            console.log('  → 문자열 타입 전이:', t);
                            return t;
                          }
                          console.log('  → 기본값: 빈 문자열');
                          return '';
                        })()}
                        onChange={e => {
                          const value = e.target.value;
                          console.log('🔄 [DEBUG] 인텐트 핸들러 전이 대상 State 변경:', {
                            handlerIndex: index,
                            oldValue: handler.transitionTarget,
                            newValue: value
                          });
                          
                          // scenarioTransition 노드 id는 nodes에서 type이 scenarioTransition인 노드의 id와 일치
                          const isScenarioTransitionId = nodes?.some((n: any) => n.type === 'scenarioTransition' && n.id === value);
                          if (isScenarioTransitionId) {
                            // scenarioTransition 노드 선택 시 id(string)로 저장
                            console.log('  → 시나리오 전이 노드로 설정');
                            updateIntentHandler(index, 'transitionTarget', value);
                          } else if (typeof value === 'string' && value.includes('::')) {
                            // 일반 state 선택 시 {scenario, dialogState}로 저장
                            const [scenario, dialogState] = value.split('::');
                            console.log('  → 일반 state로 설정:', { scenario, dialogState });
                            updateIntentHandler(index, 'transitionTarget', { scenario, dialogState });
                          } else {
                            // 특수값 (__END_SESSION__, __END_SCENARIO__ 등)
                            console.log('  → 특수값으로 설정:', value);
                            updateIntentHandler(index, 'transitionTarget', value);
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
          )}

          {/* 이벤트 핸들러 - 시나리오 전이 노드가 아닌 경우에만 표시 */}
          {nodeType !== 'scenarioTransition' && (
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
                          console.log('🔍 [DEBUG] 이벤트 핸들러 전이 대상 State value 계산:', {
                            handlerIndex: index,
                            transitionTarget: t,
                            type: typeof t,
                            isObject: t && typeof t === 'object',
                            isString: typeof t === 'string'
                          });
                          
                          if (t && typeof t === 'object' && t.scenario && t.dialogState) {
                            // 특수값인 경우 (__END_SESSION__, __END_SCENARIO__)
                            if (t.dialogState === '__END_SESSION__' || t.dialogState === '__END_SCENARIO__') {
                              console.log('  → 특수값 객체:', t.dialogState);
                              return t.dialogState;
                            }
                            // 일반 시나리오 전이인 경우
                            const result = `${t.scenario}::${t.dialogState}`;
                            console.log('  → 객체 타입 전이:', result);
                            return result;
                          }
                          if (typeof t === 'string' && t) {
                            console.log('  → 문자열 타입 전이:', t);
                            return t;
                          }
                          console.log('  → 기본값: 빈 문자열');
                          return '';
                        })()}
                        onChange={e => {
                          const value = e.target.value;
                          console.log('🔄 [DEBUG] 이벤트 핸들러 전이 대상 State 변경:', {
                            handlerIndex: index,
                            oldValue: handler.transitionTarget,
                            newValue: value
                          });
                          
                          // scenarioTransition 노드 id는 nodes에서 type이 scenarioTransition인 노드의 id와 일치
                          const isScenarioTransitionId = nodes?.some((n: any) => n.type === 'scenarioTransition' && n.id === value);
                          if (isScenarioTransitionId) {
                            // scenarioTransition 노드 선택 시 id(string)로 저장
                            console.log('  → 시나리오 전이 노드로 설정');
                            updateEventHandler(index, 'transitionTarget', value);
                          } else if (typeof value === 'string' && value.includes('::')) {
                            // 일반 state 선택 시 {scenario, dialogState}로 저장
                            const [scenario, dialogState] = value.split('::');
                            console.log('  → 일반 state로 설정:', { scenario, dialogState });
                            updateEventHandler(index, 'transitionTarget', { scenario, dialogState });
                          } else {
                            // 특수값 (__END_SESSION__, __END_SCENARIO__ 등)
                            console.log('  → 특수값으로 설정:', value);
                            updateEventHandler(index, 'transitionTarget', value);
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
          )}

          {/* API Call 액션 (Entry Action 기반) */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">API Call 액션 ({readApiCallActions().length})</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {readApiCallActions().map((action, index) => (
                  <Box key={`apicall-action-${index}`} sx={{ border: 1, borderColor: 'divider', p: 2, borderRadius: 1 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">API Call {index + 1}</Typography>
                      <IconButton onClick={() => removeApiCallAction(index)} size="small">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                    <FormControl fullWidth sx={{ mb: 1 }}>
                      <InputLabel>API Call 선택</InputLabel>
                      <Select
                        value={(availableApiCalls.find(a => a.name === action.name)?.name) || ''}
                        label="API Call 선택"
                        onChange={(e) => updateApiCallAction(index, String(e.target.value))}
                        renderValue={selected => {
                          if (!selected) return <span style={{ color: '#aaa' }}>API Call을 선택하세요</span>;
                          return selected as string;
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
                              <Typography variant="caption" sx={{ color: 'text.secondary', ml: 1 }}>method: {(apicall as any).method || apicall.formats.method}</Typography>
                            </Box>
                          </MenuItem>
                        ))}
                        {availableApiCalls.length === 0 && (
                          <MenuItem value="NEW_APICALL" disabled>-- API Call이 없습니다 (외부 연동 관리 탭에서 등록) --</MenuItem>
                        )}
                      </Select>
                    </FormControl>
                    <Box sx={{ mt: 1, p: 1, bgcolor: '#fafafa', borderRadius: 1, border: '1px dashed #ddd' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>응답 매핑 (읽기 전용)</Typography>
                      {(() => {
                        const selected = availableApiCalls.find(a => a.name === action.name);
                        const rm = selected?.formats?.responseMappings as any;
                        if (Array.isArray(rm)) {
                          const lines: string[] = [];
                          rm.forEach((grp: any, gi: number) => {
                            const t = String(grp.targetType || 'MEMORY').toUpperCase();
                            const maps = grp.mappings || {};
                            lines.push(`[그룹 ${gi+1}] ${String(grp.expressionType || 'JSON_PATH')} → ${t}`);
                            Object.entries(maps).forEach(([k, v]) => {
                              lines.push(`  ${k} ⇐ ${String(v)}`);
                            });
                          });
                          return (
                            <>
                              {lines.map((line, i) => (
                                <Typography key={i} variant="caption" sx={{ display: 'block', ml: 1.5 }}>{line}</Typography>
                              ))}
                            </>
                          );
                        }
                        const obj = rm || {};
                        const entries = Object.entries(obj).slice(0, 6);
                        return entries.length ? (
                          <>
                            {entries.map(([k, v]: any) => {
                              let display = '';
                              if (typeof v === 'string') display = v;
                              else if (v && typeof v === 'object') {
                                display = typeof v[k] === 'string' ? v[k] : '';
                                if (!display) {
                                  for (const [kk, vv] of Object.entries(v)) {
                                    if (kk !== 'type' && typeof vv === 'string') { display = vv as string; break; }
                                  }
                                }
                                if (!display) display = JSON.stringify(v);
                              } else display = String(v);
                              return (
                                <Typography key={k} variant="caption" sx={{ display: 'block', ml: 1.5 }}>{k} ⇐ {display}</Typography>
                              );
                            })}
                          </>
                        ) : (
                          <Typography variant="caption" sx={{ display: 'block', ml: 1.5 }}>-</Typography>
                        );
                      })()}
                    </Box>
                  </Box>
                ))}
                <Button onClick={addApiCallAction} startIcon={<AddIcon />} variant="outlined" fullWidth>
                  API Call 액션 추가
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Webhook 액션 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="h6">Webhook 액션 ({(() => {
                const all = readWebhookActions();
                const names = new Set(availableWebhooks.map(w => w.name));
                return (all || []).filter((a: any) => names.has(getWebhookActionName(a))).length;
              })()})</Typography>
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
                
                {(() => {
                  const all = readWebhookActions();
                  const names = new Set(availableWebhooks.map(w => w.name));
                  const nonApi = (all || []).filter((a: any) => names.has(getWebhookActionName(a)));
                  return nonApi.map((action: any, index: number) => (
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
                  ));
                })()}
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
        <Button onClick={handleSave} variant="contained" color="primary">저장</Button>
      </DialogActions>
    </Dialog>
  );
};

export default NodeEditModal; 
