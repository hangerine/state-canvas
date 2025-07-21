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
  Tabs,
  Tab,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
} from '@mui/icons-material';
import { Webhook, Scenario, ApiCallWithName } from '../types/scenario';

interface ExternalIntegrationManagerProps {
  scenario: Scenario | null;
  onScenarioUpdate: (updatedScenario: Scenario) => void;
}

// Webhook용 폼 데이터
interface WebhookFormData {
  name: string;
  url: string;
  headers: Record<string, string>;
  timeoutInMilliSecond: number;
  retry: number;
}

// ApiCall용 폼 데이터
interface ApiCallFormData {
  name: string;
  url: string;
  timeout: number;
  retry: number;
  method: string;
  headers: Record<string, string>;
  requestTemplate: string;
  responseSchema: string;
  responseMappings: string;
}

const ExternalIntegrationManager: React.FC<ExternalIntegrationManagerProps> = ({ scenario, onScenarioUpdate }) => {
  // 탭 상태: 0=Webhook, 1=ApiCall
  const [tab, setTab] = useState(0);

  // Webhook 상태
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [isWebhookDialogOpen, setIsWebhookDialogOpen] = useState(false);
  const [webhookFormData, setWebhookFormData] = useState<WebhookFormData>({
    name: '',
    url: '',
    headers: {},
    timeoutInMilliSecond: 5000,
    retry: 3,
  });
  const [webhookHeadersText, setWebhookHeadersText] = useState('{}');

  // ApiCall 상태
  const [apicalls, setApicalls] = useState<ApiCallWithName[]>([]);
  const [editingApiCall, setEditingApiCall] = useState<ApiCallWithName | null>(null);
  const [isApiCallDialogOpen, setIsApiCallDialogOpen] = useState(false);
  const [apiCallFormData, setApiCallFormData] = useState<ApiCallFormData>({
    name: '',
    url: '',
    timeout: 5000,
    retry: 3,
    method: 'POST',
    headers: {},
    requestTemplate: '',
    responseSchema: '',
    responseMappings: '',
  });
  const [apiCallHeadersText, setApiCallHeadersText] = useState('{}');
  const [apiCallResponseSchemaText, setApiCallResponseSchemaText] = useState('{}');
  const [apiCallResponseMappingsText, setApiCallResponseMappingsText] = useState('{}');

  // 시나리오에서 목록 로드
  useEffect(() => {
    setWebhooks(scenario?.webhooks || []);
    setApicalls(scenario?.apicalls || []);
  }, [scenario]);

  // Webhook 폼 초기화
  const resetWebhookForm = () => {
    setWebhookFormData({
      name: '',
      url: '',
      headers: {},
      timeoutInMilliSecond: 5000,
      retry: 3,
    });
    setWebhookHeadersText('{}');
    setEditingWebhook(null);
  };

  // ApiCall 폼 초기화
  const resetApiCallForm = () => {
    setApiCallFormData({
      name: '',
      url: '',
      timeout: 5000,
      retry: 3,
      method: 'POST',
      headers: {},
      requestTemplate: '',
      responseSchema: '',
      responseMappings: '',
    });
    setApiCallHeadersText('{}');
    setApiCallResponseSchemaText('{}');
    setApiCallResponseMappingsText('{}');
    setEditingApiCall(null);
  };

  // Webhook 추가/편집
  const handleAddWebhook = () => {
    resetWebhookForm();
    setIsWebhookDialogOpen(true);
  };
  const handleEditWebhook = (webhook: Webhook) => {
    setEditingWebhook(webhook);
    setWebhookFormData({
      name: webhook.name,
      url: webhook.url,
      headers: webhook.headers,
      timeoutInMilliSecond: webhook.timeoutInMilliSecond,
      retry: webhook.retry,
    });
    setWebhookHeadersText(JSON.stringify(webhook.headers, null, 2));
    setIsWebhookDialogOpen(true);
  };
  const handleDeleteWebhook = (webhookToDelete: Webhook) => {
    if (window.confirm(`"${webhookToDelete.name}" webhook을 삭제하시겠습니까?`)) {
      const updatedWebhooks = webhooks.filter(w => w.name !== webhookToDelete.name);
      setWebhooks(updatedWebhooks);
      updateScenarioWebhooks(updatedWebhooks);
    }
  };
  const updateScenarioWebhooks = (updatedWebhooks: Webhook[]) => {
    if (scenario) {
      const updatedScenario = {
        ...scenario,
        webhooks: updatedWebhooks,
      };
      onScenarioUpdate(updatedScenario);
    }
  };
  const handleSaveWebhook = () => {
    try {
      const parsedHeaders = JSON.parse(webhookHeadersText);
      const webhookData: Webhook = {
        name: webhookFormData.name,
        url: webhookFormData.url,
        headers: parsedHeaders,
        timeoutInMilliSecond: webhookFormData.timeoutInMilliSecond,
        retry: webhookFormData.retry,
      };
      let updatedWebhooks: Webhook[];
      if (editingWebhook) {
        updatedWebhooks = webhooks.map(w => w.name === editingWebhook.name ? webhookData : w);
      } else {
        if (webhooks.some(w => w.name === webhookData.name)) {
          alert('같은 이름의 webhook이 이미 존재합니다.');
          return;
        }
        updatedWebhooks = [...webhooks, webhookData];
      }
      setWebhooks(updatedWebhooks);
      updateScenarioWebhooks(updatedWebhooks);
      setIsWebhookDialogOpen(false);
      resetWebhookForm();
    } catch (error) {
      alert('Headers JSON 형식이 올바르지 않습니다.');
    }
  };
  const handleCancelWebhookEdit = () => {
    setIsWebhookDialogOpen(false);
    resetWebhookForm();
  };
  const handleWebhookHeadersChange = (value: string) => {
    setWebhookHeadersText(value);
    try {
      const parsed = JSON.parse(value);
      setWebhookFormData(prev => ({ ...prev, headers: parsed }));
    } catch (error) {}
  };

  // ApiCall 추가/편집
  const handleAddApiCall = () => {
    resetApiCallForm();
    setIsApiCallDialogOpen(true);
  };
  const handleEditApiCall = (apicall: ApiCallWithName) => {
    setEditingApiCall(apicall);
    setApiCallFormData({
      name: apicall.name,
      url: apicall.url,
      timeout: apicall.timeout,
      retry: apicall.retry,
      method: apicall.formats.method,
      headers: apicall.formats.headers || {},
      requestTemplate: apicall.formats.requestTemplate || '',
      responseSchema: JSON.stringify(apicall.formats.responseSchema || {}, null, 2),
      responseMappings: JSON.stringify(apicall.formats.responseMappings || {}, null, 2),
    });
    setApiCallHeadersText(JSON.stringify(apicall.formats.headers || {}, null, 2));
    setApiCallResponseSchemaText(JSON.stringify(apicall.formats.responseSchema || {}, null, 2));
    setApiCallResponseMappingsText(JSON.stringify(apicall.formats.responseMappings || {}, null, 2));
    setIsApiCallDialogOpen(true);
  };
  const handleDeleteApiCall = (apicallToDelete: ApiCallWithName) => {
    if (window.confirm(`"${apicallToDelete.name}" API Call을 삭제하시겠습니까?`)) {
      const updatedApiCalls = apicalls.filter(a => a.name !== apicallToDelete.name);
      setApicalls(updatedApiCalls);
      updateScenarioApiCalls(updatedApiCalls);
    }
  };
  const updateScenarioApiCalls = (updatedApiCalls: ApiCallWithName[]) => {
    if (scenario) {
      const updatedScenario = {
        ...scenario,
        apicalls: updatedApiCalls,
      };
      onScenarioUpdate(updatedScenario);
    }
  };
  const handleSaveApiCall = () => {
    try {
      const parsedHeaders = JSON.parse(apiCallHeadersText);
      const parsedResponseSchema = JSON.parse(apiCallResponseSchemaText);
      const parsedResponseMappings = JSON.parse(apiCallResponseMappingsText);
      const apiCallData: ApiCallWithName = {
        name: apiCallFormData.name,
        url: apiCallFormData.url,
        timeout: apiCallFormData.timeout,
        retry: apiCallFormData.retry,
        formats: {
          method: apiCallFormData.method as any,
          headers: parsedHeaders,
          requestTemplate: apiCallFormData.requestTemplate,
          responseSchema: parsedResponseSchema,
          responseMappings: parsedResponseMappings,
        },
      };
      let updatedApiCalls: ApiCallWithName[];
      if (editingApiCall) {
        updatedApiCalls = apicalls.map(a => a.name === editingApiCall.name ? apiCallData : a);
      } else {
        if (apicalls.some(a => a.name === apiCallData.name)) {
          alert('같은 이름의 API Call이 이미 존재합니다.');
          return;
        }
        updatedApiCalls = [...apicalls, apiCallData];
      }
      setApicalls(updatedApiCalls);
      updateScenarioApiCalls(updatedApiCalls);
      setIsApiCallDialogOpen(false);
      resetApiCallForm();
    } catch (error) {
      alert('Headers/ResponseSchema/ResponseMappings JSON 형식이 올바르지 않습니다.');
    }
  };
  const handleCancelApiCallEdit = () => {
    setIsApiCallDialogOpen(false);
    resetApiCallForm();
  };
  const handleApiCallHeadersChange = (value: string) => {
    setApiCallHeadersText(value);
    try {
      const parsed = JSON.parse(value);
      setApiCallFormData(prev => ({ ...prev, headers: parsed }));
    } catch (error) {}
  };
  const handleApiCallResponseSchemaChange = (value: string) => {
    setApiCallResponseSchemaText(value);
    setApiCallFormData(prev => ({ ...prev, responseSchema: value }));
  };
  const handleApiCallResponseMappingsChange = (value: string) => {
    setApiCallResponseMappingsText(value);
    setApiCallFormData(prev => ({ ...prev, responseMappings: value }));
  };

  return (
    <Box sx={{ p: 2 }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Webhook 관리" />
        <Tab label="API Call 관리" />
      </Tabs>
      {tab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Webhook 관리</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddWebhook}>
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
                        <Chip label={webhook.name} size="small" color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {webhook.url}
                        </Typography>
                      </TableCell>
                      <TableCell>{webhook.timeoutInMilliSecond}ms</TableCell>
                      <TableCell>{webhook.retry}</TableCell>
                      <TableCell>
                        {Object.keys(webhook.headers).length > 0 ? (
                          <Chip label={`${Object.keys(webhook.headers).length}개`} size="small" color="secondary" variant="outlined" />
                        ) : (
                          <Typography variant="body2" color="text.secondary">없음</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleEditWebhook(webhook)} color="primary">
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteWebhook(webhook)} color="error">
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
          <Dialog open={isWebhookDialogOpen} onClose={handleCancelWebhookEdit} maxWidth="md" fullWidth>
            <DialogTitle>{editingWebhook ? 'Webhook 편집' : 'Webhook 추가'}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <TextField
                  label="Webhook 이름"
                  value={webhookFormData.name}
                  onChange={(e) => setWebhookFormData(prev => ({ ...prev, name: e.target.value }))}
                  fullWidth
                  required
                  helperText="예: (intent_classifier)classifier"
                  disabled={!!editingWebhook}
                />
                <TextField
                  label="URL"
                  value={webhookFormData.url}
                  onChange={(e) => setWebhookFormData(prev => ({ ...prev, url: e.target.value }))}
                  fullWidth
                  required
                  helperText="예: http://172.27.31.215:8089/api/sentences/webhook"
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="타임아웃 (ms)"
                    type="number"
                    value={webhookFormData.timeoutInMilliSecond}
                    onChange={(e) => setWebhookFormData(prev => ({ ...prev, timeoutInMilliSecond: parseInt(e.target.value) || 5000 }))}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="재시도 횟수"
                    type="number"
                    value={webhookFormData.retry}
                    onChange={(e) => setWebhookFormData(prev => ({ ...prev, retry: parseInt(e.target.value) || 3 }))}
                    sx={{ flex: 1 }}
                  />
                </Box>
                <TextField
                  label="Headers (JSON)"
                  value={webhookHeadersText}
                  onChange={(e) => handleWebhookHeadersChange(e.target.value)}
                  multiline
                  rows={4}
                  fullWidth
                  helperText='JSON 형식으로 입력하세요. 예: {"Content-Type": "application/json"}'
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCancelWebhookEdit} startIcon={<CancelIcon />}>취소</Button>
              <Button onClick={handleSaveWebhook} variant="contained" startIcon={<SaveIcon />} disabled={!webhookFormData.name || !webhookFormData.url}>저장</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">API Call 관리</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddApiCall}>
              API Call 추가
            </Button>
          </Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">
              <strong>Global API Call 관리:</strong><br/>
              • 여기서 등록된 API Call은 시나리오의 모든 apicall handler에서 사용됩니다.<br/>
              • API Call 변경 사항은 자동으로 시나리오에 반영되며, 다운로드 시 JSON 파일에 포함됩니다.<br/>
              • 각 API Call은 고유한 이름을 가져야 합니다.
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
                  <TableCell>작업</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {apicalls.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      <Typography variant="body2" color="text.secondary">
                        등록된 API Call이 없습니다.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  apicalls.map((apicall) => (
                    <TableRow key={apicall.name}>
                      <TableCell>
                        <Chip label={apicall.name} size="small" color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {apicall.url}
                        </Typography>
                      </TableCell>
                      <TableCell>{apicall.timeout}ms</TableCell>
                      <TableCell>{apicall.retry}</TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleEditApiCall(apicall)} color="primary">
                          <EditIcon />
                        </IconButton>
                        <IconButton size="small" onClick={() => handleDeleteApiCall(apicall)} color="error">
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          {/* API Call 편집 다이얼로그 */}
          <Dialog open={isApiCallDialogOpen} onClose={handleCancelApiCallEdit} maxWidth="md" fullWidth>
            <DialogTitle>{editingApiCall ? 'API Call 편집' : 'API Call 추가'}</DialogTitle>
            <DialogContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                <TextField
                  label="API Call 이름"
                  value={apiCallFormData.name}
                  onChange={(e) => setApiCallFormData(prev => ({ ...prev, name: e.target.value }))}
                  fullWidth
                  required
                  helperText="예: (external_api)search"
                  disabled={!!editingApiCall}
                />
                <TextField
                  label="URL"
                  value={apiCallFormData.url}
                  onChange={(e) => setApiCallFormData(prev => ({ ...prev, url: e.target.value }))}
                  fullWidth
                  required
                  helperText="예: http://api.example.com/v1/search"
                />
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <TextField
                    label="타임아웃 (ms)"
                    type="number"
                    value={apiCallFormData.timeout}
                    onChange={(e) => setApiCallFormData(prev => ({ ...prev, timeout: parseInt(e.target.value) || 5000 }))}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    label="재시도 횟수"
                    type="number"
                    value={apiCallFormData.retry}
                    onChange={(e) => setApiCallFormData(prev => ({ ...prev, retry: parseInt(e.target.value) || 3 }))}
                    sx={{ flex: 1 }}
                  />
                </Box>
                <TextField
                  label="Response Schema (JSON)"
                  value={apiCallResponseSchemaText}
                  onChange={(e) => handleApiCallResponseSchemaChange(e.target.value)}
                  multiline
                  rows={3}
                  fullWidth
                  sx={{ mt: 1 }}
                  placeholder='{"field1": "string", "field2": "number"}'
                  helperText="API 응답의 스키마를 JSON 형식으로 입력하세요."
                />
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={handleCancelApiCallEdit} startIcon={<CancelIcon />}>취소</Button>
              <Button onClick={handleSaveApiCall} variant="contained" startIcon={<SaveIcon />} disabled={!apiCallFormData.name || !apiCallFormData.url}>저장</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
    </Box>
  );
};

export default ExternalIntegrationManager; 