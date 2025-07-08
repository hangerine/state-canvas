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
} from '@mui/material';
import { 
  ContentCopy as CopyIcon, 
  Fullscreen as FullscreenIcon,
  Close as CloseIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { Scenario } from '../types/scenario';
import axios from 'axios';

interface TestPanelProps {
  scenario: Scenario | null;
  currentState: string;
  onStateChange: (state: string) => void;
}

interface TestMessage {
  type: 'user' | 'system' | 'transition' | 'info';
  content: string;
  timestamp: Date;
}

const TestPanel: React.FC<TestPanelProps> = ({
  scenario,
  currentState,
  onStateChange,
}) => {
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<TestMessage[]>([]);
  const [sessionId] = useState(() => 'test-session-' + Date.now());
  const [isConnected, setIsConnected] = useState(false);
  const [lastScenarioHash, setLastScenarioHash] = useState<string>('');

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

  // 메시지 스크롤을 위한 ref
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 메시지 목록 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 메시지 추가 (useCallback으로 메모이제이션)
  const addMessage = useCallback((type: TestMessage['type'], content: string) => {
    const newMessage: TestMessage = {
      type,
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  }, []);

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

  // 컴포넌트가 마운트되고 시나리오가 있을 때 자동 전이 확인
  useEffect(() => {
    if (scenario && currentState && isConnected) {
      checkAutoTransition();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, currentState, isConnected]);

  // 현재 상태가 webhook 상태인지 확인
  const isWebhookState = useCallback(() => {
    if (!scenario || !currentState) return false;
    
    const dialogState = scenario.plan[0]?.dialogState.find(
      state => state.name === currentState
    );
    
    return dialogState?.webhookActions && dialogState.webhookActions.length > 0;
  }, [scenario, currentState]);

  // 현재 상태가 이벤트 핸들러를 가지고 있는지 확인
  const getEventHandlers = useCallback(() => {
    if (!scenario || !currentState) return [];
    
    const dialogState = scenario.plan[0]?.dialogState.find(
      state => state.name === currentState
    );
    
    return dialogState?.eventHandlers || [];
  }, [scenario, currentState]);

  // 이벤트 핸들러가 있는 상태인지 확인
  const isEventState = useCallback(() => {
    return getEventHandlers().length > 0;
  }, [getEventHandlers]);

  // 현재 상태가 API Call 핸들러를 가지고 있는지 확인
  const getApiCallHandlers = useCallback(() => {
    if (!scenario || !currentState) return [];
    
    const dialogState = scenario.plan[0]?.dialogState.find(
      state => state.name === currentState
    );
    
    return dialogState?.apicallHandlers || [];
  }, [scenario, currentState]);

  // API Call 핸들러가 있는 상태인지 확인
  const isApiCallState = useCallback(() => {
    return getApiCallHandlers().length > 0;
  }, [getApiCallHandlers]);

  // Webhook 상태일 때 도움말 표시와 이벤트 상태 도움말 표시
  useEffect(() => {
    const webhookState = isWebhookState();
    const eventState = isEventState();
    const apiCallState = isApiCallState();
    
    if (webhookState) {
      addMessage('info', '🔗 Webhook 상태입니다. 다음 중 하나를 입력해보세요:\n- ACT_01_0212\n- ACT_01_0213\n- ACT_01_0235\n- 기타 (fallback으로 sts_router로 이동)');
    } else if (eventState) {
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
      const apiCallNames = apiCallHandlers.map(handler => {
        const url = handler.apicall?.url || 'Unknown URL';
        const method = handler.apicall?.formats?.method || 'POST';
        return `${handler.name} (${method} ${url})`;
      }).join('\n- ');
      addMessage('info', `🔄 API Call 상태입니다. 다음 API들이 자동으로 호출됩니다:\n- ${apiCallNames}`);
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

  // 자동 전이 확인
  const checkAutoTransition = useCallback(async () => {
    if (!scenario || !currentState) return;

    // 현재 상태에 이벤트 핸들러가 있으면 자동 전이하지 않음
    if (isEventState()) {
      console.log(`🎯 상태 ${currentState}에 이벤트 핸들러가 있습니다. 수동 트리거 대기 중...`);
      return;
    }

    // 현재 상태에 API Call 핸들러가 있으면 우선 처리
    if (isApiCallState()) {
      console.log(`🔄 상태 ${currentState}에 API Call 핸들러가 있습니다. API 호출 실행 중...`);
      addMessage('info', '🔄 API Call 핸들러를 감지했습니다. 자동으로 API 호출을 실행합니다...');
    }

    try {
      // 빈 입력으로 자동 전이 확인
      const response = await axios.post('http://localhost:8000/api/process-input', {
        sessionId,
        input: '', // 빈 입력으로 자동 전이만 확인
        currentState,
        scenario: scenario,
      });

      // ApiCall 실행 결과 표시
      if (response.data.intent === 'API_CALL' && response.data.new_state !== currentState) {
        addMessage('system', `✅ API Call 완료: ${response.data.response || 'API 호출이 성공적으로 완료되었습니다.'}`);
      }

      // 자동 전이가 있는 경우 처리
      if (response.data.new_state && response.data.new_state !== currentState) {
        addMessage('transition', `🚀 자동 전이: ${currentState} → ${response.data.new_state}`);
        onStateChange(response.data.new_state);
        
        if (response.data.response && response.data.intent !== 'API_CALL') {
          addMessage('system', response.data.response);
        }
      }

    } catch (error) {
      console.warn('Auto transition check failed:', error);
    }
  }, [scenario, currentState, sessionId, isEventState, isApiCallState, addMessage, onStateChange]);

  // 메시지 추가
  // const addMessage = (type: TestMessage['type'], content: string) => {
  //   const newMessage: TestMessage = {
  //     type,
  //     content,
  //     timestamp: new Date(),
  //   };
  //   setMessages(prev => [...prev, newMessage]);
  // };

  // 사용자 입력 전송
  const handleSendMessage = async () => {
    if (!inputText.trim() || !scenario) return;

    addMessage('user', inputText);

    try {
      // Backend API 호출
      const response = await axios.post('http://localhost:8000/api/process-input', {
        sessionId,
        input: inputText,
        currentState,
        scenario: scenario,
      });

      // API Call 실행 결과 표시
      if (response.data.intent === 'API_CALL') {
        addMessage('system', `🔄 API Call 실행됨: ${response.data.response || 'API 호출이 완료되었습니다.'}`);
      }

      // 응답 처리
      if (response.data.transitions) {
        response.data.transitions.forEach((transition: any) => {
          addMessage('transition', 
            `${transition.fromState} → ${transition.toState} (${transition.reason})`
          );
        });
      }

      if (response.data.new_state) {
        onStateChange(response.data.new_state);
      }

      if (response.data.response && response.data.intent !== 'API_CALL') {
        addMessage('system', response.data.response);
      }

    } catch (error) {
      addMessage('system', '❌ Backend 연결 오류: ' + (error as Error).message);
      console.error('Test API Error:', error);
    }

    setInputText('');
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
        
        // 초기화 후 초기 상태에서 자동 전이 확인 (직접 API 호출)
        setTimeout(async () => {
          if (!scenario) return;
          
          console.log(`🚀 ${initialState} 상태에서 자동 전이 확인 중...`);
          
          // 해당 상태에 이벤트 핸들러가 있는지 확인
          const dialogState = scenario.plan[0]?.dialogState.find(s => s.name === initialState);
          if (dialogState?.eventHandlers && dialogState.eventHandlers.length > 0) {
            console.log(`🎯 상태 ${initialState}에 이벤트 핸들러가 있습니다. 수동 트리거 대기 중...`);
            return;
          }

          try {
            const response = await axios.post('http://localhost:8000/api/process-input', {
              sessionId,
              input: '',
              currentState: initialState,
              scenario: scenario,
            });

            if (response.data.new_state && response.data.new_state !== initialState) {
              console.log(`🎯 자동 전이 발견: ${initialState} → ${response.data.new_state}`);
              addMessage('transition', `🚀 자동 전이: ${initialState} → ${response.data.new_state}`);
              onStateChange(response.data.new_state);
              
              if (response.data.response) {
                addMessage('system', response.data.response);
              }
            } else {
              console.log(`ℹ️ ${initialState} 상태에서 자동 전이 없음`);
            }
          } catch (error) {
            console.warn('Auto transition check failed for state', initialState, error);
          }
        }, 200);
        
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
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  // 이벤트 트리거 함수
  const handleEventTrigger = async (eventType: string) => {
    try {
      addMessage('info', `🎯 이벤트 트리거: ${eventType}`);
      
      // 현재는 Mock으로 처리
      const response = await axios.post('http://localhost:8000/test/trigger-event', {
        sessionId,
        currentState,
        eventType
      });
      
      if (response.data.success) {
        addMessage('system', response.data.message || `이벤트 ${eventType} 처리됨`);
        if (response.data.newState && response.data.newState !== currentState) {
          onStateChange(response.data.newState);
          addMessage('transition', `상태 전이: ${currentState} → ${response.data.newState}`);
        }
      } else {
        addMessage('system', `❌ 이벤트 처리 실패: ${response.data.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      console.log('🎯 이벤트 트리거 Mock 실행 (백엔드 미연결)');
      addMessage('system', `🎯 이벤트 ${eventType} Mock 처리됨 (백엔드 미연결)`);
      
      // Mock 상태 전이 (이벤트에 따른 기본 동작)
      const eventHandlers = getEventHandlers();
      const handler = eventHandlers.find(h => {
        if (h.event) {
          if (typeof h.event === 'object' && h.event.type === eventType) return true;
          if (typeof h.event === 'string' && h.event === eventType) return true;
        }
        return false;
      });
      
      if (handler && handler.transitionTarget.dialogState) {
        onStateChange(handler.transitionTarget.dialogState);
        addMessage('transition', `상태 전이: ${currentState} → ${handler.transitionTarget.dialogState}`);
      }
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
          <Button onClick={handleReset} size="small" variant="outlined">
            초기화
          </Button>
          <Button 
            onClick={checkAutoTransition} 
            size="small" 
            variant="outlined"
            color="secondary"
          >
            자동전이 확인
          </Button>
        </Box>
      </Box>

      {/* 탭 영역 */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)}>
          <Tab label="시나리오 테스트" />
          <Tab label="API 테스트" />
        </Tabs>
      </Box>

      {/* 탭 콘텐츠 */}
      <Box sx={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {currentTab === 0 && (
          // 시나리오 테스트 탭
          <>
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
              <>
                {/* Webhook 상태일 때 빠른 입력 버튼들 */}
                {isWebhookState() && (
                  <Box sx={{ 
                    mb: 1, 
                    height: 'auto',
                    minHeight: '70px',
                    maxHeight: '100px',
                    flexShrink: 0
                  }}>
                    <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>
                      빠른 입력:
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                      {['ACT_01_0212', 'ACT_01_0213', 'ACT_01_0235', 'OTHER'].map((value) => (
                        <Button
                          key={value}
                          size="small"
                          variant="outlined"
                          onClick={() => handleQuickInput(value)}
                          sx={{ fontSize: '0.75rem' }}
                        >
                          {value}
                        </Button>
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
                        const url = handler.apicall?.url || 'Unknown URL';
                        const method = handler.apicall?.formats?.method || 'POST';
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

                {/* 메시지 목록 - 강력한 크기 제한 */}
                <Box
                  sx={{
                    flex: 1,
                    minHeight: 0,
                    mb: 2,
                    position: 'relative',
                    overflow: 'hidden !important'
                  }}
                >
                  <Paper 
                    sx={{ 
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      bgcolor: '#fafafa',
                      display: 'flex',
                      flexDirection: 'column',
                      overflow: 'hidden !important'
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
                </Box>

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
                  mr: 24, // 오른쪽 여백을 더욱 크게 늘려서 테스트모드OFF 버튼과 충분한 간격 확보
                  p: 1,
                  bgcolor: 'background.paper',
                  borderTop: '2px solid',
                  borderColor: 'primary.main',
                  borderRadius: '8px 8px 0 0',
                  boxShadow: '0 -2px 8px rgba(0,0,0,0.1)',
                  position: 'relative',
                  zIndex: 10 // 다른 요소들보다 위에 표시
                }}>
                  <TextField
                    fullWidth
                    placeholder={isWebhookState() ? "Webhook 응답을 입력하세요 (예: ACT_01_0212)" : "메시지를 입력하세요..."}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!isConnected}
                    variant="outlined"
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        height: '44px',
                      }
                    }}
                  />
                  <Button
                    variant="contained"
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || !isConnected}
                    sx={{ 
                      flexShrink: 0,
                      minWidth: '80px',
                      height: '44px',
                      fontSize: '0.9rem'
                    }}
                  >
                    전송
                  </Button>
                </Box>
              </>
            )}
          </>
        )}

        {currentTab === 1 && (
          // API 테스트 탭
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
            {/* API 요청 설정 */}
            <Paper sx={{ 
              p: 2, 
              flexShrink: 0, 
              overflow: 'visible',
              border: '1px solid',
              borderColor: 'divider'
            }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                API 요청 설정
              </Typography>
              
              <Box sx={{ display: 'flex', gap: 1, mb: 2, alignItems: 'center' }}>
                <FormControl sx={{ minWidth: 120 }}>
                  <InputLabel>Method</InputLabel>
                  <Select
                    value={apiTestMethod}
                    label="Method"
                    onChange={(e) => setApiTestMethod(e.target.value as any)}
                  >
                    <MenuItem value="GET">GET</MenuItem>
                    <MenuItem value="POST">POST</MenuItem>
                    <MenuItem value="PUT">PUT</MenuItem>
                    <MenuItem value="DELETE">DELETE</MenuItem>
                    <MenuItem value="PATCH">PATCH</MenuItem>
                  </Select>
                </FormControl>
                
                <TextField
                  label="URL"
                  value={apiTestUrl}
                  onChange={(e) => setApiTestUrl(e.target.value)}
                  placeholder="http://example.com/api/endpoint"
                  sx={{ flex: 1 }}
                />
              </Box>
              
              {/* Headers 설정 */}
              <Box sx={{ mb: 2 }}>
                <Typography variant="subtitle1" sx={{ mb: 1 }}>
                  HTTP Headers
                </Typography>
                
                {/* 기본 헤더 선택 */}
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: 'text.secondary' }}>
                    빠른 헤더 추가:
                  </Typography>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 60, overflow: 'auto' }}>
                    {defaultApiTestHeaderOptions.map((option) => (
                      <Chip
                        key={option.key}
                        label={`${option.key}`}
                        variant="outlined"
                        size="small"
                        clickable
                        onClick={() => addApiTestHeader(option.key, option.value)}
                        sx={{ fontSize: '0.7rem' }}
                      />
                    ))}
                  </Box>
                </Box>

                {/* 현재 헤더 목록 */}
                <Box sx={{ 
                  border: 1, 
                  borderColor: 'divider', 
                  borderRadius: 1, 
                  p: 1, 
                  minHeight: 60, 
                  maxHeight: 150,
                  overflow: 'auto',
                  bgcolor: '#f9f9f9', 
                  mb: 1 
                }}>
                  {Object.entries(apiTestHeaders).length === 0 ? (
                    <Typography variant="caption" color="text.secondary">
                      설정된 헤더가 없습니다. 위의 기본 헤더를 선택하거나 아래에서 커스텀 헤더를 추가하세요.
                    </Typography>
                  ) : (
                    <Grid container spacing={1}>
                      {Object.entries(apiTestHeaders).map(([key, value]) => (
                        <Grid item xs={12} key={key}>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField
                              size="small"
                              label="Key"
                              value={key}
                              onChange={(e) => updateApiTestHeader(key, e.target.value, value)}
                              sx={{ flex: 1 }}
                            />
                            <TextField
                              size="small"
                              label="Value"
                              value={value}
                              onChange={(e) => updateApiTestHeader(key, key, e.target.value)}
                              sx={{ flex: 2 }}
                            />
                            <IconButton
                              size="small"
                              onClick={() => removeApiTestHeader(key)}
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
                <Box sx={{ 
                  display: 'flex', 
                  gap: 1, 
                  alignItems: 'center',
                  bgcolor: '#f5f5f5',
                  p: 1,
                  borderRadius: 1,
                  border: '1px dashed',
                  borderColor: 'divider'
                }}>
                  <Typography variant="caption" sx={{ minWidth: 60, color: 'text.secondary' }}>
                    커스텀:
                  </Typography>
                  <TextField
                    size="small"
                    placeholder="Key"
                    id="custom-header-key"
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    placeholder="Value"
                    id="custom-header-value"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const keyInput = document.getElementById('custom-header-key') as HTMLInputElement;
                        const valueInput = e.target as HTMLInputElement;
                        const key = keyInput?.value.trim() || '';
                        const value = valueInput.value.trim();
                        if (key) {
                          addApiTestHeader(key, value);
                          keyInput.value = '';
                          valueInput.value = '';
                        }
                      }
                    }}
                    sx={{ flex: 1.5 }}
                  />
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      const keyInput = document.getElementById('custom-header-key') as HTMLInputElement;
                      const valueInput = document.getElementById('custom-header-value') as HTMLInputElement;
                      const key = keyInput?.value.trim() || '';
                      const value = valueInput?.value.trim() || '';
                      if (key) {
                        addApiTestHeader(key, value);
                        keyInput.value = '';
                        valueInput.value = '';
                      }
                    }}
                    sx={{ minWidth: 60 }}
                  >
                    추가
                  </Button>
                </Box>
              </Box>

              {/* Request Body 섹션 */}
              {apiTestMethod !== 'GET' && (
                <Box sx={{ mb: 0 }}>
                  <Typography variant="subtitle1" sx={{ mb: 1 }}>
                    Request Body
                  </Typography>
                  <TextField
                    label="Request Body (JSON)"
                    value={apiTestRequestBody}
                    onChange={(e) => setApiTestRequestBody(e.target.value)}
                    multiline
                    rows={3}
                    fullWidth
                    placeholder='{"key": "value"}'
                    sx={{
                      '& .MuiInputBase-root': {
                        fontSize: '0.875rem'
                      }
                    }}
                  />
                </Box>
              )}
            </Paper>

            {/* 전송 버튼 섹션 - Paper 밖으로 이동하여 항상 보이도록 */}
            <Box sx={{ 
              display: 'flex', 
              justifyContent: 'flex-end', 
              p: 1.5,
              bgcolor: '#f5f5f5',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
              flexShrink: 0
            }}>
              <Button
                variant="contained"
                onClick={handleApiTest}
                disabled={apiTestLoading || !apiTestUrl.trim()}
                size="large"
                sx={{ minWidth: 200 }}
              >
                {apiTestLoading ? '전송중...' : 'API 테스트 실행'}
              </Button>
            </Box>

            {/* API 응답 */}
            {apiTestResponse && (
              <Paper 
                sx={{ 
                  flex: 1,
                  minHeight: '400px',
                  display: 'flex',
                  flexDirection: 'column',
                  border: '1px solid',
                  borderColor: 'divider',
                  overflow: 'hidden'
                }}
              >
                  {/* 헤더 영역 */}
                  <Box sx={{ 
                    flexShrink: 0, 
                    p: 2, 
                    pb: 1,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start'
                  }}>
                    <Box>
                      <Typography variant="h6" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                        API 응답
                        {apiTestResponse.error && (
                          <Chip label="오류" color="error" size="small" sx={{ ml: 1 }} />
                        )}
                        {!apiTestResponse.error && (
                          <Chip 
                            label={`${apiTestResponse.status}`} 
                            color="success" 
                            size="small" 
                            sx={{ ml: 1 }} 
                          />
                        )}
                      </Typography>
                      <Typography variant="subtitle2" sx={{ mt: 1, color: 'text.secondary' }}>
                        응답 데이터: (🔗 아이콘 클릭하여 JSONPath 복사)
                      </Typography>
                    </Box>
                    
                    <Tooltip title="전체화면으로 보기">
                      <IconButton
                        onClick={() => setFullscreenOpen(true)}
                        size="small"
                        sx={{ mt: -0.5 }}
                      >
                        <FullscreenIcon />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  
                  {/* 응답 내용 */}
                  <Box 
                    sx={{ 
                      flex: 1,
                      minHeight: 0,
                      overflow: 'auto',
                      mx: 2,
                      mb: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 1,
                      p: 2,
                      bgcolor: '#fafafa'
                    }}
                  >
                    {apiTestResponse.error ? (
                      <Box>
                        <Typography color="error" sx={{ mb: 1 }}>
                          {apiTestResponse.message}
                        </Typography>
                        {apiTestResponse.response && (
                          <Box>
                            <Typography variant="subtitle2" sx={{ mt: 2, mb: 1, fontWeight: 'bold' }}>
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
                  </Box>

                </Paper>
            )}

            {/* API 응답이 없을 때 안내 메시지 */}
            {!apiTestResponse && (
              <Box 
                sx={{ 
                  flex: 1, 
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  p: 2,
                  textAlign: 'center',
                  minHeight: 400,
                  border: '2px dashed',
                  borderColor: 'divider',
                  borderRadius: 2,
                  bgcolor: '#f9f9f9'
                }}
              >
                <Box>
                  <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                    🔧 API 테스트 준비 완료
                  </Typography>
                  <Typography color="text.secondary" sx={{ mb: 2, fontSize: '0.9rem' }}>
                    위에서 설정을 완료한 후 "API 테스트 실행" 버튼을 클릭하세요.
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ 
                    p: 1.5, 
                    bgcolor: '#e3f2fd', 
                    borderRadius: 1,
                    display: 'inline-block',
                    fontSize: '0.8rem'
                  }}>
                    💡 Mock API: <code>http://localhost:8000/mock/nlu</code>
                  </Typography>
                </Box>
              </Box>
            )}
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
    </Box>
  );
};

export default TestPanel; 