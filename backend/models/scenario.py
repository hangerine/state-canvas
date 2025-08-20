from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Union

# 새로운 UserInput 모델 정의
class UserInputValue(BaseModel):
    scope: Optional[str] = None
    type: str
    value: Dict[str, Any]
    version: str

class CustomEventContent(BaseModel):
    type: str
    value: UserInputValue

class NLUEntity(BaseModel):
    role: str
    type: str
    text: str
    normalization: Optional[str] = None
    extra: Dict[str, Any]

class NLUNbest(BaseModel):
    intent: str
    confidenceScore: float
    status: str
    entities: List[NLUEntity]
    extra: Dict[str, Any]

class NLUResult(BaseModel):
    nluNbest: List[NLUNbest]
    text: str
    extra: Dict[str, Any]

class NLUInfo(BaseModel):
    type: str
    results: List[NLUResult]

class TextContent(BaseModel):
    text: str
    nluResult: Optional[NLUInfo] = None
    value: UserInputValue

class UserInput(BaseModel):
    type: str  # 'text' or 'customEvent'
    content: Union[TextContent, CustomEventContent]

class TransitionTarget(BaseModel):
    scenario: str
    dialogState: str

class Action(BaseModel):
    directives: Optional[List[Dict[str, Any]]] = None
    memoryActions: Optional[List[Dict[str, Any]]] = None

class ConditionHandler(BaseModel):
    conditionStatement: str
    action: Action
    transitionTarget: TransitionTarget

class EventHandler(BaseModel):
    event: Dict[str, Any]
    action: Action
    transitionTarget: TransitionTarget

class IntentHandler(BaseModel):
    intent: str
    action: Action
    transitionTarget: TransitionTarget

class ApiCallFormats(BaseModel):
    method: str
    requestTemplate: Optional[str] = None
    responseSchema: Optional[Dict[str, Any]] = None
    responseMappings: Optional[Dict[str, Union[str, Dict[str, str]]]] = None
    headers: Optional[Dict[str, str]] = None

class ApiCall(BaseModel):
    url: str
    timeout: int
    retry: int
    formats: ApiCallFormats

class ApiCallHandler(BaseModel):
    name: str
    apicall: ApiCall
    action: Optional[Action] = None
    transitionTarget: TransitionTarget

class SlotFillingForm(BaseModel):
    name: str
    required: str
    memorySlotKey: List[str]
    fillBehavior: Dict[str, Any]

class DialogState(BaseModel):
    name: str
    entryAction: Optional[Action] = None
    conditionHandlers: Optional[List[ConditionHandler]] = None
    eventHandlers: Optional[List[EventHandler]] = None
    intentHandlers: Optional[List[IntentHandler]] = None
    webhookActions: Optional[List[Dict[str, str]]] = None
    apicallHandlers: Optional[List[ApiCallHandler]] = None
    slotFillingForm: Optional[List[SlotFillingForm]] = None

class Plan(BaseModel):
    name: str
    dialogState: List[DialogState]

class IntentMapping(BaseModel):
    scenario: str
    dialogState: str
    intents: List[str]
    conditionStatement: str
    dmIntent: str

class Webhook(BaseModel):
    name: str
    url: str
    headers: Dict[str, str]
    timeoutInMilliSecond: int
    retry: int

class BotConfig(BaseModel):
    botType: str

class Scenario(BaseModel):
    plan: List[Plan]
    botConfig: BotConfig
    intentMapping: List[IntentMapping]
    multiIntentMapping: List[Any]
    handlerGroups: List[Any]
    webhooks: List[Webhook]
    dialogResult: str

# 새로운 챗봇 입력 포맷 모델들 - 사용자가 원하는 정확한 포맷
class ChatbotInputRequest(BaseModel):
    userId: str
    botId: str
    botVersion: str
    botName: str
    botResourcePath: Optional[str] = None
    sessionId: str
    requestId: str
    userInput: UserInput
    context: Dict[str, Any] = {}
    headers: Dict[str, Any] = {}

# API 요청/응답 모델
class ProcessInputRequest(BaseModel):
    sessionId: str
    userInput: UserInput
    currentState: str
    scenario: Dict[str, Any]
    eventType: Optional[str] = None  # 이벤트 수동 트리거용

# 새로운 챗봇 포맷을 위한 요청 모델 - 시나리오와 currentState 추가 필드
class ChatbotProcessRequest(BaseModel):
    """챗봇 요청에 시나리오와 현재 상태 정보를 추가한 모델"""
    # 기본 챗봇 요청 필드들
    userId: str
    botId: str
    botVersion: str
    botName: str
    botResourcePath: Optional[str] = None
    sessionId: str
    requestId: str
    userInput: UserInput
    context: Dict[str, Any] = {}
    headers: Dict[str, Any] = {}
    
    # 추가 처리 필드들
    currentState: str
    scenario: Dict[str, Any]
    eventType: Optional[str] = None  # 이벤트 수동 트리거용

# 기존 형식 지원을 위한 레거시 모델 (호환성 유지)
class LegacyProcessInputRequest(BaseModel):
    sessionId: str
    input: str
    currentState: str
    scenario: Dict[str, Any]
    eventType: Optional[str] = None

class StateTransition(BaseModel):
    fromState: str
    toState: str
    reason: str
    conditionMet: bool
    handlerType: str  # 'condition', 'intent', 'event' 

# 새로운 챗봇 응답 포맷 모델들
class ErrorInfo(BaseModel):
    code: str = "0"
    message: str = "[Success]"

class DirectiveContent(BaseModel):
    item: List[Dict[str, Any]] = []
    record: Dict[str, Any] = {"text": ""}
    templateId: str = "TM000000000000000001"
    type: str = "MESSAGE"
    version: str = "1.0"

class ChatbotDirective(BaseModel):
    name: str = "customPayload"
    content: DirectiveContent

class UsedSlot(BaseModel):
    key: str
    value: str
    turn: str = ""

class ResponseMeta(BaseModel):
    intent: List[str] = []
    event: Dict[str, Any] = {}
    scenario: str = ""
    dialogState: str = ""
    fallbackType: str = "not_fallback"
    usedSlots: List[UsedSlot] = []
    allowFocusShift: str = "Y"

class ChatbotResponse(BaseModel):
    endSession: str = "N"
    error: ErrorInfo = ErrorInfo()
    directives: List[ChatbotDirective] = []
    dialogResult: Dict[str, Any] = {}
    meta: ResponseMeta = ResponseMeta()
    log: Dict[str, Any] = {} 