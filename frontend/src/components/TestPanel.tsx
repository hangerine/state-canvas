import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  TextField,
  Button,
  Paper,
  Alert,
  Chip,
  List,
  ListItem,
  ListItemText,
  Divider,
  Tabs,
  Tab,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Switch,
  FormControlLabel,
} from '@mui/material';
import { 
  ContentCopy as CopyIcon, 
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  // Edit as EditIcon, // 사용하지 않음
} from '@mui/icons-material';
import { Scenario, UserInput, ChatbotProcessRequest, ChatbotResponse, ChatbotDirective, EntityInput, NLUEntity, DialogState, ApiCallHandler } from '../types/scenario';
import axios from 'axios';
import ExternalIntegrationManager from './ExternalIntegrationManager';

// NLU 관련 타입 정의 (임시로 any 사용, 추후 정확한 타입 정의 예정)
interface TrainingUtterance {
  id?: number;
  text: string;
  intent: string;
  entities: any[];
  created_at?: string;
  updated_at?: string;
}



interface IntentMapping {
  scenario: string;
  dialogState: string;
  intents: string[];
  conditionStatement: string;
  dmIntent: string;
}

interface TestPanelProps {
  scenario: Scenario | null;
  currentState: string;
  onStateChange: (state: string) => void;
  onScenarioUpdate: (scenario: Scenario) => void;
  scenarios?: { [key: string]: Scenario };
}

interface TestMessage {
  type: 'user' | 'system' | 'transition' | 'info';
  content: string;
  timestamp: Date;
}

// 시나리오의 apicallHandlers에서 apicall 필드를 제거하는 함수
function cleanScenarioApiCallHandlers(scenario: Scenario): Scenario {
  const newScenario = JSON.parse(JSON.stringify(scenario));
  newScenario.plan.forEach((plan: { dialogState: DialogState[] }) => {
    plan.dialogState.forEach((state: DialogState) => {
      if (state.apicallHandlers) {
        state.apicallHandlers = state.apicallHandlers.map((handler: ApiCallHandler & { apicall?: any }) => {
          if ('apicall' in handler) {
            const { apicall, ...rest } = handler;
            return rest as ApiCallHandler;
          }
          return handler;
        });
      }
    });
  });
  return newScenario;
}

