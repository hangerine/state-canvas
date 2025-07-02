from pydantic import BaseModel
from typing import List, Dict, Any, Optional

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

# API 요청/응답 모델
class ProcessInputRequest(BaseModel):
    sessionId: str
    input: str
    currentState: str
    scenario: Dict[str, Any]

class StateTransition(BaseModel):
    fromState: str
    toState: str
    reason: str
    conditionMet: bool
    handlerType: str  # 'condition', 'intent', 'event' 