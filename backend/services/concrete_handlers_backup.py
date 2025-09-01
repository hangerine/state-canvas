"""
구체적인 Handler 구현들

이 모듈은 각 타입별 Handler의 구체적인 구현을 제공합니다.
기존 state_engine.py의 분산된 로직들을 각각의 Handler 클래스로 분리합니다.
"""

import logging
from typing import Dict, Any, List, Optional
from .base_handler import (
    BaseHandler, HandlerResult, ExecutionContext, HandlerType, 
    create_no_transition_result, create_state_transition_result,
    create_scenario_transition_result
)

logger = logging.getLogger(__name__)


class EntryActionHandler(BaseHandler):
    """Entry Action 처리 Handler"""
    
    def __init__(self, action_executor):
        super().__init__(HandlerType.ENTRY_ACTION)
        self.action_executor = action_executor
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Entry Action이 있고 아직 실행되지 않았으면 실행"""
        if not context.current_dialog_state:
            return False
        
        # Entry Action이 있는지 확인
        has_entry_action = bool(context.current_dialog_state.get("entryAction"))
        
        # 이미 실행되었는지 확인 (스택 정보에서)
        # TODO: StackManager에서 entry_action_executed 플래그 확인
        
        return has_entry_action
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Entry Action 실행"""
        try:
            entry_response = self.action_executor.execute_entry_action(
                context.scenario, context.current_state
            )
            
            if entry_response:
                return create_no_transition_result([entry_response])
            else:
                return create_no_transition_result()
                
        except Exception as e:
            self.logger.error(f"Error executing entry action: {e}")
            return create_no_transition_result([f"⚠️ Entry action 실행 중 오류: {str(e)}"])


class IntentHandlerV2(BaseHandler):
    """Intent Handler 처리"""
    
    def __init__(self, transition_manager, nlu_processor, memory_manager):
        super().__init__(HandlerType.INTENT)
        self.transition_manager = transition_manager
        self.nlu_processor = nlu_processor
        self.memory_manager = memory_manager
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Intent Handler 실행 조건 확인"""
        self.logger.info(f"[INTENT DEBUG] can_handle check for state: {context.current_state}")
        
        if not context.current_dialog_state:
            self.logger.info(f"[INTENT DEBUG] No current_dialog_state")
            return False
        
        # Intent Handler가 정의되어 있는지 확인
        intent_handlers = context.current_dialog_state.get("intentHandlers", [])
        self.logger.info(f"[INTENT DEBUG] intentHandlers found: {len(intent_handlers)}")
        
        if not intent_handlers:
            self.logger.info(f"[INTENT DEBUG] No intentHandlers")
            return False
        
        # 사용자 입력이 있어야 함
        self.logger.info(f"[INTENT DEBUG] has_user_input: {context.has_user_input}, user_input: '{context.user_input}'")
        if not context.has_user_input:
            self.logger.info(f"[INTENT DEBUG] No user input")
            return False
        
        # Intent 유예 플래그가 설정되어 있으면 건너뛰기
        if context.intent_deferred:
            self.logger.info(f"[INTENT DEFER] Skipping intentHandlers once at state={context.current_state}")
            return False
        
        self.logger.info(f"[INTENT DEBUG] can_handle = True")
        
        # NLU 결과가 있는지 확인
        nlu_result = context.memory.get("NLU_RESULT")
        if not nlu_result:
            self.logger.info(f"[INTENT DEBUG] No NLU_RESULT in memory")
            return False
            
        # Intent 추출
        intent = self._extract_intent(nlu_result)
        if not intent:
            self.logger.info(f"[INTENT DEBUG] No intent extracted from NLU_RESULT")
            return False
            
        self.logger.info(f"[INTENT DEBUG] Extracted intent: {intent}")
        
        # 🚀 추가: DM Intent 매핑 처리
        # 현재 상태에서 DM Intent 매핑이 있는지 확인
        if hasattr(self.nlu_processor, 'apply_dm_intent_mapping'):
            mapped_intent = self.nlu_processor.apply_dm_intent_mapping(
                intent, context.current_state, context.memory, context.scenario
            )
            if mapped_intent != intent:
                self.logger.info(f"[INTENT DEBUG] DM Intent mapping applied: {intent} -> {mapped_intent}")
                intent = mapped_intent
                # 매핑된 intent를 메모리에 저장
                context.memory["DM_MAPPED_INTENT"] = mapped_intent
        
        # Intent Handler 매칭 확인 (매핑된 intent 사용)
        for handler in intent_handlers:
            handler_intent = handler.get("intent")
            if handler_intent == intent:
                self.logger.info(f"[INTENT DEBUG] Intent matched: {intent} -> {handler_intent}")
                return True
            else:
                self.logger.info(f"[INTENT DEBUG] Intent not matched: {intent} != {handler_intent}")
        
        self.logger.info(f"[INTENT DEBUG] No matching intent handler found for: {intent}")
        return False
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Intent Handler 실행"""
        try:
            # NLU 결과 파싱
            intent, entities = self.nlu_processor.get_nlu_results(
                context.user_input, context.memory, context.scenario, context.current_state
            )
            
            # Entity를 메모리에 저장
            self.memory_manager.store_entities_to_memory(entities, context.memory)
            
            # Context 업데이트
            context.intent = intent
            context.entities = entities
            
            # Intent Handler 확인
            intent_transition = self.transition_manager.check_intent_handlers(
                context.current_dialog_state, intent, context.memory
            )
            
            if intent_transition:
                new_state = intent_transition.toState
                
                # 다음 요청에서 새 상태의 intentHandlers 평가를 1회 유예
                context.memory["_DEFER_INTENT_ONCE_FOR_STATE"] = new_state
                context.memory["_INTENT_TRANSITIONED_THIS_REQUEST"] = True
                
                # 플랜명이 직접 지정된 경우 처리
                # TODO: StackManager를 통한 플랜 전환 로직 추가
                
                result = create_state_transition_result(new_state, [f"🎯 인텐트 '{intent}' 처리됨"])
                result.transitions = [intent_transition]
                return result
            else:
                return create_no_transition_result([f"💭 인텐트 '{intent}' 처리됨 (전이 없음)"])
                
        except Exception as e:
            self.logger.error(f"Error processing intent handler: {e}")
            return create_no_transition_result([f"⚠️ Intent 처리 중 오류: {str(e)}"])


