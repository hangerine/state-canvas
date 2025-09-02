"""
Handler Factory

기존 StateEngine의 서비스들을 새로운 Handler 시스템으로 래핑하는 팩토리입니다.
기존 코드를 건드리지 않고 새로운 아키텍처로 점진적 전환을 가능하게 합니다.
"""

import logging
from typing import Optional
from .base_handler import HandlerRegistry
from .concrete_handlers import (
    EntryActionHandler, IntentHandlerV2, WebhookHandlerV2, ApiCallHandlerV2,
    ConditionHandlerV2, SlotFillingHandler, EventHandler
)

logger = logging.getLogger(__name__)


class HandlerFactory:
    """기존 StateEngine 서비스들을 새로운 Handler로 변환하는 팩토리"""
    
    def __init__(self, state_engine):
        """기존 StateEngine 인스턴스를 받아서 Handler들을 생성"""
        self.state_engine = state_engine
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # 기존 서비스들 참조
        self.action_executor = getattr(state_engine, 'action_executor', None)
        self.transition_manager = getattr(state_engine, 'transition_manager', None)
        self.nlu_processor = getattr(state_engine, 'nlu_processor', None)
        self.memory_manager = getattr(state_engine, 'memory_manager', None)
        self.webhook_handler = getattr(state_engine, 'webhook_handler', None)
        self.apicall_handler = getattr(state_engine, 'apicall_handler', None)
        self.slot_filling_manager = getattr(state_engine, 'slot_filling_manager', None)
        self.event_trigger_manager = getattr(state_engine, 'event_trigger_manager', None)
        
        # 🚀 추가: 디버깅을 위한 로그
        self.logger.info(f"[HANDLER FACTORY DEBUG] Retrieved services from state_engine:")
        self.logger.info(f"  - action_executor: {type(self.action_executor)}")
        self.logger.info(f"  - transition_manager: {type(self.transition_manager)}")
        self.logger.info(f"  - nlu_processor: {type(self.nlu_processor)}")
        self.logger.info(f"  - memory_manager: {type(self.memory_manager)}")
        self.logger.info(f"  - webhook_handler: {type(self.webhook_handler)}")
        self.logger.info(f"  - apicall_handler: {type(self.apicall_handler)}")
        self.logger.info(f"  - slot_filling_manager: {type(self.slot_filling_manager)}")
        self.logger.info(f"  - event_trigger_manager: {type(self.event_trigger_manager)}")
    
    def create_handler_registry(self) -> HandlerRegistry:
        """모든 Handler를 등록한 HandlerRegistry 생성"""
        registry = HandlerRegistry()
        
        # 각 Handler 생성 및 등록
        handlers = [
            self._create_entry_action_handler(),
            self._create_slot_filling_handler(),
            self._create_webhook_handler(),
            self._create_apicall_handler(),
            self._create_intent_handler(),
            self._create_event_handler(),
            self._create_condition_handler()
        ]
        
        for handler in handlers:
            if handler:
                registry.register_handler(handler)
                self.logger.info(f"Registered handler: {handler.handler_type}")
        
        return registry
    
    def _create_entry_action_handler(self) -> Optional[EntryActionHandler]:
        """Entry Action Handler 생성"""
        if not self.action_executor:
            self.logger.warning("action_executor not available - EntryActionHandler disabled")
            return None
        
        return EntryActionHandler(self.action_executor)
    
    def _create_intent_handler(self) -> Optional[IntentHandlerV2]:
        """Intent Handler 생성"""
        if not all([self.transition_manager, self.nlu_processor, self.memory_manager]):
            missing = []
            if not self.transition_manager:
                missing.append("transition_manager")
            if not self.nlu_processor:
                missing.append("nlu_processor")
            if not self.memory_manager:
                missing.append("memory_manager")
            
            self.logger.warning(f"Missing services for IntentHandler: {missing} - IntentHandler disabled")
            return None
        
        # 🚀 추가: 디버깅을 위한 로그
        self.logger.info(f"[INTENT HANDLER DEBUG] Creating IntentHandlerV2 with:")
        self.logger.info(f"  - transition_manager: {type(self.transition_manager)}")
        self.logger.info(f"  - nlu_processor: {type(self.nlu_processor)}")
        self.logger.info(f"  - memory_manager: {type(self.memory_manager)}")
        
        # RepromptManager는 state_engine에 구성되어 있음 (legacy와 동일 동작)
        reprompt_manager = getattr(self.state_engine, 'reprompt_manager', None)
        action_executor = getattr(self.state_engine, 'action_executor', None)
        return IntentHandlerV2(
            self.transition_manager,
            self.nlu_processor,
            self.memory_manager,
            reprompt_manager=reprompt_manager,
            action_executor=action_executor
        )
    
    def _create_webhook_handler(self) -> Optional[WebhookHandlerV2]:
        """Webhook Handler 생성"""
        if not self.webhook_handler:
            self.logger.warning("webhook_handler not available - WebhookHandler disabled")
            return None
        
        return WebhookHandlerV2(self.webhook_handler)
    
    def _create_apicall_handler(self) -> Optional[ApiCallHandlerV2]:
        """API Call Handler 생성"""
        if not all([self.apicall_handler, self.transition_manager]):
            missing = []
            if not self.apicall_handler:
                missing.append("apicall_handler")
            if not self.transition_manager:
                missing.append("transition_manager")
            
            self.logger.warning(f"Missing services for ApiCallHandler: {missing} - ApiCallHandler disabled")
            return None
        
        return ApiCallHandlerV2(self.apicall_handler, self.transition_manager)
    
    def _create_condition_handler(self) -> Optional[ConditionHandlerV2]:
        """Condition Handler 생성"""
        if not self.transition_manager:
            self.logger.warning("transition_manager not available - ConditionHandler disabled")
            return None
        
        return ConditionHandlerV2(self.transition_manager)
    
    def _create_slot_filling_handler(self) -> Optional[SlotFillingHandler]:
        """Slot Filling Handler 생성"""
        if not self.slot_filling_manager:
            self.logger.warning("slot_filling_manager not available - SlotFillingHandler disabled")
            return None
        
        return SlotFillingHandler(self.slot_filling_manager)
    
    def _create_event_handler(self) -> Optional[EventHandler]:
        """Event Handler 생성"""
        if not self.event_trigger_manager:
            self.logger.warning("event_trigger_manager not available - EventHandler disabled")
            return None
        
        return EventHandler(self.event_trigger_manager)
    
    def get_available_handlers(self) -> list:
        """사용 가능한 Handler 타입들 반환"""
        available = []
        
        if self.action_executor:
            available.append("EntryActionHandler")
        if self.slot_filling_manager:
            available.append("SlotFillingHandler")
        if self.webhook_handler:
            available.append("WebhookHandler")
        if self.apicall_handler and self.transition_manager:
            available.append("ApiCallHandler")
        if self.transition_manager and self.nlu_processor and self.memory_manager:
            available.append("IntentHandler")
        if self.event_trigger_manager:
            available.append("EventHandler")
        if self.transition_manager:
            available.append("ConditionHandler")
        
        return available
    
    def validate_dependencies(self) -> dict:
        """의존성 검증 결과 반환"""
        validation_result = {
            "all_dependencies_available": True,
            "missing_services": [],
            "available_handlers": [],
            "disabled_handlers": []
        }
        
        # 각 서비스 검증
        services = {
            "action_executor": self.action_executor,
            "transition_manager": self.transition_manager,
            "nlu_processor": self.nlu_processor,
            "memory_manager": self.memory_manager,
            "webhook_handler": self.webhook_handler,
            "apicall_handler": self.apicall_handler,
            "slot_filling_manager": self.slot_filling_manager,
            "event_trigger_manager": self.event_trigger_manager
        }
        
        for service_name, service_instance in services.items():
            if not service_instance:
                validation_result["missing_services"].append(service_name)
                validation_result["all_dependencies_available"] = False
        
        # Handler별 가용성 확인
        handler_dependencies = {
            "EntryActionHandler": ["action_executor"],
            "SlotFillingHandler": ["slot_filling_manager"],
            "WebhookHandler": ["webhook_handler"],
            "ApiCallHandler": ["apicall_handler", "transition_manager"],
            "IntentHandler": ["transition_manager", "nlu_processor", "memory_manager"],
            "EventHandler": ["event_trigger_manager"],
            "ConditionHandler": ["transition_manager"]
        }
        
        for handler_name, required_services in handler_dependencies.items():
            if all(services[service] for service in required_services):
                validation_result["available_handlers"].append(handler_name)
            else:
                missing = [service for service in required_services if not services[service]]
                validation_result["disabled_handlers"].append({
                    "handler": handler_name,
                    "missing_services": missing
                })
        
        return validation_result
