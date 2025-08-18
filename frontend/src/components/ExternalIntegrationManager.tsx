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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
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
  // 탭 상태: 0=Webhook, 1=ApiCall, 2=API 테스트
  const [tab, setTab] = useState(0);
  // 전역 API 테스트 탭 상태
  const [apiTestTabUrl, setApiTestTabUrl] = useState('');
  const [apiTestTabMethod, setApiTestTabMethod] = useState<'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'>('POST');
  const [apiTestTabHeaders, setApiTestTabHeaders] = useState<Record<string, string>>({ 'Content-Type': 'application/json' });
  const [apiTestTabBody, setApiTestTabBody] = useState('');
  const [apiTestTabLoading, setApiTestTabLoading] = useState(false);
  const [apiTestTabRespText, setApiTestTabRespText] = useState('');
  const [apiTestTabRespObj, setApiTestTabRespObj] = useState<any>(null);
  const [apiTestTabPastedText, setApiTestTabPastedText] = useState('');
  const [apiTestTabPastedObj, setApiTestTabPastedObj] = useState<any>(null);
  const [isRespTreeModalOpen, setIsRespTreeModalOpen] = useState(false);
  const [isPastedTreeModalOpen, setIsPastedTreeModalOpen] = useState(false);

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

  // 그룹 상태 및 그룹 생성 다이얼로그
  const [handlerGroups, setHandlerGroups] = useState<Array<{ type: 'webhook' | 'apicall'; name: string; baseUrl: string }>>([]);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [groupType, setGroupType] = useState<'webhook' | 'apicall'>('webhook');
  const [groupName, setGroupName] = useState('');
  const [groupBaseUrl, setGroupBaseUrl] = useState('');
  const [firstEntryName, setFirstEntryName] = useState('');
  const [firstEntryEndpoint, setFirstEntryEndpoint] = useState('');

  // 엔트리 추가/편집 UX 상태: webhook
  const [webhookUseGroup, setWebhookUseGroup] = useState(false);
  const [webhookSelectedGroup, setWebhookSelectedGroup] = useState('');
  const [webhookEntryName, setWebhookEntryName] = useState('');
  const [webhookEndpoint, setWebhookEndpoint] = useState('');
  // 엔트리 추가/편집 UX 상태: apicall
  const [apiUseGroup, setApiUseGroup] = useState(false);
  const [apiSelectedGroup, setApiSelectedGroup] = useState('');
  const [apiEntryName, setApiEntryName] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');

  // 시나리오에서 목록 로드 (webhooks 통합 리스트에서 type으로 분리) + 그룹 자동 생성
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

    // 자동 그룹 계산 및 병합 적용
    const existing = (scenario as any)?.handlerGroups || [];
    const auto = computeGroupsFromWebhooks(all as any[]);
    const merged = mergeGroups(existing, auto);
    setHandlerGroups(merged);
    if (scenario && JSON.stringify(existing) !== JSON.stringify(merged)) {
      onScenarioUpdate({ ...(scenario as any), handlerGroups: merged } as any);
    }
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
    // 그룹 입력 초기화
    setWebhookUseGroup(false);
    setWebhookSelectedGroup('');
    setWebhookEntryName('');
    setWebhookEndpoint('');
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
    // 그룹/엔드포인트 모드 자동 세팅
    try {
      const m = String(webhook.name || '').match(/^\(([^)]+)\)(.*)$/);
      const grpName = m ? m[1] : '';
      const entry = m ? m[2] : '';
      const groupDef = handlerGroups.find(g => g.type === 'webhook' && g.name === grpName);
      if (groupDef && groupDef.baseUrl && webhook.url?.startsWith(groupDef.baseUrl)) {
        const endpoint = webhook.url.slice(groupDef.baseUrl.length);
        setWebhookUseGroup(true);
        setWebhookSelectedGroup(grpName);
        setWebhookEntryName(entry);
        setWebhookEndpoint(endpoint);
      } else {
        setWebhookUseGroup(false);
        setWebhookSelectedGroup('');
        setWebhookEntryName('');
        setWebhookEndpoint('');
      }
    } catch {
      setWebhookUseGroup(false);
      setWebhookSelectedGroup('');
      setWebhookEntryName('');
      setWebhookEndpoint('');
    }
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
        handlerGroups,
      } as any;
      onScenarioUpdate(updatedScenario);
    }
  };
  const handleSaveWebhook = () => {
    try {
      const parsedHeaders = JSON.parse(webhookHeadersText);
      let finalName = webhookFormData.name;
      let finalUrl = webhookFormData.url;
      if (webhookUseGroup && webhookSelectedGroup) {
        const grp = handlerGroups.find(g => g.type === 'webhook' && g.name === webhookSelectedGroup);
        if (!grp) {
          alert('선택한 그룹을 찾을 수 없습니다.');
          return;
        }
        if (!webhookEntryName.trim()) {
          alert('엔트리 이름을 입력하세요.');
          return;
        }
        finalName = `(${grp.name})${webhookEntryName.trim()}`;
        finalUrl = joinUrl(grp.baseUrl, webhookEndpoint.trim());
      }
      const webhookData: Webhook = {
        name: finalName,
        url: finalUrl,
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
    // 그룹 입력 초기화
    setApiUseGroup(false);
    setApiSelectedGroup('');
    setApiEntryName('');
    setApiEndpoint('');
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
    // 그룹/엔드포인트 모드 자동 세팅
    try {
      const m = String(apicall.name || '').match(/^\(([^)]+)\)(.*)$/);
      const grpName = m ? m[1] : '';
      const entry = m ? m[2] : '';
      const groupDef = handlerGroups.find(g => g.type === 'apicall' && g.name === grpName);
      if (groupDef && groupDef.baseUrl && apicall.url?.startsWith(groupDef.baseUrl)) {
        const endpoint = apicall.url.slice(groupDef.baseUrl.length);
        setApiUseGroup(true);
        setApiSelectedGroup(grpName);
        setApiEntryName(entry);
        setApiEndpoint(endpoint);
      } else {
        setApiUseGroup(false);
        setApiSelectedGroup('');
        setApiEntryName('');
        setApiEndpoint('');
      }
    } catch {
      setApiUseGroup(false);
      setApiSelectedGroup('');
      setApiEntryName('');
      setApiEndpoint('');
    }
  };
  const handleDeleteApiCall = (apicallToDelete: ApiCallWithName) => {
    if (window.confirm(`"${apicallToDelete.name}" API Call을 삭제하시겠습니까?`)) {
      const updatedApiCalls = apicalls.filter(a => a.name !== apicallToDelete.name);
      setApicalls(updatedApiCalls);
      updateScenarioApiCalls(updatedApiCalls);
    }
  };
  const loadApiCallToTest = (apicall: ApiCallWithName) => {
    try {
      setApiTestTabUrl(apicall.url || '');
      setApiTestTabMethod((apicall.formats?.method || 'POST') as any);
      setApiTestTabHeaders(apicall.formats?.headers || { 'Content-Type': 'application/json' });
      const tmpl = apicall.formats?.requestTemplate || '';
      if (tmpl && typeof tmpl === 'string') {
        try {
          const parsed = JSON.parse(tmpl);
          setApiTestTabBody(JSON.stringify(parsed, null, 2));
        } catch {
          setApiTestTabBody(tmpl);
        }
      } else {
        setApiTestTabBody('');
      }
      setTab(2);
    } catch {
      // noop
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
        handlerGroups,
      } as any;
      onScenarioUpdate(updatedScenario);
    }
  };

  // 그룹 생성 다이얼로그 오픈/저장
  const openGroupDialogFor = (type: 'webhook' | 'apicall') => {
    setGroupType(type);
    setGroupName('');
    setGroupBaseUrl('');
    setFirstEntryName('');
    setFirstEntryEndpoint('');
    setIsGroupDialogOpen(true);
  };
  const saveGroupWithFirstEntry = () => {
    if (!scenario || !groupName.trim() || !groupBaseUrl.trim() || !firstEntryName.trim()) return;
    const newGroups = mergeGroups(handlerGroups, [{ type: groupType, name: groupName.trim(), baseUrl: groupBaseUrl.trim() }]);
    const fullUrl = joinUrl(groupBaseUrl.trim(), firstEntryEndpoint.trim());
    const updatedScenario: any = { ...(scenario as any) };
    updatedScenario.handlerGroups = newGroups;
    const wlist = Array.isArray(updatedScenario.webhooks) ? updatedScenario.webhooks : [];
    if (groupType === 'webhook') {
      wlist.push({ type: 'webhook', name: `(${groupName.trim()})${firstEntryName.trim()}`, url: fullUrl, headers: {}, timeoutInMilliSecond: 5000, retry: 3 });
    } else {
      wlist.push({ type: 'apicall', name: `(${groupName.trim()})${firstEntryName.trim()}`, url: fullUrl, timeout: 5000, retry: 3, timeoutInMilliSecond: 5000, headers: {}, formats: { method: 'POST', headers: {}, requestTemplate: '', responseSchema: {}, responseMappings: {} } });
    }
    updatedScenario.webhooks = wlist;
      onScenarioUpdate(updatedScenario);
    setHandlerGroups(newGroups);
    setIsGroupDialogOpen(false);
  };

  // URL 유틸
  const joinUrl = (base: string, endpoint: string) => {
    if (!base) return endpoint || '';
    const b = base.endsWith('/') ? base.slice(0, -1) : base;
    if (!endpoint) return b;
    const e = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return b + e;
  };
  const commonPrefix = (a: string, b: string) => {
    const len = Math.min(a.length, b.length);
    let i = 0;
    while (i < len && a[i] === b[i]) i++;
    return a.slice(0, i);
  };
  const inferBaseUrl = (urls: string[]) => {
    if (!urls || urls.length === 0) return '';
    try {
      if (urls.length === 1) {
        const u = new URL(urls[0]);
        return `${u.protocol}//${u.host}`;
      }
      let prefix = urls[0];
      for (let i = 1; i < urls.length; i++) prefix = commonPrefix(prefix, urls[i]);
      const lastSlash = prefix.lastIndexOf('/');
      const base = lastSlash > 7 ? prefix.slice(0, lastSlash) : prefix;
      const u = new URL(urls[0]);
      const minBase = `${u.protocol}//${u.host}`;
      return base.length < minBase.length || !base.startsWith(minBase) ? minBase : base;
    } catch {
      return urls[0];
    }
  };
  const computeGroupsFromWebhooks = (items: any[]) => {
    const groups: Record<string, { type: 'webhook' | 'apicall'; name: string; urls: string[] }> = {};
    (items || []).forEach((it) => {
      const type: 'webhook' | 'apicall' = it.type === 'apicall' ? 'apicall' : 'webhook';
      const nm: string = String(it.name || '');
      const m = nm.match(/^\(([^)]+)\)/);
      const grp = m ? m[1] : type;
      const key = `${type}::${grp}`;
      if (!groups[key]) groups[key] = { type, name: grp, urls: [] };
      if (it.url) groups[key].urls.push(String(it.url));
    });
    const result: Array<{ type: 'webhook' | 'apicall'; name: string; baseUrl: string }> = [];
    Object.values(groups).forEach((g) => result.push({ type: g.type, name: g.name, baseUrl: inferBaseUrl(g.urls) }));
    return result;
  };
  const mergeGroups = (oldArr: any[], newArr: any[]) => {
    const map = new Map<string, any>();
    (oldArr || []).forEach(g => map.set(`${g.type}::${g.name}`, g));
    (newArr || []).forEach(g => { const k = `${g.type}::${g.name}`; if (!map.has(k)) map.set(k, g); });
    return Array.from(map.values());
  };
  // JSONPath 트리 유틸 (TestPanel 스타일)
  const generateJsonPath = (obj: any, path: string = '$'): string[] => {
    const paths: string[] = [];
    if (obj === null || obj === undefined) return paths;
    if (Array.isArray(obj)) {
      paths.push(path);
      obj.forEach((item, index) => {
        const newPath = `${path}[${index}]`;
        paths.push(newPath);
        paths.push(...generateJsonPath(item, newPath));
      });
    } else if (typeof obj === 'object') {
      paths.push(path);
      Object.keys(obj).forEach(key => {
        const newPath = `${path}.${key}`;
        paths.push(newPath);
        paths.push(...generateJsonPath(obj[key], newPath));
      });
    } else {
      paths.push(path);
    }
    return paths;
  };
  const getValueByPath = (obj: any, path: string): any => {
    try {
      const cleanPath = path.replace(/^\$\.?/, '');
      if (!cleanPath) return obj;
      const parts = cleanPath.split(/[.\[\]]+/).filter(Boolean);
      let current = obj;
      for (const part of parts) {
        const isIndex = /^\d+$/.test(part);
        if (isIndex) {
          current = current?.[Number(part)];
        } else {
          current = current?.[part];
        }
      }
      return current;
    } catch {
      return undefined;
    }
  };
  const getValueType = (value: any): string => {
    if (value === null) return 'null';
    if (Array.isArray(value)) return `array[${value.length}]`;
    if (typeof value === 'object') return `object{${Object.keys(value || {}).length}}`;
    return typeof value;
  };
  const renderJsonPathTooltip = (value: any, path: string) => {
    const actualValue = getValueByPath(value, path);
    const valueType = getValueType(actualValue);
    const isLeafValue = !Array.isArray(actualValue) && typeof actualValue !== 'object';
    return (
      <Tooltip 
        title={
          <Box>
            <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold' }}>JSONPath: {path}</Typography>
            <Typography variant="caption" sx={{ display: 'block' }}>Type: {valueType}</Typography>
            {isLeafValue && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Value: {String(actualValue)}</Typography>
            )}
          </Box>
        }
        arrow
        placement="top"
      >
        <IconButton size="small" onClick={() => copyToClipboard(path)} sx={{ ml: 0.5, p: 0.25 }}>
          <ContentCopyIcon fontSize="inherit" />
        </IconButton>
      </Tooltip>
    );
  };
  const renderResponseValue = (obj: any, path: string = '$', depth: number = 0): React.ReactNode => {
    const maxDepth = 5;
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
          {renderJsonPathTooltip(apiTestTabRespObj, path)}
        </Box>
      );
    }
    if (Array.isArray(obj)) {
      if (obj.length === 0) {
        return (
          <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ color: '#666' }}>[]</span>
            {renderJsonPathTooltip(apiTestTabRespObj, path)}
          </Box>
        );
      }
      return (
        <Box sx={{ ml: depth > 0 ? 2 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#e91e63' }}>Array [{obj.length}]</Typography>
            {renderJsonPathTooltip(apiTestTabRespObj, path)}
          </Box>
          {obj.slice(0, 50).map((item, index) => (
            <Box key={index} sx={{ ml: 2, mb: 0.5 }}>
              <Typography variant="body2" component="div">
                <strong style={{ color: '#1976d2' }}>[{index}]:</strong>{' '}
                {renderResponseValue(item, `${path}[${index}]`, depth + 1)}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) {
        return (
          <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
            <span style={{ color: '#666' }}>{'{}'}</span>
            {renderJsonPathTooltip(apiTestTabRespObj, path)}
          </Box>
        );
      }
      return (
        <Box sx={{ ml: depth > 0 ? 2 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
            <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#ff9800' }}>Object {'{'}{keys.length}{'}'}</Typography>
            {renderJsonPathTooltip(apiTestTabRespObj, path)}
          </Box>
          {keys.slice(0, 100).map((key) => (
            <Box key={key} sx={{ ml: 2, mb: 0.5 }}>
              <Typography variant="body2" component="div">
                <strong style={{ color: '#4caf50' }}>{key}:</strong>{' '}
                {renderResponseValue(obj[key], `${path}.${key}`, depth + 1)}
              </Typography>
            </Box>
          ))}
        </Box>
      );
    }
    return (
      <Box sx={{ display: 'inline-flex', alignItems: 'center' }}>
        <span style={{ color: '#333', fontFamily: 'monospace', fontSize: '0.9em' }}>{typeof obj === 'string' ? `"${obj}"` : String(obj)}</span>
        {renderJsonPathTooltip(apiTestTabRespObj, path)}
      </Box>
    );
  };
  const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&');
  const isNameInGroup = (name: string, grp: string) => {
    return new RegExp(`^\\(${escapeRegExp(grp)}\\)`).test(String(name || ''));
  };
  const stripGroupFromName = (name: string, grp: string) => String(name || '').replace(new RegExp(`^\\(${escapeRegExp(grp)}\\)`), '');
  const endpointFromUrl = (url: string, baseUrl: string) => {
    if (!url || !baseUrl) return url || '';
    return url.startsWith(baseUrl) ? url.slice(baseUrl.length) || '/' : url;
  };
  const openAddWebhookEntryForGroup = (groupName: string) => {
    resetWebhookForm();
    setWebhookUseGroup(true);
    setWebhookSelectedGroup(groupName);
    setWebhookEntryName('');
    setWebhookEndpoint('');
    setIsWebhookDialogOpen(true);
  };
  const openAddApiCallEntryForGroup = (groupName: string) => {
    resetApiCallForm();
    setApiUseGroup(true);
    setApiSelectedGroup(groupName);
    setApiEntryName('');
    setApiEndpoint('');
    setIsApiCallDialogOpen(true);
  };
  const handleEditGroupBaseUrl = (type: 'webhook' | 'apicall', name: string, currentBaseUrl: string) => {
    const next = window.prompt(`${type} 그룹 "${name}"의 Base URL`, currentBaseUrl || '') || '';
    if (next.trim() === '' || next === currentBaseUrl) return;
    const updated = handlerGroups.map(g => (g.type === type && g.name === name ? { ...g, baseUrl: next.trim() } : g));
    setHandlerGroups(updated);
    if (scenario) onScenarioUpdate({ ...(scenario as any), handlerGroups: updated } as any);
  };
  const handleDeleteGroup = (type: 'webhook' | 'apicall', name: string) => {
    if (!window.confirm(`그룹 "${name}"을(를) 삭제하시겠습니까? 그룹에 속한 엔트리는 그룹 없음으로 이동합니다.`)) return;
    const updated = handlerGroups.filter(g => !(g.type === type && g.name === name));
    setHandlerGroups(updated);
    if (scenario) onScenarioUpdate({ ...(scenario as any), handlerGroups: updated } as any);
  };
  const handleSaveApiCall = () => {
    try {
      const parsedResponseSchema = JSON.parse(apiCallResponseSchemaText);
      let finalName = apiCallFormData.name;
      let finalUrl = apiCallFormData.url;
      if (apiUseGroup && apiSelectedGroup) {
        const grp = handlerGroups.find(g => g.type === 'apicall' && g.name === apiSelectedGroup);
        if (!grp) {
          alert('선택한 그룹을 찾을 수 없습니다.');
          return;
        }
        if (!apiEntryName.trim()) {
          alert('엔트리 이름을 입력하세요.');
          return;
        }
        finalName = `(${grp.name})${apiEntryName.trim()}`;
        finalUrl = joinUrl(grp.baseUrl, apiEndpoint.trim());
      }
      const apiCallData: ApiCallWithName = {
        name: finalName,
        url: finalUrl,
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
        <Tab label="API 테스트" />
      </Tabs>
      {tab === 0 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Webhook 관리</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => openGroupDialogFor('webhook')}>그룹 만들기</Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddWebhook}>Webhook 추가</Button>
            </Box>
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
                {(() => {
                  const groups = handlerGroups.filter(g => g.type === 'webhook');
                  const renderGroup = (grp: any) => (
                    <React.Fragment key={`wh-group-${grp.name}`}>
                  <TableRow>
                        <TableCell colSpan={6}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                              <Typography variant="subtitle2">그룹: {grp.name}</Typography>
                              <Typography variant="body2" color="text.secondary">Base URL: {grp.baseUrl}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <IconButton size="small" color="primary" onClick={() => openAddWebhookEntryForGroup(grp.name)} title="엔트리 추가">
                                <AddIcon />
                              </IconButton>
                              <IconButton size="small" onClick={() => handleEditGroupBaseUrl('webhook', grp.name, grp.baseUrl)} title="Base URL 수정">
                                <EditIcon />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={() => handleDeleteGroup('webhook', grp.name)} title="그룹 삭제">
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          </Box>
                    </TableCell>
                  </TableRow>
                      {webhooks.filter(w => isNameInGroup(w.name, grp.name)).map((webhook) => (
                    <TableRow key={webhook.name}>
                      <TableCell>
                            <Chip label={stripGroupFromName(webhook.name, grp.name)} size="small" color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>
                            <Typography variant="body2" sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{endpointFromUrl(webhook.url, grp.baseUrl)}</Typography>
                      </TableCell>
                      <TableCell>{webhook.timeoutInMilliSecond}ms</TableCell>
                      <TableCell>{webhook.retry}</TableCell>
                      <TableCell>
                            {Object.keys(webhook.headers).length > 0 ? <Chip label={`${Object.keys(webhook.headers).length}개`} size="small" color="secondary" variant="outlined" /> : <Typography variant="body2" color="text.secondary">없음</Typography>}
                      </TableCell>
                      <TableCell>
                            <IconButton size="small" onClick={() => handleEditWebhook(webhook)} color="primary"><EditIcon /></IconButton>
                            <IconButton size="small" onClick={() => handleDeleteWebhook(webhook)} color="error"><DeleteIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                      ))}
                    </React.Fragment>
                  );
                  return (
                    <>
                      {groups.map(renderGroup)}
                      {/* 그룹 없음 섹션 */}
                      {webhooks.some(w => !groups.some((g: any) => isNameInGroup(w.name, g.name))) && (
                        <React.Fragment>
                          <TableRow>
                            <TableCell colSpan={6}>
                              <Typography variant="subtitle2">그룹: (없음)</Typography>
                            </TableCell>
                          </TableRow>
                          {webhooks.filter(w => !groups.some((g: any) => isNameInGroup(w.name, g.name))).map((webhook) => (
                            <TableRow key={webhook.name}>
                              <TableCell>
                                <Chip label={webhook.name} size="small" color="default" variant="outlined" />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{webhook.url}</Typography>
                              </TableCell>
                              <TableCell>{webhook.timeoutInMilliSecond}ms</TableCell>
                              <TableCell>{webhook.retry}</TableCell>
                              <TableCell>
                                {Object.keys(webhook.headers).length > 0 ? <Chip label={`${Object.keys(webhook.headers).length}개`} size="small" color="secondary" variant="outlined" /> : <Typography variant="body2" color="text.secondary">없음</Typography>}
                              </TableCell>
                              <TableCell>
                                <IconButton size="small" onClick={() => handleEditWebhook(webhook)} color="primary"><EditIcon /></IconButton>
                                <IconButton size="small" onClick={() => handleDeleteWebhook(webhook)} color="error"><DeleteIcon /></IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      )}
                    </>
                  );
                })()}
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
                  disabled={!!editingWebhook || webhookUseGroup}
                />
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Chip
                    label={webhookUseGroup ? '그룹 모드' : '직접 URL 모드'}
                    color={webhookUseGroup ? 'primary' : 'default'}
                    onClick={() => setWebhookUseGroup(!webhookUseGroup)}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {webhookUseGroup ? '그룹과 엔드포인트로 URL을 구성합니다.' : 'URL을 직접 입력합니다.'}
                  </Typography>
                </Box>
                {webhookUseGroup ? (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl sx={{ minWidth: 180 }}>
                      <InputLabel>그룹 선택</InputLabel>
                      <Select label="그룹 선택" value={webhookSelectedGroup} onChange={(e) => setWebhookSelectedGroup(e.target.value as string)}>
                        {handlerGroups.filter(g => g.type === 'webhook').map(g => (
                          <MenuItem key={`wh-${g.name}`} value={g.name}>{`${g.name} (${g.baseUrl})`}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField label="엔트리 이름" value={webhookEntryName} onChange={(e) => setWebhookEntryName(e.target.value)} sx={{ minWidth: 160 }} />
                    <TextField label="Endpoint" value={webhookEndpoint} onChange={(e) => setWebhookEndpoint(e.target.value)} sx={{ flex: 1 }} placeholder="예: /webhook" />
                  </Box>
                ) : (
                <TextField
                  label="URL"
                  value={webhookFormData.url}
                  onChange={(e) => setWebhookFormData(prev => ({ ...prev, url: e.target.value }))}
                  fullWidth
                  required
                  helperText="예: http://172.27.31.215:8089/api/sentences/webhook"
                />
                )}
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
              <Button
                onClick={handleSaveWebhook}
                variant="contained"
                startIcon={<SaveIcon />}
                disabled={
                  webhookUseGroup
                    ? !(webhookSelectedGroup && webhookEntryName)
                    : !(webhookFormData.name && webhookFormData.url)
                }
              >
                저장
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
      {tab === 1 && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">API Call 관리</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button variant="outlined" startIcon={<AddIcon />} onClick={() => openGroupDialogFor('apicall')}>그룹 만들기</Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleAddApiCall}>API Call 추가</Button>
            </Box>
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
                {(() => {
                  const groups = handlerGroups.filter(g => g.type === 'apicall');
                  const renderGroup = (grp: any) => (
                    <React.Fragment key={`api-group-${grp.name}`}>
                  <TableRow>
                        <TableCell colSpan={5}>
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                              <Typography variant="subtitle2">그룹: {grp.name}</Typography>
                              <Typography variant="body2" color="text.secondary">Base URL: {grp.baseUrl}</Typography>
                            </Box>
                            <Box sx={{ display: 'flex', gap: 1 }}>
                              <IconButton size="small" color="primary" onClick={() => openAddApiCallEntryForGroup(grp.name)} title="엔트리 추가">
                                <AddIcon />
                              </IconButton>
                              <IconButton size="small" onClick={() => handleEditGroupBaseUrl('apicall', grp.name, grp.baseUrl)} title="Base URL 수정">
                                <EditIcon />
                              </IconButton>
                              <IconButton size="small" color="error" onClick={() => handleDeleteGroup('apicall', grp.name)} title="그룹 삭제">
                                <DeleteIcon />
                              </IconButton>
                            </Box>
                          </Box>
                    </TableCell>
                  </TableRow>
                      {apicalls.filter(a => isNameInGroup(a.name, grp.name)).map((apicall) => (
                    <TableRow key={apicall.name}>
                      <TableCell>
                            <Chip label={stripGroupFromName(apicall.name, grp.name)} size="small" color="primary" variant="outlined" />
                      </TableCell>
                      <TableCell>
                            <Typography variant="body2" sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{endpointFromUrl(apicall.url, grp.baseUrl)}</Typography>
                      </TableCell>
                      <TableCell>{apicall.timeout}ms</TableCell>
                      <TableCell>{apicall.retry}</TableCell>
                      <TableCell>
                            <IconButton size="small" onClick={() => loadApiCallToTest(apicall)} title="불러오기"><ContentCopyIcon /></IconButton>
                            <IconButton size="small" onClick={() => handleEditApiCall(apicall)} color="primary" title="편집"><EditIcon /></IconButton>
                            <IconButton size="small" onClick={() => handleDeleteApiCall(apicall)} color="error"><DeleteIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                      ))}
                    </React.Fragment>
                  );
                  return (
                    <>
                      {groups.map(renderGroup)}
                      {/* 그룹 없음 섹션 */}
                      {apicalls.some(a => !groups.some((g: any) => isNameInGroup(a.name, g.name))) && (
                        <React.Fragment>
                          <TableRow>
                            <TableCell colSpan={5}>
                              <Typography variant="subtitle2">그룹: (없음)</Typography>
                            </TableCell>
                          </TableRow>
                          {apicalls.filter(a => !groups.some((g: any) => isNameInGroup(a.name, g.name))).map((apicall) => (
                            <TableRow key={apicall.name}>
                              <TableCell>
                                <Chip label={apicall.name} size="small" color="default" variant="outlined" />
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" sx={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{apicall.url}</Typography>
                              </TableCell>
                              <TableCell>{apicall.timeout}ms</TableCell>
                              <TableCell>{apicall.retry}</TableCell>
                              <TableCell>
                                <IconButton size="small" onClick={() => handleEditApiCall(apicall)} color="primary"><EditIcon /></IconButton>
                                <IconButton size="small" onClick={() => handleDeleteApiCall(apicall)} color="error"><DeleteIcon /></IconButton>
                              </TableCell>
                            </TableRow>
                          ))}
                        </React.Fragment>
                      )}
                    </>
                  );
                })()}
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
                {/* 그룹/엔드포인트 기반 입력 전환 */}
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  <Chip
                    label={apiUseGroup ? '그룹 모드' : '직접 URL 모드'}
                    color={apiUseGroup ? 'primary' : 'default'}
                    onClick={() => setApiUseGroup(!apiUseGroup)}
                  />
                  <Typography variant="body2" color="text.secondary">
                    {apiUseGroup ? '그룹과 엔드포인트로 URL을 구성합니다.' : 'URL을 직접 입력합니다.'}
                  </Typography>
                </Box>
                {apiUseGroup ? (
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <FormControl sx={{ minWidth: 180 }}>
                      <InputLabel>그룹 선택</InputLabel>
                      <Select label="그룹 선택" value={apiSelectedGroup} onChange={(e) => setApiSelectedGroup(e.target.value as string)}>
                        {handlerGroups.filter(g => g.type === 'apicall').map(g => (
                          <MenuItem key={`api-${g.name}`} value={g.name}>{`${g.name} (${g.baseUrl})`}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <TextField label="엔트리 이름" value={apiEntryName} onChange={(e) => setApiEntryName(e.target.value)} sx={{ minWidth: 160 }} />
                    <TextField label="Endpoint" value={apiEndpoint} onChange={(e) => setApiEndpoint(e.target.value)} sx={{ flex: 1 }} placeholder="예: /search" />
                  </Box>
                ) : (
                <TextField
                  label="URL"
                  value={apiCallFormData.url}
                  onChange={(e) => setApiCallFormData(prev => ({ ...prev, url: e.target.value }))}
                  fullWidth
                  required
                  helperText="예: http://api.example.com/v1/search"
                />
                )}
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
              <Button
                onClick={handleSaveApiCall}
                variant="contained"
                startIcon={<SaveIcon />}
                disabled={
                  apiUseGroup
                    ? !(apiSelectedGroup && apiEntryName)
                    : !(apiCallFormData.name && apiCallFormData.url)
                }
              >
                저장
              </Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
      {tab === 2 && (
        <Box>
          <Alert severity="info" sx={{ mb: 2 }}>
            <Typography variant="body2">외부연동 관리에서 독립적인 API 테스트를 실행합니다.</Typography>
          </Alert>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mb: 1 }}>
            <TextField label="URL" value={apiTestTabUrl} onChange={(e) => setApiTestTabUrl(e.target.value)} fullWidth />
            <TextField label="Method" value={apiTestTabMethod} onChange={(e) => setApiTestTabMethod(e.target.value as any)} select SelectProps={{ native: true }} sx={{ width: 140 }}>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
              <option value="PATCH">PATCH</option>
            </TextField>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Headers (JSON)" value={JSON.stringify(apiTestTabHeaders, null, 2)} onChange={(e) => { try { setApiTestTabHeaders(JSON.parse(e.target.value)); } catch {} }} multiline rows={6} sx={{ flex: 1 }} />
            <TextField label="Body (JSON)" value={apiTestTabBody} onChange={(e) => setApiTestTabBody(e.target.value)} multiline rows={6} sx={{ flex: 1 }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
            <Button variant="contained" onClick={async () => {
              setApiTestTabLoading(true);
              setApiTestTabRespText('');
              setApiTestTabRespObj(null);
              try {
                const method = apiTestTabMethod;
                const url = apiTestTabUrl;
                const headers = apiTestTabHeaders;
                let data: any = undefined;
                if (method !== 'GET' && apiTestTabBody.trim()) {
                  try { data = JSON.parse(apiTestTabBody); } catch { data = apiTestTabBody; }
                }
                const resp = await axios({ url, method, headers, data });
                const text = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data, null, 2);
                setApiTestTabRespText(text);
                try { setApiTestTabRespObj(typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data); } catch { setApiTestTabRespObj(null); }
              } catch (e: any) {
                const errText = e?.response?.data ? (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data, null, 2)) : String(e);
                setApiTestTabRespText(errText);
                setApiTestTabRespObj(null);
              } finally {
                setApiTestTabLoading(false);
              }
            }} disabled={apiTestTabLoading || !apiTestTabUrl.trim()}>
              {apiTestTabLoading ? '전송중...' : 'API 테스트 실행'}
            </Button>
          </Box>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">응답</Typography>
            <TextField value={apiTestTabRespText} onChange={() => {}} multiline rows={8} fullWidth InputProps={{ readOnly: true }} />
          </Box>
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">응답 JSONPath 트리</Typography>
              <Button size="small" variant="text" onClick={() => setIsRespTreeModalOpen(true)}>크게 보기</Button>
            </Box>
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 280, overflow: 'auto', bgcolor: '#fafafa' }}>
              {apiTestTabRespObj ? (
                <Box sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {renderResponseValue(apiTestTabRespObj, '$', 0)}
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary">API 응답 JSON이 없거나 유효하지 않습니다.</Typography>
              )}
            </Box>
          </Box>
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">응답 JSON 붙여넣기 (직접 탐색)</Typography>
              <Button size="small" variant="text" onClick={() => setIsPastedTreeModalOpen(true)}>크게 보기</Button>
            </Box>
            <TextField label="응답 JSON (붙여넣기)" value={apiTestTabPastedText} onChange={(e) => { setApiTestTabPastedText(e.target.value); try { setApiTestTabPastedObj(JSON.parse(e.target.value)); } catch { setApiTestTabPastedObj(null); } }} multiline rows={6} fullWidth placeholder='임의의 응답 JSON을 붙여넣어 JSONPath를 탐색해보세요' />
            <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 280, overflow: 'auto', bgcolor: '#fafafa', mt: 1 }}>
              {apiTestTabPastedObj ? (
                <Box sx={{ fontFamily: 'monospace', fontSize: '12px' }}>
                  {renderResponseValue(apiTestTabPastedObj, '$', 0)}
                </Box>
              ) : (
                <Typography variant="caption" color="text.secondary">붙여넣은 JSON이 없거나 유효하지 않습니다.</Typography>
              )}
            </Box>
          </Box>
          {/* JSONPath 트리 모달들 */}
          <Dialog open={isRespTreeModalOpen} onClose={() => setIsRespTreeModalOpen(false)} maxWidth="lg" fullWidth>
            <DialogTitle>응답 JSONPath 트리</DialogTitle>
            <DialogContent>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 600, overflow: 'auto', bgcolor: '#fafafa' }}>
                {apiTestTabRespObj ? (
                  <Box sx={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {renderResponseValue(apiTestTabRespObj, '$', 0)}
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary">API 응답 JSON이 없거나 유효하지 않습니다.</Typography>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsRespTreeModalOpen(false)}>닫기</Button>
            </DialogActions>
          </Dialog>
          <Dialog open={isPastedTreeModalOpen} onClose={() => setIsPastedTreeModalOpen(false)} maxWidth="lg" fullWidth>
            <DialogTitle>붙여넣은 JSON JSONPath 트리</DialogTitle>
            <DialogContent>
              <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, maxHeight: 600, overflow: 'auto', bgcolor: '#fafafa' }}>
                {apiTestTabPastedObj ? (
                  <Box sx={{ fontFamily: 'monospace', fontSize: '13px' }}>
                    {renderResponseValue(apiTestTabPastedObj, '$', 0)}
                  </Box>
                ) : (
                  <Typography variant="caption" color="text.secondary">붙여넣은 JSON이 없거나 유효하지 않습니다.</Typography>
                )}
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setIsPastedTreeModalOpen(false)}>닫기</Button>
            </DialogActions>
          </Dialog>
        </Box>
      )}
      
      {/* 그룹 생성 다이얼로그 */}
      <Dialog open={isGroupDialogOpen} onClose={() => setIsGroupDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>그룹 만들기</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Type</InputLabel>
              <Select label="Type" value={groupType} onChange={(e) => setGroupType(e.target.value as any)}>
                <MenuItem value="webhook">webhook</MenuItem>
                <MenuItem value="apicall">apicall</MenuItem>
              </Select>
            </FormControl>
            <TextField label="그룹명" value={groupName} onChange={(e) => setGroupName(e.target.value)} fullWidth required placeholder="예: external_api" />
            <TextField label="Base URL" value={groupBaseUrl} onChange={(e) => setGroupBaseUrl(e.target.value)} fullWidth required placeholder="예: http://localhost:8000/api/v1" />
            <Alert severity="info">그룹 생성 시 첫 번째 엔트리를 반드시 등록해야 합니다.</Alert>
            <TextField label="엔트리 이름" value={firstEntryName} onChange={(e) => setFirstEntryName(e.target.value)} fullWidth required placeholder="예: search" />
            <TextField label="엔드포인트(Endpoint)" value={firstEntryEndpoint} onChange={(e) => setFirstEntryEndpoint(e.target.value)} fullWidth placeholder="예: /apicall 또는 /webhook" />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsGroupDialogOpen(false)} startIcon={<CancelIcon />}>취소</Button>
          <Button onClick={saveGroupWithFirstEntry} variant="contained" startIcon={<SaveIcon />} disabled={!groupName.trim() || !groupBaseUrl.trim() || !firstEntryName.trim()}>저장</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ExternalIntegrationManager; 