class WebhookHandlerV2(BaseHandler):
    """Webhook Action 처리"""
    
    def __init__(self, webhook_handler):
        super().__init__(HandlerType.WEBHOOK)
        self.webhook_handler = webhook_handler
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Webhook Action이 있으면 실행"""
        if not context.current_dialog_state:
            return False
        
        webhook_actions = context.current_dialog_state.get("webhookActions", [])
        return bool(webhook_actions)
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Webhook 실행"""
        try:
            webhook_result = await self.webhook_handler.handle_webhook_actions(
                context.current_state, context.current_dialog_state, 
                context.scenario, context.memory
            )
            
            if webhook_result:
                new_state = webhook_result.get("new_state", context.current_state)
                messages = [webhook_result.get("response", "🔗 Webhook 실행 완료")]
                
                if new_state != context.current_state:
                    result = create_state_transition_result(new_state, messages)
                else:
                    result = create_no_transition_result(messages)
                
                result.transitions = webhook_result.get("transitions", [])
                return result
            else:
                return create_no_transition_result(["❌ Webhook 실행 실패"])
                
        except Exception as e:
            self.logger.error(f"Error executing webhook: {e}")
            return create_no_transition_result([f"⚠️ Webhook 실행 중 오류: {str(e)}"])


class ApiCallHandlerV2(BaseHandler):
    """API Call Handler 처리"""
    
    def __init__(self, apicall_handler, transition_manager):
        super().__init__(HandlerType.APICALL)
        self.apicall_handler = apicall_handler
        self.transition_manager = transition_manager
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """API Call Handler가 있으면 실행"""
        if not context.current_dialog_state:
            return False
        
        apicall_handlers = context.current_dialog_state.get("apicallHandlers", [])
        return bool(apicall_handlers)
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """API Call 실행"""
        try:
            # 기존 _handle_apicall_handlers 로직을 여기로 이전
            apicall_handlers = context.current_dialog_state.get("apicallHandlers", [])
            
            for handler in apicall_handlers:
                if not isinstance(handler, dict):
                    continue
                
                # API 호출 실행
                apicall_name = handler.get("name")
                apicall_config = await self._find_apicall_config(context.scenario, apicall_name)
                
                if not apicall_config:
                    self.logger.warning(f"No apicall config found for: {apicall_name}")
                    continue
                
                # API 응답 가져오기
                response_data = await self.apicall_handler.execute_api_call(apicall_config, context.memory)
                if response_data is None:
                    continue
                
                # 응답 매핑 처리
                await self._process_response_mappings(apicall_config, response_data, context.memory)
                
                # Condition Handler 확인 및 전이 처리
                return await self._process_condition_handlers(context, handler)
            
            return create_no_transition_result(["🔄 API 호출 완료"])
            
        except Exception as e:
            self.logger.error(f"Error executing API call: {e}")
            return create_no_transition_result([f"⚠️ API 호출 중 오류: {str(e)}"])
    
    async def _find_apicall_config(self, scenario: Dict[str, Any], apicall_name: str) -> Optional[Dict[str, Any]]:
        """API Call 설정 찾기"""
        # unified webhooks(type='apicall') 우선 검색
        for ap in scenario.get("webhooks", []):
            try:
                if ap.get("type") == "apicall" and ap.get("name") == apicall_name:
                    return {
                        "name": ap.get("name"),
                        "url": ap.get("url", ""),
                        "timeout": ap.get("timeout", ap.get("timeoutInMilliSecond", 5000)),
                        "retry": ap.get("retry", 3),
                        "formats": ap.get("formats", {})
                    }
            except Exception:
                continue
        
        # 레거시 fallback
        for apicall in scenario.get("apicalls", []):
            if apicall.get("name") == apicall_name:
                return apicall
        
        return None
    
    async def _process_response_mappings(self, apicall_config: Dict[str, Any], response_data: Dict[str, Any], memory: Dict[str, Any]):
        """응답 매핑 처리"""
        mappings = apicall_config.get("formats", {}).get("responseMappings", [])
        if not mappings:
            return
        
        if not isinstance(mappings, list):
            mappings = [mappings]
        
        for mapping in mappings:
            if not isinstance(mapping, dict):
                continue
            
            # 매핑 처리 로직 (기존 로직 사용)
            # TODO: utils 모듈의 extract_jsonpath_value 사용
            pass
    
    async def _process_condition_handlers(self, context: ExecutionContext, handler: Dict[str, Any]) -> HandlerResult:
        """Condition Handler 처리"""
        condition_handlers = context.current_dialog_state.get("conditionHandlers", [])
        
        # 조건 평가
        for cond_handler in condition_handlers:
            if not isinstance(cond_handler, dict):
                continue
            
            condition_statement = cond_handler.get("conditionStatement", "")
            condition_result = self.transition_manager.evaluate_condition(condition_statement, context.memory)
            
            if condition_result:
                cond_target = cond_handler.get("transitionTarget", {})
                new_state = cond_target.get("dialogState", context.current_state)
                
                if new_state != context.current_state:
                    return create_state_transition_result(
                        new_state, 
                        [f"✅ API 호출 후 조건 '{condition_statement}' 매칭됨 → {new_state}"]
                    )
        
        return create_no_transition_result(["🔄 API 호출 완료 (조건 불일치)"])