const TestPanel: React.FC<TestPanelProps> = ({
  scenario,
  currentState,
  onStateChange,
  onScenarioUpdate,
  scenarios
}) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [sessionId] = useState(() => 'test-session-' + Date.now());
  const [isConnected, setIsConnected] = useState(false);
  const [lastScenarioHash, setLastScenarioHash] = useState<string>('');

  // 새로운 input format 관련 상태
  const [inputType, setInputType] = useState<'text' | 'customEvent'>('text');
  const [eventType, setEventType] = useState('USER_DIALOG_START');
  const [intentValue, setIntentValue] = useState('');
  const [confidenceScore, setConfidenceScore] = useState(0.97);
  const [entities, setEntities] = useState<EntityInput[]>([]);

  // 챗봇 입력 포맷 관련 상태 - 이제 챗봇 포맷이 기본값
  const [useJsonInputMode, setUseJsonInputMode] = useState(false); // JSON 입력 모드 토글
  const [userId] = useState(() => 'user-' + Date.now());
  const [botId] = useState('1370');
  const [botVersion] = useState('5916');
  const [botName] = useState('나단도움봇_테스트');
  // const [requestId, setRequestId] = useState(() => 'chatbot-' + Date.now()); // 삭제

  // 탭 관련 상태
  const [currentTab, setCurrentTab] = useState(0);

  // API 테스트 관련 상태
  const [apiTestUrl, setApiTestUrl] = useState('');
  const [apiTestMethod, setApiTestMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('POST');
  const [apiTestRequestBody, setApiTestRequestBody] = useState('');
  const [apiTestHeaders, setApiTestHeaders] = useState<Record<string, string>>({
    'Content-Type': 'application/json'
  });
  const [apiTestResponse, setApiTestResponse] = useState<any>(null);
  const [apiTestLoading, setApiTestLoading] = useState(false);

  // 전체화면 모달 관련 상태
  const [fullscreenOpen, setFullscreenOpen] = useState(false);

  // NLU 관리 관련 상태
  const [nluUtterances, setNluUtterances] = useState<TrainingUtterance[]>([]);
  const [nluNewUtterance, setNluNewUtterance] = useState<TrainingUtterance>({
    text: '',
    intent: '',
    entities: []
  });
  const [nluNewIntentMode, setNluNewIntentMode] = useState(false);
  const [nluSelectedText, setNluSelectedText] = useState<{start: number, end: number, text: string} | null>(null);
  const [nluEntityModalOpen, setNluEntityModalOpen] = useState(false);
  const [nluNewEntityType, setNluNewEntityType] = useState('');
  const [nluNewEntityRole, setNluNewEntityRole] = useState('');
  const [nluSelectedUtterance] = useState<TrainingUtterance | null>(null);
  const [nluIntents, setNluIntents] = useState<string[]>([]);
  const [nluEntityTypes, setNluEntityTypes] = useState<string[]>([]);
  const [nluConnected, setNluConnected] = useState(false);

  // Intent Mapping 관리 상태
  const [intentMappings, setIntentMappings] = useState<IntentMapping[]>([]);
  const [newIntentMapping, setNewIntentMapping] = useState<IntentMapping>({
    scenario: 'Main',
    dialogState: '',
    intents: [],
    conditionStatement: '',
    dmIntent: ''
  });
  const [editingIntentMapping] = useState<IntentMapping | null>(null);

  // 메시지 스크롤을 위한 ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 목록 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // NLU 연결 상태 확인
  useEffect(() => {
    const checkConnection = async () => {
      await checkNluConnection();
    };
    checkConnection();
    
    // NLU 탭일 때 데이터 로드
    if (currentTab === 2 && nluConnected) {
      fetchNluUtterances();
      fetchNluIntents();
      fetchNluEntityTypes();
    }
  }, [currentTab, nluConnected]);

  // Intent Mapping 관련 함수들
  const loadIntentMappingsFromScenario = useCallback(() => {
    if (scenario && scenario.intentMapping) {
      setIntentMappings(scenario.intentMapping);
    }
  }, [scenario]);

  // 시나리오가 변경될 때 IntentMapping 로드
  useEffect(() => {
    loadIntentMappingsFromScenario();
  }, [loadIntentMappingsFromScenario]);

  // 메시지 추가 (useCallback으로 메모이제이션)
  const addMessage = useCallback((type: TestMessage['type'], content: string) => {
    const newMessage: TestMessage = {
      type,
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

  // NLU API 함수들
  const checkNluConnection = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/nlu/health');
      setNluConnected(response.status === 200);
      return true;
    } catch (error) {
      setNluConnected(false);
      return false;
    }
  };

  const fetchNluUtterances = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/nlu/training/utterances');
      setNluUtterances(response.data);
    } catch (error) {
      console.error('NLU 발화 목록 조회 실패:', error);
    }
  };

  const fetchNluIntents = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/nlu/intents');
      setNluIntents(response.data.intents || []);
    } catch (error) {
      console.error('NLU Intent 목록 조회 실패:', error);
    }
  };

  const fetchNluEntityTypes = async () => {
    try {
      const response = await axios.get('http://localhost:8000/api/nlu/entity-types');
      setNluEntityTypes(response.data.entity_types || []);
    } catch (error) {
      console.error('NLU Entity 타입 목록 조회 실패:', error);
    }
  };

  const createNluUtterance = async (utterance: TrainingUtterance) => {
    try {
      const response = await axios.post('http://localhost:8000/api/nlu/training/utterances', utterance);
      await fetchNluUtterances();
      await fetchNluIntents();
      return response.data;
    } catch (error) {
      console.error('NLU 발화 생성 실패:', error);
      throw error;
    }
  };

  // const updateNluUtterance = async (id: number, utterance: TrainingUtterance) => {
  //   try {
  //     const response = await axios.put(`http://localhost:8000/api/nlu/training/utterances/${id}`, utterance);
  //     await fetchNluUtterances();
  //     await fetchNluIntents();
  //     return response.data;
  //   } catch (error) {
  //     console.error('NLU 발화 수정 실패:', error);
  //     throw error;
  //     }
  //   }
  // };

  const deleteNluUtterance = async (id: number) => {
    try {
      await axios.delete(`http://localhost:8000/api/nlu/training/utterances/${id}`);
      await fetchNluUtterances();
      await fetchNluIntents();
    } catch (error) {
      console.error('NLU 발화 삭제 실패:', error);
      throw error;
    }
  };

  const saveIntentMappingToScenario = async (mapping: IntentMapping) => {
    if (!scenario) return;
    
    const updatedMappings = editingIntentMapping 
      ? intentMappings.map(m => m === editingIntentMapping ? mapping : m)
      : [...intentMappings, mapping];
    
    setIntentMappings(updatedMappings);
    
    // 시나리오 상태 업데이트 (부모 컴포넌트)
    const updatedScenario = {
      ...scenario,
      intentMapping: updatedMappings
    };
    
    try {
      // 백엔드에 Intent Mapping 업데이트 요청
      await axios.post('http://localhost:8000/api/intent-mapping', {
        scenario: mapping.scenario,
        intentMapping: updatedMappings
      });
      
      // 부모 컴포넌트의 scenario 상태 업데이트
      if (onScenarioUpdate) {
        onScenarioUpdate(updatedScenario);
      }
      
      console.log('Intent Mapping saved and applied to scenario:', mapping);
      console.log('Updated scenario intentMapping:', updatedMappings);
      
      // 성공 메시지 표시 (스낵바 등으로 개선 가능)
      alert('Intent Mapping이 성공적으로 저장되었습니다. 시나리오 테스트에 즉시 반영되며, 시나리오 저장 시에도 포함됩니다.');
      
    } catch (error) {
      console.error('Intent Mapping 저장 실패:', error);
      alert('Intent Mapping 저장에 실패했습니다.');
    }
  };

  const deleteIntentMapping = async (mapping: IntentMapping) => {
    if (!scenario) return;
    
    const updatedMappings = intentMappings.filter(m => m !== mapping);
    setIntentMappings(updatedMappings);
    
    // 시나리오 상태 업데이트 (부모 컴포넌트)
    const updatedScenario = {
      ...scenario,
      intentMapping: updatedMappings
    };
    
    try {
      // 백엔드에 Intent Mapping 업데이트 요청
      await axios.post('http://localhost:8000/api/intent-mapping', {
        scenario: mapping.scenario,
        intentMapping: updatedMappings
      });
      
      // 부모 컴포넌트의 scenario 상태 업데이트
      if (onScenarioUpdate) {
        onScenarioUpdate(updatedScenario);
      }
      
      console.log('Intent Mapping deleted and updated in scenario');
      
    } catch (error) {
      console.error('Intent Mapping 삭제 실패:', error);
      alert('Intent Mapping 삭제에 실패했습니다.');
    }
  };

  const getDialogStatesFromScenario = (): string[] => {
    const states: string[] = [];
    
    // scenarios 배열이 있으면 모든 시나리오에서 검색, 없으면 단일 scenario 사용
    const scenariosToSearch = scenarios && Object.values(scenarios).length > 0 
      ? Object.values(scenarios) 
      : scenario ? [scenario] : [];
    
    scenariosToSearch.forEach(scenarioItem => {
      scenarioItem.plan.forEach(plan => {
        plan.dialogState.forEach(state => {
          if (state.name) {
            states.push(state.name);
          }
        });
      });
    });
    
    return states;
  };

  // Entity 관리 함수들
  const handleTextSelection = (e: React.MouseEvent<HTMLDivElement>) => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      const selectedText = selection.toString().trim();
      const range = selection.getRangeAt(0);
      const start = range.startOffset;
      const end = range.endOffset;
      
      setNluSelectedText({ start, end, text: selectedText });
      setNluEntityModalOpen(true);
      setNluNewEntityType('');
      setNluNewEntityRole('');
    }
  };

  const addEntityToUtterance = () => {
    if (!nluSelectedText) return;
    
    const newEntity = {
      start: nluSelectedText.start,
      end: nluSelectedText.end,
      value: nluSelectedText.text,
      entity_type: nluNewEntityType,
      role: nluNewEntityRole || nluNewEntityType,
      normalization: ''
    };

    setNluNewUtterance(prev => ({
      ...prev,
      entities: [...prev.entities, newEntity]
    }));

    // 모달 닫기 및 상태 초기화
    setNluEntityModalOpen(false);
    setNluSelectedText(null);
    setNluNewEntityType('');
    setNluNewEntityRole('');
  };

  const removeEntityFromUtterance = (index: number) => {
    setNluNewUtterance(prev => ({
      ...prev,
      entities: prev.entities.filter((_, i) => i !== index)
    }));
  };

  const renderTextWithEntities = (text: string, entities: any[]) => {
    if (!entities.length) return text;

    // Entity 위치에 따라 정렬
    const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
    let lastEnd = 0;
    const parts = [];

    sortedEntities.forEach((entity, index) => {
      // Entity 이전 텍스트
      if (entity.start > lastEnd) {
        parts.push(text.slice(lastEnd, entity.start));
      }
      
      // Entity 부분 (하이라이트)
      parts.push(
        <span
          key={index}
          style={{
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '3px',
            padding: '1px 3px',
            margin: '0 1px',
            fontSize: '0.9em'
          }}
          title={`${entity.entity_type}: ${entity.role || entity.entity_type}`}
        >
          {entity.value}
        </span>
      );
      
      lastEnd = entity.end;
    });

    // 마지막 Entity 이후 텍스트
    if (lastEnd < text.length) {
      parts.push(text.slice(lastEnd));
    }

    return parts;
  };

  // Entities 관리 함수들
  const addEntity = useCallback(() => {
    const newEntity: EntityInput = {
      id: `entity-${Date.now()}-${Math.random()}`,
      role: '',
      type: '',
      text: '',
      normalization: '',
      extraTypeKr: ''
    };
    setEntities(prev => [...prev, newEntity]);
  }, []);

  const updateEntity = useCallback((id: string, field: keyof EntityInput, value: string) => {
    setEntities(prev => prev.map(entity => 
      entity.id === id ? { ...entity, [field]: value } : entity
    ));
  }, []);

  const removeEntity = useCallback((id: string) => {
    setEntities(prev => prev.filter(entity => entity.id !== id));
  }, []);

  // EntityInput을 NLUEntity로 변환
  const convertEntitiesToNLUFormat = useCallback((entityInputs: EntityInput[]): NLUEntity[] => {
    return entityInputs
      .filter(entity => entity.role && entity.type && entity.text) // 필수 필드가 있는 것만
      .map(entity => ({
        role: entity.role,
        type: entity.type,
        text: entity.text,
        ...(entity.normalization && { normalization: entity.normalization }),
        extra: {
          ...(entity.extraTypeKr && { type_kr: entity.extraTypeKr })
        }
      }));
  }, []);

  // 새로운 UserInput format 생성 함수
  const createUserInput = useCallback((): UserInput => {
    if (inputType === 'customEvent') {
      return {
        type: 'customEvent',
        content: {
          type: eventType,
          value: {
            scope: null,
            type: eventType,
            value: {},
            version: '1.0'
          }
        }
      };
    } else {
      const baseContent = {
        text: inputText,
        value: {
          scope: null,
          type: 'text',
          value: {},
          version: '1.0'
        }
      };

      // Intent가 포함된 경우 NLU 결과 추가
      if (intentValue && intentValue !== '') {
        const nluEntities = convertEntitiesToNLUFormat(entities);
        
        return {
          type: 'text',
          content: {
            ...baseContent,
            nluResult: {
              type: 'skt.opennlu',
              results: [
                {
                  nluNbest: [
                    {
                      intent: intentValue,
                      confidenceScore: confidenceScore,
                      status: 'accept',
                      entities: nluEntities,
                      extra: {
                        action_kr: intentValue,
                        analyzer: 'reranker/simple_voter',
                        domain: 'default',
                        engine_score: confidenceScore
                      }
                    }
                  ],
                  text: inputText,
                  extra: {}
                }
              ]
            }
          }
        };
      }

      return {
        type: 'text',
        content: baseContent
      };
    }
  }, [inputType, inputText, eventType, intentValue, confidenceScore, entities, convertEntitiesToNLUFormat]);

  // 새로운 챗봇 입력 포맷 생성 함수 (사용하지 않음)
  // const createChatbotProcessRequest = useCallback((): ChatbotProcessRequest => {
  //   // 매 요청마다 새로운 requestId 생성
  //   const newRequestId = 'chatbot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
  //   setRequestId(newRequestId);
  //   
  //   return {
  //     // 기본 챗봇 요청 필드들
  //     userId,
  //     botId,
  //     botVersion,
  //     botName,
  //     botResourcePath: `${botId}-${botVersion}.json`,
  //     sessionId,
  //     requestId: newRequestId,
  //     userInput: createUserInput(),
  //     context: {},
  //     headers: {},
  //     
  //     // 추가 처리 필드들
  //     currentState,
  //     scenario: scenario!
  //   };
  // }, [userId, botId, botVersion, botName, sessionId, createUserInput, currentState, scenario]);

  // 시나리오 변경 감지를 위한 해시 생성
  const generateScenarioHash = useCallback((scenario: Scenario | null): string => {
    if (!scenario) return '';
    try {
      return JSON.stringify(scenario.plan[0]?.dialogState || []);
    } catch {
      return '';
    }
  }, []);

  // 시나리오 변경 감지 및 자동 세션 초기화
  useEffect(() => {
    if (scenario) {
      const currentHash = generateScenarioHash(scenario);
      
      // 첫 로드가 아니고 시나리오가 변경된 경우
      if (lastScenarioHash && lastScenarioHash !== currentHash) {
        console.log('📊 시나리오 변경 감지 - 세션 자동 초기화');
        addMessage('system', '🔄 시나리오가 변경되어 세션을 자동으로 초기화합니다.');
        
        // 메시지 초기화 (기존 메시지 유지하면서 알림 추가)
        setTimeout(() => {
          handleReset();
        }, 500);
      }
      
      setLastScenarioHash(currentHash);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, lastScenarioHash]);

  // WebSocket 연결 (Backend와 연동)
  useEffect(() => {
    // TODO: WebSocket 연결 구현 예정
    // const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);
    // ws.onopen = () => setIsConnected(true);
    // ws.onclose = () => setIsConnected(false);
    // ws.onmessage = (event) => {
    //   const data = JSON.parse(event.data);
    //   if (data.type === 'state_transition') {
    //     onStateChange(data.newState);
    //     addMessage('transition', `상태 전이: ${data.oldState} → ${data.newState}`);
    //   } else if (data.type === 'response') {
    //     addMessage('system', data.content);
    //   }
    // };
    
    // Mock connection for now
    setIsConnected(true);
    
    return () => {
      // ws.close();
    };
  }, [sessionId, onStateChange]);

  // 백엔드에서 자동으로 상태 전이를 처리하므로 불필요한 자동전이 확인 제거

  // 현재 상태가 webhook 상태인지 확인
  const isWebhookState = useCallback(() => {
    if (!currentState) return false;
    
    // scenarios 배열이 있으면 모든 시나리오에서 검색, 없으면 단일 scenario 사용
    const scenariosToSearch = scenarios && Object.values(scenarios).length > 0 
      ? Object.values(scenarios) 
      : scenario ? [scenario] : [];
    
    for (const scenarioItem of scenariosToSearch) {
      const dialogState = scenarioItem.plan[0]?.dialogState.find(
        state => state.name === currentState
      );
      
      if (dialogState?.webhookActions && dialogState.webhookActions.length > 0) {
        return true;
      }
    }
    
    return false;
  }, [scenario, scenarios, currentState]);

  // 현재 상태가 이벤트 핸들러를 가지고 있는지 확인
  const getEventHandlers = useCallback(() => {
    if (!currentState) return [];
    
    // scenarios 배열이 있으면 모든 시나리오에서 검색, 없으면 단일 scenario 사용
    const scenariosToSearch = scenarios && Object.values(scenarios).length > 0 
      ? Object.values(scenarios) 
      : scenario ? [scenario] : [];
    
    for (const scenarioItem of scenariosToSearch) {
      const dialogState = scenarioItem.plan[0]?.dialogState.find(
        state => state.name === currentState
      );
      
      if (dialogState?.eventHandlers && dialogState.eventHandlers.length > 0) {
        return dialogState.eventHandlers;
      }
    }
    
    return [];
  }, [scenario, scenarios, currentState]);

  // 이벤트 핸들러가 있는 상태인지 확인
  const isEventState = useCallback(() => {
    return getEventHandlers().length > 0;
  }, [getEventHandlers]);

  // 현재 상태가 API Call 핸들러를 가지고 있는지 확인
  const getApiCallHandlers = useCallback(() => {
    if (!currentState) return [];
    
    // scenarios 배열이 있으면 모든 시나리오에서 검색, 없으면 단일 scenario 사용
    const scenariosToSearch = scenarios && Object.values(scenarios).length > 0 
      ? Object.values(scenarios) 
      : scenario ? [scenario] : [];
    
    for (const scenarioItem of scenariosToSearch) {
      const dialogState = scenarioItem.plan[0]?.dialogState.find(
        state => state.name === currentState
      );
      
      if (dialogState?.apicallHandlers && dialogState.apicallHandlers.length > 0) {
        return dialogState.apicallHandlers;
      }
    }
    
    return [];
  }, [scenario, scenarios, currentState]);

  // 현재 상태가 Webhook 액션을 가지고 있는지 확인
  const getWebhookActions = useCallback(() => {
    if (!currentState) return [];
    
    // scenarios 배열이 있으면 모든 시나리오에서 검색, 없으면 단일 scenario 사용
    const scenariosToSearch = scenarios && Object.values(scenarios).length > 0 
      ? Object.values(scenarios) 
      : scenario ? [scenario] : [];
    
    for (const scenarioItem of scenariosToSearch) {
      const dialogState = scenarioItem.plan[0]?.dialogState.find(
        state => state.name === currentState
      );
      
      if (dialogState?.webhookActions && dialogState.webhookActions.length > 0) {
        return dialogState.webhookActions;
      }
    }
    
    return [];
  }, [scenario, scenarios, currentState]);

  // API Call 핸들러가 있는 상태인지 확인
  const isApiCallState = useCallback(() => {
    return getApiCallHandlers().length > 0;
  }, [getApiCallHandlers]);

  // Intent 핸들러가 있는 상태인지 확인
  const getIntentHandlers = useCallback(() => {
    if (!currentState) return [];
    
    // scenarios 배열이 있으면 모든 시나리오에서 검색, 없으면 단일 scenario 사용
    const scenariosToSearch = scenarios && Object.values(scenarios).length > 0 
      ? Object.values(scenarios) 
      : scenario ? [scenario] : [];
    
    for (const scenarioItem of scenariosToSearch) {
      const dialogState = scenarioItem.plan[0]?.dialogState.find(
        state => state.name === currentState
      );
      
      if (dialogState?.intentHandlers && dialogState.intentHandlers.length > 0) {
        return dialogState.intentHandlers;
      }
    }
    
    return [];
  }, [scenario, scenarios, currentState]);

  // Intent 핸들러가 있는 상태인지 확인
  const isIntentState = useCallback(() => {
    return getIntentHandlers().length > 0;
  }, [getIntentHandlers]);

  // Webhook 상태일 때 도움말 표시와 이벤트 상태 도움말 표시
  useEffect(() => {
    const webhookState = isWebhookState();
    const eventState = isEventState();
    const apiCallState = isApiCallState();
    const intentState = isIntentState();
    
    // webhookState 안내 메시지 제거
    if (eventState) {
      const eventHandlers = getEventHandlers();
      const eventTypes = eventHandlers.map(handler => {
        // event 필드 안전하게 처리
        if (handler.event) {
          if (typeof handler.event === 'object' && handler.event.type) {
            return handler.event.type;
          } else if (typeof handler.event === 'string') {
            return handler.event;
          }
        }
        return 'Unknown';
      }).join('\n- ');
      addMessage('info', `🎯 이벤트 상태입니다. 다음 이벤트들을 트리거할 수 있습니다:\n- ${eventTypes}`);
    } else if (apiCallState) {
      const apiCallHandlers = getApiCallHandlers();
      // 항상 scenario.apicalls에서 최신 apicall 객체를 찾아서 사용
      const apiCallNames = apiCallHandlers.map(handler => {
        let apicall = null;
        if (scenario && scenario.webhooks && handler.name) {
          const apicallLike = (scenario.webhooks as any[]).find(w => w.type === 'apicall' && w.name === handler.name);
          if (apicallLike) {
            apicall = {
              url: apicallLike.url,
              formats: apicallLike.formats || { method: 'POST' }
            } as any;
          }
        }
        const url = apicall?.url || 'Unknown URL';
        const method = apicall?.formats?.method || 'POST';
        return `${handler.name} (${method} ${url})`;
      }).join('\n- ');
      addMessage('info', `🔄 API Call 상태입니다. 다음 API들이 자동으로 호출됩니다:\n- ${apiCallNames}`);
    } else if (intentState) {
      const intentHandlers = getIntentHandlers();
      const intents = intentHandlers.map(handler => {
        return handler.intent || 'Unknown';
      }).join('\n- ');
      addMessage('info', `💬 Intent 상태입니다. 사용자 입력을 기다리고 있습니다. 다음 intent들을 처리할 수 있습니다:\n- ${intents}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentState, scenario]);

  // 초기 상태 찾기 (백엔드와 동일한 로직)
  const getInitialState = useCallback(() => {
    if (!scenario || !scenario.plan || scenario.plan.length === 0) {
      return 'Start';
    }
    
    const dialogStates = scenario.plan[0].dialogState;
    if (!dialogStates || dialogStates.length === 0) {
      return 'Start';
    }
    
    // Start가 있으면 선택
    const startState = dialogStates.find(state => state.name === 'Start');
    if (startState) {
      console.log('🎯 Start를 초기 상태로 설정');
      return 'Start';
    }
    
    // Start가 없으면 첫 번째 상태 선택
    console.log('🎯 첫 번째 상태를 초기 상태로 설정:', dialogStates[0].name);
    return dialogStates[0].name;
  }, [scenario]);

  // 자동 전이 확인 (백엔드에서 자동 처리되므로 불필요 - 제거 예정)
  const checkAutoTransition = useCallback(async () => {
    console.log('⚠️ 자동전이 확인 기능은 백엔드에서 자동 처리되므로 불필요합니다.');
    addMessage('info', 'ℹ️ 백엔드에서 자동으로 상태 전이를 처리합니다. 수동 확인이 필요하지 않습니다.');
  }, [addMessage, currentState, onStateChange]);

  // 메시지 추가
  // const addMessage = (type: TestMessage['type'], content: string) => {
  //   const newMessage: TestMessage = {
  //     type,
  //     content,
  //     timestamp: new Date(),
  //   };
  //   setMessages(prev => [...prev, newMessage]);
  // };

  // NLU API 호출 함수
  const callNluApi = async (text: string) => {
    try {
      const response = await axios.post('http://localhost:8000/api/nlu/infer', {
        text: text,
        session_id: sessionId,
        context: {}
      });
      return response.data;
    } catch (error) {
      console.error('NLU API 호출 실패:', error);
      return null;
    }
  };

  // 사용자 입력 전송
  const handleSendMessage = async () => {
    if (!scenario) return;
    
    // 웹훅 상태일 때 자동으로 빈 입력 전송
    if (isWebhookState()) {
      addMessage('system', '🔗 웹훅 상태 - 자동으로 처리합니다...');
      
      try {
        const chatbotRequestData: ChatbotProcessRequest = {
          userId,
          botId,
          botVersion,
          botName,
          botResourcePath: `${botId}-${botVersion}.json`,
          sessionId,
          requestId: 'chatbot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
          userInput: {
            type: 'text',
            content: {
              text: '',
              value: {
                scope: null,
                type: 'text',
                value: {},
                version: '1.0'
              },
              nluResult: {
                type: 'skt.opennlu',
                results: [
                  {
                    nluNbest: [],
                    text: '',
                    extra: {}
                  }
                ]
              }
            }
          },
          context: defaultContext,
          headers: defaultHeaders,
          currentState,
          scenario: scenario!
        };

        const response = await axios.post('http://localhost:8000/api/process-chatbot-input', chatbotRequestData);
        handleChatbotResponse(response.data);
        return;
      } catch (error) {
        addMessage('system', '❌ 웹훅 처리 오류: ' + (error as Error).message);
        console.error('Webhook processing error:', error);
        return;
      }
    }
    
    // JSON 입력 모드일 때
    if (useJsonInputMode) {
      if (!inputText.trim()) return;
      
      try {
        let jsonRequest = JSON.parse(inputText);
        // eventType만 입력된 경우 보조 처리
        if (typeof jsonRequest === 'string') {
                      // eventType만 입력된 경우 userInput 포맷으로 감싸기
            jsonRequest = {
              userId,
              botId,
              botVersion,
              botName,
              botResourcePath: `${botId}-${botVersion}.json`,
              sessionId,
              requestId: 'chatbot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
              userInput: {
                type: 'customEvent',
                content: {
                  type: jsonRequest,
                  value: {
                    scope: null,
                    type: jsonRequest,
                    value: {},
                                         version: '1.0'
                  }
                }
              },
              context: defaultContext,
              headers: defaultHeaders,
              currentState,
              scenario: scenario!
            };
        }
        // 필수 필드 확인
        if (!jsonRequest.userId || !jsonRequest.sessionId || !jsonRequest.userInput) {
          addMessage('system', '❌ JSON 형식 오류: userId, sessionId, userInput 필드가 필요합니다.');
          return;
        }
        // currentState와 scenario 추가
        const requestData = {
          ...jsonRequest,
          currentState,
          scenario: scenario!
        };
        addMessage('user', `[JSON] ${JSON.stringify(jsonRequest.userInput, null, 2)}`);
        addMessage('system', '📤 JSON 요청을 전송합니다...');
        console.log('📤 JSON request:', JSON.stringify(requestData, null, 2));
        let response;
        if (proxyMode && proxyEndpoint.trim()) {
          response = await axios.post('http://localhost:8000/api/proxy', {
            endpoint: proxyEndpoint,
            payload: requestData
          });
        } else {
          response = await axios.post('http://localhost:8000/api/process-chatbot-input', requestData);
        }
        handleChatbotResponse(response.data);
        setInputText('');
      } catch (error) {
        if (error instanceof SyntaxError) {
          addMessage('system', '❌ JSON 파싱 오류: ' + error.message);
        } else {
          addMessage('system', '❌ 요청 처리 오류: ' + (error as Error).message);
        }
        console.error('JSON processing error:', error);
      }
      
      return;
    }
    
    // 기본 챗봇 포맷 모드 (기존 로직)
    // customEvent 타입이거나 text 타입에서 inputText가 있는 경우만 진행
    if (inputType === 'text' && !inputText.trim()) return;

    // 메시지 표시용 텍스트 생성
    let displayMessage = '';
    if (inputType === 'customEvent') {
      displayMessage = `[Event] ${eventType}`;
    } else {
      displayMessage = inputText;
    }
    
    addMessage('user', displayMessage);

    let userInput: UserInput;

    // NLU 연동 플로우
    console.log('🔍 NLU 연동 조건 확인:', {
      inputType,
      nluConnected,
      intentValue,
      shouldUseNLU: inputType === 'text' && nluConnected && !intentValue
    });

    if (inputType === 'text' && nluConnected && !intentValue) {
      // NLU API 호출
      addMessage('system', '🧠 NLU 분석 중...');
      console.log('📡 NLU API 호출 시작:', inputText);
      const nluResult = await callNluApi(inputText);
      console.log('📥 NLU API 응답:', nluResult);
      
      if (nluResult) {
        // NLU 결과를 포함한 UserInput 생성
        userInput = {
          type: 'text',
          content: {
            text: inputText,
            value: {
              scope: null,
              type: 'text',
              value: {},
              version: '1.0'
            },
            nluResult: {
              type: 'custom.nlu',
              results: [
                {
                  nluNbest: [
                    {
                      intent: nluResult.dm_intent || nluResult.intent,
                      confidenceScore: nluResult.confidence,
                      status: 'accept',
                      entities: nluResult.entities.map((entity: any) => ({
                        role: entity.role || entity.entity_type, // role 입력이 없으면 type을 role로 사용
                        type: entity.entity_type,
                        text: entity.value,
                        normalization: entity.normalization,
                        extra: {}
                      })),
                      extra: {
                        action_kr: nluResult.intent,
                        analyzer: 'custom_nlu_service',
                        domain: 'default',
                        engine_score: nluResult.confidence,
                        processing_time_ms: nluResult.processing_time_ms,
                        dm_intent: nluResult.dm_intent
                      }
                    }
                  ],
                  text: inputText,
                  extra: {}
                }
              ]
            }
          }
        };

        // NLU 결과 표시
        const intentDisplay = nluResult.dm_intent ? 
          `${nluResult.intent} → ${nluResult.dm_intent}` : 
          nluResult.intent;
        addMessage('system', 
          `🧠 NLU 분석 완료: ${intentDisplay} (${(nluResult.confidence * 100).toFixed(1)}%)`
        );
        
        if (nluResult.entities.length > 0) {
          const entitiesText = nluResult.entities
            .map((e: any) => `${e.entity_type}:${e.value}`)
            .join(', ');
          addMessage('system', `📍 추출된 엔티티: ${entitiesText}`);
        }
      } else {
        // NLU API 실패 시 기본 UserInput 생성
        addMessage('system', '⚠️ NLU 분석 실패 - 기본 처리로 진행');
        userInput = createUserInput();
      }
    } else {
      // 기존 방식 (수동 입력 또는 customEvent)
      userInput = createUserInput();
    }

    try {
      let response;
      
      // 챗봇 포맷으로 Backend API 호출 (기본값)
      const newRequestId = 'chatbot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      
      const cleanedScenario = scenario ? cleanScenarioApiCallHandlers(scenario) : scenario;
      const cleanedScenarios = scenarios ? Object.fromEntries(Object.entries(scenarios).map(([k, v]) => [k, cleanScenarioApiCallHandlers(v)])) : scenarios;
      
      // === 디버깅 로그 추가 ===
      console.log('🔍 [DEBUG] 원본 scenario:', scenario);
      console.log('🔍 [DEBUG] cleanedScenario:', cleanedScenario);
      console.log('🔍 [DEBUG] cleanedScenario 타입:', typeof cleanedScenario);
      console.log('🔍 [DEBUG] cleanedScenario 배열 여부:', Array.isArray(cleanedScenario));
      
      const chatbotRequestData: ChatbotProcessRequest = {
        userId,
        botId,
        botVersion,
        botName,
        botResourcePath: `${botId}-${botVersion}.json`,
        sessionId,
        requestId: newRequestId,
        userInput: userInput,
        context: defaultContext,
        headers: defaultHeaders,
        currentState,
        scenario: cleanedScenario  // scenario 필드 추가
      };

      // === 추가: 백엔드로 전송되는 시나리오 배열 로그 ===
      console.log('🛫 백엔드로 전송되는 시나리오:', chatbotRequestData.scenario);
      console.log('🛫 [DEBUG] 최종 scenario 타입:', typeof chatbotRequestData.scenario);
      console.log('🛫 [DEBUG] 최종 scenario 배열 여부:', Array.isArray(chatbotRequestData.scenario));

      if (proxyMode && proxyEndpoint.trim()) {
        response = await axios.post('http://localhost:8000/api/proxy', {
          endpoint: proxyEndpoint,
          payload: chatbotRequestData
        });
      } else {
        response = await axios.post('http://localhost:8000/api/process-chatbot-input', chatbotRequestData);
      }

      // 새로운 챗봇 응답 포맷 처리
      handleChatbotResponse(response.data);

    } catch (error) {
      addMessage('system', '❌ Backend 연결 오류: ' + (error as Error).message);
      console.error('Test API Error:', error);
    }

    // input 초기화 (text 타입인 경우만)
    if (inputType === 'text') {
      setInputText('');
    }
  };

  // 테스트 초기화 (개선된 버전)
  const handleReset = useCallback(async () => {
    try {
      // 메시지 초기화
      setMessages([]);
      addMessage('system', '🔄 테스트 세션 초기화 중...');
      
      // Backend 세션 초기화
      const resetResponse = await axios.post(`http://localhost:8000/api/reset-session/${sessionId}`, {
        scenario: scenario  // 현재 시나리오를 함께 전송
      });
      
      if (resetResponse.data.status === 'success') {
        const initialState = resetResponse.data.initial_state || getInitialState();
        
        console.log('🎯 초기화 완료 - 초기 상태:', initialState);
        onStateChange(initialState);
        
        addMessage('system', `✅ 테스트 세션이 초기화되었습니다. 초기 상태: ${initialState}`);
        
        // 백엔드에서 자동으로 상태 전이를 처리하므로 추가 확인 불필요
        console.log(`✅ 초기화 완료 - 백엔드에서 자동 전이 처리됨`);
        
      } else {
        throw new Error('Backend 초기화 실패');
      }
      
    } catch (error) {
      console.error('Reset error:', error);
      addMessage('system', '❌ 초기화 오류: ' + (error as Error).message);
      
      // Fallback: Frontend만 초기화
      const fallbackState = getInitialState();
      onStateChange(fallbackState);
      addMessage('system', `⚠️ Backend 초기화 실패 - Frontend만 초기화됨. 상태: ${fallbackState}`);
    }
  }, [sessionId, scenario, getInitialState, onStateChange, addMessage]);

  // 빠른 입력 버튼들
  const handleQuickInput = (value: string) => {
    setInputText(value);
  };

  // Enter 키 처리 개선
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      if (useJsonInputMode) {
        // JSON 입력 모드에서는 Ctrl+Enter로 전송
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          handleSendMessage();
        }
        // 일반 Enter는 줄바꿈 허용
      } else {
        // 일반 모드에서는 Enter로 전송 (Shift+Enter는 줄바꿈)
        if (!event.shiftKey) {
          event.preventDefault();
          handleSendMessage();
        }
      }
    }
  };

  // 이벤트 트리거 함수
  const handleEventTrigger = async (eventType: string) => {
    try {
      addMessage('info', `🎯 이벤트 트리거: ${eventType}`);

      // customEvent 타입 userInput 생성
      const userInput: UserInput = {
        type: 'customEvent',
        content: {
          type: eventType,
          value: {
            scope: null,
            type: eventType,
            value: {},
            version: '1.0'
          }
        }
      };

      const newRequestId = 'chatbot-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      const chatbotRequestData: ChatbotProcessRequest = {
        userId,
        botId,
        botVersion,
        botName,
        botResourcePath: `${botId}-${botVersion}.json`,
        sessionId,
        requestId: newRequestId,
        userInput,
        context: defaultContext,
        headers: defaultHeaders,
        currentState,
        scenario: scenario!
      };

      let response;
      if (proxyMode && proxyEndpoint.trim()) {
        response = await axios.post('http://localhost:8000/api/proxy', {
          endpoint: proxyEndpoint,
          payload: chatbotRequestData
        });
      } else {
        response = await axios.post('http://localhost:8000/api/process-chatbot-input', chatbotRequestData);
      }
      handleChatbotResponse(response.data);
    } catch (error) {
      addMessage('system', `❌ 이벤트 처리 오류: ${(error as Error).message}`);
      console.error('Event trigger error:', error);
    }
  };

  // API 테스트 관련 함수들


  const handleApiTest = async () => {
    if (!apiTestUrl.trim()) {
      alert('URL을 입력해주세요.');
      return;
    }

    setApiTestLoading(true);
    setApiTestResponse(null);

    try {
      const config: any = {
        method: apiTestMethod.toLowerCase(),
        url: apiTestUrl,
        headers: { ...apiTestHeaders },
      };

      if (apiTestMethod !== 'GET' && apiTestRequestBody.trim()) {
        try {
          config.data = JSON.parse(apiTestRequestBody);
        } catch (e) {
          throw new Error('Request Body는 유효한 JSON 형식이어야 합니다.');
        }
      }

      const response = await axios(config);
      setApiTestResponse({
        status: response.status,
        headers: response.headers,
        data: response.data,
      });
    } catch (error: any) {
      setApiTestResponse({
        error: true,
        message: error.message,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data,
        } : null,
      });
    } finally {
      setApiTestLoading(false);
    }
  };

  // 헤더 관리 함수들
  const addApiTestHeader = (key: string = '', value: string = '') => {
    if (key.trim()) {
      setApiTestHeaders(prev => ({
        ...prev,
        [key]: value
      }));
    }
  };

  const removeApiTestHeader = (key: string) => {
    setApiTestHeaders(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest;
    });
  };

  const updateApiTestHeader = (oldKey: string, newKey: string, newValue: string) => {
    setApiTestHeaders(prev => {
      const updated = { ...prev };
      if (oldKey !== newKey) {
        delete updated[oldKey];
      }
      updated[newKey] = newValue;
      return updated;
    });
  };

  // 기본 헤더 옵션들
  const defaultApiTestHeaderOptions = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Accept', value: 'application/json' },
    { key: 'Authorization', value: 'Bearer ' },
    { key: 'User-Agent', value: 'StateCanvas/1.0' },
    { key: 'X-Requested-With', value: 'XMLHttpRequest' },
  ];

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const generateJsonPath = (obj: any, path: string = '$'): string[] => {
    const paths: string[] = [];
    
    if (obj === null || obj === undefined) {
      return paths;
    }

    if (Array.isArray(obj)) {
      // 배열 자체 경로도 포함
      paths.push(path);
      obj.forEach((item, index) => {
        const newPath = `${path}[${index}]`;
        paths.push(newPath);
        paths.push(...generateJsonPath(item, newPath));
      });
    } else if (typeof obj === 'object') {
      // 객체 자체 경로도 포함
      paths.push(path);
      Object.keys(obj).forEach(key => {
        const newPath = `${path}.${key}`;
        paths.push(newPath);
        paths.push(...generateJsonPath(obj[key], newPath));
      });
    } else {
      // 원시값 경로
      paths.push(path);
    }

    return paths;
  };

  const handleCopyJsonPath = (path: string) => {
    navigator.clipboard.writeText(path);
    // TODO: 토스트 메시지 추가
    console.log('JSONPath copied:', path);
  };

  const getValueByPath = (obj: any, path: string): any => {
    try {
      // 간단한 JSONPath 파싱 ($.key.subkey[0] 형태)
      const cleanPath = path.replace(/^\$\.?/, ''); // $ 제거
      if (!cleanPath) return obj;
      
      const parts = cleanPath.split(/[.[\]]+/).filter(Boolean);
      let current = obj;
      
      for (const part of parts) {
        if (current === null || current === undefined) return undefined;
        
        if (Array.isArray(current)) {
          const index = parseInt(part);
          if (isNaN(index) || index >= current.length) return undefined;
          current = current[index];
        } else if (typeof current === 'object') {
          current = current[part];
        } else {
          return undefined;
        }
      }
      
      return current;
    } catch (e) {
      return undefined;
    }
  };

  const getValueType = (value: any): string => {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return `array[${value.length}]`;
    if (typeof value === 'object') return `object{${Object.keys(value).length}}`;
    return typeof value;
  };

  const renderJsonPathTooltip = (value: any, path: string) => {
    const actualValue = getValueByPath(apiTestResponse?.data, path);
    const valueType = getValueType(actualValue);
    const isLeafValue = !Array.isArray(actualValue) && typeof actualValue !== 'object';
    
    return (
      <Tooltip 
        title={
          <Box>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold' }}>
              JSONPath: {path}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>
              Type: {valueType}
            </Typography>
            {isLeafValue && (
              <Typography variant="caption" sx={{ display: 'block' }}>
                Value: {String(actualValue)}
              </Typography>
            )}
            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
              Click to copy
            </Typography>
          </Box>
        } 
        arrow
        placement="top"
      >
        <IconButton
          size="small"
          onClick={() => handleCopyJsonPath(path)}
          sx={{ 
            ml: 0.5, 
            p: 0.25,
            color: isLeafValue ? 'primary.main' : 'text.secondary',
            '&:hover': {
              backgroundColor: 'action.hover',
            }
          }}
        >
          <CopyIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  };

  const renderResponseValue = (obj: any, path: string = '$', depth: number = 0): React.ReactNode => {
    const maxDepth = 5; // 최대 깊이 제한
    
    if (depth > maxDepth) {
      return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ color: '#999', fontStyle: 'italic' }}>...</span>
          {renderJsonPathTooltip(obj, path)}
        </Box>
      );
    }

    if (obj === null || obj === undefined) {
      return (
        <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
          <span style={{ color: '#999' }}>{obj === null ? 'null' : 'undefined'}</span>
          {renderJsonPathTooltip(obj, path)}
        </Box>
      );
    }

    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return (
          <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ color: '#666' }}>[]</span>
            {renderJsonPathTooltip(obj, path)}
          </Box>
        );
      }

      return (
        <Box sx={{ ml: depth > 0 ? 2 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#e91e63' }}>
              Array [{obj.length}]
            </Typography>
            {renderJsonPathTooltip(obj, path)}
          </Box>
          {obj.slice(0, 10).map((item, index) => ( // 처음 10개만 표시
            <Box key={index} sx={{ ml: 2, mb: 0.5 }}>
              <Typography variant="body2" component="div">
                <strong style={{ color: '#1976d2' }}>[{index}]:</strong>{' '}
                {renderResponseValue(item, `${path}[${index}]`, depth + 1)}
              </Typography>
            </Box>
          ))}
          {obj.length > 10 && (
            <Box sx={{ ml: 2 }}>
              <Typography variant="body2" sx={{ color: '#999', fontStyle: 'italic' }}>
                ... and {obj.length - 10} more items
              </Typography>
            </Box>
          )}
        </Box>
      );
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      
      if (keys.length === 0) {
        return (
          <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ color: '#666' }}>{'{}'}</span>
            {renderJsonPathTooltip(obj, path)}
          </Box>
        );
      }

      return (
        <Box sx={{ ml: depth > 0 ? 2 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#ff9800' }}>
              Object {`{${keys.length}}`}
            </Typography>
            {renderJsonPathTooltip(obj, path)}
          </Box>
          {keys.slice(0, 20).map((key) => ( // 처음 20개 키만 표시
            <Box key={key} sx={{ ml: 2, mb: 0.5 }}>
              <Typography variant="body2" component="div">
                <strong style={{ color: '#4caf50' }}>{key}:</strong>{' '}
                {renderResponseValue(obj[key], `${path}.${key}`, depth + 1)}
              </Typography>
            </Box>
          ))}
          {keys.length > 20 && (
            <Box sx={{ ml: 2 }}>
              <Typography variant="body2" sx={{ color: '#999', fontStyle: 'italic' }}>
                ... and {keys.length - 20} more properties
              </Typography>
            </Box>
          )}
        </Box>
      );
    }

    // 원시값 (문자열, 숫자, 불린)
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <span style={{ 
          color: typeof obj === 'string' ? '#1976d2' : 
                typeof obj === 'number' ? '#d32f2f' : 
                typeof obj === 'boolean' ? '#9c27b0' : '#333',
          fontFamily: 'monospace',
          fontSize: '0.9em'
        }}>
          {typeof obj === 'string' ? `"${obj}"` : String(obj)}
        </span>
        {renderJsonPathTooltip(obj, path)}
      </Box>
    );
  };

  // 새로운 챗봇 응답 처리 함수
  const handleChatbotResponse = (response: ChatbotResponse) => {
    // 에러 처리
    if (response.error.code !== "0") {
      addMessage('system', `❌ 오류: ${response.error.message}`);
      return;
    }
    
    // 상태 전이 처리 - 백엔드 응답의 meta.dialogState를 확인하여 전이 표시
    if (response.meta.dialogState && response.meta.dialogState !== currentState) {
      addMessage('transition', `🚀 상태 전이: ${currentState} → ${response.meta.dialogState}`);
      onStateChange(response.meta.dialogState);
    }
    
    // Directives 처리
    response.directives.forEach((directive: ChatbotDirective) => {
      if (directive.name === "customPayload") {
        const content = directive.content;
        
        // 텍스트 메시지 추출
        content.item.forEach((item: any) => {
          if (item.section && item.section.item) {
            item.section.item.forEach((sectionItem: any) => {
              if (sectionItem.text && sectionItem.text.text) {
                // HTML 태그 제거
                const cleanText = sectionItem.text.text.replace(/<[^>]*>/g, '');
                addMessage('system', cleanText);
              }
              if (sectionItem.image) {
                addMessage('system', `🖼️ 이미지: ${sectionItem.image.altText || '이미지'}`);
              }
            });
          }
        });
      }
    });
    
    // 메타 정보 표시
    if (response.meta.intent.length > 0 && response.meta.intent[0]) {
      addMessage('info', `🎯 Intent: ${response.meta.intent[0]}`);
    }
    
    // Used slots 표시
    if (response.meta.usedSlots.length > 0) {
      const slotsText = response.meta.usedSlots
        .map(slot => `${slot.key}: ${slot.value}`)
        .join(', ');
      addMessage('info', `📍 Used Slots: ${slotsText}`);
    }
    
    // 세션 종료 처리
    if (response.endSession === "Y") {
      addMessage('system', '🔚 세션이 종료되었습니다.');
    }
  };

  // 기존 응답 처리 함수 (레거시) - 사용하지 않음
  // const handleLegacyResponse = (responseData: any) => {
  //   // 응답 처리
  //   if (responseData.transitions) {
  //     responseData.transitions.forEach((transition: any) => {
  //       addMessage('transition', 
  //         `${transition.fromState} → ${transition.toState} (${transition.reason})`
  //       );
  //     });
  //   }

  //   if (responseData.new_state) {
  //     onStateChange(responseData.new_state);
  //   }

  //   if (responseData.response) {
  //     addMessage('system', responseData.response);
  //   }
  // };

  const [proxyMode, setProxyMode] = useState(false);
  const [proxyEndpoint, setProxyEndpoint] = useState('');

  // 1. context, headers mock 데이터 정의 (파일 상단 useState 아래에 추가)
  const defaultContext = {
    context: {
      client: {
        os: 'darwin',
        playStack: [],
        wakeupWord: ' ' 
      },
      supportedInterfaces: {
        ACP: null
      },
      system: {
        accessToken: ' ',
        device: {
          age: null,
          ageGroup: null,
          attributes: null,
          authToken: ' ',
          birthdate: null,
          ci: null,
          defaultVoiceCode: null,
          deviceTtsOption: true,
          deviceUniqueId: null,
          gender: null,
          id: ' ',
          iwfTypeCode: ' ',
          latitude: null,
          longitude: null,
          phoneNumber: null,
          pocGroup: {},
          pocId: ' ',
          pocName: null,
          pocServiceName: null,
          pocStatus: null,
          typeCode: null,
          typeId: null,
          useWakeupTts: null,
          userCharacterName: null,
          userCharacterTone: null,
          userCharacterVoice: null,
          userName: null,
          userType: null
        },
        play: {
          alias: [],
          ambiguityHint: {},
          apiKey: ' ',
          capabilityInterfaces: [ ' ' ],
          charge: ' ',
          extendedAlias: [],
          interlockType: ' ',
          invocationName: null,
          invocationType: ' ',
          isSpecializedRoute: null,
          isTest: false,
          nluType: ' ',
          permission: {
            available: [ ' ' ],
            required: [ ' ' ]
          },
          playName: ' ',
          playNo: 0,
          playRevisionId: ' ',
          playServiceId: ' ',
          playServiceName: ' ',
          routingType: ' ',
          specializedRouteOrder: null,
          status: ' ',
          supportedPocList: [],
          systemCodes: null,
          type: ' ',
          url: ' ',
          useOAuth: false,
          voices: null
        },
        serviceId: ' ',
        serviceType: ' ',
        userId: userId
      }
    },
    request: {
      event: {
        scope: null,
        type: 'text',
        value: {},
        version: '1.0'
      },
      nlu: null,
      requestId: '',
      text: '',
      transactionId: '',
      type: 'ACP.RecognizeResult'
    },
    session: {
      id: sessionId,
      isNew: false,
      playId: 5021,
      playType: 'BOT_GROUP'
    },
    version: {
      client: '1.0',
      npk: '2.2',
      sdk: '1.0'
    }
  };
  const defaultHeaders = {
    'Accept': ['*/*'],
    'Accept-Encoding': ['gzip'],
    'Content-Length': ['2250'],
    'Content-Type': ['application/json'],
    'User-Agent': ['ReactorNetty/1.2.4'],
    'X-Trace-Id': ['test-trace-id'],
    'X-Trace-Requestid': ['test-request-id'],
    'X-Trace-Sessionid': [sessionId],
    'X-Transaction-Id': ['test-transaction-id']
  };

  // Base Intents 입력값을 위한 별도 상태 추가
  const [rawIntentsInput, setRawIntentsInput] = useState('');

  return (
    <Box
      id="test-panel-container"
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex', 
        flexDirection: 'column', 
        p: 2,
        overflow: 'hidden !important',
        boxSizing: 'border-box'
      }}
    >
      {/* 헤더 영역 - 완전 고정 */}
      <Box 
        sx={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between', 
          mb: 2,
          height: '48px',
          minHeight: '48px',
          maxHeight: '48px',
          flexShrink: 0
        }}
      >
        <Typography variant="h6">
          테스트 패널
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <Chip
            label={isConnected ? '연결됨' : '연결 끊김'}
            color={isConnected ? 'success' : 'error'}
            size="small"
          />
          {currentState && (
            <Chip
              label={`현재 상태: ${currentState}`}
              color="primary"
              size="small"
            />
          )}
          {isWebhookState() && (
            <Chip
              label="Webhook 대기중"
              color="warning"
              size="small"
            />
          )}
          {isEventState() && (
            <Chip
              label="이벤트 대기중"
              color="info"
              size="small"
            />
          )}
          {isApiCallState() && (
            <Chip
              label="API Call 실행"
              color="success"
              size="small"
            />
          )}
          {isIntentState() && (
            <Chip
              label="사용자 입력 대기"
              color="primary"
              size="small"
            />
          )}
          <Button onClick={handleReset} size="small" variant="outlined">
            초기화
          </Button>
          <Button 
            onClick={checkAutoTransition} 
            size="small" 
            variant="outlined"
            color="secondary"
            disabled
            title="백엔드에서 자동 처리됨"
          >
            자동전이 확인 (불필요)
          </Button>
        </Box>
      </Box>

      {/* 탭 영역 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
          <Tab label="시나리오 테스트" />
          <Tab label={`NLU 관리 ${nluConnected ? '🟢' : '🔴'}`} />
          <Tab label="외부 연동 관리" />
        </Tabs>
      </Box>

      {/* 탭 콘텐츠 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {currentTab === 0 && (
          // 시나리오 테스트 탭
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 1.5,
            minHeight: 0,
            height: '100%',
            overflow: 'auto',
            pb: 4
          }}>
            {!scenario && (
              <Alert 
                severity="info" 
                sx={{ 
                  mb: 2,
                  height: 'auto',
                  minHeight: '48px',
                  flexShrink: 0
                }}
              >
                시나리오를 먼저 로드해주세요.
              </Alert>
            )}

            {scenario && (
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column',
                height: '100%',
                overflow: 'visible'
              }}>
                {/* Webhook 상태일 때 정보 표시 */}
                {isWebhookState() && (
                  <Box sx={{ 
                    mb: 1, 
                    height: 'auto',
                    minHeight: '70px',
                    maxHeight: '100px',
                    flexShrink: 0
                  }}>
                    <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                      🔗 Webhook 상태 (자동 처리):
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
                      {getWebhookActions().map((action, index) => (
                        <Box 
                          key={`${currentState}-${action.name}-${index}`}
                          sx={{ 
                            p: 1, 
                            border: '1px solid', 
                            borderColor: 'warning.light',
                            borderRadius: 1,
                            bgcolor: 'warning.lighter',
                            fontSize: '0.75rem'
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'warning.dark' }}>
                            {action.name}
                          </Typography>
                          <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                            자동으로 실행됩니다
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                    <Divider />
                  </Box>
                )}

                {/* 이벤트 상태일 때 빠른 이벤트 트리거 버튼들 */}
                {isEventState() && (
                  <Box sx={{ 
                    mb: 1, 
                    height: 'auto',
                    minHeight: '70px',
                    maxHeight: '100px',
                    flexShrink: 0
                  }}>
                    <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                      이벤트 트리거 (현재 상태: {currentState}):
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      {getEventHandlers().map((handler, index) => {
                        // event 필드 안전하게 처리
                        let eventType = 'Unknown';
                        if (handler.event) {
                          if (typeof handler.event === 'object' && handler.event.type) {
                            eventType = handler.event.type;
                          } else if (typeof handler.event === 'string') {
                            eventType = handler.event;
                          }
                        }
                        
                        return (
                          <Button
                            key={`${currentState}-${eventType}-${index}`}
                            size="small"
                            variant="contained"
                            color="info"
                            onClick={() => handleEventTrigger(eventType)}
                            sx={{ fontSize: '0.75rem' }}
                          >
                            {eventType}
                          </Button>
                        );
                      })}
                    </Box>
                    <Divider />
                  </Box>
                )}

                {/* API Call 상태일 때 정보 표시 */}
                {isApiCallState() && (
                  <Box sx={{ 
                    mb: 1, 
                    height: 'auto',
                    minHeight: '70px',
                    maxHeight: '120px',
                    flexShrink: 0
                  }}>
                    <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                      API Call 핸들러 (현재 상태: {currentState}):
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 1 }}>
                      {getApiCallHandlers().map((handler, index) => {
                        let apicall = null;
        if (scenario && scenario.webhooks && handler.name) {
          const apicallLike = (scenario.webhooks as any[]).find(w => w.type === 'apicall' && w.name === handler.name);
          if (apicallLike) {
            apicall = {
              url: apicallLike.url,
              formats: apicallLike.formats || { method: 'POST' }
            } as any;
          }
                        }
                        const url = apicall?.url || 'Unknown URL';
                        const method = apicall?.formats?.method || 'POST';
                        return (
                          <Box 
                            key={`${currentState}-${handler.name}-${index}`}
                            sx={{ 
                              p: 1, 
                              border: '1px solid', 
                              borderColor: 'success.light',
                              borderRadius: 1,
                              bgcolor: 'success.lighter',
                              fontSize: '0.75rem'
                            }}
                          >
                            <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'success.dark' }}>
                              {handler.name}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', color: 'text.secondary' }}>
                              {method} {url}
                            </Typography>
                          </Box>
                        );
                      })}
                    </Box>
                    <Divider />
                  </Box>
                )}

                {/* Intent 상태일 때 빠른 입력 제안 */}
                {isIntentState() && (
                  <Box sx={{ 
                    mb: 1, 
                    height: 'auto',
                    minHeight: '70px',
                    maxHeight: '100px',
                    flexShrink: 0
                  }}>
                    <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                      Intent 핸들러 (현재 상태: {currentState}) - 사용자 입력을 기다리고 있습니다:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      {getIntentHandlers().map((handler, index) => {
                        const intent = handler.intent || 'Unknown';
                        const targetState = handler.transitionTarget?.dialogState || 'Unknown';
                        
                        // Intent에 따른 샘플 입력 제안
                        let sampleInput = '';
                        if (intent === '__ANY_INTENT__') {
                          sampleInput = '아무거나 입력';
                        } else if (intent === 'Weather.Inform') {
                          sampleInput = '날씨';
                        } else if (intent === 'say.yes') {
                          sampleInput = '네';
                        } else if (intent === 'say.no') {
                          sampleInput = '아니요';
                        } else if (intent === 'Positive') {
                          sampleInput = '긍정';
                        } else {
                          sampleInput = intent;
                        }
                        
                        return (
                          <Button
                            key={`${currentState}-${intent}-${index}`}
                            size="small"
                            variant="outlined"
                            color="primary"
                            onClick={() => handleQuickInput(sampleInput)}
                            sx={{ fontSize: '0.75rem' }}
                            title={`${intent} → ${targetState}`}
                          >
                            {sampleInput}
                          </Button>
                        );
                      })}
                    </Box>
                    <Divider />
                  </Box>
                )}

                {/* 메시지 목록 - 강력한 크기 제한 */}
                <Paper
                  sx={{
                    flex: 1,
                    minHeight: 300,
                    mb: 2,
                    bgcolor: '#fafafa',
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: 'divider'
                  }}
                >
                    <List 
                      dense 
                      sx={{ 
                        flex: 1,
                        minHeight: 0,
                        overflow: 'auto !important',
                        padding: 0,
                        margin: 0,
                        '& .MuiListItem-root': {
                          borderBottom: '1px solid #f0f0f0',
                          '&:last-child': {
                            borderBottom: 'none'
                          }
                        }
                      }}
                    >
                      {messages.length === 0 ? (
                        <ListItem>
                          <ListItemText
                            primary="테스트를 시작하려면 메시지를 입력하세요."
                            sx={{
                              '& .MuiListItemText-primary': {
                                fontSize: '0.9rem',
                                color: '#666',
                                fontStyle: 'italic',
                                textAlign: 'center'
                              }
                            }}
                          />
                        </ListItem>
                      ) : (
                        messages.map((message, index) => (
                          <ListItem key={index} sx={{ py: 1 }}>
                            <ListItemText
                              primary={message.content}
                              secondary={message.timestamp.toLocaleTimeString()}
                              sx={{
                                '& .MuiListItemText-primary': {
                                  fontSize: '0.9rem',
                                  color: message.type === 'user' ? '#1976d2' : 
                                         message.type === 'transition' ? '#ed6c02' : 
                                         message.type === 'info' ? '#9c27b0' : '#333',
                                  fontWeight: message.type === 'transition' ? 'bold' : 'normal',
                                  whiteSpace: 'pre-line',
                                  wordBreak: 'break-word'
                                },
                                '& .MuiListItemText-secondary': {
                                  fontSize: '0.7rem',
                                },
                              }}
                            />
                          </ListItem>
                        ))
                      )}
                      {/* 스크롤 타겟 - 새 메시지가 추가될 때 이 위치로 스크롤됨 */}
                      <div ref={messagesEndRef} />
                    </List>
                  </Paper>

                {!isWebhookState() ? (
                  <>
                    {/* Input Type Selector */}
                    <Paper sx={{ p: 2, mt: 1, flexShrink: 0, bgcolor: 'background.default', borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
                      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                        📨 Input Format 설정
                      </Typography>
                      
                      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <FormControl sx={{ minWidth: 120 }}>
                          <InputLabel size="small">Input Type</InputLabel>
                          <Select
                            size="small"
                            value={inputType}
                            label="Input Type"
                            onChange={(e) => setInputType(e.target.value as 'text' | 'customEvent')}
                          >
                            <MenuItem value="text">Text</MenuItem>
                            <MenuItem value="customEvent">Custom Event</MenuItem>
                          </Select>
                        </FormControl>

                        {inputType === 'customEvent' && (
                          <TextField
                            size="small"
                            label="Event Type"
                            value={eventType}
                            onChange={(e) => setEventType(e.target.value)}
                            placeholder="USER_DIALOG_START"
                            sx={{ minWidth: 180 }}
                          />
                        )}

                        {inputType === 'text' && (
                          <>
                            <TextField
                              size="small"
                              label="Intent (선택사항)"
                              value={intentValue}
                              onChange={(e) => setIntentValue(e.target.value)}
                              placeholder="Weather.Inform"
                              sx={{ minWidth: 150 }}
                            />
                            <TextField
                              size="small"
                              label="Confidence"
                              type="number"
                              value={confidenceScore}
                              onChange={(e) => setConfidenceScore(parseFloat(e.target.value) || 0)}
                              inputProps={{ min: 0, max: 1, step: 0.01 }}
                              sx={{ width: 100 }}
                            />
                          </>
                        )}

                        <Tooltip title="생성될 JSON format 미리보기">
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              const preview = createUserInput();
                              console.log('📄 UserInput Preview:', JSON.stringify(preview, null, 2));
                              alert('콘솔에서 생성될 JSON format을 확인하세요!');
                            }}
                          >
                            👁️
                          </IconButton>
                        </Tooltip>

                        {/* JSON 입력 모드 토글 */}
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, ml: 2 }}>
                          <Typography variant="body2" sx={{ fontSize: '0.875rem', fontWeight: 500 }}>
                            📝 JSON 입력 모드
                          </Typography>
                          <Switch
                            checked={useJsonInputMode}
                            onChange={(e) => setUseJsonInputMode(e.target.checked)}
                            size="small"
                            color="primary"
                          />
                        </Box>

                        {useJsonInputMode && (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, minWidth: 200 }}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                              JSON 형태의 전체 요청을 입력하세요
                            </Typography>
                            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                              NLU 결과가 포함된 요청을 직접 전송합니다
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Paper>
                    {/* Entities 관리 (Text 타입일 때만 표시) */}
                    {inputType === 'text' && (
                      <Paper sx={{ p: 2, mt: 1, flexShrink: 0, bgcolor: 'background.default', borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                            🏷️ Entities 설정 ({entities.length}개)
                          </Typography>
                          <Button
                            size="small"
                            startIcon={<AddIcon />}
                            onClick={addEntity}
                            variant="outlined"
                            sx={{ fontSize: '0.75rem' }}
                          >
                            Entity 추가
                          </Button>
                        </Box>
                        
                        {entities.length === 0 ? (
                          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', textAlign: 'center', py: 2 }}>
                            Entities가 없습니다. "Entity 추가" 버튼을 클릭하여 추가하세요.
                          </Typography>
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, maxHeight: 200, overflow: 'auto' }}>
                            {entities.map((entity) => (
                              <Paper key={entity.id} sx={{ p: 2, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                                <Grid container spacing={1} alignItems="center">
                                  <Grid item xs={2}>
                                    <TextField
                                      size="small"
                                      label="Role"
                                      value={entity.role}
                                      onChange={(e) => updateEntity(entity.id, 'role', e.target.value)}
                                      placeholder="CITY"
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid item xs={2}>
                                    <TextField
                                      size="small"
                                      label="Type"
                                      value={entity.type}
                                      onChange={(e) => updateEntity(entity.id, 'type', e.target.value)}
                                      placeholder="CITY"
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid item xs={2}>
                                    <TextField
                                      size="small"
                                      label="Text"
                                      value={entity.text}
                                      onChange={(e) => updateEntity(entity.id, 'text', e.target.value)}
                                      placeholder="서울"
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid item xs={2}>
                                    <TextField
                                      size="small"
                                      label="Normalization"
                                      value={entity.normalization || ''}
                                      onChange={(e) => updateEntity(entity.id, 'normalization', e.target.value)}
                                      placeholder="W.0"
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid item xs={3}>
                                    <TextField
                                      size="small"
                                      label="Type KR"
                                      value={entity.extraTypeKr || ''}
                                      onChange={(e) => updateEntity(entity.id, 'extraTypeKr', e.target.value)}
                                      placeholder="CITY"
                                      fullWidth
                                    />
                                  </Grid>
                                  <Grid item xs={1}>
                                    <IconButton
                                      size="small"
                                      onClick={() => removeEntity(entity.id)}
                                      color="error"
                                      sx={{ ml: 1 }}
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Grid>
                                </Grid>
                              </Paper>
                            ))}
                          </Box>
                        )}
                        
                        {/* 샘플 Entity 추가 버튼들 */}
                        <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
                          <Typography variant="caption" sx={{ display: 'block', mb: 1, color: 'text.secondary' }}>
                            빠른 샘플 추가:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                            <Chip
                              label="날씨 - 시간"
                              variant="outlined"
                              size="small"
                              clickable
                              onClick={() => {
                                const newEntity: EntityInput = {
                                  id: `entity-${Date.now()}-${Math.random()}`,
                                  role: 'BID_DT_WEEK',
                                  type: 'BID_DT_WEEK',
                                  text: '이번 주',
                                  normalization: 'W.0',
                                  extraTypeKr: 'BID_DT_WEEK.W.0'
                                };
                                setEntities(prev => [...prev, newEntity]);
                              }}
                              sx={{ fontSize: '0.7rem' }}
                            />
                            <Chip
                              label="날씨 - 도시"
                              variant="outlined"
                              size="small"
                              clickable
                              onClick={() => {
                                const newEntity: EntityInput = {
                                  id: `entity-${Date.now()}-${Math.random()}`,
                                  role: 'CITY',
                                  type: 'CITY',
                                  text: '서울',
                                  normalization: '',
                                  extraTypeKr: 'CITY'
                                };
                                setEntities(prev => [...prev, newEntity]);
                              }}
                              sx={{ fontSize: '0.7rem' }}
                            />
                          </Box>
                        </Box>
                      </Paper>
                    )}

                    {/* 입력 영역 - 완전 고정 */}
                    <Box sx={{ 
                      display: 'flex', 
                      gap: 2, 
                      height: '60px',
                      minHeight: '60px',
                      maxHeight: '60px',
                      flexShrink: 0,
                      alignItems: 'center',
                      mt: 2,
                      p: 1,
                      bgcolor: 'background.paper',
                      borderTop: '2px solid',
                      borderColor: 'primary.main',
                      borderRadius: '8px 8px 0 0',
                      boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
                      position: 'relative',
                      zIndex: 10, // 다른 요소들보다 위에 표시
                      width: '100%' // 전체 너비 사용
                    }}>
                      <TextField
                        fullWidth
                        multiline={useJsonInputMode}
                        rows={useJsonInputMode ? 8 : undefined}
                        placeholder={
                          useJsonInputMode 
                            ? `JSON 형태의 전체 요청을 입력하세요...\n\n예시:\n{\n  "userId": "user-123",\n  "botId": "1370",\n  "botVersion": "5916",\n  "botName": "나단도움봇_테스트",\n  "botResourcePath": "1370-5916.json",\n  "sessionId": "chat-41949057-072e-413d-b42c-d3d4242056a8",\n  "requestId": "chatbot-uuid",\n  "userInput": {\n    "type": "text",\n    "content": {\n      "text": "아들 계좌를 하나 만들고 싶어요.",\n      "nluResult": {\n        "type": "skt.opennlu",\n        "results": [\n          {\n            "nluNbest": [],\n            "text": "아들 계좌를 하나 만들고 싶어요",\n            "extra": {}\n          }\n        ]\n      },\n      "value": {\n        "scope": null,\n        "type": "text",\n        "value": {},\n        "version": "1.0"\n      }\n    }\n  },\n  "context": { ... },\n  "headers": { ... },\n  "currentState": "Start",\n  "scenario": { ... }\n}`
                            : inputType === 'customEvent' 
                              ? `Event가 전송됩니다: ${eventType}`
                              : isWebhookState() 
                                ? "Webhook 상태 - 자동으로 처리됩니다" 
                                : "메시지를 입력하세요..."
                        }
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={handleKeyDown}
                        disabled={!isConnected || inputType === 'customEvent'}
                        variant="outlined"
                        sx={{
                          '& .MuiOutlinedInput-root': {
                            height: useJsonInputMode ? 'auto' : '44px',
                            minHeight: useJsonInputMode ? '200px' : '44px',
                            alignItems: useJsonInputMode ? 'flex-start' : 'center',
                            bgcolor: inputType === 'customEvent' ? 'action.disabledBackground' : 'background.paper'
                          },
                          '& .MuiOutlinedInput-input': {
                            padding: useJsonInputMode ? '12px 14px' : '10px 14px'
                          }
                        }}
                      />
                      <Button
                        variant="contained"
                        onClick={handleSendMessage}
                        disabled={
                          !isConnected || 
                          (inputType === 'text' && !inputText.trim()) ||
                          (inputType === 'customEvent' && !eventType.trim())
                        }
                        sx={{ 
                          flexShrink: 0,
                          minWidth: '120px',
                          height: '44px',
                          fontSize: '0.9rem',
                          fontWeight: 'bold'
                        }}
                      >
                        {useJsonInputMode ? 'JSON 전송' : inputType === 'customEvent' ? 'Event 전송' : isWebhookState() ? '웹훅 실행' : '전송'}
                      </Button>
                    </Box>
                    
                    {/* JSON 입력 모드 도움말 */}
                    {useJsonInputMode && (
                      <Box sx={{ mt: 1, p: 1, bgcolor: 'info.main', color: 'info.contrastText', borderRadius: 1 }}>
                        <Typography variant="caption" sx={{ fontSize: '0.75rem' }}>
                          💡 <strong>JSON 입력 모드:</strong> Ctrl+Enter로 전송 | 일반 Enter는 줄바꿈
                        </Typography>
                      </Box>
                    )}
                  </>
                ) : (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Webhook 상태입니다. 입력 없이 자동으로 처리됩니다.
                  </Alert>
                )}
              </Box>
            )}
          </Box>
        )}

        {currentTab === 1 && (
          // NLU 관리 탭
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            gap: 2,
            minHeight: 0,
            height: '100%',
            overflow: 'auto',
            pb: 4
          }}>
            {/* NLU 연결 상태 */}
            <Alert 
              severity={nluConnected ? "success" : "error"} 
              sx={{ mb: 2 }}
            >
              {nluConnected 
                ? "✅ NLU 서버 연결됨 (http://localhost:8001)" 
                : "❌ NLU 서버 연결 실패 - 서버를 시작해주세요 (./start_nlu.sh)"
              }
            </Alert>

            {nluConnected && (
              <>
                {/* 학습 발화 관리 섹션 */}
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" sx={{ mb: 2 }}>
                    📚 학습 발화 관리
                  </Typography>
                  
                  {/* 새 발화 추가 */}
                  <Box sx={{ mb: 3, p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
                    <Typography variant="subtitle1" sx={{ mb: 2 }}>새 발화 추가</Typography>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={6}>
                        <TextField
                          fullWidth
                          label="발화 텍스트"
                          value={nluNewUtterance.text}
                          onChange={(e) => setNluNewUtterance(prev => ({ ...prev, text: e.target.value, entities: [] }))}
                          placeholder="서울 날씨가 어때?"
                        />
                        
                        {/* 텍스트 선택 영역 */}
                        {nluNewUtterance.text && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                              👆 텍스트를 드래그하여 Entity 선택:
                            </Typography>
                            <Box
                              sx={{
                                p: 2,
                                border: '1px solid #ddd',
                                borderRadius: 1,
                                bgcolor: '#f9f9f9',
                                cursor: 'text',
                                userSelect: 'text',
                                fontSize: '1.1em',
                                lineHeight: 1.5
                              }}
                              onMouseUp={handleTextSelection}
                            >
                              {renderTextWithEntities(nluNewUtterance.text, nluNewUtterance.entities)}
                            </Box>
                          </Box>
                        )}

                        {/* Entity 목록 */}
                        {nluNewUtterance.entities.length > 0 && (
                          <Box sx={{ mt: 2 }}>
                            <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                              📍 추출된 Entities:
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {nluNewUtterance.entities.map((entity: any, index: number) => (
                                <Chip
                                  key={index}
                                  label={`${entity.entity_type}: ${entity.value}`}
                                  onDelete={() => removeEntityFromUtterance(index)}
                                  size="small"
                                  color="primary"
                                  variant="outlined"
                                />
                              ))}
                            </Box>
                          </Box>
                        )}
                      </Grid>
                      <Grid item xs={4}>
                        {!nluNewIntentMode ? (
                          <FormControl fullWidth>
                            <InputLabel>Intent</InputLabel>
                            <Select
                              value={nluNewUtterance.intent}
                              label="Intent"
                              onChange={(e) => {
                                if (e.target.value === 'NEW_INTENT') {
                                  setNluNewIntentMode(true);
                                  setNluNewUtterance(prev => ({ ...prev, intent: '' }));
                                } else {
                                  setNluNewUtterance(prev => ({ ...prev, intent: e.target.value }));
                                }
                              }}
                            >
                              {nluIntents.map(intent => (
                                <MenuItem key={intent} value={intent}>{intent}</MenuItem>
                              ))}
                              <MenuItem value="NEW_INTENT">-- 새 Intent 입력 --</MenuItem>
                            </Select>
                          </FormControl>
                        ) : (
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <TextField
                              fullWidth
                              label="새 Intent 이름"
                              value={nluNewUtterance.intent}
                              onChange={(e) => setNluNewUtterance(prev => ({ ...prev, intent: e.target.value }))}
                              placeholder="예: Weather.Inform"
                              autoFocus
                            />
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <Button 
                                size="small" 
                                variant="outlined"
                                onClick={() => {
                                  setNluNewIntentMode(false);
                                  setNluNewUtterance(prev => ({ ...prev, intent: '' }));
                                }}
                              >
                                취소
                              </Button>
                              <Button 
                                size="small" 
                                variant="contained"
                                disabled={!nluNewUtterance.intent.trim()}
                                onClick={() => {
                                  setNluNewIntentMode(false);
                                  // Intent는 이미 입력되어 있으므로 그대로 유지
                                }}
                              >
                                확인
                              </Button>
                            </Box>
                          </Box>
                        )}
                      </Grid>
                      <Grid item xs={2}>
                        <Button
                          variant="contained"
                          fullWidth
                          sx={{ height: '56px' }}
                          disabled={!nluNewUtterance.text || !nluNewUtterance.intent}
                          onClick={async () => {
                            try {
                              await createNluUtterance(nluNewUtterance);
                              setNluNewUtterance({ text: '', intent: '', entities: [] });
                              setNluNewIntentMode(false);
                            } catch (error) {
                              console.error('발화 추가 실패:', error);
                            }
                          }}
                        >
                          추가
                        </Button>
                      </Grid>
                    </Grid>
                  </Box>

                  {/* 발화 목록 */}
                  <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      등록된 발화 ({nluUtterances.length}개)
                    </Typography>
                    {nluUtterances.length === 0 ? (
                      <Box sx={{ 
                        p: 2, 
                        textAlign: 'center', 
                        color: 'text.secondary',
                        border: '1px dashed #ccc',
                        borderRadius: 1
                      }}>
                        등록된 발화가 없습니다. 첫 번째 발화를 추가해보세요!
                      </Box>
                    ) : (
                      <List>
                        {nluUtterances.map((utterance, index) => (
                          <ListItem key={utterance.id || index} sx={{ 
                            border: '1px solid #eee', 
                            borderRadius: 1, 
                            mb: 1 
                          }}>
                            <ListItemText
                              primary={
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <Typography variant="body1">{utterance.text}</Typography>
                                  <Box sx={{ display: 'flex', gap: 1 }}>
                                    <Chip 
                                      label={utterance.intent} 
                                      size="small" 
                                      color="primary" 
                                      variant="outlined"
                                    />
                                    {utterance.entities.length > 0 && (
                                      <Chip 
                                        label={`${utterance.entities.length} entities`} 
                                        size="small" 
                                        color="secondary" 
                                        variant="outlined"
                                      />
                                    )}
                                    <IconButton
                                      size="small"
                                      onClick={() => utterance.id && deleteNluUtterance(utterance.id)}
                                      color="error"
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Box>
                                </Box>
                              }
                              secondary={
                                utterance.entities.length > 0 ? (
                                  <Box sx={{ mt: 1 }}>
                                    {utterance.entities.map((entity: any, idx: number) => (
                                      <Chip
                                        key={idx}
                                        label={`${entity.entity_type}: ${entity.value}`}
                                        size="small"
                                        sx={{ mr: 0.5, mb: 0.5 }}
                                      />
                                    ))}
                                  </Box>
                                ) : null
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                </Paper>



                {/* Intent Mapping 관리 섹션 */}
                <Paper sx={{ p: 2 }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    🔗 Intent Mapping 관리 (DM Intent)
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                    Base Intent를 Dialog State별 조건에 따라 DM Intent로 매핑합니다. 저장 시 시나리오에 자동 반영됩니다.
                  </Typography>
                  
                  {/* 새 IntentMapping 추가 */}
                  <Box sx={{ mb: 3, p: 2, border: '1px dashed #ccc', borderRadius: 1 }}>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>새 Intent Mapping 추가</Typography>
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                      특정 상태에서 Base Intent가 조건을 만족할 때 DM Intent로 변환됩니다.
                    </Typography>
                    
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                      <Grid item xs={3}>
                        <TextField
                          fullWidth
                          label="시나리오"
                          value={newIntentMapping.scenario}
                          onChange={(e) => setNewIntentMapping(prev => ({ ...prev, scenario: e.target.value }))}
                          placeholder="Main"
                          helperText="시나리오 이름"
                        />
                      </Grid>
                      <Grid item xs={3}>
                        <FormControl fullWidth>
                          <InputLabel>Dialog State</InputLabel>
                          <Select
                            value={newIntentMapping.dialogState}
                            label="Dialog State"
                            onChange={(e) => setNewIntentMapping(prev => ({ ...prev, dialogState: e.target.value }))}
                          >
                            {getDialogStatesFromScenario().map(state => (
                              <MenuItem key={state} value={state}>{state}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={3}>
                        <TextField
                          fullWidth
                          label="DM Intent"
                          value={newIntentMapping.dmIntent}
                          onChange={(e) => setNewIntentMapping(prev => ({ ...prev, dmIntent: e.target.value }))}
                          placeholder="Positive"
                          helperText="변환될 Intent"
                        />
                      </Grid>
                      <Grid item xs={3}>
                        <TextField
                          fullWidth
                          label="Base Intents (쉼표 구분)"
                          value={rawIntentsInput}
                          onChange={(e) => setRawIntentsInput(e.target.value)}
                          placeholder="say.yes, say.no"
                          helperText="매핑 대상 Intent들"
                          inputProps={{ inputMode: 'text', autoComplete: 'off' }}
                        />
                      </Grid>
                    </Grid>
                    
                    <TextField
                      fullWidth
                      label="조건문 (메모리 변수 조건)"
                      value={newIntentMapping.conditionStatement}
                      onChange={(e) => setNewIntentMapping(prev => ({ ...prev, conditionStatement: e.target.value }))}
                      placeholder='{$negInterSentence} == "True"'
                      helperText='예: {$variable} == "value" 또는 {key} == "value"'
                      sx={{ mb: 2 }}
                    />
                    
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <Button
                        variant="contained"
                        onClick={async () => {
                          const intents = rawIntentsInput.split(',').map(s => s.trim()).filter(s => s);
                          await saveIntentMappingToScenario({
                            ...newIntentMapping,
                            intents,
                          });
                          setRawIntentsInput('');
                          setNewIntentMapping({
                            scenario: 'Main',
                            dialogState: '',
                            intents: [],
                            conditionStatement: '',
                            dmIntent: ''
                          });
                        }}
                        disabled={!newIntentMapping.dialogState || !newIntentMapping.dmIntent || rawIntentsInput.trim().length === 0}
                      >
                        매핑 추가
                      </Button>
                      
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setNewIntentMapping({
                            scenario: 'Main',
                            dialogState: 'slot_filled_response',
                            intents: ['say.yes', 'say.no'],
                            conditionStatement: '{$negInterSentence} == "True"',
                            dmIntent: 'Positive'
                          });
                          setRawIntentsInput('say.yes, say.no');
                        }}
                      >
                        예시 로드
                      </Button>
                    </Box>
                  </Box>

                  {/* Intent Mapping 목록 */}
                  <Box>
                    <Typography variant="subtitle1" sx={{ mb: 1 }}>
                      등록된 Intent Mappings ({intentMappings.length}개)
                    </Typography>
                    <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
                      시나리오 테스트 시 이 규칙들이 자동으로 적용됩니다.
                    </Typography>
                    {intentMappings.length === 0 ? (
                      <Box sx={{ 
                        p: 3, 
                        textAlign: 'center', 
                        color: 'text.secondary',
                        border: '1px dashed #ccc',
                        borderRadius: 1
                      }}>
                        <Typography>등록된 Intent Mapping이 없습니다.</Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                          "예시 로드" 버튼을 클릭하여 샘플 매핑을 추가해보세요.
                        </Typography>
                      </Box>
                    ) : (
                      <List>
                        {intentMappings.map((mapping, index) => (
                          <ListItem key={index} sx={{ 
                            border: '1px solid #eee', 
                            borderRadius: 1, 
                            mb: 1,
                            flexDirection: 'column',
                            alignItems: 'stretch'
                          }}>
                            <Box sx={{ width: '100%' }}>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                  {mapping.dialogState} → {mapping.dmIntent}
                                </Typography>
                                <Box sx={{ display: 'flex', gap: 1 }}>
                                  <Chip label={mapping.scenario} size="small" color="secondary" />
                                  <Button
                                    size="small"
                                    color="error"
                                    variant="outlined"
                                    onClick={() => deleteIntentMapping(mapping)}
                                  >
                                    삭제
                                  </Button>
                                </Box>
                              </Box>
                              
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
                                <Typography variant="body2" sx={{ fontWeight: 'bold', mr: 1 }}>
                                  Base Intents:
                                </Typography>
                                {mapping.intents.map((intent, idx) => (
                                  <Chip key={idx} label={intent} size="small" variant="outlined" />
                                ))}
                              </Box>
                              
                              {mapping.conditionStatement && (
                                <Box sx={{ 
                                  p: 1, 
                                  backgroundColor: 'grey.50', 
                                  borderRadius: 1,
                                  border: '1px solid',
                                  borderColor: 'grey.300'
                                }}>
                                  <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                                    조건문:
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                                    {mapping.conditionStatement}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Box>
                </Paper>
              </>
            )}
          </Box>
        )}

        {currentTab === 2 && (
          // 외부 연동 관리 탭
          <Box sx={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            minHeight: 0,
            height: '100%',
            overflow: 'auto'
          }}>
            <ExternalIntegrationManager 
              scenario={scenario}
              onScenarioUpdate={onScenarioUpdate || (() => {})}
            />
          </Box>
        )}
      </Box>

      {/* 전체화면 API 응답 모달 */}
      <Dialog
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        maxWidth={false}
        fullWidth
        PaperProps={{
          sx: {
            width: '95vw',
            height: '90vh',
            maxWidth: 'none',
            maxHeight: 'none',
            m: 1,
          }
        }}
      >
        <DialogTitle sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          pb: 1
        }}>
          <Box>
            <Typography variant="h5" component="span">
              API 응답 (전체화면)
            </Typography>
            {apiTestResponse && (
              <>
                {apiTestResponse.error && (
                  <Chip label="오류" color="error" size="small" sx={{ ml: 2 }} />
                )}
                {!apiTestResponse.error && (
                  <Chip 
                    label={`${apiTestResponse.status}`} 
                    color="success" 
                    size="small" 
                    sx={{ ml: 2 }} 
                  />
                )}
              </>
            )}
          </Box>
          <IconButton onClick={() => setFullscreenOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        
        <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
          <Box sx={{ px: 3, py: 1, bgcolor: '#f5f5f5', borderBottom: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle1" sx={{ color: 'text.secondary' }}>
              응답 데이터: (🔗 아이콘 클릭하여 JSONPath 복사)
            </Typography>
          </Box>
          
          <Box 
            sx={{ 
              flex: 1,
              overflow: 'auto',
              p: 3,
              bgcolor: '#fafafa'
            }}
          >
            {apiTestResponse && (
              <>
                {apiTestResponse.error ? (
                  <Box>
                    <Typography color="error" sx={{ mb: 2, fontSize: '1.1rem' }}>
                      {apiTestResponse.message}
                    </Typography>
                    {apiTestResponse.response && (
                      <Box>
                        <Typography variant="h6" sx={{ mt: 3, mb: 2, fontWeight: 'bold' }}>
                          응답 데이터:
                        </Typography>
                        {renderResponseValue(apiTestResponse.response.data)}
                      </Box>
                    )}
                  </Box>
                ) : (
                  <Box>
                    {renderResponseValue(apiTestResponse.data)}
                  </Box>
                )}
              </>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setFullscreenOpen(false)} variant="contained">
            닫기
          </Button>
        </DialogActions>
      </Dialog>

      {/* Entity 추가 모달 */}
      <Dialog
        open={nluEntityModalOpen}
        onClose={() => setNluEntityModalOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Entity 추가
        </DialogTitle>
        <DialogContent>
          {nluSelectedText && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                선택된 텍스트:
              </Typography>
              <Box sx={{ 
                p: 1, 
                bgcolor: '#e3f2fd', 
                borderRadius: 1, 
                border: '1px solid #2196f3',
                fontWeight: 'bold'
              }}>
                "{nluSelectedText.text}"
              </Box>
            </Box>
          )}
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>Entity 타입</InputLabel>
                <Select
                  value={nluNewEntityType}
                  label="Entity 타입"
                  onChange={(e) => setNluNewEntityType(e.target.value)}
                >
                  {nluEntityTypes.map(type => (
                    <MenuItem key={type} value={type}>{type}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {!nluEntityTypes.includes(nluNewEntityType) && (
                <TextField
                  fullWidth
                  size="small"
                  label="새 Entity 타입"
                  value={nluNewEntityType}
                  onChange={(e) => setNluNewEntityType(e.target.value)}
                  placeholder="예: CITY, PERSON"
                  sx={{ mt: 1 }}
                />
              )}
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                label="Role (선택사항)"
                value={nluNewEntityRole}
                onChange={(e) => setNluNewEntityRole(e.target.value)}
                placeholder="기본값: Entity 타입과 동일"
                helperText="비워두면 Entity 타입과 동일하게 설정됩니다"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setNluEntityModalOpen(false)}
            color="inherit"
          >
            취소
          </Button>
          <Button
            onClick={addEntityToUtterance}
            variant="contained"
            disabled={!nluNewEntityType.trim()}
          >
            추가
          </Button>
        </DialogActions>
      </Dialog>

      {/* 프록시 모드 스위치와 endpoint 입력창 추가 */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={proxyMode}
              onChange={(_, checked) => setProxyMode(checked)}
              color="primary"
            />
          }
          label="프록시 모드"
        />
        {proxyMode && (
          <TextField
            size="small"
            label="Proxy Endpoint"
            value={proxyEndpoint}
            onChange={e => setProxyEndpoint(e.target.value)}
            placeholder="http://your-api-endpoint"
            sx={{ minWidth: 320 }}
          />
        )}
      </Box>
    </Box>
  );
};

export default TestPanel; 