import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Chip,
  // FormControl,
  // InputLabel,
  // Select,
  // MenuItem,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { Webhook, Scenario } from '../types/scenario';

interface WebhookManagerProps {
  scenario: Scenario | null;
  onScenarioUpdate: (updatedScenario: Scenario) => void;
}

interface WebhookFormData {
  name: string;
  url: string;
  headers: Record<string, string>;
  timeoutInMilliSecond: number;
  retry: number;
}

const WebhookManager: React.FC<WebhookManagerProps> = ({ scenario, onScenarioUpdate }) => {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState<WebhookFormData>({
    name: '',
    url: '',
    headers: {},
    timeoutInMilliSecond: 5000,
    retry: 3,
  });
  const [headersText, setHeadersText] = useState('{}');

  // 시나리오에서 webhook 목록 로드
  useEffect(() => {
    if (scenario?.webhooks) {
      setWebhooks(scenario.webhooks);
    } else {
      setWebhooks([]);
    }
  }, [scenario]);

  // 폼 데이터 초기화
  const resetForm = () => {
    setFormData({
      name: '',
      url: '',
      headers: {},
      timeoutInMilliSecond: 5000,
      retry: 3,
    });
    setHeadersText('{}');
    setEditingWebhook(null);
  };

  // 새 webhook 추가
  const handleAddWebhook = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  // webhook 편집
  const handleEditWebhook = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setFormData({
      name: webhook.name,
      url: webhook.url,
      headers: webhook.headers,
      timeoutInMilliSecond: webhook.timeoutInMilliSecond,
      retry: webhook.retry,
    });
    setHeadersText(JSON.stringify(webhook.headers, null, 2));
    setIsDialogOpen(true);
  };

  // webhook 삭제
  const handleDeleteWebhook = (webhookToDelete: Webhook) => {
    if (window.confirm(`"${webhookToDelete.name}" webhook을 삭제하시겠습니까?`)) {
      const updatedWebhooks = webhooks.filter(w => w.name !== webhookToDelete.name);
      setWebhooks(updatedWebhooks);
      updateScenarioWebhooks(updatedWebhooks);
    }
  };

  // 시나리오 업데이트
  const updateScenarioWebhooks = (updatedWebhooks: Webhook[]) => {
    if (scenario) {
      const updatedScenario = {
        ...scenario,
        webhooks: updatedWebhooks,
      };
      onScenarioUpdate(updatedScenario);
    }
  };

  // 폼 저장
  const handleSaveWebhook = () => {
    try {
      // Headers JSON 파싱
      const parsedHeaders = JSON.parse(headersText);
      
      const webhookData: Webhook = {
        type: 'webhook',
        name: formData.name,
        url: formData.url,
        headers: parsedHeaders,
        timeoutInMilliSecond: formData.timeoutInMilliSecond,
        retry: formData.retry,
      };

      let updatedWebhooks: Webhook[];
      
      if (editingWebhook) {
        // 편집 모드
        updatedWebhooks = webhooks.map(w => 
          w.name === editingWebhook.name ? webhookData : w
        );
      } else {
        // 새 webhook 추가
        if (webhooks.some(w => w.name === webhookData.name)) {
          alert('같은 이름의 webhook이 이미 존재합니다.');
          return;
        }
        updatedWebhooks = [...webhooks, webhookData];
      }

      setWebhooks(updatedWebhooks);
      updateScenarioWebhooks(updatedWebhooks);
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      alert('Headers JSON 형식이 올바르지 않습니다.');
    }
  };

  // 폼 취소
  const handleCancelEdit = () => {
    setIsDialogOpen(false);
    resetForm();
  };

  // 헤더 텍스트 변경
  const handleHeadersChange = (value: string) => {
    setHeadersText(value);
    try {
      const parsed = JSON.parse(value);
      setFormData(prev => ({ ...prev, headers: parsed }));
    } catch (error) {
      // JSON 파싱 실패는 무시 (사용자가 입력 중일 수 있음)
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Webhook 관리</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleAddWebhook}
        >
          Webhook 추가
        </Button>
      </Box>

      <Alert severity="info" sx={{ mb: 2 }}>
        <Typography variant="body2">
          <strong>Global Webhook 관리:</strong><br/>
          • 여기서 등록된 webhook은 시나리오의 모든 webhook action에서 사용됩니다.<br/>
          • webhook 변경 사항은 자동으로 시나리오에 반영되며, 다운로드 시 JSON 파일에 포함됩니다.<br/>
          • 각 webhook은 고유한 이름을 가져야 합니다.
        </Typography>
      </Alert>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>이름</TableCell>
              <TableCell>URL</TableCell>
              <TableCell>타임아웃</TableCell>
              <TableCell>재시도</TableCell>
              <TableCell>헤더</TableCell>
              <TableCell>작업</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {webhooks.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  <Typography variant="body2" color="text.secondary">
                    등록된 webhook이 없습니다.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              webhooks.map((webhook) => (
                <TableRow key={webhook.name}>
                  <TableCell>
                    <Chip 
                      label={webhook.name} 
                      size="small" 
                      color="primary"
                      variant="outlined"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ 
                      maxWidth: 200, 
                      overflow: 'hidden', 
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {webhook.url}
                    </Typography>
                  </TableCell>
                  <TableCell>{webhook.timeoutInMilliSecond}ms</TableCell>
                  <TableCell>{webhook.retry}</TableCell>
                  <TableCell>
                    {Object.keys(webhook.headers).length > 0 ? (
                      <Chip 
                        label={`${Object.keys(webhook.headers).length}개`} 
                        size="small" 
                        color="secondary"
                        variant="outlined"
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">없음</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      size="small" 
                      onClick={() => handleEditWebhook(webhook)}
                      color="primary"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      onClick={() => handleDeleteWebhook(webhook)}
                      color="error"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Webhook 편집 다이얼로그 */}
      <Dialog open={isDialogOpen} onClose={handleCancelEdit} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingWebhook ? 'Webhook 편집' : 'Webhook 추가'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Webhook 이름"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              fullWidth
              required
              helperText="예: (intent_classifier)classifier"
              disabled={!!editingWebhook} // 편집 모드에서는 이름 변경 불가
            />
            
            <TextField
              label="URL"
              value={formData.url}
              onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
              fullWidth
              required
              helperText="예: http://172.27.31.215:8089/api/sentences/webhook"
            />
            
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="타임아웃 (ms)"
                type="number"
                value={formData.timeoutInMilliSecond}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  timeoutInMilliSecond: parseInt(e.target.value) || 5000 
                }))}
                sx={{ flex: 1 }}
              />
              
              <TextField
                label="재시도 횟수"
                type="number"
                value={formData.retry}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  retry: parseInt(e.target.value) || 3 
                }))}
                sx={{ flex: 1 }}
              />
            </Box>
            
            <TextField
              label="Headers (JSON)"
              value={headersText}
              onChange={(e) => handleHeadersChange(e.target.value)}
              multiline
              rows={4}
              fullWidth
              helperText='JSON 형식으로 입력하세요. 예: {"Content-Type": "application/json"}'
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelEdit} startIcon={<CancelIcon />}>
            취소
          </Button>
          <Button 
            onClick={handleSaveWebhook} 
            variant="contained" 
            startIcon={<SaveIcon />}
            disabled={!formData.name || !formData.url}
          >
            저장
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WebhookManager; 