class ConditionHandlerV2(BaseHandler):
    """Condition Handler 처리"""
    
    def __init__(self, transition_manager):
        super().__init__(HandlerType.CONDITION)
        self.transition_manager = transition_manager
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Condition Handler가 있으면 실행"""
        if not context.current_dialog_state:
            return False
        
        condition_handlers = context.current_dialog_state.get("conditionHandlers", [])
        return bool(condition_handlers)
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Condition Handler 실행 (조건 평가 순서 개선)"""
        try:
            condition_handlers = context.current_dialog_state.get("conditionHandlers", [])
            
            # 조건 평가 순서 개선: 불린 True를 문자열 "True"보다 우선 평가
            sorted_handlers = self._sort_conditions_by_priority(condition_handlers)
            
            for handler_index, (original_index, handler) in enumerate(sorted_handlers):
                if not isinstance(handler, dict):
                    continue
                
                condition = handler.get("conditionStatement", "")
                
                self.logger.info(f"[CONDITION] 평가 중: '{condition}' (원본 인덱스: {original_index})")
                
                if self.transition_manager.evaluate_condition(condition, context.memory):
                    target = handler.get("transitionTarget", {})
                    target_scenario = target.get("scenario")
                    target_state = target.get("dialogState")
                    
                    self.logger.info(f"[CONDITION] 조건 매칭: '{condition}' -> {target_scenario}.{target_state}")
                    
                    # 시나리오 전이 확인
                    if target_scenario and target_scenario != context.scenario["plan"][0]["name"]:
                        # 시나리오 전이
                        result = create_scenario_transition_result(
                            target_scenario, target_state,
                            [f"⚡ 조건 '{condition}' 만족으로 시나리오 전이: {target_scenario}"]
                        )
                        result.handler_index = original_index  # 원본 인덱스 사용
                        return result
                    
                    # 일반 상태 전이
                    elif target_state and target_state != context.current_state:
                        result = create_state_transition_result(
                            target_state,
                            [f"⚡ 조건 '{condition}' 만족으로 전이: {target_state}"]
                        )
                        result.handler_index = original_index  # 원본 인덱스 사용
                        return result
                    
                    # 특별한 경우: __END_SCENARIO__ 처리
                    elif target_state == "__END_SCENARIO__":
                        from .base_handler import TransitionType
                        result = HandlerResult(
                            transition_type=TransitionType.END_SCENARIO,
                            new_state="__END_SCENARIO__",
                            messages=[f"🔚 시나리오 종료: 조건 '{condition}' 만족"],
                            handler_index=original_index
                        )
                        return result
                    
                    # 특별한 경우: __END_SESSION__ 처리
                    elif target_state == "__END_SESSION__":
                        result = create_state_transition_result(
                            "__END_SESSION__",
                            [f"🏁 세션 종료: 조건 '{condition}' 만족"]
                        )
                        result.handler_index = original_index
                        return result
            
            return create_no_transition_result()
            
        except Exception as e:
            self.logger.error(f"Error executing condition handler: {e}")
            return create_no_transition_result([f"⚠️ Condition 처리 중 오류: {str(e)}"])
    
    def _sort_conditions_by_priority(self, condition_handlers: list) -> list:
        """조건을 우선순위에 따라 정렬 (불린 True > 문자열 "True" > 기타)"""
        indexed_handlers = [(i, handler) for i, handler in enumerate(condition_handlers)]
        
        def condition_priority(indexed_handler):
            index, handler = indexed_handler
            condition = handler.get("conditionStatement", "")
            
            # 1순위: 불린 True
            if condition == True or condition == "True":
                return (0, index)
            
            # 2순위: 문자열 "True"  
            elif condition == '"True"' or condition == "'True'":
                return (1, index)
            
            # 3순위: 기타 조건들
            else:
                return (2, index)
        
        sorted_handlers = sorted(indexed_handlers, key=condition_priority)
        
        # 정렬 결과 로깅
        self.logger.info(f"[CONDITION] 조건 평가 순서:")
        for i, (original_index, handler) in enumerate(sorted_handlers):
            condition = handler.get("conditionStatement", "")
            target = handler.get("transitionTarget", {})
            target_info = f"{target.get('scenario', '')}.{target.get('dialogState', '')}"
            self.logger.info(f"  {i+1}. 조건: {condition} → {target_info} (원본 인덱스: {original_index})")
        
        return sorted_handlers


