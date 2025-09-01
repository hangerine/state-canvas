"""
Handler 시스템의 기반 클래스들

이 모듈은 새로운 Handler 아키텍처의 기반이 되는 추상 클래스들과 
데이터 모델들을 정의합니다.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Union
from enum import Enum

logger = logging.getLogger(__name__)


class HandlerType(Enum):
    """Handler 타입 정의"""
    ENTRY_ACTION = "entry_action"
    SLOT_FILLING = "slot_filling"
    WEBHOOK = "webhook"
    APICALL = "apicall"
    INTENT = "intent"
    EVENT = "event"
    CONDITION = "condition"


class TransitionType(Enum):
    """전이 타입 정의"""
    NO_TRANSITION = "no_transition"
    STATE_TRANSITION = "state_transition"
    SCENARIO_TRANSITION = "scenario_transition"
    PLAN_TRANSITION = "plan_transition"
    END_SCENARIO = "end_scenario"


@dataclass
class ExecutionContext:
    """Handler 실행에 필요한 모든 컨텍스트 정보"""
    session_id: str
    current_state: str
    scenario: Dict[str, Any]
    memory: Dict[str, Any]
    user_input: Optional[str] = None
    
    # 상태 정보
    current_dialog_state: Optional[Dict[str, Any]] = None
    
    # 실행 플래그
    has_user_input: bool = False
    intent_deferred: bool = False  # Intent handler 1회 유예 플래그
    
    # 추출된 정보
    intent: Optional[str] = None
    entities: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        self.has_user_input = bool(self.user_input and str(self.user_input).strip())


@dataclass
class HandlerResult:
    """Handler 실행 결과"""
    success: bool = True
    transition_type: TransitionType = TransitionType.NO_TRANSITION
    new_state: Optional[str] = None
    target_scenario: Optional[str] = None
    target_plan: Optional[str] = None
    
    # 응답 정보
    messages: List[str] = field(default_factory=list)
    response: Optional[str] = None
    
    # 전이 정보
    transitions: List[Any] = field(default_factory=list)  # StateTransition 객체들
    
    # 추가 데이터
    updated_memory: Optional[Dict[str, Any]] = None
    handler_index: Optional[int] = None  # 실행된 핸들러의 인덱스
    
    def add_message(self, message: str):
        """응답 메시지 추가"""
        if message:
            self.messages.append(message)
    
    def set_transition(self, transition_type: TransitionType, target: str, scenario: str = None, plan: str = None):
        """전이 정보 설정"""
        self.transition_type = transition_type
        self.new_state = target
        self.target_scenario = scenario
        self.target_plan = plan


@dataclass
class StateExecutionResult:
    """상태 실행의 최종 결과"""
    final_state: str
    response_messages: List[str] = field(default_factory=list)
    transitions: List[Any] = field(default_factory=list)
    updated_memory: Dict[str, Any] = field(default_factory=dict)
    
    # 실행 정보
    executed_handlers: List[HandlerType] = field(default_factory=list)
    execution_stopped_at: Optional[HandlerType] = None  # 실행이 중단된 Handler
    needs_user_input: bool = False  # 사용자 입력 대기 필요 여부


class BaseHandler(ABC):
    """모든 Handler의 기반 클래스"""
    
    def __init__(self, handler_type: HandlerType):
        self.handler_type = handler_type
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    @abstractmethod
    async def can_handle(self, context: ExecutionContext) -> bool:
        """이 Handler가 현재 상황에서 실행 가능한지 확인"""
        pass
    
    @abstractmethod
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Handler 실행"""
        pass
    
    def should_stop_execution(self, result: HandlerResult) -> bool:
        """이 Handler 실행 후 전체 실행을 중단해야 하는지 확인"""
        # Intent Handler는 사용자 입력 대기를 위해 실행 중단
        if self.handler_type == HandlerType.INTENT and result.success:
            return True
        
        # 시나리오 전이가 발생하면 실행 중단 (새 컨텍스트에서 재시작)
        if result.transition_type == TransitionType.SCENARIO_TRANSITION:
            return True
            
        return False
    
    def get_priority(self) -> int:
        """Handler 실행 우선순위 (낮을수록 먼저 실행)"""
        priority_map = {
            HandlerType.ENTRY_ACTION: 1,
            HandlerType.SLOT_FILLING: 2,
            HandlerType.WEBHOOK: 3,
            HandlerType.APICALL: 4,
            HandlerType.INTENT: 5,        # Intent Handler를 조건 핸들러보다 먼저 실행
            HandlerType.EVENT: 6,
            HandlerType.CONDITION: 7      # 조건 핸들러는 Intent Handler 이후에 실행
        }
        return priority_map.get(self.handler_type, 999)


