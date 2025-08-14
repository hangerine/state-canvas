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
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import axios from 'axios';
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
  const [webhookBodyObj, setWebhookBodyObj] = useState<Record<string, any>>({});
  const [newWebhookHeaderKey, setNewWebhookHeaderKey] = useState('');
  const [newWebhookHeaderValue, setNewWebhookHeaderValue] = useState('');
  const [newWebhookBodyKey, setNewWebhookBodyKey] = useState('');
  const [newWebhookBodyValue, setNewWebhookBodyValue] = useState('');
  // Webhook 테스트 상태
  const [webhookTestLoading, setWebhookTestLoading] = useState(false);
  const [webhookTestRequestText, setWebhookTestRequestText] = useState('');
  const [webhookTestResponseText, setWebhookTestResponseText] = useState('');
  const [webhookTestResponseObj, setWebhookTestResponseObj] = useState<any>(null);
  const [webhookPastedResponseText, setWebhookPastedResponseText] = useState('');
  const [webhookPastedResponseObj, setWebhookPastedResponseObj] = useState<any>(null);

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
  const [apiCallResponseSchemaText, setApiCallResponseSchemaText] = useState('{}');
  // Response Mappings (key/value UI)
  const [responseMappingsObj, setResponseMappingsObj] = useState<Record<string, string>>({});
  const [newMappingKey, setNewMappingKey] = useState('');
  const [newMappingValue, setNewMappingValue] = useState('');
  const [newHeaderKey, setNewHeaderKey] = useState('');
  const [newHeaderValue, setNewHeaderValue] = useState('');
  // API 테스트 상태
  const [apiTestLoading, setApiTestLoading] = useState(false);
  const [testRequestBodyText, setTestRequestBodyText] = useState('');
  const [apiTestResponseText, setApiTestResponseText] = useState('');
  const [apiTestResponseObj, setApiTestResponseObj] = useState<any>(null);
  const [pastedResponseText, setPastedResponseText] = useState('');
  const [pastedResponseObj, setPastedResponseObj] = useState<any>(null);

  // 주요 헤더(빠른 추가)
  const defaultHeaderOptions = [
    { key: 'Content-Type', value: 'application/json' },
    { key: 'Accept', value: 'application/json' },
    { key: 'Authorization', value: 'Bearer ' },
    { key: 'User-Agent', value: 'StateCanvas/1.0' },
    { key: 'X-Requested-With', value: 'XMLHttpRequest' },
    { key: 'Cache-Control', value: 'no-cache' },
  ];

  // 시나리오에서 목록 로드 (webhooks 통합 리스트에서 type으로 분리)
  useEffect(() => {
    const all = scenario?.webhooks || [];
    const webhookOnly = all.filter((w: any) => !w.type || w.type === 'webhook');
    const apicallOnly = all.filter((w: any) => w.type === 'apicall');
    setWebhooks(webhookOnly as any);
    setApicalls(
      apicallOnly.map((w: any) => ({
        name: w.name,
        url: w.url,
        timeout: w.timeout || w.timeoutInMilliSecond || 5000,
        retry: w.retry || 3,
        formats: w.formats || { method: 'POST', headers: {}, requestTemplate: '', responseMappings: {}, responseSchema: {} }
      }))
    );
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
    setWebhookBodyObj({});
    setNewWebhookHeaderKey('');
    setNewWebhookHeaderValue('');
    setNewWebhookBodyKey('');
    setNewWebhookBodyValue('');
    setWebhookTestRequestText('');
    setWebhookTestResponseText('');
    setWebhookTestResponseObj(null);
    setWebhookPastedResponseText('');
    setWebhookPastedResponseObj(null);
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
    setApiCallResponseSchemaText('{}');
    setResponseMappingsObj({});
    setEditingApiCall(null);
    setNewHeaderKey('');
    setNewHeaderValue('');
    setNewMappingKey('');
    setNewMappingValue('');
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
    setWebhookBodyObj(webhook.body || {});
    try {
      const body = webhook.body || {};
      setWebhookTestRequestText(Object.keys(body).length > 0 ? JSON.stringify(body, null, 2) : '');
    } catch {
      setWebhookTestRequestText('');
    }
    setWebhookTestResponseText('');
    setWebhookTestResponseObj(null);
    setWebhookPastedResponseText('');
    setWebhookPastedResponseObj(null);
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
      // 기존 apicall 항목 유지, webhook 항목만 교체
      const existingApicalls = (scenario.webhooks || []).filter((w: any) => w.type === 'apicall');
      const normalizedWebhooks = (updatedWebhooks || []).map((w: any) => ({ ...w, type: 'webhook' }));
      const updatedScenario = {
        ...scenario,
        webhooks: [...normalizedWebhooks, ...existingApicalls],
      } as any;
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
        body: webhookBodyObj,
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
  // JSON 입력 방식은 사용하지 않음(키/값 UI로 대체)

  // webhook headers 조작
  const addWebhookHeader = (key: string, value: string = '') => {
    if (!key) return;
    setWebhookFormData(prev => ({ ...prev, headers: { ...prev.headers, [key]: value } }));
    setWebhookHeadersText(JSON.stringify({ ...webhookFormData.headers, [key]: value }, null, 2));
  };
  const removeWebhookHeader = (key: string) => {
    const { [key]: removed, ...rest } = webhookFormData.headers;
    setWebhookFormData(prev => ({ ...prev, headers: rest }));
    setWebhookHeadersText(JSON.stringify(rest, null, 2));
  };
  const updateWebhookHeaderKey = (oldKey: string, newKey: string) => {
    if (!newKey) return;
    const headers = { ...webhookFormData.headers } as Record<string, string>;
    const val = headers[oldKey];
    delete headers[oldKey];
    headers[newKey] = val;
    setWebhookFormData(prev => ({ ...prev, headers }));
    setWebhookHeadersText(JSON.stringify(headers, null, 2));
  };
  const updateWebhookHeaderValue = (key: string, value: string) => {
    const headers = { ...webhookFormData.headers, [key]: value };
    setWebhookFormData(prev => ({ ...prev, headers }));
    setWebhookHeadersText(JSON.stringify(headers, null, 2));
  };

  // webhook body 조작 (key/value → 저장 시 JSON)
  const addWebhookBodyField = (key: string, value: string = '') => {
    if (!key) return;
    setWebhookBodyObj(prev => ({ ...prev, [key]: value }));
  };
  const removeWebhookBodyField = (key: string) => {
    setWebhookBodyObj(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest;
    });
  };
  const updateWebhookBodyKey = (oldKey: string, newKey: string) => {
    if (!newKey) return;
    setWebhookBodyObj(prev => {
      const next = { ...prev } as Record<string, any>;
      const val = next[oldKey];
      delete next[oldKey];
      next[newKey] = val;
      return next;
    });
  };
  const updateWebhookBodyValue = (key: string, value: string) => {
    setWebhookBodyObj(prev => ({ ...prev, [key]: value }));
  };

  // Webhook 테스트 실행
  const runWebhookTest = async () => {
    setWebhookTestLoading(true);
    setWebhookTestResponseText('');
    setWebhookTestResponseObj(null);
    try {
      const url = webhookFormData.url;
      const headers = webhookFormData.headers || {};
      let data: any = {};
      if (webhookTestRequestText.trim()) {
        try { data = JSON.parse(webhookTestRequestText); } catch { data = webhookTestRequestText; }
      } else {
        data = webhookBodyObj || {};
      }
      const resp = await axios.post(url, data, { headers });
      const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
      setWebhookTestResponseText(text);
      try { setWebhookTestResponseObj(typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data); } catch { setWebhookTestResponseObj(null); }
    } catch (e: any) {
      const errText = e?.response?.data ? (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data, null, 2)) : String(e);
      setWebhookTestResponseText(errText);
      setWebhookTestResponseObj(null);
    } finally {
      setWebhookTestLoading(false);
    }
  };

  const handleWebhookPasteResponseChange = (text: string) => {
    setWebhookPastedResponseText(text);
    try { setWebhookPastedResponseObj(JSON.parse(text)); } catch { setWebhookPastedResponseObj(null); }
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
    setApiCallResponseSchemaText(JSON.stringify(apicall.formats.responseSchema || {}, null, 2));
    setResponseMappingsObj(apicall.formats.responseMappings || {});
    setIsApiCallDialogOpen(true);
    // 테스트 섹션 초기화
    try {
      const tmpl = apicall.formats.requestTemplate || '';
      if (tmpl) {
        const parsed = JSON.parse(tmpl);
        setTestRequestBodyText(JSON.stringify(parsed, null, 2));
      } else {
        setTestRequestBodyText('');
      }
    } catch {
      setTestRequestBodyText(apicall.formats.requestTemplate || '');
    }
    setApiTestResponseText('');
    setApiTestResponseObj(null);
    setPastedResponseText('');
    setPastedResponseObj(null);
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
      // apicalls를 webhooks(type='apicall')로 병합 저장
      const legacyWebhooks = scenario.webhooks || [];
      const apicallsAsWebhooks: Webhook[] = updatedApiCalls.map(a => ({
        type: 'apicall',
        name: a.name,
        url: a.url,
        timeout: a.timeout,
        retry: a.retry,
        headers: a.formats.headers || {},
        timeoutInMilliSecond: a.timeout, // for uniformity, although unused
        formats: a.formats,
      }));
      const updatedScenario = {
        ...scenario,
        webhooks: [...legacyWebhooks.filter(w => w.type !== 'apicall'), ...apicallsAsWebhooks],
        apicalls: undefined,
      } as any;
      onScenarioUpdate(updatedScenario);
    }
  };
  const handleSaveApiCall = () => {
    try {
      const parsedResponseSchema = JSON.parse(apiCallResponseSchemaText);
      const apiCallData: ApiCallWithName = {
        name: apiCallFormData.name,
        url: apiCallFormData.url,
        timeout: apiCallFormData.timeout,
        retry: apiCallFormData.retry,
        formats: {
          method: apiCallFormData.method as any,
          headers: apiCallFormData.headers,
          requestTemplate: apiCallFormData.requestTemplate,
          responseSchema: parsedResponseSchema,
          responseMappings: responseMappingsObj,
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
      alert('ResponseSchema JSON 형식이 올바르지 않습니다.');
    }
  };
  const handleCancelApiCallEdit = () => {
    setIsApiCallDialogOpen(false);
    resetApiCallForm();
  };
  // Header 조작 함수들
  const addHeaderToApiForm = (key: string, value: string = '') => {
    if (!key) return;
    setApiCallFormData(prev => ({ ...prev, headers: { ...prev.headers, [key]: value } }));
  };
  const removeHeaderFromApiForm = (key: string) => {
    setApiCallFormData(prev => {
      const { [key]: removed, ...rest } = prev.headers;
      return { ...prev, headers: rest };
    });
  };
  const updateHeaderKeyInApiForm = (oldKey: string, newKey: string) => {
    if (!newKey) return;
    setApiCallFormData(prev => {
      const headers = { ...prev.headers } as Record<string, string>;
      const value = headers[oldKey];
      delete headers[oldKey];
      headers[newKey] = value;
      return { ...prev, headers };
    });
  };
  const updateHeaderValueInApiForm = (key: string, newValue: string) => {
    setApiCallFormData(prev => ({ ...prev, headers: { ...prev.headers, [key]: newValue } }));
  };
  const handleApiCallResponseSchemaChange = (value: string) => {
    setApiCallResponseSchemaText(value);
    setApiCallFormData(prev => ({ ...prev, responseSchema: value }));
  };
  // Response Mappings 조작 함수들
  const addResponseMapping = (key: string, value: string = '') => {
    if (!key) return;
    setResponseMappingsObj(prev => ({ ...prev, [key]: value }));
  };
  const removeResponseMapping = (key: string) => {
    setResponseMappingsObj(prev => {
      const { [key]: removed, ...rest } = prev;
      return rest;
    });
  };
  const updateResponseMappingKey = (oldKey: string, newKey: string) => {
    if (!newKey) return;
    setResponseMappingsObj(prev => {
      const next = { ...prev } as Record<string, string>;
      const value = next[oldKey];
      delete next[oldKey];
      next[newKey] = value;
      return next;
    });
  };
  const updateResponseMappingValue = (key: string, newValue: string) => {
    setResponseMappingsObj(prev => ({ ...prev, [key]: newValue }));
  };

  // JSONPath 유틸
  const getAllJsonPaths = (obj: any, base: string = '$'): Array<{ path: string; value: any }> => {
    const result: Array<{ path: string; value: any }> = [];
    const walk = (node: any, currentPath: string) => {
      result.push({ path: currentPath, value: node });
      if (Array.isArray(node)) {
        node.forEach((item, idx) => walk(item, `${currentPath}[${idx}]`));
      } else if (node && typeof node === 'object') {
        Object.keys(node).forEach((key) => walk(node[key], `${currentPath}.${key}`));
      }
    };
    try {
      walk(obj, base);
    } catch {}
    return result;
  };

  const copyToClipboard = (text: string) => {
    try { navigator.clipboard.writeText(text); } catch {}
  };

  const handlePasteResponseChange = (text: string) => {
    setPastedResponseText(text);
    try {
      const parsed = JSON.parse(text);
      setPastedResponseObj(parsed);
    } catch {
      setPastedResponseObj(null);
    }
  };

  const runApiTest = async () => {
    setApiTestLoading(true);
    setApiTestResponseText('');
    setApiTestResponseObj(null);
    try {
      const url = apiCallFormData.url;
      const method = (apiCallFormData.method || 'POST').toUpperCase();
      const headers = apiCallFormData.headers || {};
      let data: any = undefined;
      if (method !== 'GET' && testRequestBodyText.trim()) {
        try {
          data = JSON.parse(testRequestBodyText);
        } catch {
          data = testRequestBodyText;
        }
      }
      let resp;
      if (method === 'GET') {
        resp = await axios.get(url, { headers });
      } else if (method === 'DELETE') {
        resp = await axios.delete(url, { headers });
      } else {
        resp = await axios.request({ method: method.toLowerCase() as any, url, headers, data });
      }
      const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
      setApiTestResponseText(text);
      try { setApiTestResponseObj(typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data); } catch { setApiTestResponseObj(null); }
    } catch (e: any) {
      const errText = e?.response?.data ? (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data, null, 2)) : String(e);
      setApiTestResponseText(errText);
      setApiTestResponseObj(null);
    } finally {
      setApiTestLoading(false);
    }
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
                {/* (Webhook 편집에서는 API 테스트 제공하지 않음) */}
                {/* Headers: 빠른추가 + key/value 편집 */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>HTTP Headers</Typography>
                  <Box sx={{ mb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {defaultHeaderOptions.map(option => (
                      <Chip
                        key={option.key}
                        label={`${option.key}: ${option.value}`}
                        variant="outlined"
                        size="small"
                        clickable
                        onClick={() => addWebhookHeader(option.key, option.value)}
                      />
                    ))}
                  </Box>
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, bgcolor: '#f9f9f9' }}>
                    {Object.entries(webhookFormData.headers || {}).length === 0 ? (
                      <Typography variant="caption" color="text.secondary">설정된 헤더가 없습니다.</Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {Object.entries(webhookFormData.headers).map(([key, value]) => (
                              <TableRow key={key}>
                                <TableCell sx={{ width: '30%' }}>
                                  <TextField size="small" label="Key" value={key} onChange={(e) => updateWebhookHeaderKey(key, e.target.value)} fullWidth />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" label="Value" value={String(value)} onChange={(e) => updateWebhookHeaderValue(key, e.target.value)} fullWidth />
                                </TableCell>
                                <TableCell sx={{ width: 56 }} align="right">
                                  <IconButton size="small" color="error" onClick={() => removeWebhookHeader(key)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                    <TextField size="small" placeholder="Header Key" value={newWebhookHeaderKey} onChange={(e) => setNewWebhookHeaderKey(e.target.value)} sx={{ flex: 1 }} />
                    <TextField size="small" placeholder="Header Value" value={newWebhookHeaderValue} onChange={(e) => setNewWebhookHeaderValue(e.target.value)} sx={{ flex: 2 }} />
                    <Button size="small" variant="outlined" onClick={() => { addWebhookHeader(newWebhookHeaderKey.trim(), newWebhookHeaderValue.trim()); setNewWebhookHeaderKey(''); setNewWebhookHeaderValue(''); }}>추가</Button>
                  </Box>
                </Box>

                {/* Body: key/value → 전송 시 JSON */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Request Body (key/value)</Typography>
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, bgcolor: '#f9f9f9' }}>
                    {Object.entries(webhookBodyObj || {}).length === 0 ? (
                      <Typography variant="caption" color="text.secondary">정의된 Body 필드가 없습니다.</Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {Object.entries(webhookBodyObj).map(([key, value]) => (
                              <TableRow key={key}>
                                <TableCell sx={{ width: '30%' }}>
                                  <TextField size="small" label="Key" value={key} onChange={(e) => updateWebhookBodyKey(key, e.target.value)} fullWidth />
                                </TableCell>
                                <TableCell>
                                  <TextField size="small" label="Value" value={String(value)} onChange={(e) => updateWebhookBodyValue(key, e.target.value)} fullWidth />
                                </TableCell>
                                <TableCell sx={{ width: 56 }} align="right">
                                  <IconButton size="small" color="error" onClick={() => removeWebhookBodyField(key)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                    <TextField size="small" placeholder="Body Key" value={newWebhookBodyKey} onChange={(e) => setNewWebhookBodyKey(e.target.value)} sx={{ flex: 1 }} />
                    <TextField size="small" placeholder="Body Value" value={newWebhookBodyValue} onChange={(e) => setNewWebhookBodyValue(e.target.value)} sx={{ flex: 2 }} />
                    <Button size="small" variant="outlined" onClick={() => { addWebhookBodyField(newWebhookBodyKey.trim(), newWebhookBodyValue.trim()); setNewWebhookBodyKey(''); setNewWebhookBodyValue(''); }}>추가</Button>
                  </Box>
                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                    전송 시 JSON으로 변환되어 POST 본문으로 사용됩니다.
                  </Typography>
                </Box>

                {/* Webhook 테스트 섹션 */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>Webhook 테스트</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <TextField
                      label="요청 본문 (JSON)"
                      value={webhookTestRequestText}
                      onChange={(e) => setWebhookTestRequestText(e.target.value)}
                      multiline
                      rows={4}
                      fullWidth
                      placeholder='{"text": "hello"}'
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 160 }}>
                      <Button variant="contained" onClick={runWebhookTest} disabled={webhookTestLoading || !webhookFormData.url}>
                        {webhookTestLoading ? '전송중...' : 'Webhook 실행'}
                      </Button>
                      <Button variant="outlined" onClick={() => { setWebhookTestResponseText(''); setWebhookTestResponseObj(null); }}>응답 지우기</Button>
                    </Box>
                  </Box>
                  <TextField
                    label="응답 JSON (결과)"
                    value={webhookTestResponseText}
                    onChange={(e) => setWebhookTestResponseText(e.target.value)}
                    multiline
                    rows={6}
                    fullWidth
                    placeholder="Webhook 응답이 여기에 표시됩니다"
                  />
                  <Typography variant="subtitle2" sx={{ mt: 1, color: 'text.secondary' }}>
                    응답 JSONPath 탐색 (클릭하여 복사)
                  </Typography>
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 240, overflow: 'auto', bgcolor: '#fafafa' }}>
                    {webhookTestResponseObj ? (
                      <Table size="small">
                        <TableBody>
                          {getAllJsonPaths(webhookTestResponseObj).map(({ path, value }) => (
                            <TableRow key={path}>
                              <TableCell sx={{ width: '55%' }}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{path}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ width: 64 }} align="right">
                                <IconButton size="small" onClick={() => copyToClipboard(path)} title="JSONPath 복사"><ContentCopyIcon fontSize="inherit" /></IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Typography variant="caption" color="text.secondary">Webhook 응답 JSON이 없거나 유효하지 않습니다.</Typography>
                    )}
                  </Box>

                  <Typography variant="subtitle2" sx={{ mt: 2 }}>응답 JSON 붙여넣기 (직접 탐색)</Typography>
                  <TextField
                    label="응답 JSON (붙여넣기)"
                    value={webhookPastedResponseText}
                    onChange={(e) => handleWebhookPasteResponseChange(e.target.value)}
                    multiline
                    rows={4}
                    fullWidth
                    placeholder='임의의 응답 JSON을 붙여넣어 JSONPath를 탐색해보세요'
                  />
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 200, overflow: 'auto', bgcolor: '#fafafa', mt: 1 }}>
                    {webhookPastedResponseObj ? (
                      <Table size="small">
                        <TableBody>
                          {getAllJsonPaths(webhookPastedResponseObj).map(({ path, value }) => (
                            <TableRow key={path}>
                              <TableCell sx={{ width: '55%' }}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{path}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ width: 64 }} align="right">
                                <IconButton size="small" onClick={() => copyToClipboard(path)} title="JSONPath 복사"><ContentCopyIcon fontSize="inherit" /></IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Typography variant="caption" color="text.secondary">붙여넣은 JSON이 없거나 유효하지 않습니다.</Typography>
                    )}
                  </Box>
                </Box>
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
                  label="HTTP Method"
                  value={apiCallFormData.method}
                  onChange={(e) => setApiCallFormData(prev => ({ ...prev, method: e.target.value }))}
                  fullWidth
                  select
                  SelectProps={{ native: true }}
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                  <option value="PATCH">PATCH</option>
                </TextField>
                <TextField
                  label="Request Template"
                  value={apiCallFormData.requestTemplate}
                  onChange={(e) => setApiCallFormData(prev => ({ ...prev, requestTemplate: e.target.value }))}
                  multiline
                  rows={4}
                  fullWidth
                  placeholder='{"text": "{{USER_TEXT_INPUT.[0]}}", "sessionId": "{{sessionId}}", "requestId": "{{requestId}}"}'
                  helperText="사용 가능한 변수: {{sessionId}}, {{requestId}}, {{USER_TEXT_INPUT.[0]}}, {{memorySlots.KEY.value.[0]}}, {{customKey}} 등"
                />
                {/* Headers 설정 (Key/Value + 빠른 추가) */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>HTTP Headers</Typography>
                  {/* 기본 헤더 빠른 추가 */}
                  <Box sx={{ mb: 1, display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {defaultHeaderOptions.map(option => (
                      <Chip
                        key={option.key}
                        label={`${option.key}: ${option.value}`}
                        variant="outlined"
                        size="small"
                        clickable
                        onClick={() => addHeaderToApiForm(option.key, option.value)}
                      />
                    ))}
                  </Box>
                  {/* 현재 헤더 목록 */}
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, minHeight: 60, bgcolor: '#f9f9f9' }}>
                    {Object.entries(apiCallFormData.headers || {}).length === 0 ? (
                      <Typography variant="caption" color="text.secondary">설정된 헤더가 없습니다.</Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {Object.entries(apiCallFormData.headers).map(([key, value]) => (
                              <TableRow key={key}>
                                <TableCell sx={{ width: '30%' }}>
                                  <TextField
                                    size="small"
                                    label="Key"
                                    value={key}
                                    onChange={(e) => updateHeaderKeyInApiForm(key, e.target.value)}
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    label="Value"
                                    value={String(value)}
                                    onChange={(e) => updateHeaderValueInApiForm(key, e.target.value)}
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell sx={{ width: 56 }} align="right">
                                  <IconButton size="small" color="error" onClick={() => removeHeaderFromApiForm(key)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                  {/* 새 헤더 추가 */}
                  <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                    <TextField
                      size="small"
                      placeholder="Header Key"
                      value={newHeaderKey}
                      onChange={(e) => setNewHeaderKey(e.target.value)}
                      sx={{ flex: 1 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addHeaderToApiForm(newHeaderKey.trim(), newHeaderValue.trim());
                          setNewHeaderKey('');
                          setNewHeaderValue('');
                        }
                      }}
                    />
                    <TextField
                      size="small"
                      placeholder="Header Value"
                      value={newHeaderValue}
                      onChange={(e) => setNewHeaderValue(e.target.value)}
                      sx={{ flex: 2 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addHeaderToApiForm(newHeaderKey.trim(), newHeaderValue.trim());
                          setNewHeaderKey('');
                          setNewHeaderValue('');
                        }
                      }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        addHeaderToApiForm(newHeaderKey.trim(), newHeaderValue.trim());
                        setNewHeaderKey('');
                        setNewHeaderValue('');
                      }}
                    >
                      추가
                    </Button>
                  </Box>
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
                {/* Response Mappings (Key/Value: JSONPath) */}
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Response Mappings (JSONPath)</Typography>
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, minHeight: 60, bgcolor: '#f9f9f9' }}>
                    {Object.entries(responseMappingsObj || {}).length === 0 ? (
                      <Typography variant="caption" color="text.secondary">정의된 매핑이 없습니다.</Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableBody>
                            {Object.entries(responseMappingsObj).map(([key, value]) => (
                              <TableRow key={key}>
                                <TableCell sx={{ width: '30%' }}>
                                  <TextField
                                    size="small"
                                    label="Memory Key"
                                    value={key}
                                    onChange={(e) => updateResponseMappingKey(key, e.target.value)}
                                    fullWidth
                                  />
                                </TableCell>
                                <TableCell>
                                  <TextField
                                    size="small"
                                    label="JSONPath"
                                    value={String(value)}
                                    onChange={(e) => updateResponseMappingValue(key, e.target.value)}
                                    fullWidth
                                    placeholder='예: $.nlu.intent'
                                  />
                                </TableCell>
                                <TableCell sx={{ width: 56 }} align="right">
                                  <IconButton size="small" color="error" onClick={() => removeResponseMapping(key)}>
                                    <DeleteIcon fontSize="small" />
                                  </IconButton>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </Box>
                  <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                    <TextField
                      size="small"
                      placeholder="Memory Key (예: NLU_INTENT)"
                      value={newMappingKey}
                      onChange={(e) => setNewMappingKey(e.target.value)}
                      sx={{ flex: 1 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addResponseMapping(newMappingKey.trim(), newMappingValue.trim());
                          setNewMappingKey('');
                          setNewMappingValue('');
                        }
                      }}
                    />
                    <TextField
                      size="small"
                      placeholder="JSONPath (예: $.nlu.intent)"
                      value={newMappingValue}
                      onChange={(e) => setNewMappingValue(e.target.value)}
                      sx={{ flex: 2 }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addResponseMapping(newMappingKey.trim(), newMappingValue.trim());
                          setNewMappingKey('');
                          setNewMappingValue('');
                        }
                      }}
                    />
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        addResponseMapping(newMappingKey.trim(), newMappingValue.trim());
                        setNewMappingKey('');
                        setNewMappingValue('');
                      }}
                    >
                      추가
                    </Button>
                  </Box>
                </Box>

                {/* API 테스트 섹션 (APICall 편집 전용) */}
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>API 테스트</Typography>
                  <Box sx={{ display: 'flex', gap: 1, mb: 1 }}>
                    <TextField
                      label="요청 본문 (JSON)"
                      value={testRequestBodyText}
                      onChange={(e) => setTestRequestBodyText(e.target.value)}
                      multiline
                      rows={4}
                      fullWidth
                      placeholder='{"text": "hello", "sessionId": "session-123"}'
                    />
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 160 }}>
                      <Button variant="contained" onClick={runApiTest} disabled={apiTestLoading || !apiCallFormData.url}>
                        {apiTestLoading ? '전송중...' : 'API 테스트 실행'}
                      </Button>
                      <Button variant="outlined" onClick={() => { setApiTestResponseText(''); setApiTestResponseObj(null); }}>응답 지우기</Button>
                    </Box>
                  </Box>
                  <TextField
                    label="응답 JSON (결과)"
                    value={apiTestResponseText}
                    onChange={(e) => setApiTestResponseText(e.target.value)}
                    multiline
                    rows={6}
                    fullWidth
                    placeholder="API 응답이 여기에 표시됩니다"
                  />
                  <Typography variant="subtitle2" sx={{ mt: 1, color: 'text.secondary' }}>
                    응답 JSONPath 탐색 (클릭하여 복사/매핑 추가)
                  </Typography>
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 240, overflow: 'auto', bgcolor: '#fafafa' }}>
                    {apiTestResponseObj ? (
                      <Table size="small">
                        <TableBody>
                          {getAllJsonPaths(apiTestResponseObj).map(({ path, value }) => (
                            <TableRow key={path}>
                              <TableCell sx={{ width: '55%' }}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{path}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ width: 88 }} align="right">
                                <IconButton size="small" onClick={() => copyToClipboard(path)} title="JSONPath 복사"><ContentCopyIcon fontSize="inherit" /></IconButton>
                                <IconButton size="small" onClick={() => {
                                  const key = window.prompt('매핑에 추가할 Memory Key를 입력하세요', 'NLU_INTENT') || '';
                                  if (key.trim()) addResponseMapping(key.trim(), path);
                                }} title="매핑에 추가"><AddIcon fontSize="inherit" /></IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Typography variant="caption" color="text.secondary">API 응답 JSON이 없거나 유효하지 않습니다.</Typography>
                    )}
                  </Box>

                  <Typography variant="subtitle2" sx={{ mt: 2 }}>응답 JSON 붙여넣기 (직접 탐색)</Typography>
                  <TextField
                    label="응답 JSON (붙여넣기)"
                    value={pastedResponseText}
                    onChange={(e) => handlePasteResponseChange(e.target.value)}
                    multiline
                    rows={4}
                    fullWidth
                    placeholder='임의의 응답 JSON을 붙여넣어 JSONPath를 탐색해보세요'
                  />
                  <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 200, overflow: 'auto', bgcolor: '#fafafa', mt: 1 }}>
                    {pastedResponseObj ? (
                      <Table size="small">
                        <TableBody>
                          {getAllJsonPaths(pastedResponseObj).map(({ path, value }) => (
                            <TableRow key={path}>
                              <TableCell sx={{ width: '55%' }}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>{path}</Typography>
                              </TableCell>
                              <TableCell>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                </Typography>
                              </TableCell>
                              <TableCell sx={{ width: 88 }} align="right">
                                <IconButton size="small" onClick={() => copyToClipboard(path)} title="JSONPath 복사"><ContentCopyIcon fontSize="inherit" /></IconButton>
                                <IconButton size="small" onClick={() => {
                                  const key = window.prompt('매핑에 추가할 Memory Key를 입력하세요', 'NLU_INTENT') || '';
                                  if (key.trim()) addResponseMapping(key.trim(), path);
                                }} title="매핑에 추가"><AddIcon fontSize="inherit" /></IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    ) : (
                      <Typography variant="caption" color="text.secondary">붙여넣은 JSON이 없거나 유효하지 않습니다.</Typography>
                    )}
                  </Box>
                </Box>
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