"""
구체적인 Handler 구현들

이 모듈은 각 타입별 Handler의 구체적인 구현을 제공합니다.
기존 state_engine.py의 분산된 로직들을 각각의 Handler 클래스로 분리합니다.
"""

import logging
from typing import Dict, Any, List, Optional
from .base_handler import (
    BaseHandler, HandlerResult, ExecutionContext, HandlerType, TransitionType,
    create_no_transition_result, create_state_transition_result,
    create_scenario_transition_result, create_plan_transition_result
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
        
        if not has_entry_action:
            return False
        
        # 🚀 핵심 수정: 메모리에서 entry_action_executed 플래그 확인
        entry_action_executed_key = f"_ENTRY_ACTION_EXECUTED_{context.current_state}"
        
        # 🚀 추가 수정: plan 전이 후에는 새로운 플랜의 상태에 대해 플래그 무시
        # 현재 플랜 이름을 확인하여 plan 전이 여부 판단
        from services.handler_execution_engine import HandlerExecutionEngine
        
        # 전이 플래그가 설정되어 있으면 plan 전이 직후로 간주
        if HandlerExecutionEngine.get_transition_flag(context.session_id):
            self.logger.info(f"Plan transition detected, allowing entry action for state: {context.current_state}")
            return True
        
        # 🚀 추가: 이전 상태와 현재 상태가 다른 플랜에 있는지 확인
        # _PREVIOUS_STATE가 있고, 현재 상태가 새로운 플랜에 있다면 plan 전이로 간주
        previous_state = context.memory.get("_PREVIOUS_STATE")
        if previous_state and previous_state != context.current_state:
            # 현재 플랜에서 상태를 찾을 수 있는지 확인
            current_plan_found = False
            for plan in context.scenario.get("plan", []):
                for dialog_state in plan.get("dialogState", []):
                    if dialog_state.get("name") == context.current_state:
                        current_plan_found = True
                        break
                if current_plan_found:
                    break
            
            # 이전 상태가 다른 플랜에 있다면 plan 전이로 간주
            if current_plan_found:
                self.logger.info(f"State transition detected, allowing entry action for state: {context.current_state}")
                return True
        
        if context.memory.get(entry_action_executed_key, False):
            self.logger.debug(f"Entry action already executed for state: {context.current_state}")
            return False
        
        self.logger.debug(f"Entry action can be executed for state: {context.current_state}")
        return True
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Entry Action 실행"""
        try:
            entry_response = self.action_executor.execute_entry_action(
                context.scenario, context.current_state
            )
            
            # 🚀 핵심 수정: entry action 실행 후 플래그 설정
            # HandlerExecutionEngine의 stack_manager를 통해 플래그 업데이트
            # from services.handler_execution_engine import HandlerExecutionEngine
            
            # 🚀 임시 해결책: 전역 변수나 메모리에 플래그 설정
            # context.memory에 entry_action_executed 플래그 설정
            context.memory[f"_ENTRY_ACTION_EXECUTED_{context.current_state}"] = True
            self.logger.info(f"Entry action executed for state: {context.current_state}")
            
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

    def _extract_intent(self, nlu_result: Dict[str, Any]) -> Optional[str]:
        """NLU 결과에서 Intent를 추출"""
        try:
            results = nlu_result.get("results", [])
            if not results:
                return None
                
            nlu_nbest = results[0].get("nluNbest", [])
            if not nlu_nbest:
                return None
                
            intent = nlu_nbest[0].get("intent")
            return intent
        except Exception as e:
            self.logger.warning(f"[INTENT DEBUG] Failed to extract intent: {e}")
            return None
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Intent Handler 실행 조건 확인"""
        self.logger.info(f"[INTENT DEBUG] can_handle check for state: {context.current_state}")
        
        if not context.current_dialog_state:
            self.logger.info(f"[INTENT DEBUG] No current_dialog_state")
            return False
        
        # 🚀 핵심 수정: 전역 캐시에서 상태 전이 직후 즉시 intent 처리 방지
        # 이전 상태에서 전이된 직후라면 USER_INPUT을 삭제하여 즉시 intent 처리 방지
        # 🚀 수정: 전역 캐시에서 전이 플래그 확인 (요청 간에도 유지)
        from services.handler_execution_engine import HandlerExecutionEngine
        
        if HandlerExecutionEngine.get_transition_flag(context.session_id):
            self.logger.info(f"[INTENT DEBUG] 🚨 TRANSITION FLAG DETECTED in global cache!")
            
            # 🚀 핵심 개선: 현재 상태가 사용자 입력을 기다리는 상태인지 확인
            # intentHandlers나 slotFillingForm이 있으면 사용자 입력 대기 상태
            has_intent_handlers = bool(context.current_dialog_state.get("intentHandlers", []))
            has_slot_filling = bool(context.current_dialog_state.get("slotFillingForm", []))
            expects_user_input = has_intent_handlers or has_slot_filling
            
            if expects_user_input:
                # 🚀 추가 개선: __ANY_INTENT__만 있는 경우는 전이 플래그 존중
                intent_handlers = context.current_dialog_state.get("intentHandlers", [])
                has_only_any_intent = (
                    len(intent_handlers) == 1 and 
                    intent_handlers[0].get("intent") == "__ANY_INTENT__"
                )
                
                if has_only_any_intent:
                    self.logger.info(f"[INTENT DEBUG] State has only __ANY_INTENT__, respecting transition flag")
                    context.memory.pop("USER_INPUT", None)
                    HandlerExecutionEngine.clear_transition_flag(context.session_id)
                    return False
                else:
                    self.logger.info(f"[INTENT DEBUG] Current state expects user input (intentHandlers: {has_intent_handlers}, slotFilling: {has_slot_filling})")
                    self.logger.info(f"[INTENT DEBUG] Allowing intent processing despite transition flag")
                    # 전이 플래그 제거하고 인텐트 처리 계속 진행
                    HandlerExecutionEngine.clear_transition_flag(context.session_id)
            else:
                self.logger.info(f"[INTENT DEBUG] Current state does not expect user input, clearing USER_INPUT to prevent processing")
                context.memory.pop("USER_INPUT", None)
                # 🚀 수정: 전역 캐시에서 플래그 제거 (한 번만 사용)
                HandlerExecutionEngine.clear_transition_flag(context.session_id)
                # 상태 전이 직후에는 intent 처리를 하지 않음
                return False
        
        # 🚀 디버깅: 메모리 상태 상세 로깅
        self.logger.info(f"[INTENT DEBUG] Memory state check:")
        self.logger.info(f"  - _JUST_TRANSITIONED_THIS_REQUEST: {context.memory.get('_JUST_TRANSITIONED_THIS_REQUEST', 'NOT_SET')}")
        self.logger.info(f"  - _INTENT_TRANSITIONED_THIS_REQUEST: {context.memory.get('_INTENT_TRANSITIONED_THIS_REQUEST', 'NOT_SET')}")
        self.logger.info(f"  - _PREVIOUS_STATE: {context.memory.get('_PREVIOUS_STATE', 'NOT_SET')}")
        self.logger.info(f"  - USER_INPUT: {context.memory.get('USER_INPUT', 'NOT_SET')}")
        self.logger.info(f"  - Session ID: {context.session_id}")
        self.logger.info(f"  - Current State: {context.current_state}")
        
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
        
        # 🚀 핵심 수정: __ANY_INTENT__만 있는 상태에서는 사용자 입력을 기다려야 함
        # __ANY_INTENT__는 사용자가 명시적으로 입력을 제공했을 때만 처리되어야 함
        intent_handlers = context.current_dialog_state.get("intentHandlers", [])
        has_only_any_intent = (
            len(intent_handlers) == 1 and 
            intent_handlers[0].get("intent") == "__ANY_INTENT__"
        )
        
        if has_only_any_intent:
            self.logger.info(f"[INTENT DEBUG] State has only __ANY_INTENT__, requiring explicit user input")
            # __ANY_INTENT__만 있는 상태에서는 사용자 입력이 명시적으로 있어야 함
            # 단순히 has_user_input이 True인 것만으로는 부족함
            # 실제로 사용자가 이번 요청에서 입력을 제공했는지 확인
            if not context.user_input or not context.user_input.strip():
                self.logger.info(f"[INTENT DEBUG] __ANY_INTENT__ state but no explicit user input")
                return False
            else:
                self.logger.info(f"[INTENT DEBUG] __ANY_INTENT__ state with explicit user input: '{context.user_input}'")
        
        # 🚀 추가: 이전 user input 재사용 방지
        # State 전이 후 이전 user input이 새로운 state에서 재사용되지 않도록 보장
        if context.memory.get("_CLEAR_USER_INPUT_ON_NEXT_REQUEST", False):
            self.logger.info(f"[INTENT CLEAR] Clearing previous user input for new state: {context.current_state}")
            # 이전 user input과 NLU 결과 삭제
            context.memory.pop("USER_TEXT_INPUT", None)
            context.memory.pop("NLU_RESULT", None)
            context.memory.pop("_CLEAR_USER_INPUT_ON_NEXT_REQUEST", None)
            self.logger.info(f"[INTENT CLEAR] Previous user input cleared")
            # 🚀 수정: user input을 정리한 후에도 intent 처리가 필요한지 확인
            # 새로운 user input이 있으면 intent 처리를 계속 진행
            if context.has_user_input and context.user_input and context.user_input.strip():
                self.logger.info(f"[INTENT CLEAR] Continuing with new user input: '{context.user_input}'")
                # 🚀 추가: 새로운 user input에 대해 NLU_RESULT를 생성해야 함
                # 이는 can_handle에서 NLU_RESULT가 필요하기 때문
                if "NLU_RESULT" not in context.memory:
                    self.logger.info(f"[INTENT CLEAR] Creating NLU_RESULT for new user input")
                    # 🚀 수정: 비동기 HTTP 클라이언트로 NLU 서비스 호출
                    try:
                        import aiohttp
                        import json
                        
                        # NLU 서비스 호출 (비동기)
                        nlu_url = "http://localhost:8000/api/nlu/infer"
                        async with aiohttp.ClientSession() as session:
                            async with session.post(nlu_url, json={"text": context.user_input}, timeout=aiohttp.ClientTimeout(total=5)) as response:
                                if response.status == 200:
                                    nlu_data = await response.json()
                                    intent = nlu_data.get("intent", "unknown_intent")
                                    entities = nlu_data.get("entities", [])
                                    
                                    # NLU_RESULT 형식으로 변환
                                    context.memory["NLU_RESULT"] = {
                                        "results": [{
                                            "nluNbest": [{
                                                "intent": intent,
                                                "entities": entities
                                            }]
                                        }]
                                    }
                                    self.logger.info(f"[INTENT CLEAR] NLU processing completed: '{context.user_input}' -> '{intent}'")
                                else:
                                    raise Exception(f"NLU service returned {response.status}")
                            
                    except Exception as e:
                        self.logger.error(f"[INTENT CLEAR] NLU processing failed: {e}")
                        # 실패 시 기본값 설정
                        context.memory["NLU_RESULT"] = {
                            "results": [{
                                "nluNbest": [{"intent": "unknown_intent"}]
                            }]
                        }
            else:
                self.logger.info(f"[INTENT CLEAR] No new user input, skipping intent processing")
                return False
        
        # 🚀 수정: Intent 유예 플래그 처리 - 막 진입한 상태에서만 1회 유예
        if context.intent_deferred:
            self.logger.info(f"[INTENT DEFER] Deferring intent evaluation once at state={context.current_state}")
            # 1회 유예이므로 플래그 제거
            context.memory.pop("_DEFER_INTENT_ONCE_FOR_STATE", None)
            context.intent_deferred = False
            return False
        
        # NLU 결과가 있는지 확인
        nlu_result = context.memory.get("NLU_RESULT")
        if not nlu_result:
            self.logger.info(f"[INTENT DEBUG] No NLU_RESULT in memory, creating one")
            # 🚀 추가: 비동기 HTTP 클라이언트로 NLU_RESULT 생성
            try:
                import aiohttp
                import json
                
                # NLU 서비스 호출 (비동기)
                nlu_url = "http://localhost:8000/api/nlu/infer"
                async with aiohttp.ClientSession() as session:
                    async with session.post(nlu_url, json={"text": context.user_input}, timeout=aiohttp.ClientTimeout(total=5)) as response:
                        if response.status == 200:
                            nlu_data = await response.json()
                            intent = nlu_data.get("intent", "unknown_intent")
                            entities = nlu_data.get("entities", [])
                            
                            # NLU_RESULT 형식으로 변환
                            context.memory["NLU_RESULT"] = {
                                "results": [{
                                    "nluNbest": [{
                                        "intent": intent,
                                        "entities": entities
                                    }]
                                }]
                            }
                            nlu_result = context.memory["NLU_RESULT"]
                            self.logger.info(f"[INTENT DEBUG] Created NLU_RESULT: '{context.user_input}' -> '{intent}'")
                        else:
                            raise Exception(f"NLU service returned {response.status}")
                        
            except Exception as e:
                self.logger.error(f"[INTENT DEBUG] NLU processing failed: {e}")
                # 실패 시 기본값 설정
                context.memory["NLU_RESULT"] = {
                    "results": [{
                        "nluNbest": [{"intent": "unknown_intent"}]
                    }]
                }
                nlu_result = context.memory["NLU_RESULT"]
            
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
        # 더 구체적인 인텐트가 우선적으로 처리되도록 수정
        for handler in intent_handlers:
            handler_intent = handler.get("intent")
            if handler_intent == intent:
                self.logger.info(f"[INTENT DEBUG] Exact intent matched: {intent} -> {handler_intent}")
                self.logger.info(f"[INTENT DEBUG] can_handle = True (exact match)")
                return True
            elif handler_intent == "__ANY_INTENT__":
                self.logger.info(f"[INTENT DEBUG] __ANY_INTENT__ found as fallback for: {intent}")
                # __ANY_INTENT__는 fallback으로 작동하므로 True 반환
                # 실제 우선순위는 execute에서 처리
                self.logger.info(f"[INTENT DEBUG] can_handle = True (__ANY_INTENT__)")
                return True
            else:
                self.logger.info(f"[INTENT DEBUG] Intent not matched: {intent} != {handler_intent}")
        
        # 정확한 매칭이 없으면 False 반환
        self.logger.info(f"[INTENT DEBUG] No exact intent match found for: {intent}")
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
            
            # Intent Handler 확인 (정확한 매칭 우선, __ANY_INTENT__는 fallback)
            intent_transition = self.transition_manager.check_intent_handlers(
                context.current_dialog_state, intent, context.memory
            )
            
            if intent_transition:
                new_state = intent_transition.toState
                
                # 🚀 추가: 메모리 액션 실행
                # Intent Handler의 action에서 memoryActions 실행
                updated_memory = {}
                
                # 먼저 정확한 인텐트 매칭 확인
                exact_match_handler = None
                any_intent_handler = None
                
                for handler in context.current_dialog_state.get("intentHandlers", []):
                    handler_intent = handler.get("intent")
                    if handler_intent == intent:
                        exact_match_handler = handler
                        break
                    elif handler_intent == "__ANY_INTENT__":
                        any_intent_handler = handler
                
                # 정확한 매칭이 있으면 그것을 사용, 없으면 __ANY_INTENT__ 사용
                target_handler = exact_match_handler or any_intent_handler
                
                if target_handler:
                    action = target_handler.get("action", {})
                    if action:
                        self.transition_manager.execute_action(action, context.memory)
                        # 메모리 변경사항 추적
                        updated_memory.update(context.memory)
                
                # 🚀 추가: State 전이 후 이전 user input 삭제 (재사용 방지)
                # 이전 intent와 user input이 새로운 state에서 재사용되지 않도록 보장
                context.memory["_CLEAR_USER_INPUT_ON_NEXT_REQUEST"] = True
                context.memory["_PREVIOUS_STATE"] = context.current_state
                context.memory["_PREVIOUS_INTENT"] = intent
                
                # 다음 요청에서 새 상태의 intentHandlers 평가를 1회 유예
                context.memory["_DEFER_INTENT_ONCE_FOR_STATE"] = new_state
                context.memory["_INTENT_TRANSITIONED_THIS_REQUEST"] = True
                
                # 플랜명이 직접 지정된 경우 처리
                # TODO: StackManager를 통한 플랜 전환 로직 추가
                
                result = create_state_transition_result(new_state, [f"🎯 인텐트 '{intent}' 처리됨"])
                result.transitions = [intent_transition]
                
                # 🚀 추가: 메모리 변경사항 반환 (전체 메모리 상태 포함)
                result.updated_memory = context.memory.copy()
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
                self.logger.info(f"[APICALL] Calling _process_condition_handlers...")
                cond_result = await self._process_condition_handlers(context, handler)
                self.logger.info(f"[APICALL] _process_condition_handlers result: {cond_result}")
                self.logger.info(f"[APICALL] cond_result.transition_type: {cond_result.transition_type if cond_result else 'None'}")
                
                # 전이가 발생하는 경우 다음 상태에서 intent 1회 유예 및 입력 정리
                if cond_result and cond_result.transition_type != TransitionType.NO_TRANSITION:
                    if cond_result.new_state and cond_result.new_state != context.current_state:
                        context.memory["_DEFER_INTENT_ONCE_FOR_STATE"] = cond_result.new_state
                        context.memory["_INTENT_TRANSITIONED_THIS_REQUEST"] = True
                        context.memory["_CLEAR_USER_INPUT_ON_NEXT_REQUEST"] = True
                        context.memory["_PREVIOUS_STATE"] = context.current_state
                return cond_result
            
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
        mappings = apicall_config.get("formats", {}).get("responseMappings", {})
        if not mappings:
            return
        
        self.logger.info(f"📋 Processing response mappings: {mappings}")
        self.logger.info(f"📋 Response data: {response_data}")
        
        # utils 모듈의 apply_response_mappings 사용
        from services.utils import apply_response_mappings
        apply_response_mappings(response_data, mappings, memory)
    
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
                target_scenario = cond_target.get("scenario")
                target_state = cond_target.get("dialogState", context.current_state)
                
                self.logger.info(f"[APICALL CONDITION] 조건 매칭: '{condition_statement}' -> {target_scenario}.{target_state}")
                
                # 플랜 전이 확인
                if target_scenario and target_scenario != context.scenario["plan"][0]["name"]:
                    self.logger.info(f"[APICALL CONDITION] 🚨 PLAN TRANSITION DETECTED!")
                    self.logger.info(f"[APICALL CONDITION] 🚨 target_scenario: {target_scenario}")
                    self.logger.info(f"[APICALL CONDITION] 🚨 current plan: {context.scenario['plan'][0]['name']}")
                    
                    # 플랜 전이로 처리
                    result = create_plan_transition_result(
                        target_scenario, target_state,
                        [f"⚡ 조건 '{condition_statement}' 만족으로 플랜 전이: {target_scenario}"]
                    )
                    return result
                
                # 일반 상태 전이
                elif target_state and target_state != context.current_state:
                    return create_state_transition_result(
                        target_state, 
                        [f"✅ API 호출 후 조건 '{condition_statement}' 매칭됨 → {target_state}"]
                    )
        
        return create_no_transition_result(["🔄 API 호출 완료 (조건 불일치)"])


class ConditionHandlerV2(BaseHandler):
    """Condition Handler 처리"""
    
    def __init__(self, transition_manager):
        super().__init__(HandlerType.CONDITION)
        self.transition_manager = transition_manager
    
    async def can_handle(self, context: ExecutionContext) -> bool:
        """Condition Handler가 있으면 실행"""
        self.logger.info(f"[CONDITION DEBUG] can_handle check for state: {context.current_state}")
        self.logger.info(f"[CONDITION DEBUG] context.current_dialog_state: {context.current_dialog_state}")
        self.logger.info(f"[CONDITION DEBUG] context.has_user_input: {context.has_user_input}")
        self.logger.info(f"[CONDITION DEBUG] context.user_input: '{context.user_input}'")
        
        if not context.current_dialog_state:
            self.logger.info(f"[CONDITION DEBUG] No current_dialog_state")
            return False
        
        # 🚀 핵심 수정: 사용자 입력을 기다리는 상태인지 확인
        # intentHandlers나 slotFillingForm이 있으면 사용자 입력 대기 상태
        has_intent_handlers = bool(context.current_dialog_state.get("intentHandlers", []))
        has_slot_filling = bool(context.current_dialog_state.get("slotFillingForm", []))
        expects_user_input = has_intent_handlers or has_slot_filling
        
        self.logger.info(f"[CONDITION DEBUG] has_intent_handlers: {has_intent_handlers}")
        self.logger.info(f"[CONDITION DEBUG] has_slot_filling: {has_slot_filling}")
        self.logger.info(f"[CONDITION DEBUG] expects_user_input: {expects_user_input}")
        
        if expects_user_input:
            # 🚀 추가: 사용자 입력이 있는지 확인
            if not context.has_user_input:
                self.logger.info(f"[CONDITION DEBUG] State expects user input but no input provided, skipping condition handler")
                self.logger.info(f"[CONDITION DEBUG] intentHandlers: {has_intent_handlers}, slotFilling: {has_slot_filling}")
                return False
            else:
                self.logger.info(f"[CONDITION DEBUG] State expects user input and input provided, allowing condition handler")
        
        condition_handlers = context.current_dialog_state.get("conditionHandlers", [])
        self.logger.info(f"[CONDITION DEBUG] condition_handlers: {condition_handlers}")
        self.logger.info(f"[CONDITION DEBUG] condition_handlers length: {len(condition_handlers) if condition_handlers else 0}")
        
        result = bool(condition_handlers)
        self.logger.info(f"[CONDITION DEBUG] can_handle result: {result}")
        return result
    
    async def execute(self, context: ExecutionContext) -> HandlerResult:
        """Condition Handler 실행 (시나리오 등록 순서대로 처리)"""
        self.logger.info(f"[CONDITION DEBUG] 🚨 execute 메서드 시작 - state: {context.current_state}")
        
        try:
            # 🚀 디버깅: context 상태 확인
            self.logger.info(f"[CONDITION DEBUG] context.current_dialog_state: {context.current_dialog_state}")
            self.logger.info(f"[CONDITION DEBUG] context.current_dialog_state type: {type(context.current_dialog_state)}")
            
            if context.current_dialog_state is None:
                self.logger.error(f"[CONDITION DEBUG] current_dialog_state is None!")
                return create_no_transition_result(["⚠️ current_dialog_state가 None입니다"])
            
            condition_handlers = context.current_dialog_state.get("conditionHandlers", [])
            
            # 🚀 디버깅: condition_handlers 내용 확인
            self.logger.info(f"[CONDITION DEBUG] Raw condition_handlers: {condition_handlers}")
            self.logger.info(f"[CONDITION DEBUG] Type: {type(condition_handlers)}, Length: {len(condition_handlers) if condition_handlers else 'None'}")
            
            # 🚀 수정: None 값 필터링
            if condition_handlers is None:
                condition_handlers = []
            
            # 🚀 수정: None 값들을 필터링하여 새로운 리스트 생성
            filtered_handlers = []
            for i, handler in enumerate(condition_handlers):
                if handler is None:
                    self.logger.warning(f"[CONDITION DEBUG] Handler {i} is None, skipping")
                    continue
                filtered_handlers.append(handler)
            
            condition_handlers = filtered_handlers
            
            # 🚀 디버깅: 필터링된 핸들러들 확인
            for i, handler in enumerate(condition_handlers):
                self.logger.info(f"[CONDITION DEBUG] Handler {i}: {handler} (type: {type(handler)})")
            
            # 🚀 수정: 시나리오 등록 순서대로 처리 (우선순위 정렬 제거)
            self.logger.info(f"[CONDITION] 조건 핸들러 {len(condition_handlers)}개를 등록 순서대로 처리")
            
            # 조건 평가 순서 로깅
            for i, handler in enumerate(condition_handlers):
                if handler is None:
                    continue
                if isinstance(handler, dict):
                    condition = handler.get("conditionStatement", "")
                    target = handler.get("transitionTarget", {})
                    target_info = f"{target.get('scenario', '')}.{target.get('dialogState', '')}"
                    self.logger.info(f"  {i+1}. 조건: {condition} → {target_info}")
            
            for handler_index, handler in enumerate(condition_handlers):
                if handler is None:
                    self.logger.warning(f"[CONDITION DEBUG] Skipping None handler at index {handler_index}")
                    continue
                if not isinstance(handler, dict):
                    self.logger.warning(f"[CONDITION DEBUG] Skipping non-dict handler at index {handler_index}: {type(handler)}")
                    continue
                
                condition = handler.get("conditionStatement", "")
                
                self.logger.info(f"[CONDITION] 평가 중: '{condition}' (인덱스: {handler_index})")
                
                if self.transition_manager.evaluate_condition(condition, context.memory):
                    target = handler.get("transitionTarget", {})
                    target_scenario = target.get("scenario")
                    target_state = target.get("dialogState")
                    
                    self.logger.info(f"[CONDITION] 조건 매칭: '{condition}' -> {target_scenario}.{target_state}")
                    self.logger.info(f"[CONDITION] 🔍 target_scenario: {target_scenario}")
                    self.logger.info(f"[CONDITION] 🔍 target_state: {target_state}")
                    self.logger.info(f"[CONDITION] 🔍 context.scenario: {context.scenario}")
                    self.logger.info(f"[CONDITION] 🔍 context.scenario[\"plan\"][0][\"name\"]: {context.scenario.get('plan', [{}])[0].get('name', 'N/A')}")
                    
                    # 플랜 전이 확인
                    if target_scenario and target_scenario != context.scenario["plan"][0]["name"]:
                        self.logger.info(f"[CONDITION] 🚨 PLAN TRANSITION DETECTED!")
                        self.logger.info(f"[CONDITION] 🚨 target_scenario: {target_scenario}")
                        self.logger.info(f"[CONDITION] 🚨 current plan: {context.scenario['plan'][0]['name']}")
                        
                        # 플랜 전이로 처리
                        result = create_plan_transition_result(
                            target_scenario, target_state,
                            [f"⚡ 조건 '{condition}' 만족으로 플랜 전이: {target_scenario}"]
                        )
                        result.handler_index = handler_index  # 실제 인덱스 사용
                        self.logger.info(f"[CONDITION] 🚨 Created plan transition result: {result}")
                        return result
                    else:
                        self.logger.info(f"[CONDITION] 🔍 Not a plan transition")
                        self.logger.info(f"[CONDITION] 🔍 target_scenario == current_plan: {target_scenario == context.scenario['plan'][0]['name']}")
                    
                    # 일반 상태 전이
                    if target_state and target_state != context.current_state:
                        # 전이 발생 시 다음 상태에서 인텐트 1회 유예 및 입력 정리
                        context.memory["_DEFER_INTENT_ONCE_FOR_STATE"] = target_state
                        context.memory["_INTENT_TRANSITIONED_THIS_REQUEST"] = True
                        context.memory["_CLEAR_USER_INPUT_ON_NEXT_REQUEST"] = True
                        context.memory["_PREVIOUS_STATE"] = context.current_state

                        result = create_state_transition_result(
                            target_state,
                            [f"⚡ 조건 '{condition}' 만족으로 전이: {target_state}"]
                        )
                        result.handler_index = handler_index  # 실제 인덱스 사용
                        return result
                    
                    # 특별한 경우: __END_SCENARIO__ 처리
                    elif target_state == "__END_SCENARIO__":
                        from .base_handler import TransitionType
                        result = HandlerResult(
                            transition_type=TransitionType.END_SCENARIO,
                            new_state="__END_SCENARIO__",
                            messages=[f"🔚 시나리오 종료: 조건 '{condition}' 만족"],
                            handler_index=handler_index
                        )
                        return result
                    
                    # 특별한 경우: __END_SESSION__ 처리
                    elif target_state == "__END_SESSION__":
                        result = create_state_transition_result(
                            "__END_SESSION__",
                            [f"🏁 세션 종료: 조건 '{condition}' 만족"]
                        )
                        result.handler_index = handler_index
                        return result
                    
                    # 🚀 핵심 수정: 조건이 만족되면 즉시 반환 (다른 조건은 평가하지 않음)
                    break
            
            return create_no_transition_result()
            
        except Exception as e:
            self.logger.error(f"Error executing condition handler: {e}")
            return create_no_transition_result([f"⚠️ Condition 처리 중 오류: {str(e)}"])
    



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
