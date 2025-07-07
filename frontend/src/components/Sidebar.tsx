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
  Badge
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Scenario, FlowNode } from '../types/scenario';
import { compareScenarios } from '../utils/scenarioUtils';

interface SidebarProps {
  scenario: Scenario | null;
  selectedNode: FlowNode | null;
  onScenarioLoad: (scenario: Scenario) => void;
  onScenarioSave: () => void;
  onApplyChanges: () => void;
  nodes: FlowNode[];
  originalScenario: Scenario | null;
  onNodeUpdate: (node: FlowNode) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  scenario,
  selectedNode,
  onScenarioLoad,
  onScenarioSave,
  onApplyChanges,
  nodes,
  originalScenario,
  onNodeUpdate
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

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonContent = e.target?.result as string;
        const parsedScenario = JSON.parse(jsonContent);
        
        // 기본 validation
        if (!validateScenario(parsedScenario)) {
          setValidationError('잘못된 시나리오 파일 형식입니다.');
          return;
        }

        setValidationError('');
        onScenarioLoad(parsedScenario);
      } catch (error) {
        setValidationError('JSON 파싱 에러: ' + (error as Error).message);
      }
    };
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
        
        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
          <Button 
            variant="contained" 
            onClick={() => fileInputRef.current?.click()}
            size="small"
          >
            업로드
          </Button>
          <Button 
            variant="outlined" 
            onClick={handleDownload}
            disabled={!scenario}
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
              disabled={!scenario}
              size="small"
              sx={{ 
                width: '100%',
                backgroundColor: hasChanges ? '#ff9800' : undefined,
                '&:hover': {
                  backgroundColor: hasChanges ? '#f57c00' : undefined,
                }
              }}
            >
              {hasChanges ? '🔄 변경사항 즉시 반영' : '🚀 변경사항 즉시 반영'}
            </Button>
          </Badge>
          <Button 
            variant="contained" 
            color="success"
            onClick={onScenarioSave}
            disabled={!scenario}
            size="small"
            sx={{ width: '100%', mt: 0.5 }}
          >
            📁 편집된 시나리오 저장
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
        </Paper>
      )}
    </Box>
  );
};

export default Sidebar; 