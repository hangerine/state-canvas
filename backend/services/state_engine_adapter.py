"""
StateEngine Adapter

기존 StateEngine과 새로운 HandlerExecutionEngine을 연결하는 어댑터입니다.
기존 API를 유지하면서 새로운 Handler 시스템을 점진적으로 도입할 수 있게 합니다.
"""

import logging
from typing import Dict, Any, Optional
from .handler_execution_engine import HandlerExecutionEngine
from .handler_factory import HandlerFactory

logger = logging.getLogger(__name__)


class StateEngineAdapter:
    """기존 StateEngine과 새로운 Handler 시스템을 연결하는 어댑터"""
    
    def __init__(self, state_engine):
        """기존 StateEngine 인스턴스로 초기화"""
        self.state_engine = state_engine
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # 새로운 시스템 초기화
        self._initialize_new_system()
        
        # 설정 플래그들
        self.enable_new_system = True  # 새 시스템 사용 여부
        self.fallback_on_error = True  # 에러 시 기존 시스템으로 fallback
        self.log_performance = True    # 성능 비교 로깅
        
        # Handler별 활성화 설정 (점진적 전환용)
        self.enabled_handlers = {
            "EntryActionHandler": False,    # 아직 비활성화
            "SlotFillingHandler": False,
            "WebhookHandler": False,
            "ApiCallHandler": False,
            "IntentHandler": True,          # __ANY_INTENT__ 처리를 위해 활성화
            "EventHandler": False,
            "ConditionHandler": True,       # 가장 안전한 것부터 활성화
        }
    
    def _initialize_new_system(self):
        """새로운 Handler 시스템 초기화"""
        try:
            # Handler Factory로 새 시스템 구성
            self.handler_factory = HandlerFactory(self.state_engine)
            
            # 의존성 검증
            validation = self.handler_factory.validate_dependencies()
            self.logger.info(f"Handler system validation: {validation}")
            
            # Handler Execution Engine 생성
            self.handler_execution_engine = HandlerExecutionEngine(
                self.state_engine.scenario_manager,
                self.state_engine.action_executor
            )
            
            # Handler Registry 생성 및 등록
            self.handler_registry = self.handler_factory.create_handler_registry()
            
            # Handler들을 Execution Engine에 등록
            for handler in self.handler_registry.get_all_handlers():
                self.handler_execution_engine.register_handler(handler)
            
            self.new_system_available = True
            self.logger.info("New handler system initialized successfully")
            
        except Exception as e:
            self.logger.error(f"Failed to initialize new handler system: {e}")
            self.new_system_available = False
            self.enable_new_system = False
    
    async def process_input(
        self,
        session_id: str,
        user_input: str,
        current_state: str,
        scenario: Dict[str, Any],
        memory: Dict[str, Any],
        event_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        통합된 입력 처리 메서드
        
        새 시스템과 기존 시스템을 모두 지원하며, 점진적 전환을 가능하게 합니다.
        """
        
        self.logger.info(f"[PROCESS INPUT] 🚨 process_input 메서드 시작!")
        self.logger.info(f"[PROCESS INPUT] 🔍 session_id: {session_id}")
        self.logger.info(f"[PROCESS INPUT] 🔍 current_state: {current_state}")
        self.logger.info(f"[PROCESS INPUT] 🔍 user_input: {user_input}")
        
        # 성능 측정 시작
        import time
        start_time = time.time()
        
        # 새 시스템 사용 여부 결정
        use_new_system = self._should_use_new_system(current_state, scenario)
        self.logger.info(f"[PROCESS INPUT] 🔍 use_new_system: {use_new_system}")
        
        if use_new_system:
            try:
                self.logger.info(f"[PROCESS INPUT] 🚨 새로운 시스템 사용!")
                self.logger.info(f"[PROCESS INPUT] 🔍 _process_with_new_system 호출 시작!")
                # 새로운 Handler 시스템으로 처리
                result = await self._process_with_new_system(
                    session_id, user_input, current_state, scenario, memory, event_type
                )
                self.logger.info(f"[PROCESS INPUT] 🔍 _process_with_new_system 호출 완료!")
                
                # 성능 로깅
                if self.log_performance:
                    elapsed = time.time() - start_time
                    self.logger.info(f"[PERF] New system processed in {elapsed:.3f}s")
                
                return result
                
            except Exception as e:
                self.logger.error(f"New system failed: {e}")
                
                if self.fallback_on_error:
                    self.logger.info("Falling back to legacy system")
                    return await self._process_with_legacy_system(
                        session_id, user_input, current_state, scenario, memory, event_type
                    )
                else:
                    raise
        else:
            # 기존 시스템으로 처리
            result = await self._process_with_legacy_system(
                session_id, user_input, current_state, scenario, memory, event_type
            )
            
            # 성능 로깅
            if self.log_performance:
                elapsed = time.time() - start_time
                self.logger.info(f"[PERF] Legacy system processed in {elapsed:.3f}s")
            
            return result
    
    def _should_use_new_system(self, current_state: str, scenario: Dict[str, Any]) -> bool:
        """새 시스템을 사용할지 결정하는 로직"""
        
        self.logger.info(f"[SYSTEM SELECTION] 🚨 _should_use_new_system 호출됨!")
        self.logger.info(f"[SYSTEM SELECTION] 🔍 current_state: {current_state}")
        self.logger.info(f"[SYSTEM SELECTION] 🔍 enable_new_system: {self.enable_new_system}")
        self.logger.info(f"[SYSTEM SELECTION] 🔍 new_system_available: {self.new_system_available}")
        
        # 새 시스템이 비활성화되어 있으면 사용하지 않음
        if not self.enable_new_system or not self.new_system_available:
            self.logger.info(f"[SYSTEM SELECTION] ❌ 새 시스템 비활성화됨")
            return False
        
        # 특정 상태에서만 새 시스템 사용 (점진적 전환)
        # TODO: 설정 기반으로 변경 가능하게 만들기
        test_states = ["end_process", "act_01_0235", "sts_webhook_test", "positive_sentence_response", "sts_router"]  # 테스트할 상태들
        self.logger.info(f"[SYSTEM SELECTION] 🔍 test_states: {test_states}")
        self.logger.info(f"[SYSTEM SELECTION] 🔍 current_state in test_states: {current_state in test_states}")
        
        if current_state in test_states:
            self.logger.info(f"[SYSTEM SELECTION] ✅ 새 시스템 사용 결정됨!")
            return True
        
        # IntentHandler가 활성화된 경우에도 새 시스템 사용 (__ANY_INTENT__ 처리를 위해)
        if self.enabled_handlers.get("IntentHandler", False):
            self.logger.info(f"[SYSTEM SELECTION] ✅ IntentHandler 활성화로 새 시스템 사용")
            return True
        
        # 모든 Handler가 활성화된 경우에만 전면 사용
        if all(self.enabled_handlers.values()):
            self.logger.info(f"[SYSTEM SELECTION] ✅ 모든 Handler 활성화로 새 시스템 사용")
            return True
        
        self.logger.info(f"[SYSTEM SELECTION] ❌ 기존 시스템 사용 결정됨")
        return False
    
    async def _process_with_new_system(
        self,
        session_id: str,
        user_input: str,
        current_state: str,
        scenario: Dict[str, Any],
        memory: Dict[str, Any],
        event_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """새로운 Handler 시스템으로 처리"""
        
        self.logger.info(f"[NEW SYSTEM] Processing: session={session_id}, state={current_state}")
        
        # 새로운 Handler Execution Engine으로 실행
        execution_result = await self.handler_execution_engine.execute_state_cycle(
            session_id, current_state, scenario, memory, user_input
        )
        
        # 🚀 상태 전이 후 세션 스택 강제 동기화
        if execution_result.final_state != current_state:
            try:
                # 기존 StateEngine의 세션 스택 업데이트 메서드 사용
                if hasattr(self.state_engine, '_update_current_dialog_state_name'):
                    self.state_engine._update_current_dialog_state_name(session_id, execution_result.final_state)
                    self.logger.info(f"[NEW SYSTEM] Session stack updated: {current_state} -> {execution_result.final_state}")
                else:
                    # 직접 세션 스택 업데이트
                    stack = self.state_engine.session_stacks.get(session_id, [])
                    if stack:
                        stack[-1]["dialogStateName"] = execution_result.final_state
                        self.state_engine.session_stacks[session_id] = stack
                        self.logger.info(f"[NEW SYSTEM] Session stack manually updated: {current_state} -> {execution_result.final_state}")
                
                # 🚀 추가: 현재 상태를 새로운 상태로 강제 업데이트
                self.logger.info(f"[NEW SYSTEM] Forcing state update: {current_state} -> {execution_result.final_state}")
                
            except Exception as e:
                self.logger.warning(f"[NEW SYSTEM] Failed to update session stack: {e}")
        
        # 🚀 추가: Handler 실행 결과 상세 로깅
        self.logger.info(f"[NEW SYSTEM] Execution result details:")
        self.logger.info(f"  - Final state: {execution_result.final_state}")
        self.logger.info(f"  - Executed handlers: {[h.value for h in execution_result.executed_handlers]}")
        self.logger.info(f"  - Response messages: {execution_result.response_messages}")
        self.logger.info(f"  - Transitions: {execution_result.transitions}")
        self.logger.info(f"  - Needs user input: {execution_result.needs_user_input}")
        
        # 🚀 추가: State 전이 후 이전 user input 정리
        if execution_result.final_state != current_state:
            self.logger.info(f"[NEW SYSTEM] State transition detected: {current_state} -> {execution_result.final_state}")
            # 새로운 state에서는 이전 user input을 사용하지 않도록 정리
            if execution_result.updated_memory:
                execution_result.updated_memory["_CLEAR_USER_INPUT_ON_NEXT_REQUEST"] = True
                execution_result.updated_memory["_PREVIOUS_STATE"] = current_state
                # 새 상태에서 Intent를 1회 유예 (이미 설정되어 있지 않다면)
                if execution_result.updated_memory.get("_DEFER_INTENT_ONCE_FOR_STATE") != execution_result.final_state:
                    execution_result.updated_memory["_DEFER_INTENT_ONCE_FOR_STATE"] = execution_result.final_state
                self.logger.info(f"[NEW SYSTEM] User input clear flag set for next request")
            
            # 🚀 추가: 즉시 user input 정리 (다음 요청을 기다리지 않음)
            if hasattr(execution_result, 'updated_memory') and execution_result.updated_memory:
                # 이전 user input과 NLU 결과를 즉시 삭제
                execution_result.updated_memory.pop("USER_TEXT_INPUT", None)
                execution_result.updated_memory.pop("NLU_RESULT", None)
                self.logger.info(f"[NEW SYSTEM] User input and NLU result cleared immediately after state transition")
        
        # 기존 API 형식으로 변환
        result = {
            "new_state": execution_result.final_state,
            "response": "\n".join(execution_result.response_messages),
            "transitions": execution_result.transitions,
            "intent": memory.get("intent", ""),
            "entities": memory.get("entities", {}),
            "memory": execution_result.updated_memory,  # 수정된 메모리 사용
            "messages": execution_result.response_messages,
            
            # 새 시스템 전용 정보
            "_new_system": True,
            "_executed_handlers": [h.value for h in execution_result.executed_handlers],
            "_execution_stopped_at": execution_result.execution_stopped_at.value if execution_result.execution_stopped_at else None,
            "_needs_user_input": execution_result.needs_user_input
        }
        
        self.logger.info(f"[NEW SYSTEM] Result: state={result['new_state']}, handlers={result['_executed_handlers']}")
        
        return result
    
    async def _process_with_legacy_system(
        self,
        session_id: str,
        user_input: str,
        current_state: str,
        scenario: Dict[str, Any],
        memory: Dict[str, Any],
        event_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """기존 시스템으로 처리"""
        
        self.logger.info(f"[LEGACY SYSTEM] Processing: session={session_id}, state={current_state}")
        
        # 기존 StateEngine의 process_input 호출
        result = await self.state_engine.process_input(
            session_id, user_input, current_state, scenario, memory, event_type
        )
        
        # 기존 시스템 표시 추가
        result["_new_system"] = False
        
        return result
    
    def enable_handler(self, handler_name: str):
        """특정 Handler 활성화 (점진적 전환용)"""
        if handler_name in self.enabled_handlers:
            self.enabled_handlers[handler_name] = True
            self.logger.info(f"Enabled handler: {handler_name}")
        else:
            self.logger.warning(f"Unknown handler: {handler_name}")
    
    def disable_handler(self, handler_name: str):
        """특정 Handler 비활성화"""
        if handler_name in self.enabled_handlers:
            self.enabled_handlers[handler_name] = False
            self.logger.info(f"Disabled handler: {handler_name}")
        else:
            self.logger.warning(f"Unknown handler: {handler_name}")
    
    def enable_all_handlers(self):
        """모든 Handler 활성화"""
        for handler_name in self.enabled_handlers:
            self.enabled_handlers[handler_name] = True
        self.logger.info("All handlers enabled")
    
    def disable_all_handlers(self):
        """모든 Handler 비활성화 (기존 시스템만 사용)"""
        for handler_name in self.enabled_handlers:
            self.enabled_handlers[handler_name] = False
        self.logger.info("All handlers disabled - using legacy system only")
    
    def get_system_status(self) -> Dict[str, Any]:
        """시스템 상태 정보 반환"""
        return {
            "new_system_available": self.new_system_available,
            "new_system_enabled": self.enable_new_system,
            "fallback_enabled": self.fallback_on_error,
            "enabled_handlers": self.enabled_handlers.copy(),
            "available_handlers": self.handler_factory.get_available_handlers() if hasattr(self, 'handler_factory') else [],
            "stack_debug": self.handler_execution_engine.get_stack_debug_info("current") if hasattr(self, 'handler_execution_engine') else {}
        }
    
    def toggle_new_system(self, enabled: bool = None):
        """새 시스템 활성화/비활성화 토글"""
        if enabled is None:
            self.enable_new_system = not self.enable_new_system
        else:
            self.enable_new_system = enabled
        
        status = "enabled" if self.enable_new_system else "disabled"
        self.logger.info(f"New system {status}")
        
        return self.enable_new_system
