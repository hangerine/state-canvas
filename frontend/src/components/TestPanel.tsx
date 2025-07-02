import React, { useState, useEffect } from 'react';
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
} from '@mui/material';
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
  }, [scenario, currentState, isConnected]);

  // 현재 상태가 webhook 상태인지 확인
  const isWebhookState = () => {
    if (!scenario || !currentState) return false;
    
    const dialogState = scenario.plan[0]?.dialogState.find(
      state => state.name === currentState
    );
    
    return dialogState?.webhookActions && dialogState.webhookActions.length > 0;
  };

  // 현재 상태가 이벤트 핸들러를 가지고 있는지 확인
  const getEventHandlers = () => {
    if (!scenario || !currentState) return [];
    
    const dialogState = scenario.plan[0]?.dialogState.find(
      state => state.name === currentState
    );
    
    return dialogState?.eventHandlers || [];
  };

  // 이벤트 핸들러가 있는 상태인지 확인
  const isEventState = () => {
    return getEventHandlers().length > 0;
  };

  // Webhook 상태일 때 도움말 표시
  useEffect(() => {
    if (isWebhookState()) {
      addMessage('info', '🔗 Webhook 상태입니다. 다음 중 하나를 입력해보세요:\n- ACT_01_0212\n- ACT_01_0213\n- ACT_01_0235\n- 기타 (fallback으로 sts_router로 이동)');
    } else if (isEventState()) {
      const eventHandlers = getEventHandlers();
      const eventTypes = eventHandlers.map(handler => handler.event.type).join('\n- ');
      addMessage('info', `🎯 이벤트 상태입니다. 다음 이벤트들을 트리거할 수 있습니다:\n- ${eventTypes}`);
    }
  }, [currentState]);

  // 초기 상태 찾기
  const getInitialState = () => {
    if (!scenario || !scenario.plan || scenario.plan.length === 0) {
      return 'Start';
    }
    
    const dialogStates = scenario.plan[0].dialogState;
    if (!dialogStates || dialogStates.length === 0) {
      return 'Start';
    }
    
    // 명시적으로 "Start" 상태를 찾기
    const startState = dialogStates.find(state => state.name === 'Start');
    if (startState) {
      return 'Start';
    }
    
    // Start가 없으면 첫 번째 상태 사용
    return dialogStates[0].name;
  };

  // 자동 전이 확인
  const checkAutoTransition = async () => {
    if (!scenario || !currentState) return;

    // 현재 상태에 이벤트 핸들러가 있으면 자동 전이하지 않음
    if (isEventState()) {
      console.log(`🎯 상태 ${currentState}에 이벤트 핸들러가 있습니다. 수동 트리거 대기 중...`);
      return;
    }

    try {
      // 빈 입력으로 자동 전이 확인
      const response = await axios.post('http://localhost:8000/api/process-input', {
        sessionId,
        input: '', // 빈 입력으로 자동 전이만 확인
        currentState,
        scenario: scenario,
      });

      // 자동 전이가 있는 경우 처리
      if (response.data.new_state && response.data.new_state !== currentState) {
        addMessage('transition', `🚀 자동 전이: ${currentState} → ${response.data.new_state}`);
        onStateChange(response.data.new_state);
        
        if (response.data.response) {
          addMessage('system', response.data.response);
        }
      }

    } catch (error) {
      console.warn('Auto transition check failed:', error);
    }
  };

  // 메시지 추가
  const addMessage = (type: TestMessage['type'], content: string) => {
    const newMessage: TestMessage = {
      type,
      content,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, newMessage]);
  };

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

      if (response.data.response) {
        addMessage('system', response.data.response);
      }

    } catch (error) {
      addMessage('system', '❌ Backend 연결 오류: ' + (error as Error).message);
      console.error('Test API Error:', error);
    }

    setInputText('');
  };

  // 테스트 초기화 (개선된 버전)
  const handleReset = async () => {
    try {
      // 메시지 초기화
      setMessages([]);
      addMessage('system', '🔄 테스트 세션 초기화 중...');
      
      // Backend 세션 초기화
      const resetResponse = await axios.post(`http://localhost:8000/api/reset-session/${sessionId}`);
      
      if (resetResponse.data.status === 'success') {
        const initialState = resetResponse.data.initial_state || getInitialState();
        
        console.log('🎯 초기화 완료 - 초기 상태:', initialState);
        onStateChange(initialState);
        
        addMessage('system', `✅ 테스트 세션이 초기화되었습니다. 초기 상태: ${initialState}`);
        
        // 초기화 후 Start 상태에서 자동 전이 확인
        setTimeout(async () => {
          if (initialState === 'Start') {
            console.log('🚀 Start 상태에서 자동 전이 확인 중...');
            await checkAutoTransitionForState(initialState);
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
  };

  // 특정 상태에서 자동 전이 확인
  const checkAutoTransitionForState = async (state: string) => {
    if (!scenario) return;

    // 해당 상태에 이벤트 핸들러가 있는지 확인
    const dialogState = scenario.plan[0]?.dialogState.find(
      s => s.name === state
    );
    
    if (dialogState?.eventHandlers && dialogState.eventHandlers.length > 0) {
      console.log(`🎯 상태 ${state}에 이벤트 핸들러가 있습니다. 수동 트리거 대기 중...`);
      return;
    }

    try {
      const response = await axios.post('http://localhost:8000/api/process-input', {
        sessionId,
        input: '', // 빈 입력으로 자동 전이만 확인
        currentState: state,
        scenario: scenario,
      });

      // 자동 전이가 있는 경우 처리
      if (response.data.new_state && response.data.new_state !== state) {
        console.log(`🎯 자동 전이 발견: ${state} → ${response.data.new_state}`);
        addMessage('transition', `🚀 자동 전이: ${state} → ${response.data.new_state}`);
        onStateChange(response.data.new_state);
        
        if (response.data.response) {
          addMessage('system', response.data.response);
        }
      } else {
        console.log(`ℹ️ ${state} 상태에서 자동 전이 없음`);
      }

    } catch (error) {
      console.warn('Auto transition check failed for state', state, error);
    }
  };

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
    if (!scenario) return;

    addMessage('user', `이벤트 트리거: ${eventType}`);

    try {
      // Backend API 호출 (이벤트 타입 포함)
      const response = await axios.post('http://localhost:8000/api/process-input', {
        sessionId,
        input: '', // 빈 입력
        currentState,
        scenario: scenario,
        eventType: eventType // 이벤트 타입 추가
      });

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

      if (response.data.response) {
        addMessage('system', response.data.response);
      }

    } catch (error) {
      addMessage('system', '❌ Backend 연결 오류: ' + (error as Error).message);
      console.error('Event Trigger API Error:', error);
    }
  };

  return (
    <Box 
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
          시나리오 테스트
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
                이벤트 트리거:
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                {getEventHandlers().map((handler, index) => (
                  <Button
                    key={index}
                    size="small"
                    variant="contained"
                    color="info"
                    onClick={() => handleEventTrigger(handler.event.type)}
                    sx={{ fontSize: '0.75rem' }}
                  >
                    {handler.event.type}
                  </Button>
                ))}
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
              </List>
            </Paper>
          </Box>

          {/* 입력 영역 - 완전 고정 */}
          <Box sx={{ 
            display: 'flex', 
            gap: 1, 
            height: '40px',
            minHeight: '40px',
            maxHeight: '40px',
            flexShrink: 0,
            alignItems: 'center',
            pr: '180px' // 테스트 모드 버튼과 겹치지 않도록 오른쪽 여백 증가
          }}>
            <TextField
              fullWidth
              size="small"
              placeholder={isWebhookState() ? "Webhook 응답을 입력하세요 (예: ACT_01_0212)" : "메시지를 입력하세요..."}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isConnected}
            />
            <Button
              variant="contained"
              onClick={handleSendMessage}
              disabled={!inputText.trim() || !isConnected}
              sx={{ flexShrink: 0 }}
            >
              전송
            </Button>
          </Box>
        </>
      )}
    </Box>
  );
};

export default TestPanel; 