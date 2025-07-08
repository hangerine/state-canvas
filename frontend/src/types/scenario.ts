// 시나리오 JSON 구조 타입 정의
import { CSSProperties } from 'react';

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
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  requestTemplate?: string;
  responseSchema?: Record<string, any>;
  responseMappings?: Record<string, string>;
  headers?: Record<string, string>;
}

export interface ApiCall {
  url: string;
  timeout: number;
  retry: number;
  formats: ApiCallFormats;
}

export interface ApiCallHandler {
  name: string;
  apicall: ApiCall;
  action?: Action;
  transitionTarget: TransitionTarget;
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
}

export interface IntentMapping {
  scenario: string;
  dialogState: string;
  intents: string[];
  conditionStatement: string;
  dmIntent: string;
}

export interface Webhook {
  name: string;
  url: string;
  headers: Record<string, string>;
  timeoutInMilliSecond: number;
  retry: number;
}

export interface Scenario {
  plan: {
    name: string;
    dialogState: DialogState[];
  }[];
  botConfig: {
    botType: string;
  };
  intentMapping: IntentMapping[];
  multiIntentMapping: any[];
  handlerGroups: any[];
  webhooks: Webhook[];
  dialogResult: string;
}

// React Flow 노드 타입
export interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    dialogState: DialogState;
  };
  style?: CSSProperties;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  type?: string;
} 