class HandlerRegistry:
    """Handler 등록 및 관리"""
    
    def __init__(self):
        self._handlers: Dict[HandlerType, BaseHandler] = {}
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def register_handler(self, handler: BaseHandler):
        """Handler 등록"""
        self._handlers[handler.handler_type] = handler
        self.logger.info(f"Registered handler: {handler.handler_type}")
    
    def get_handler(self, handler_type: HandlerType) -> Optional[BaseHandler]:
        """Handler 조회"""
        return self._handlers.get(handler_type)
    
    def get_all_handlers(self) -> List[BaseHandler]:
        """모든 Handler를 우선순위 순으로 반환"""
        return sorted(self._handlers.values(), key=lambda h: h.get_priority())
    
    async def get_executable_handlers(self, context: ExecutionContext) -> List[BaseHandler]:
        """현재 컨텍스트에서 실행 가능한 Handler들을 우선순위 순으로 반환"""
        executable = []
        
        # 🚀 디버깅: 모든 Handler의 can_handle 결과 로깅
        self.logger.info(f"[HANDLER REGISTRY] Checking handlers for state: {context.current_state}")
        
        # 🚀 디버깅: 등록된 모든 핸들러 확인
        all_handlers = self.get_all_handlers()
        self.logger.info(f"[HANDLER REGISTRY] 등록된 핸들러들: {[h.handler_type for h in all_handlers]}")
        
        for handler in all_handlers:
            try:
                can_handle_result = await handler.can_handle(context)
                self.logger.info(f"[HANDLER REGISTRY] {handler.handler_type}: can_handle = {can_handle_result}")
                
                if can_handle_result:
                    executable.append(handler)
            except Exception as e:
                self.logger.error(f"Error checking handler {handler.handler_type}: {e}")
        
        self.logger.info(f"[HANDLER REGISTRY] Final executable handlers: {[h.handler_type for h in executable]}")
        return executable


# 편의 함수들
def create_no_transition_result(messages: List[str] = None) -> HandlerResult:
    """전이 없는 결과 생성"""
    return HandlerResult(
        success=True,
        transition_type=TransitionType.NO_TRANSITION,
        messages=messages or []
    )


def create_state_transition_result(new_state: str, messages: List[str] = None) -> HandlerResult:
    """상태 전이 결과 생성"""
    return HandlerResult(
        success=True,
        transition_type=TransitionType.STATE_TRANSITION,
        new_state=new_state,
        messages=messages or []
    )


def create_scenario_transition_result(scenario: str, state: str, messages: List[str] = None) -> HandlerResult:
    """시나리오 전이 결과 생성"""
    return HandlerResult(
        success=True,
        transition_type=TransitionType.SCENARIO_TRANSITION,
        new_state=state,
        target_scenario=scenario,
        messages=messages or []
    )


def create_plan_transition_result(plan: str, state: str, messages: List[str] = None) -> HandlerResult:
    """플랜 전이 결과 생성"""
    return HandlerResult(
        success=True,
        transition_type=TransitionType.PLAN_TRANSITION,
        new_state=state,
        target_plan=plan,
        messages=messages or []
    )