class SlotFillingHandler(BaseHandler):
    """Slot Filling 처리"""
    
    def __init__(self, slot_filling_manager):
        super().__init__(HandlerType.SLOT_FILLING)
        self.slot_filling_manager = slot_filling_manager
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Slot Filling이 필요한지 확인"""
        if not context.current_dialog_state:
            return False
        
        # 슬롯 필링 폼이 있는지 확인
        slot_filling_forms = context.current_dialog_state.get("slotFillingForm", [])
        return bool(slot_filling_forms)
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Slot Filling 실행"""
        try:
            slot_filling_result = self.slot_filling_manager.process_slot_filling(
                context.current_dialog_state, context.memory, context.scenario, context.current_state
            )
            
            if slot_filling_result:
                new_state = slot_filling_result.get("new_state", context.current_state)
                messages = slot_filling_result.get("messages", [])
                
                if new_state != context.current_state:
                    result = create_state_transition_result(new_state, messages)
                else:
                    result = create_no_transition_result(messages)
                
                if slot_filling_result.get("transition"):
                    result.transitions = [slot_filling_result["transition"]]
                
                return result
            else:
                return create_no_transition_result()
                
        except Exception as e:
            self.logger.error(f"Error executing slot filling: {e}")
            return create_no_transition_result([f"⚠️ Slot Filling 처리 중 오류: {str(e)}"])


class EventHandler(BaseHandler):
    """Event Handler 처리"""
    
    def __init__(self, event_trigger_manager):
        super().__init__(HandlerType.EVENT)
        self.event_trigger_manager = event_trigger_manager
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Event Handler가 있고 이벤트가 발생했으면 실행"""
        if not context.current_dialog_state:
            return False
        
        event_handlers = context.current_dialog_state.get("eventHandlers", [])
        if not event_handlers:
            return False
        
        # 메모리에서 마지막 이벤트 타입 확인
        last_event_type = context.memory.get("lastEventType")
        return bool(last_event_type)
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Event Handler 실행"""
        try:
            event_handlers = context.current_dialog_state.get("eventHandlers", [])
            last_event_type = context.memory.get("lastEventType")
            
            for handler in event_handlers:
                if not isinstance(handler, dict):
                    continue
                
                event_info = handler.get("event", {})
                if isinstance(event_info, dict):
                    handler_event_type = event_info.get("type", "")
                elif isinstance(event_info, str):
                    handler_event_type = event_info
                else:
                    continue
                
                if handler_event_type == last_event_type:
                    target = handler.get("transitionTarget", {})
                    new_state = target.get("dialogState", context.current_state)
                    
                    if new_state != context.current_state:
                        return create_state_transition_result(
                            new_state,
                            [f"🎯 이벤트 '{last_event_type}' 처리됨 → {new_state}"]
                        )
            
            return create_no_transition_result([f"❌ 이벤트 '{last_event_type}'에 대한 핸들러가 없습니다."])
            
        except Exception as e:
            self.logger.error(f"Error executing event handler: {e}")
            return create_no_transition_result([f"⚠️ Event 처리 중 오류: {str(e)}"])
