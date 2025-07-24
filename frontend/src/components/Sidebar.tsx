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
  CircularProgress,
  Tabs,
  Tab,
  List,
  ListItem,
  ListItemText,
  IconButton
} from '@mui/material';

import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Scenario, FlowNode } from '../types/scenario';
import { compareScenarios } from '../utils/scenarioUtils';

interface SidebarProps {
  scenario: Scenario | null;
  selectedNode: FlowNode | null;
  onScenarioLoad: (scenario: Scenario, loadedId?: string) => void;
  onLoadingStart: (startTime?: number) => void;
  onScenarioSave: () => void;
  onApplyChanges: () => void;
  onCreateNewScenario: () => void;
  onSaveAllScenarios: () => void;
  scenarios?: { [key: string]: Scenario };
  activeScenarioId?: string;
  onSwitchScenario?: (scenarioId: string) => void;
  onDeleteScenario?: (scenarioId: string) => void;
  onUpdateScenarioName?: (scenarioId: string, newName: string) => void;
  nodes: FlowNode[];
  originalScenario: Scenario | null;
  onNodeUpdate: (node: FlowNode) => void;
  isLoading: boolean;
  loadingTime: number | null;
  onAllScenariosLoad?: (scenarioMap: Record<string, Scenario>) => void;
  setIsLoading: (v: boolean) => void;
  setLoadingTime: (v: number) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  scenario,
  selectedNode,
  onScenarioLoad,
  onLoadingStart,
  onScenarioSave,
  onApplyChanges,
  onCreateNewScenario,
  onSaveAllScenarios,
  scenarios = {},
  activeScenarioId,
  onSwitchScenario,
  onDeleteScenario,
  onUpdateScenarioName,
  nodes,
  originalScenario,
  onNodeUpdate,
  isLoading,
  loadingTime,
  onAllScenariosLoad,
  setIsLoading,
  setLoadingTime
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
  const [treeSelectedState, setTreeSelectedState] = useState<FlowNode | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [editingScenarioId, setEditingScenarioId] = useState<string | null>(null);
  const [editingScenarioName, setEditingScenarioName] = useState('');

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
        // console.warn('변경사항 감지 오류:', error);
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
    // console.log('🔄 Sidebar: isLoading 상태 변경됨:', isLoading);
  }, [isLoading]);

  // 로딩 시간 변화 감지 (디버깅용)
  useEffect(() => {
    if (loadingTime !== null) {
      // console.log('⏱️ Sidebar: loadingTime 업데이트됨:', loadingTime);
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

    // ⏱️ 시간 측정 시작 - 파일 업로드 처리 시작 시점
    const overallStartTime = performance.now();
    // console.log('🚀 [TIMING] 파일 업로드 시작:', file.name, '크기:', file.size);
    
    // 파일이 선택되자마자 즉시 로딩 상태 시작 (정확한 시작 시간 전달)
    onLoadingStart(overallStartTime);
    // console.log('⏱️ [TIMING] 로딩 상태 설정 시작 시간:', overallStartTime);

    const reader = new FileReader();
    const readerStartTime = performance.now();
    
    reader.onload = (e) => {
      const fileReadTime = performance.now() - readerStartTime;
      // console.log('⏱️ [TIMING] 파일 읽기 완료:', fileReadTime.toFixed(2), 'ms');
      
      try {
        const parseStartTime = performance.now();
        const jsonContent = e.target?.result as string;
        const parsed = JSON.parse(jsonContent);
        const parseTime = performance.now() - parseStartTime;
        console.log('⏱️ [TIMING] JSON 파싱 완료:', parseTime.toFixed(2), 'ms');

        // 여러 시나리오 배열 지원
        if (Array.isArray(parsed)) {
          // 각 시나리오 객체가 {id, name, scenario} 구조인지 확인
          const valid = parsed.every(item => item && item.id && item.name && item.scenario && item.scenario.plan);
          if (!valid) {
            setValidationError('잘못된 시나리오 파일 형식입니다. (배열 내 각 시나리오의 구조가 올바르지 않음)');
            return;
          }
          // 각 시나리오 validation
          for (const item of parsed) {
            if (!validateScenario(item.scenario)) {
              setValidationError(`시나리오 "${item.name}"의 형식이 올바르지 않습니다.`);
              return;
            }
          }
          // 모두 유효하면 setScenarios로 등록
          const scenarioMap: Record<string, Scenario> = {};
          parsed.forEach((item: {id: string, scenario: Scenario}) => {
            scenarioMap[item.id] = item.scenario;
          });
          setValidationError('');
          // 첫 번째 시나리오를 활성화
          onScenarioLoad(parsed[0].scenario, parsed[0].id);
          // 모든 시나리오 등록
          if (onAllScenariosLoad) {
            onAllScenariosLoad(scenarioMap);
          }
          setIsLoading(false);
          setLoadingTime(performance.now() - overallStartTime);
          return;
        }

        // 단일 시나리오 객체 처리 (기존 로직)
        if (!validateScenario(parsed)) {
          setValidationError('잘못된 시나리오 파일 형식입니다.');
          setIsLoading(false);
          setLoadingTime(performance.now() - overallStartTime);
          return;
        }
        setValidationError('');
        onScenarioLoad(parsed);
        setIsLoading(false);
        setLoadingTime(performance.now() - overallStartTime);
      } catch (error) {
        // console.error('❌ [TIMING] JSON 파싱 에러:', error);
        setValidationError('JSON 파싱 에러: ' + (error as Error).message);
      }
    };
    
    // 파일 input 값 초기화 (같은 파일 재선택 가능하도록)
    event.target.value = '';
    // console.log('⏱️ [TIMING] FileReader.readAsText() 호출');
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

  // 시나리오 이름 편집 시작
  const handleStartScenarioNameEdit = (scenarioId: string, currentName: string) => {
    setEditingScenarioId(scenarioId);
    setEditingScenarioName(currentName);
  };

  // 시나리오 이름 편집 완료
  const handleFinishScenarioNameEdit = () => {
    if (editingScenarioId && editingScenarioName.trim()) {
      onUpdateScenarioName?.(editingScenarioId, editingScenarioName.trim());
    }
    setEditingScenarioId(null);
    setEditingScenarioName('');
  };

  // 시나리오 이름 편집 취소
  const handleCancelScenarioNameEdit = () => {
    setEditingScenarioId(null);
    setEditingScenarioName('');
  };

  return (
    <Box sx={{ height: '100vh', overflow: 'auto', p: 2, bgcolor: '#f5f5f5' }}>
      <Typography variant="h6" gutterBottom>
        StateCanvas Control Panel
      </Typography>

      {/* 탭 네비게이션 */}
      <Paper sx={{ mb: 2 }}>
        <Tabs 
          value={activeTab} 
          onChange={(_e: React.SyntheticEvent, newValue: number) => setActiveTab(newValue)}
          variant="fullWidth"
        >
          <Tab label="시나리오 관리" />
          <Tab label="시나리오 구조" />
          <Tab label="노드 속성" />
        </Tabs>
      </Paper>

      {/* 시나리오 관리 탭 */}
      {activeTab === 0 && (
        <>
          {/* 파일 업로드 섹션 */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: '#fafafa', border: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2', mb: 2 }}>
              📁 파일 관리
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
              <Box sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 1, 
                p: 1.5, 
                mb: 2, 
                bgcolor: '#e3f2fd', 
                borderRadius: 1,
                border: '1px solid #2196f3'
              }}>
                <CircularProgress size={16} thickness={4} />
                <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                  로딩 중...
                </Typography>
              </Box>
            )}
            
            {/* 로딩 완료 시간 표시 */}
            {!isLoading && loadingTime !== null && (
              <Box sx={{ 
                p: 1, 
                mb: 2, 
                bgcolor: loadingTime > 10000 ? '#fff3e0' : loadingTime > 5000 ? '#e8f5e8' : '#f3e5f5',
                borderRadius: 1,
                border: `1px solid ${loadingTime > 10000 ? '#ff9800' : loadingTime > 5000 ? '#4caf50' : '#9c27b0'}`
              }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                  {(loadingTime / 1000).toFixed(1)}초 로딩 완료
                </Typography>
              </Box>
            )}

            {/* 파일 관리 버튼들 */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
              <Button
                variant="contained"
                onClick={() => fileInputRef.current?.click()}
                size="small"
                disabled={isLoading}
                sx={{ flex: 1, fontSize: '0.75rem' }}
              >
                📂 업로드
              </Button>
              <Button
                variant="outlined"
                onClick={handleDownload}
                disabled={!scenario || isLoading}
                size="small"
                sx={{ flex: 1, fontSize: '0.75rem' }}
              >
                💾 다운로드
              </Button>
            </Box>
          </Paper>

          {/* 시나리오 관리 섹션 */}
          <Paper sx={{ p: 2, mb: 2, bgcolor: '#fafafa', border: '1px solid #e0e0e0' }}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2', mb: 2 }}>
              ⚙️ 시나리오 관리
            </Typography>

            {/* 새 시나리오 추가 버튼 */}
            <Button 
              variant="contained" 
              color="primary"
              onClick={onCreateNewScenario}
              disabled={isLoading}
              size="small"
              sx={{ width: '100%', mb: 1, fontSize: '0.75rem' }}
            >
              🆕 새 시나리오 추가
            </Button>

            {/* 변경사항 적용 버튼 */}
            <Badge 
              badgeContent={hasChanges ? changeCount : 0} 
              color="warning"
              sx={{ width: '100%', mb: 1 }}
            >
              <Button 
                variant="contained" 
                color={hasChanges ? "warning" : "primary"}
                onClick={onApplyChanges}
                disabled={!scenario || isLoading}
                size="small"
                sx={{ 
                  width: '100%',
                  fontSize: '0.75rem',
                  backgroundColor: hasChanges ? '#ff9800' : undefined,
                  '&:hover': {
                    backgroundColor: hasChanges ? '#f57c00' : undefined,
                  }
                }}
              >
                {hasChanges ? '🔄 변경사항 적용' : '✅ 변경사항 적용'}
              </Button>
            </Badge>

            {/* 저장 버튼들 */}
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button 
                variant="outlined" 
                color="success"
                onClick={onScenarioSave}
                disabled={!scenario || isLoading}
                size="small"
                sx={{ flex: 1, fontSize: '0.75rem' }}
              >
                💾 개별 저장
              </Button>
              <Button 
                variant="outlined" 
                color="secondary"
                onClick={onSaveAllScenarios}
                disabled={isLoading}
                size="small"
                sx={{ flex: 1, fontSize: '0.75rem' }}
              >
                📦 전체 저장
              </Button>
            </Box>
          </Paper>

          {/* 시나리오 목록 */}
          {Object.keys(scenarios).length > 0 && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#fafafa', border: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2', mb: 2 }}>
                📋 시나리오 목록
              </Typography>
              <List dense sx={{ p: 0 }}>
                {Object.entries(scenarios).map(([id, scenarioData]) => (
                  <ListItem 
                    key={id}
                    sx={{ 
                      p: 1, 
                      mb: 0.5, 
                      borderRadius: 1,
                      backgroundColor: id === activeScenarioId ? '#e3f2fd' : 'transparent',
                      border: id === activeScenarioId ? '1px solid #1976d2' : '1px solid #e0e0e0',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      '&:hover': {
                        backgroundColor: id === activeScenarioId ? '#e3f2fd' : '#f5f5f5'
                      }
                    }}
                    onClick={() => onSwitchScenario?.(id)}
                  >
                    <Box sx={{ flex: 1 }}>
                      <ListItemText
                        primary={
                          editingScenarioId === id ? (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <TextField
                                value={editingScenarioName}
                                onChange={(e) => setEditingScenarioName(e.target.value)}
                                size="small"
                                sx={{ 
                                  '& .MuiInputBase-root': { 
                                    fontSize: '0.875rem',
                                    height: 28
                                  }
                                }}
                                onKeyPress={(e) => {
                                  if (e.key === 'Enter') {
                                    handleFinishScenarioNameEdit();
                                  } else if (e.key === 'Escape') {
                                    handleCancelScenarioNameEdit();
                                  }
                                }}
                                autoFocus
                              />
                              <IconButton
                                size="small"
                                onClick={handleFinishScenarioNameEdit}
                                sx={{ color: '#4caf50', p: 0.5 }}
                              >
                                <span style={{ fontSize: '0.8rem' }}>✅</span>
                              </IconButton>
                              <IconButton
                                size="small"
                                onClick={handleCancelScenarioNameEdit}
                                sx={{ color: '#f44336', p: 0.5 }}
                              >
                                <span style={{ fontSize: '0.8rem' }}>❌</span>
                              </IconButton>
                            </Box>
                          ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: id === activeScenarioId ? 'bold' : 'normal' }}>
                                {scenarioData.plan[0]?.name || `Scenario ${id}`}
                              </Typography>
                              <IconButton
                                size="small"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartScenarioNameEdit(id, scenarioData.plan[0]?.name || `Scenario ${id}`);
                                }}
                                sx={{ color: '#1976d2', p: 0.5, opacity: 0.7 }}
                              >
                                <span style={{ fontSize: '0.7rem' }}>✏️</span>
                              </IconButton>
                            </Box>
                          )
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {scenarioData.plan[0]?.dialogState?.length || 0}개 상태
                          </Typography>
                        }
                      />
                    </Box>
                    {/* 삭제 버튼: 항상 보이되, 1개 남았을 때는 비활성화 */}
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onDeleteScenario && Object.keys(scenarios).length > 1) {
                          onDeleteScenario(id);
                        }
                      }}
                      sx={{ color: '#f44336', ml: 1 }}
                      disabled={Object.keys(scenarios).length <= 1}
                    >
                      <span style={{ fontSize: '0.8rem' }}>🗑️</span>
                    </IconButton>
                  </ListItem>
                ))}
              </List>
            </Paper>
          )}

          {/* 변경사항 표시 */}
          {hasChanges && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff3e0', border: '1px solid #ff9800' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: '#f57c00' }}>
                🔄 변경사항 ({changeCount}개)
              </Typography>
              
              {changeSummary.added.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 'bold' }}>
                    ✅ 추가: {changeSummary.added.length}개
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
                    🔄 수정: {changeSummary.modified.length}개
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
                    ❌ 삭제: {changeSummary.removed.length}개
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

          {/* 오류 표시 */}
          {validationError && (
            <Alert severity="error" sx={{ mt: 1 }}>
              {validationError}
            </Alert>
          )}

          {/* 시나리오 정보 */}
          {scenario && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#fafafa', border: '1px solid #e0e0e0' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                ℹ️ 시나리오 정보
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, fontSize: '0.875rem' }}>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>플랜:</Typography>
                <Typography variant="caption">{scenario.plan[0]?.name}</Typography>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>상태 수:</Typography>
                <Typography variant="caption">{scenario.plan[0]?.dialogState?.length || 0}개</Typography>
                <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>웹훅 수:</Typography>
                <Typography variant="caption">{scenario.webhooks?.length || 0}개</Typography>
              </Box>
            </Paper>
          )}
        </>
      )}

                    {/* 시나리오 구조 탭 */}
       {activeTab === 1 && (
         <Paper sx={{ p: 2, mb: 2 }}>
           <Typography variant="subtitle1" gutterBottom>
             시나리오 구조
           </Typography>
           
           {/* 디버깅 정보 */}
           <Box sx={{ mb: 2, p: 1, bgcolor: '#f0f0f0', borderRadius: 1 }}>
             <Typography variant="caption" display="block">
               <strong>디버깅 정보:</strong>
             </Typography>
             <Typography variant="caption" display="block">
               scenario: {scenario ? '있음' : '없음'}
             </Typography>
             <Typography variant="caption" display="block">
               scenario.plan: {scenario?.plan ? `${scenario.plan.length}개` : '없음'}
             </Typography>
             <Typography variant="caption" display="block">
               nodes: {nodes.length}개
             </Typography>
           </Box>
           
           {scenario && scenario.plan && scenario.plan.length > 0 ? (
             <Box sx={{ maxHeight: '400px', overflow: 'auto' }}>
               {scenario.plan.map((plan, pIdx) => (
                 <Accordion 
                   key={pIdx} 
                   sx={{ 
                     mb: 1,
                     '&:before': {
                       display: 'none',
                     },
                     boxShadow: 'none',
                     border: '1px solid #e0e0e0',
                     borderRadius: 1,
                     overflow: 'hidden'
                   }}
                 >
                   <AccordionSummary 
                     expandIcon={<ExpandMoreIcon />}
                     sx={{
                       backgroundColor: '#fafafa',
                       borderBottom: '1px solid #e0e0e0',
                       '&:hover': {
                         backgroundColor: '#f5f5f5'
                       },
                       '&.Mui-expanded': {
                         backgroundColor: '#f0f0f0',
                         borderBottom: '1px solid #d0d0d0'
                       }
                     }}
                   >
                     <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                       <Box sx={{ 
                         display: 'flex', 
                         alignItems: 'center', 
                         justifyContent: 'center',
                         width: 24,
                         height: 24,
                         borderRadius: '50%',
                         backgroundColor: '#1976d2',
                         color: 'white',
                         fontSize: '0.75rem',
                         fontWeight: 'bold'
                       }}>
                         {pIdx + 1}
                       </Box>
                       <Typography variant="subtitle2" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                         {plan.name || `Plan ${pIdx}`}
                       </Typography>
                       <Chip 
                         label={`${plan.dialogState?.length || 0}개 상태`}
                         size="small"
                         variant="outlined"
                         sx={{ ml: 'auto', fontSize: '0.7rem' }}
                       />
                     </Box>
                   </AccordionSummary>
                   <AccordionDetails sx={{ pt: 0, pb: 0 }}>
                     <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                       {plan.dialogState && plan.dialogState.map((state, sIdx) => (
                         <Box
                           key={sIdx}
                           sx={{
                             display: 'flex',
                             alignItems: 'center',
                             p: 1,
                             borderBottom: sIdx < (plan.dialogState?.length || 0) - 1 ? '1px solid #f0f0f0' : 'none',
                             cursor: 'pointer',
                             '&:hover': {
                               backgroundColor: '#f8f9fa'
                             },
                             '&:last-child': {
                               borderBottom: 'none'
                             }
                           }}
                           onClick={() => {
                             console.log('State selected:', state.name);
                             const found = nodes.find(n => n.id === state.name);
                             if (found) {
                               console.log('Found node:', found);
                               setTreeSelectedState(found);
                             } else {
                               console.log('Node not found in nodes array');
                             }
                           }}
                         >
                           <Box sx={{ 
                             display: 'flex', 
                             alignItems: 'center', 
                             justifyContent: 'center',
                             width: 20,
                             height: 20,
                             borderRadius: '50%',
                             backgroundColor: '#4caf50',
                             color: 'white',
                             fontSize: '0.6rem',
                             fontWeight: 'bold',
                             mr: 1
                           }}>
                             {sIdx + 1}
                           </Box>
                           <Typography 
                             variant="body2" 
                             sx={{ 
                               fontSize: '0.875rem',
                               color: '#333',
                               fontWeight: 'medium'
                             }}
                           >
                             {state.name}
                           </Typography>
                           
                           {/* 핸들러 개수 표시 */}
                           <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
                             {state.conditionHandlers && state.conditionHandlers.length > 0 && (
                               <Chip 
                                 label={`조건 ${state.conditionHandlers.length}`}
                                 size="small"
                                 variant="outlined"
                                 sx={{ fontSize: '0.6rem', height: 20 }}
                               />
                             )}
                             {state.intentHandlers && state.intentHandlers.length > 0 && (
                               <Chip 
                                 label={`인텐트 ${state.intentHandlers.length}`}
                                 size="small"
                                 variant="outlined"
                                 sx={{ fontSize: '0.6rem', height: 20 }}
                               />
                             )}
                             {state.eventHandlers && state.eventHandlers.length > 0 && (
                               <Chip 
                                 label={`이벤트 ${state.eventHandlers.length}`}
                                 size="small"
                                 variant="outlined"
                                 sx={{ fontSize: '0.6rem', height: 20 }}
                               />
                             )}
                           </Box>
                         </Box>
                       ))}
                     </Box>
                   </AccordionDetails>
                 </Accordion>
               ))}
             </Box>
           ) : (
             <Typography variant="body2" color="text.secondary">
               시나리오가 로드되지 않았거나 구조가 없습니다.
             </Typography>
           )}
           
           {treeSelectedState && (
             <Box sx={{ mt: 2, p: 2, bgcolor: '#f8f9fa', borderRadius: 2, border: '1px solid #e9ecef' }}>
               <Typography variant="subtitle2" gutterBottom sx={{ color: '#1976d2', fontWeight: 'bold' }}>
                 📋 선택된 상태: {treeSelectedState.data.label}
               </Typography>
               
               {/* 기본 정보 */}
               <Box sx={{ mb: 2 }}>
                 <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1 }}>
                   기본 정보
                 </Typography>
                 <Box sx={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 1, fontSize: '0.875rem' }}>
                   <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>상태 이름:</Typography>
                   <Typography variant="caption">{treeSelectedState.data.dialogState.name}</Typography>
                   
                   {treeSelectedState.data.dialogState.conditionHandlers && (
                     <>
                       <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>조건 핸들러:</Typography>
                       <Typography variant="caption">{treeSelectedState.data.dialogState.conditionHandlers.length}개</Typography>
                     </>
                   )}
                   
                   {treeSelectedState.data.dialogState.intentHandlers && (
                     <>
                       <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>인텐트 핸들러:</Typography>
                       <Typography variant="caption">{treeSelectedState.data.dialogState.intentHandlers.length}개</Typography>
                     </>
                   )}
                   
                   {treeSelectedState.data.dialogState.eventHandlers && (
                     <>
                       <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>이벤트 핸들러:</Typography>
                       <Typography variant="caption">{treeSelectedState.data.dialogState.eventHandlers.length}개</Typography>
                     </>
                   )}
                   
                   {treeSelectedState.data.dialogState.apicallHandlers && (
                     <>
                       <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>API Call 핸들러:</Typography>
                       <Typography variant="caption">{treeSelectedState.data.dialogState.apicallHandlers.length}개</Typography>
                     </>
                   )}
                   
                   {treeSelectedState.data.dialogState.webhookActions && (
                     <>
                       <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>Webhook Actions:</Typography>
                       <Typography variant="caption">{treeSelectedState.data.dialogState.webhookActions.length}개</Typography>
                     </>
                   )}
                   
                   {treeSelectedState.data.dialogState.slotFillingForm && (
                     <>
                       <Typography variant="caption" sx={{ fontWeight: 'bold', color: '#666' }}>Slot Filling Form:</Typography>
                       <Typography variant="caption">{treeSelectedState.data.dialogState.slotFillingForm.length}개</Typography>
                     </>
                   )}
                 </Box>
               </Box>
               
               {/* 상세 JSON 정보 */}
               <Accordion sx={{ bgcolor: 'white', borderRadius: 1 }}>
                 <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                   <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                     🔍 상세 JSON 정보
                   </Typography>
                 </AccordionSummary>
                 <AccordionDetails sx={{ p: 0 }}>
                   <Box sx={{ 
                     maxHeight: '300px',
                     overflow: 'auto',
                     bgcolor: '#f8f9fa',
                     border: '1px solid #e9ecef',
                     borderRadius: 1,
                     p: 1
                   }}>
                     <pre style={{
                       margin: 0,
                       fontFamily: 'Monaco, Menlo, "Ubuntu Mono", monospace',
                       fontSize: '0.75rem',
                       lineHeight: '1.4',
                       color: '#333',
                       whiteSpace: 'pre-wrap',
                       wordBreak: 'break-word'
                     }}>
                       {JSON.stringify(treeSelectedState.data.dialogState, null, 2)}
                     </pre>
                   </Box>
                 </AccordionDetails>
               </Accordion>
             </Box>
           )}
         </Paper>
       )}

             {/* 노드 속성 탭 */}
       {activeTab === 2 && (
        <Paper sx={{ p: 2 }}>
          <Typography variant="subtitle1" gutterBottom>
            선택된 노드 속성
          </Typography>

                     {/* 디버깅 정보 */}
           <Box sx={{ mb: 2, p: 1, bgcolor: '#f0f0f0', borderRadius: 1 }}>
             <Typography variant="caption" display="block">
               <strong>디버깅 정보:</strong>
             </Typography>
             <Typography variant="caption" display="block">
               selectedNode: {selectedNode ? '있음' : '없음'}
             </Typography>
             <Typography variant="caption" display="block">
               selectedNode.id: {selectedNode?.id || 'N/A'}
             </Typography>
           </Box>

           {selectedNode ? (
             <>
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2">조건 핸들러</Typography>
                <Chip 
                  label={selectedNode.data.dialogState.conditionHandlers?.length || 0}
                  size="small"
                  color={selectedNode.data.dialogState.conditionHandlers?.length ? "primary" : "default"}
                  variant={selectedNode.data.dialogState.conditionHandlers?.length ? "filled" : "outlined"}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2">인텐트 핸들러</Typography>
                <Chip 
                  label={selectedNode.data.dialogState.intentHandlers?.length || 0}
                  size="small"
                  color={selectedNode.data.dialogState.intentHandlers?.length ? "primary" : "default"}
                  variant={selectedNode.data.dialogState.intentHandlers?.length ? "filled" : "outlined"}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2">이벤트 핸들러</Typography>
                <Chip 
                  label={selectedNode.data.dialogState.eventHandlers?.length || 0}
                  size="small"
                  color={selectedNode.data.dialogState.eventHandlers?.length ? "secondary" : "default"}
                  variant={selectedNode.data.dialogState.eventHandlers?.length ? "filled" : "outlined"}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2">Entry Action</Typography>
                <Chip 
                  label={selectedNode.data.dialogState.entryAction?.directives?.length || 0}
                  size="small"
                  color={selectedNode.data.dialogState.entryAction?.directives?.length ? "success" : "default"}
                  variant={selectedNode.data.dialogState.entryAction?.directives?.length ? "filled" : "outlined"}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2">API Call Handlers</Typography>
                <Chip 
                  label={selectedNode.data.dialogState.apicallHandlers?.length || 0}
                  size="small"
                  color={selectedNode.data.dialogState.apicallHandlers?.length ? "warning" : "default"}
                  variant={selectedNode.data.dialogState.apicallHandlers?.length ? "filled" : "outlined"}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
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
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2">Webhook Actions</Typography>
                <Chip 
                  label={selectedNode.data.dialogState.webhookActions?.length || 0}
                  size="small"
                  color={selectedNode.data.dialogState.webhookActions?.length ? "error" : "default"}
                  variant={selectedNode.data.dialogState.webhookActions?.length ? "filled" : "outlined"}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {selectedNode.data.dialogState.webhookActions && selectedNode.data.dialogState.webhookActions.length > 0 ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
                    🔗 실제 webhook 호출 → NLU_INTENT 추출 → 조건 처리
                  </Typography>
                  {selectedNode.data.dialogState.webhookActions.map((webhook, idx) => (
                    <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip 
                        label={webhook.name} 
                        size="small" 
                        color="error" 
                        variant="outlined"
                      />
                      <Typography variant="caption" color="text.secondary">
                        → 조건 처리
                      </Typography>
                    </Box>
                  ))}
                  {selectedNode.data.dialogState.apicallHandlers && selectedNode.data.dialogState.apicallHandlers.length > 0 && (
                    <Typography variant="caption" color="warning.main" sx={{ mt: 1 }}>
                      ⚠️ API Call Handler는 Webhook 상태에서 비활성화됨
                    </Typography>
                  )}
                </Box>
              ) : (
                <Typography variant="caption">없음</Typography>
              )}
            </AccordionDetails>
          </Accordion>

          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Typography variant="body2">Slot Filling Form</Typography>
                <Chip 
                  label={selectedNode.data.dialogState.slotFillingForm?.length || 0}
                  size="small"
                  color={selectedNode.data.dialogState.slotFillingForm?.length ? "info" : "default"}
                  variant={selectedNode.data.dialogState.slotFillingForm?.length ? "filled" : "outlined"}
                  sx={{ fontSize: '0.7rem', height: 20 }}
                />
              </Box>
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
             </>
           ) : (
             <Typography variant="body2" color="text.secondary">
               선택된 노드가 없습니다. 시나리오 구조를 탐색하여 노드를 선택해주세요.
             </Typography>
           )}
        </Paper>
      )}
    </Box>
  );
};

export default Sidebar; 