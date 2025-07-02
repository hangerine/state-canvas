import React, { useRef, useState } from 'react';
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
  Chip
} from '@mui/material';
import { ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { Scenario, FlowNode } from '../types/scenario';

interface SidebarProps {
  scenario: Scenario | null;
  selectedNode: FlowNode | null;
  onScenarioLoad: (scenario: Scenario) => void;
  onNodeUpdate: (node: FlowNode) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  scenario,
  selectedNode,
  onScenarioLoad,
  onNodeUpdate
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [validationError, setValidationError] = useState<string>('');
  const [editedNodeName, setEditedNodeName] = useState('');

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
        
        <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
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
            다운로드
          </Button>
        </Box>

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
                    label={handler.event.type} 
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