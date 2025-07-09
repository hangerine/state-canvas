import React, { useRef, useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  TextField,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  Chip,
  Badge,
  CircularProgress
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Scenario, FlowNode } from '../types/scenario';
import { compareScenarios } from '../utils/scenarioUtils';

interface SidebarProps {
  scenario: Scenario | null;
  selectedNode: FlowNode | null;
  onScenarioLoad: (scenario: Scenario) => void;
  onLoadingStart: () => void;
  onScenarioSave: () => void;
  onApplyChanges: () => void;
  nodes: FlowNode[];
  originalScenario: Scenario | null;
  onNodeUpdate: (node: FlowNode) => void;
  isLoading: boolean;
  loadingTime: number | null;
}

const Sidebar: React.FC<SidebarProps> = ({
  scenario,
  selectedNode,
  onScenarioLoad,
  onLoadingStart,
  onScenarioSave,
  onApplyChanges,
  nodes,
  originalScenario,
  onNodeUpdate,
  isLoading,
  loadingTime
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string>('');
  const [editedNodeName, setEditedNodeName] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [changeCount, setChangeCount] = useState(0);
  const [changeSummary, setChangeSummary] = useState<{
    added: string[];
    modified: string[];
    removed: string[];
  }>({ added: [], modified: [], removed: [] });

  // 변경사항 감지 (노드가 변경될 때마다 체크)
  useEffect(() => {
    if (originalScenario && nodes.length > 0) {
      try {
        // 변경사항 계산
        const changes = compareScenarios(nodes, originalScenario);
        const totalChanges = changes.added.length + changes.modified.length + changes.removed.length;
        
        setHasChanges(totalChanges > 0);
        setChangeCount(totalChanges);
        setChangeSummary({
          added: changes.added.map(state => state.name),
          modified: changes.modified.map(state => state.name),
          removed: changes.removed.map(state => state.name)
        });
      } catch (error) {
        console.warn('변경사항 감지 오류:', error);
        setHasChanges(false);
        setChangeCount(0);
        setChangeSummary({ added: [], modified: [], removed: [] });
      }
    } else {
      setHasChanges(false);
      setChangeCount(0);
      setChangeSummary({ added: [], modified: [], removed: [] });
    }
  }, [nodes, originalScenario]);

  // 시나리오 로드 시 초기화
  useEffect(() => {
    setHasChanges(false);
    setChangeCount(0);
    setChangeSummary({ added: [], modified: [], removed: [] });
  }, [scenario]);

  // 로딩 상태 변화 감지 (디버깅용)
  useEffect(() => {
    console.log('🔄 Sidebar: isLoading 상태 변경됨:', isLoading);
  }, [isLoading]);

  // 로딩 시간 변화 감지 (디버깅용)
  useEffect(() => {
    if (loadingTime !== null) {
      console.log('⏱️ Sidebar: loadingTime 업데이트됨:', loadingTime);
    }
  }, [loadingTime]);

  // 이벤트 타입을 안전하게 가져오는 헬퍼 함수
  const getEventType = (event: any): string => {
    if (!event) return 'Unknown';
    if (typeof event === 'object' && event.type) {
      return event.type;
    } else if (typeof event === 'string') {
      return event;
    }
    return 'Unknown';
  };

  // JSON 파일 업로드 처리
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // ⏱️ 시간 측정 시작
    const overallStartTime = performance.now();
    console.log('🚀 [TIMING] 파일 업로드 시작:', file.name, '크기:', file.size);
    
    // 파일이 선택되자마자 즉시 로딩 상태 시작
    const loadingStartTime = performance.now();
    onLoadingStart();
    console.log('⏱️ [TIMING] 로딩 상태 설정:', (performance.now() - loadingStartTime).toFixed(2), 'ms');

    const reader = new FileReader();
    const readerStartTime = performance.now();
    
    reader.onload = (e) => {
      const fileReadTime = performance.now() - readerStartTime;
      console.log('⏱️ [TIMING] 파일 읽기 완료:', fileReadTime.toFixed(2), 'ms');
      
      try {
        const parseStartTime = performance.now();
        const jsonContent = e.target?.result as string;
        const parsedScenario = JSON.parse(jsonContent);
        const parseTime = performance.now() - parseStartTime;
        console.log('⏱️ [TIMING] JSON 파싱 완료:', parseTime.toFixed(2), 'ms');
        
        // 기본 validation
        const validationStartTime = performance.now();
        if (!validateScenario(parsedScenario)) {
          setValidationError('잘못된 시나리오 파일 형식입니다.');
          return;
        }
        const validationTime = performance.now() - validationStartTime;
        console.log('⏱️ [TIMING] 시나리오 검증 완료:', validationTime.toFixed(2), 'ms');

        setValidationError('');
        
        const totalPreprocessTime = performance.now() - overallStartTime;
        console.log('⏱️ [TIMING] 전처리 총 시간:', totalPreprocessTime.toFixed(2), 'ms');
        console.log('📊 [TIMING] 세부 시간 분석:');
        console.log('  - 파일 읽기:', fileReadTime.toFixed(2), 'ms', `(${(fileReadTime/totalPreprocessTime*100).toFixed(1)}%)`);
        console.log('  - JSON 파싱:', parseTime.toFixed(2), 'ms', `(${(parseTime/totalPreprocessTime*100).toFixed(1)}%)`);
        console.log('  - 시나리오 검증:', validationTime.toFixed(2), 'ms', `(${(validationTime/totalPreprocessTime*100).toFixed(1)}%)`);
        console.log('✅ [TIMING] onScenarioLoad 호출 시작');
        
        onScenarioLoad(parsedScenario);
      } catch (error) {
        console.error('❌ [TIMING] JSON 파싱 에러:', error);
        setValidationError('JSON 파싱 에러: ' + (error as Error).message);
      }
    };
    
    // 파일 input 값 초기화 (같은 파일 재선택 가능하도록)
    event.target.value = '';
    console.log('⏱️ [TIMING] FileReader.readAsText() 호출');
    reader.readAsText(file);
  };

  // 시나리오 validation
  const validateScenario = (scenario: any): boolean => {
    if (!scenario.plan || !Array.isArray(scenario.plan)) return false;
    if (scenario.plan.length === 0) return false;
    
    const firstPlan = scenario.plan[0];
    if (!firstPlan.dialogState || !Array.isArray(firstPlan.dialogState)) return false;
    
    return true;
  };

  // JSON 파일 다운로드
  const handleDownload = () => {
    if (!scenario) return;

    const dataStr = JSON.stringify(scenario, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'scenario.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 노드 업데이트 처리
  const handleNodeNameUpdate = () => {
    if (!selectedNode || !editedNodeName.trim()) return;

    const updatedNode: FlowNode = {
      ...selectedNode,
      data: {
        ...selectedNode.data,
        label: editedNodeName,
        dialogState: {
          ...selectedNode.data.dialogState,
          name: editedNodeName
        }
      }
    };

    onNodeUpdate(updatedNode);
    setEditedNodeName('');
  };

  // 선택된 노드가 변경될 때 편집 필드 초기화
  React.useEffect(() => {
    if (selectedNode) {
      setEditedNodeName(selectedNode.data.dialogState.name);
    }
  }, [selectedNode]);

  return (
    <Box sx={{ height: '100vh', overflow: 'auto', p: 2, bgcolor: '#f5f5f5' }}>
      <Typography variant="h6" gutterBottom>
        StateCanvas Control Panel
      </Typography>

      {/* 파일 업로드/다운로드 섹션 */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          시나리오 파일 관리
        </Typography>
        
        <input
          type="file"
          accept=".json"
          onChange={handleFileUpload}
          ref={fileInputRef}
          style={{ display: 'none' }}
        />
        
        {/* 로딩 상태 표시 */}
        {isLoading && (
          <Alert 
            severity="info" 
            sx={{ 
              mb: 2, 
              border: '2px solid #2196f3',
              backgroundColor: '#e3f2fd',
              '& .MuiAlert-icon': {
                color: '#1976d2'
              }
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <CircularProgress size={20} thickness={4} />
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                🚀 시나리오 로딩 중... 잠시만 기다려주세요
              </Typography>
            </Box>
          </Alert>
        )}
        
        {/* 로딩 완료 시간 표시 */}
        {!isLoading && loadingTime !== null && (
          <Alert 
            severity={loadingTime > 10000 ? "warning" : loadingTime > 5000 ? "info" : "success"} 
            sx={{ mb: 2 }}
          >
            <Typography variant="body2">
              {loadingTime <= 5000 && '✅ 빠른 로딩'}
              {loadingTime > 5000 && loadingTime <= 10000 && '⏱️ 보통 로딩'}
              {loadingTime > 10000 && '🐌 느린 로딩'}
              : {(loadingTime / 1000).toFixed(1)}초
              {loadingTime > 5000 && ' (대용량 파일)'}
              {loadingTime > 10000 && ' ⚠️ 성능 최적화 권장'}
            </Typography>
            {loadingTime > 10000 && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5, opacity: 0.8 }}>
                💡 팁: 큰 시나리오 파일은 로딩에 시간이 걸릴 수 있습니다.
              </Typography>
            )}
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Button 
            variant="contained" 
            onClick={() => fileInputRef.current?.click()}
            size="small"
            disabled={isLoading}
          >
            {isLoading ? '로딩중...' : '업로드'}
          </Button>
          <Button 
            variant="outlined" 
            onClick={handleDownload}
            disabled={!scenario || isLoading}
            size="small"
          >
            원본 다운로드
          </Button>
          <Badge 
            badgeContent={hasChanges ? changeCount : 0} 
            color="warning"
            sx={{ width: '100%', mt: 1 }}
          >
            <Button 
              variant="contained" 
              color={hasChanges ? "warning" : "primary"}
              onClick={onApplyChanges}
              disabled={!scenario || isLoading}
              size="small"
              sx={{ 
                width: '100%',
                backgroundColor: hasChanges ? '#ff9800' : undefined,
                '&:hover': {
                  backgroundColor: hasChanges ? '#f57c00' : undefined,
                }
              }}
            >
              {isLoading ? '로딩중...' : hasChanges ? '🔄 변경사항 즉시 반영' : '🚀 변경사항 즉시 반영'}
            </Button>
          </Badge>
          <Button 
            variant="contained" 
            color="success"
            onClick={onScenarioSave}
            disabled={!scenario || isLoading}
            size="small"
            sx={{ width: '100%', mt: 0.5 }}
          >
            {isLoading ? '로딩중...' : '📁 편집된 시나리오 저장'}
          </Button>
        </Box>

        {hasChanges && (
          <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
            {changeCount}개의 변경사항이 있습니다. 위 버튼을 클릭하여 즉시 반영하세요.
          </Alert>
        )}

        {hasChanges && (
          <Paper sx={{ p: 2, mb: 2, bgcolor: '#f8f9fa' }}>
            <Typography variant="subtitle2" gutterBottom>
              📋 변경사항 요약
            </Typography>
            
            {changeSummary.added.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="success.main" sx={{ fontWeight: 'bold' }}>
                  ✅ 추가된 상태 ({changeSummary.added.length}개):
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {changeSummary.added.map(stateName => (
                    <Chip key={stateName} label={stateName} size="small" color="success" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}
            
            {changeSummary.modified.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="warning.main" sx={{ fontWeight: 'bold' }}>
                  🔄 수정된 상태 ({changeSummary.modified.length}개):
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {changeSummary.modified.map(stateName => (
                    <Chip key={stateName} label={stateName} size="small" color="warning" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}
            
            {changeSummary.removed.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" color="error.main" sx={{ fontWeight: 'bold' }}>
                  ❌ 삭제된 상태 ({changeSummary.removed.length}개):
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 0.5 }}>
                  {changeSummary.removed.map(stateName => (
                    <Chip key={stateName} label={stateName} size="small" color="error" variant="outlined" />
                  ))}
                </Box>
              </Box>
            )}
          </Paper>
        )}

        {validationError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {validationError}
          </Alert>
        )}
      </Paper>

      {/* 시나리오 정보 */}
      {scenario && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            시나리오 정보
          </Typography>
          <Typography variant="body2" color="text.secondary">
            플랜: {scenario.plan[0]?.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            상태 수: {scenario.plan[0]?.dialogState?.length || 0}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            웹훅 수: {scenario.webhooks?.length || 0}
          </Typography>
        </Paper>
      )}

      {/* 선택된 노드 속성 편집 */}
      {selectedNode && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            선택된 노드 속성
          </Typography>

          {/* 기본 정보 */}
          <Box sx={{ mb: 2 }}>
            <TextField
              label="노드 이름"
              value={editedNodeName}
              onChange={(e) => setEditedNodeName(e.target.value)}
              fullWidth
              size="small"
              sx={{ mb: 1 }}
            />
            <Button 
              variant="contained" 
              onClick={handleNodeNameUpdate}
              size="small"
            >
              이름 변경
            </Button>
          </Box>

          {/* 핸들러 정보 */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">조건 핸들러</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.conditionHandlers?.map((handler, idx) => (
                <Box key={idx} sx={{ mb: 1, p: 1, bgcolor: '#f9f9f9', borderRadius: 1 }}>
                  <Typography variant="caption" display="block">
                    조건: {handler.conditionStatement}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    → {handler.transitionTarget.dialogState}
                  </Typography>
                </Box>
              )) || <Typography variant="caption">없음</Typography>}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">인텐트 핸들러</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.intentHandlers?.map((handler, idx) => (
                <Box key={idx} sx={{ mb: 1 }}>
                  <Chip 
                    label={handler.intent} 
                    size="small" 
                    color="primary" 
                    variant="outlined"
                  />
                  <Typography variant="caption" display="block">
                    → {handler.transitionTarget.dialogState}
                  </Typography>
                </Box>
              )) || <Typography variant="caption">없음</Typography>}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">이벤트 핸들러</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.eventHandlers?.map((handler, idx) => (
                <Box key={idx} sx={{ mb: 1 }}>
                  <Chip 
                    label={getEventType(handler.event)} 
                    size="small" 
                    color="secondary" 
                    variant="outlined"
                  />
                  <Typography variant="caption" display="block">
                    → {handler.transitionTarget.dialogState}
                  </Typography>
                </Box>
              )) || <Typography variant="caption">없음</Typography>}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">Entry Action</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.entryAction ? (
                <Box sx={{ p: 1, bgcolor: '#f9f9f9', borderRadius: 1 }}>
                  {selectedNode.data.dialogState.entryAction.directives?.map((directive, idx) => (
                    <Box key={idx} sx={{ mb: 1 }}>
                      <Typography variant="caption" display="block" sx={{ fontWeight: 'bold' }}>
                        {directive.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ 
                        display: 'block',
                        maxHeight: '100px',
                        overflow: 'auto',
                        fontSize: '0.7rem',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {typeof directive.content === 'string' 
                          ? directive.content 
                          : JSON.stringify(directive.content, null, 2)}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              ) : (
                <Typography variant="caption">없음</Typography>
              )}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">API Call Handlers</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.apicallHandlers?.map((handler, idx) => (
                <Box key={idx} sx={{ mb: 2, p: 1, bgcolor: '#f9f9f9', borderRadius: 1 }}>
                  <Typography variant="caption" display="block" sx={{ fontWeight: 'bold', mb: 1 }}>
                    {handler.name}
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary">
                    URL: {handler.apicall.url}
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary">
                    Method: {handler.apicall.formats.method}
                  </Typography>
                  <Typography variant="caption" display="block" color="text.secondary">
                    Timeout: {handler.apicall.timeout}ms
                  </Typography>
                  {handler.apicall.formats.requestTemplate && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                      Request Template:
                    </Typography>
                  )}
                  {handler.apicall.formats.requestTemplate && (
                    <Typography variant="caption" sx={{ 
                      display: 'block',
                      maxHeight: '60px',
                      overflow: 'auto',
                      fontSize: '0.65rem',
                      bgcolor: '#fff',
                      p: 0.5,
                      borderRadius: 0.5,
                      fontFamily: 'monospace'
                    }}>
                      {handler.apicall.formats.requestTemplate}
                    </Typography>
                  )}
                  {handler.apicall.formats.responseMappings && Object.keys(handler.apicall.formats.responseMappings).length > 0 && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                      Response Mappings:
                    </Typography>
                  )}
                  {handler.apicall.formats.responseMappings && Object.keys(handler.apicall.formats.responseMappings).length > 0 && (
                    <Box sx={{ 
                      maxHeight: '60px',
                      overflow: 'auto',
                      fontSize: '0.65rem',
                      bgcolor: '#fff',
                      p: 0.5,
                      borderRadius: 0.5,
                      fontFamily: 'monospace'
                    }}>
                      {Object.entries(handler.apicall.formats.responseMappings).map(([key, value]) => (
                        <Typography key={key} variant="caption" display="block">
                          {key}: {value}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  {handler.apicall.formats.headers && Object.keys(handler.apicall.formats.headers).length > 0 && (
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                      Headers:
                    </Typography>
                  )}
                  {handler.apicall.formats.headers && Object.keys(handler.apicall.formats.headers).length > 0 && (
                    <Box sx={{ 
                      maxHeight: '60px',
                      overflow: 'auto',
                      fontSize: '0.65rem',
                      bgcolor: '#fff',
                      p: 0.5,
                      borderRadius: 0.5,
                      fontFamily: 'monospace'
                    }}>
                      {Object.entries(handler.apicall.formats.headers).map(([key, value]) => (
                        <Typography key={key} variant="caption" display="block">
                          {key}: {value}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  <Typography variant="caption" display="block" color="primary.main" sx={{ mt: 1 }}>
                    → {handler.transitionTarget.dialogState}
                  </Typography>
                </Box>
              )) || <Typography variant="caption">없음</Typography>}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">Webhook Actions</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.webhookActions?.map((webhook, idx) => (
                <Box key={idx} sx={{ mb: 1 }}>
                  <Chip 
                    label={webhook.name} 
                    size="small" 
                    color="info" 
                    variant="outlined"
                  />
                </Box>
              )) || <Typography variant="caption">없음</Typography>}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">Slot Filling Form</Typography>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.slotFillingForm?.map((slot, idx) => (
                <Box key={idx} sx={{ mb: 1, p: 1, bgcolor: '#f9f9f9', borderRadius: 1 }}>
                  <Typography variant="caption" display="block" sx={{ fontWeight: 'bold' }}>
                    {slot.name} {slot.required === 'Y' && <span style={{ color: 'red' }}>*</span>}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Memory Keys: {slot.memorySlotKey?.join(', ') || 'None'}
                  </Typography>
                </Box>
              )) || <Typography variant="caption">없음</Typography>}
            </AccordionDetails>
          </Accordion>
        </Paper>
      )}
    </Box>
  );
};

export default Sidebar; 