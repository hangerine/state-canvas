// 시나리오 JSON 구조 타입 정의
import { CSSProperties } from 'react';

// 새로운 UserInput 타입 정의
export interface UserInputValue {
  scope: string | null;
  type: string;
  value: Record<string, any>;
  version: string;
}

export interface CustomEventContent {
  type: string;
  value: UserInputValue;
}

export interface NLUEntity {
  role: string;
  type: string;
  text: string;
  normalization?: string;
  extra: Record<string, any>;
}

// UI에서 사용할 Entity 입력 타입
export interface EntityInput {
  id: string; // UI에서 관리용 임시 ID
  role: string;
  type: string;
  text: string;
  normalization?: string;
  extraTypeKr?: string; // extra.type_kr 필드를 위한 간편 입력
}

export interface NLUResult {
  nluNbest: Array<{
    intent: string;
    confidenceScore: number;
    status: string;
    entities: NLUEntity[];
    extra: Record<string, any>;
  }>;
  text: string;
  extra: Record<string, any>;
}

export interface TextContent {
  text: string;
  nluResult?: {
    type: string;
    results: NLUResult[];
  };
  value: UserInputValue;
}

export interface UserInput {
  type: 'text' | 'customEvent';
  content: TextContent | CustomEventContent;
}

// 새로운 챗봇 입력 포맷 타입들 - 사용자가 원하는 정확한 포맷
export interface ChatbotInputRequest {
  userId: string;
  botId: string;
  botVersion: string;
  botName: string;
  botResourcePath?: string;
  sessionId: string;
  requestId: string;
  userInput: UserInput;
  context?: Record<string, any>;
  headers?: Record<string, any>;
}

export interface ProcessInputRequest {
  sessionId: string;
  userInput: UserInput;
  currentState: string;
  scenario: Scenario;
  eventType?: string;
}

// 새로운 챗봇 포맷을 위한 요청 타입 - 플랫 구조
export interface ChatbotProcessRequest {
  // 기본 챗봇 요청 필드들
  userId: string;
  botId: string;
  botVersion: string;
  botName: string;
  botResourcePath?: string;
  sessionId: string;
  requestId: string;
  userInput: UserInput;
  context?: Record<string, any>;
  headers?: Record<string, any>;
  
  // 추가 처리 필드들
  currentState: string;
  scenario: Scenario | Scenario[];
  eventType?: string;
}

export interface TransitionTarget {
  scenario: string;
  dialogState: string;
}

export interface Action {
  directives?: Directive[];
  memoryActions?: MemoryAction[];
}

export interface Directive {
  name: string;
  content: any;
}

export interface MemoryAction {
  actionType: string;
  memorySlotKey: string;
  memorySlotValue: string;
  actionScope: string;
}

export interface ApiCallFormats {
  method: string;
  contentType: string;
  requestTemplate: string;
  responseProcessing?: Record<string, any>;
  responseMappings: Array<{
    type: 'memory' | 'directive';
    map: Record<string, string>;
  }>;
  headers?: Record<string, string>;
  queryParams?: Array<{name: string, value: string}>;
}

export interface ApiCall {
  url: string;
  timeoutInMilliSecond: number;
  retry: number;
  formats: ApiCallFormats;
}

// [추가] 이름이 포함된 글로벌 ApiCall 타입
export interface ApiCallWithName extends ApiCall {
  name: string;
}

export interface ApiCallHandler {
  name: string;
  apicall?: ApiCall;
  transitionTarget?: {
    scenario: string;
    dialogState: string;
  };
}

export interface ConditionHandler {
  conditionStatement: string;
  action: Action;
  transitionTarget: TransitionTarget;
}

export interface EventHandler {
  event: {
    type: string;
    count: string;
  } | string;
  action: Action;
  transitionTarget: TransitionTarget;
}

export interface IntentHandler {
  intent: string;
  action: Action;
  transitionTarget: TransitionTarget;
}

// [추가] 시나리오 간 전이를 위한 핸들러 타입
export interface ScenarioTransitionHandler {
  conditionStatement: string;
  action: Action;
  transitionTarget: {
    scenario: string;
    dialogState: string;
  };
}

export interface SlotFillingForm {
  name: string;
  required: string;
  memorySlotKey: string[];
  fillBehavior: {
    promptAction: Action;
    repromptEventHandlers: EventHandler[];
  };
}

export interface DialogState {
  name: string;
  entryAction?: Action;
  conditionHandlers?: ConditionHandler[];
  eventHandlers?: EventHandler[];
  intentHandlers?: IntentHandler[];
  webhookActions?: { name: string }[];
  apicallHandlers?: ApiCallHandler[];
  slotFillingForm?: SlotFillingForm[];
  // [추가] 시나리오 간 전이 핸들러
  scenarioTransitionHandlers?: ScenarioTransitionHandler[];
}

export interface IntentMapping {
  scenario: string;
  dialogState: string;
  intents: string[];
  conditionStatement: string;
  dmIntent: string;
}

export interface Webhook {
  type: 'webhook' | 'apicall';
  name: string;
  url: string;
  timeoutInMilliSecond: number;
  retry: number;
  headers: Record<string, string>;
  // apicall 타입일 때만 필요한 필드들
  queryParams?: Array<{name: string, value: string}>;
  formats?: ApiCallFormats;
}

export interface ScenarioPlan {
  name: string;
  dialogState: DialogState[];
  // scenarioTransitionNodes는 더 이상 사용하지 않음
  // 시나리오 전이는 transitionTarget의 scenarioName으로 판단
  // scenarioName이 현재 시나리오와 다른 경우 시나리오 전이로 간주
}

export interface Scenario {
  plan: ScenarioPlan[];
  botConfig: {
    botType: string;
  };
  intentMapping: IntentMapping[];
  multiIntentMapping: any[];
  handlerGroups: any[];
  webhooks: Webhook[]; // unified (webhook | apicall)
  // legacy global apicalls (to be migrated into webhooks with type='apicall')
  apicalls?: ApiCallWithName[];
  dialogResult: string;
}

// React Flow 노드 타입
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    dialogState: DialogState | any;
    targetScenario?: string;
    targetPlan?: string;
    targetState?: string;
    onEdit?: (nodeId: string) => void;
    handleRefs?: {
      top?: React.Ref<HTMLDivElement>;
      bottom?: React.Ref<HTMLDivElement>;
      left?: React.Ref<HTMLDivElement>;
      right?: React.Ref<HTMLDivElement>;
    };
    currentState?: string;
    [key: string]: any;
  };
  style?: CSSProperties;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
  style?: React.CSSProperties;
  sourceHandle?: string | null;
  targetHandle?: string | null;
} 

// 새로운 챗봇 응답 포맷 타입들
export interface ErrorInfo {
  code: string;
  message: string;
}

export interface DirectiveContent {
  item: any[];
  record: { text: string };
  templateId: string;
  type: string;
  version: string;
}

export interface ChatbotDirective {
  name: string;
  content: DirectiveContent;
}

export interface UsedSlot {
  key: string;
  value: string;
  turn: string;
}

export interface ResponseMeta {
  intent: string[];
  event: Record<string, any>;
  scenario: string;
  dialogState: string;
  fallbackType: string;
  usedSlots: UsedSlot[];
  allowFocusShift: string;
}

export interface ChatbotResponse {
  endSession: string;
  error: ErrorInfo;
  directives: ChatbotDirective[];
  dialogResult: Record<string, any>;
  meta: ResponseMeta;
  log: Record<string, any>;
} 