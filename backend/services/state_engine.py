import logging
import re
import json
import aiohttp
import asyncio
import time
import uuid
from typing import Dict, Any, List, Optional, Tuple
from jsonpath_ng import parse
from models.scenario import StateTransition, ChatbotResponse, ErrorInfo, ChatbotDirective, DirectiveContent, ResponseMeta, UsedSlot

logger = logging.getLogger(__name__)

class StateEngine:
    """시나리오 기반 State 전이 엔진"""
    
    def __init__(self):
        self.scenarios: Dict[str, Dict[str, Any]] = {}
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.global_intent_mapping: List[Dict[str, Any]] = []
    
    def load_scenario(self, session_id: str, scenario_data: Dict[str, Any]):
        """시나리오를 로드합니다."""
        self.scenarios[session_id] = scenario_data
        
        # Webhook 정보 로딩 확인
        webhooks = scenario_data.get("webhooks", [])
        logger.info(f"📋 Loaded {len(webhooks)} webhooks for session: {session_id}")
        for webhook in webhooks:
            logger.info(f"🔗 Webhook: {webhook.get('name', 'Unknown')} -> {webhook.get('url', 'Unknown URL')}")
        
        # Webhook Actions 확인
        plan = scenario_data.get("plan", [])
        if plan and len(plan) > 0:
            dialog_states = plan[0].get("dialogState", [])
            webhook_states = []
            for state in dialog_states:
                webhook_actions = state.get("webhookActions", [])
                if webhook_actions:
                    webhook_states.append({
                        "state": state.get("name", "Unknown"),
                        "actions": [action.get("name", "Unknown") for action in webhook_actions]
                    })
            
            if webhook_states:
                logger.info(f"🔗 Found {len(webhook_states)} states with webhook actions:")
                for ws in webhook_states:
                    logger.info(f"   - {ws['state']}: {ws['actions']}")
            else:
                logger.info("🔗 No states with webhook actions found")
        
        logger.info(f"Scenario loaded for session: {session_id}")
        
    def get_scenario(self, session_id: str) -> Optional[Dict[str, Any]]:
        """세션의 시나리오를 반환합니다."""
        return self.scenarios.get(session_id)
    
    def update_intent_mapping(self, intent_mapping: List[Dict[str, Any]]):
        """글로벌 Intent Mapping을 업데이트합니다."""
        self.global_intent_mapping = intent_mapping
        logger.info(f"Updated global intent mapping with {len(intent_mapping)} rules")
    
    def get_initial_state(self, scenario: Dict[str, Any]) -> str:
        """시나리오의 초기 상태를 반환합니다."""
        if scenario.get("plan") and len(scenario["plan"]) > 0:
            dialog_states = scenario["plan"][0].get("dialogState", [])
            if dialog_states:
                # Start가 있으면 선택
                for state in dialog_states:
                    if state.get("name") == "Start":
                        logger.info("🎯 Start를 초기 상태로 설정")
                        return "Start"
                
                # Start가 없으면 첫 번째 상태 선택
                first_state = dialog_states[0].get("name", "")
                logger.info(f"🎯 첫 번째 상태를 초기 상태로 설정: {first_state}")
                return first_state
        return ""
    
    def check_auto_transitions(self, scenario: Dict[str, Any], current_state: str, memory: Optional[Dict[str, Any]] = None) -> List[StateTransition]:
        """자동 전이가 가능한지 확인합니다."""
        if memory is None:
            memory = {}
            
        auto_transitions = []
        current_dialog_state = self._find_dialog_state(scenario, current_state)
        
        if not current_dialog_state:
            return auto_transitions
        
        # Webhook이 있는 상태에서는 webhook 실행 후 조건 핸들러 확인
        webhook_actions = current_dialog_state.get("webhookActions", [])
        if webhook_actions:
            logger.info(f"State {current_state} has webhook actions - checking condition handlers (webhook execution handled separately in process_input)")
            # webhook 상태에서는 조건 핸들러만 확인 (실제 webhook 실행은 process_input에서 _handle_webhook_actions로 처리)
            condition_handlers = current_dialog_state.get("conditionHandlers", [])
            for handler in condition_handlers:
                if not isinstance(handler, dict):
                    logger.warning(f"Handler is not a dict: {handler}")
                    continue
                    
                condition = handler.get("conditionStatement", "")
                if condition.strip() == "True" or condition.strip() == '"True"':
                    target = handler.get("transitionTarget", {})
                    transition = StateTransition(
                        fromState=current_state,
                        toState=target.get("dialogState", ""),
                        reason="웹훅 후 자동 조건: True",
                        conditionMet=True,
                        handlerType="condition"
                    )
                    auto_transitions.append(transition)
                    logger.info(f"Webhook state auto condition transition found: {current_state} -> {transition.toState}")
                    break
            return auto_transitions
        
        # Event Handler가 있는 상태에서는 모든 자동 전이하지 않음 (사용자 이벤트 트리거 대기)
        event_handlers = current_dialog_state.get("eventHandlers", [])
        if event_handlers:
            logger.info(f"State {current_state} has event handlers - NO auto transitions, waiting for manual event trigger")
            return auto_transitions
        
        # ApiCall Handler가 있는 상태에서는 자동 전이하지 않음 (API 호출 대기)
        # 단, webhook action이 있는 경우에는 API call handler를 무시
        apicall_handlers = current_dialog_state.get("apicallHandlers", [])
        if apicall_handlers and not webhook_actions:
            logger.info(f"State {current_state} has apicall handlers - NO auto transitions, waiting for API execution")
            return auto_transitions
        
        # Intent Handler가 있는 상태에서는 자동 전이하지 않음 (사용자 입력 대기)
        intent_handlers = current_dialog_state.get("intentHandlers", [])
        if intent_handlers:
            logger.info(f"State {current_state} has intent handlers - NO auto transitions, waiting for user input")
            return auto_transitions
        
        # 2. True 조건 확인 (webhook이나 event handler, apicall handler, intent handler가 없는 경우에만)
        condition_handlers = current_dialog_state.get("conditionHandlers", [])
        for handler in condition_handlers:
            # handler가 딕셔너리인지 확인
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
                
            condition = handler.get("conditionStatement", "")
            if condition.strip() == "True" or condition.strip() == '"True"':
                target = handler.get("transitionTarget", {})
                transition = StateTransition(
                    fromState=current_state,
                    toState=target.get("dialogState", ""),
                    reason="자동 조건: True",
                    conditionMet=True,
                    handlerType="condition"
                )
                auto_transitions.append(transition)
                logger.info(f"Auto condition transition found: {current_state} -> {transition.toState}")
        
        return auto_transitions

    async def process_input(
        self, 
        session_id: str, 
        user_input: str, 
        current_state: str, 
        scenario: Dict[str, Any],
        memory: Dict[str, Any],
        event_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """사용자 입력을 처리하고 State 전이를 수행합니다."""
        
        try:
            # 현재 상태 정보 가져오기
            current_dialog_state = self._find_dialog_state(scenario, current_state)
            if not current_dialog_state:
                return {
                    "error": f"상태 '{current_state}'를 찾을 수 없습니다.",
                    "new_state": current_state,
                    "response": "❌ 알 수 없는 상태입니다.",
                    "transitions": []
                }
            
            # 이벤트 타입이 지정된 경우 이벤트 처리
            if event_type:
                return await self._handle_event_trigger(
                    event_type, current_state, current_dialog_state, scenario, memory
                )
            
            # Webhook이 있는 상태인지 확인
            webhook_actions = current_dialog_state.get("webhookActions", [])
            is_webhook_state = len(webhook_actions) > 0
            
            # 빈 입력일 경우 자동 전이 확인 (webhook 상태가 아닐 때만)
            if not user_input.strip():
                # 슬롯 필링 대기 중인지 확인
                waiting_slot = memory.get("_WAITING_FOR_SLOT")
                reprompt_handlers = memory.get("_REPROMPT_HANDLERS")
                
                if waiting_slot and reprompt_handlers:
                    logger.info(f"🔄 Empty input while waiting for slot {waiting_slot}, triggering reprompt")
                    no_match_result = self._handle_no_match_event(
                        current_dialog_state, memory, scenario, current_state
                    )
                    if no_match_result:
                        return {
                            "new_state": no_match_result.get("new_state", current_state),
                            "response": "\n".join(no_match_result.get("messages", [])),
                            "transitions": [],
                            "intent": "NO_MATCH_EVENT",
                            "entities": {},
                            "memory": memory
                        }
                
                if is_webhook_state:
                    logger.info(f"State {current_state} has webhooks - executing webhook actions automatically")
                    return await self._handle_webhook_actions(
                        current_state, current_dialog_state, scenario, memory
                    )
                else:
                    # ApiCall Handler 확인 (webhook action이 있는 경우 제외)
                    webhook_actions = current_dialog_state.get("webhookActions", [])
                    if not webhook_actions:
                        apicall_result = await self._handle_apicall_handlers(
                            current_state, current_dialog_state, scenario, memory
                        )
                        if apicall_result:
                            return apicall_result
                    
                    auto_transitions = self.check_auto_transitions(scenario, current_state, memory)
                    if auto_transitions:
                        first_transition = auto_transitions[0]
                        new_state = first_transition.toState
                        
                        # Entry Action 실행
                        entry_response = self._execute_entry_action(scenario, new_state)
                        response_msg = entry_response or f"🚀 자동 전이: {current_state} → {new_state}"
                        
                        return {
                            "new_state": new_state,
                            "response": response_msg,
                            "transitions": [t.dict() for t in auto_transitions],
                            "intent": "AUTO_TRANSITION",
                            "entities": {},
                            "memory": memory
                        }
            
            # Webhook 처리 확인
            if is_webhook_state:
                logger.info(f"Processing webhook actions for state: {current_state}")
                return await self._handle_webhook_actions(
                    current_state, current_dialog_state, scenario, memory
                )
            
            # 일반 입력 처리
            return await self._handle_normal_input(
                user_input, current_state, current_dialog_state, scenario, memory
            )
            
        except Exception as e:
            logger.error(f"State processing error: {str(e)}")
            return {
                "error": str(e),
                "new_state": current_state,
                "response": f"❌ 처리 오류: {str(e)}",
                "transitions": []
            }
    
    async def _handle_webhook_actions(
        self,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        """웹훅 액션을 자동으로 처리합니다."""
        
        webhook_actions = current_dialog_state.get("webhookActions", [])
        if not webhook_actions:
            return {
                "new_state": current_state,
                "response": "🔗 웹훅 액션이 없습니다.",
                "transitions": [],
                "intent": "NO_WEBHOOK",
                "entities": {},
                "memory": memory
            }
        
        transitions = []
        new_state = current_state
        response_messages = []
        
        # 각 웹훅 액션 처리
        for webhook_action in webhook_actions:
            if not isinstance(webhook_action, dict):
                logger.warning(f"Webhook action is not a dict: {webhook_action}")
                continue
            
            webhook_name = webhook_action.get("name", "Unknown")
            logger.info(f"🔗 Processing webhook action: {webhook_name} (type: {type(webhook_name)})")
            logger.info(f"🔗 Raw webhook action data: {webhook_action}")
            
            # 시나리오에서 해당 이름의 웹훅 설정 찾기
            webhook_config = None
            webhooks = scenario.get("webhooks", [])
            logger.info(f"📋 Searching for webhook '{webhook_name}' among {len(webhooks)} registered webhooks")
            
            # 먼저 정확한 이름으로 찾기
            for webhook in webhooks:
                registered_name = webhook.get("name", "")
                logger.info(f"   - Checking: '{registered_name}' vs '{webhook_name}'")
                if registered_name == webhook_name:
                    webhook_config = webhook
                    logger.info(f"✅ Found matching webhook config: {webhook_name}")
                    break
            
            # 정확한 이름으로 찾지 못한 경우, 쉼표로 구분된 이름 중에서 찾기
            if not webhook_config and "," in webhook_name:
                webhook_names = [name.strip() for name in webhook_name.split(",")]
                logger.info(f"🔍 Webhook name contains multiple values: {webhook_names}")
                
                for name in webhook_names:
                    for webhook in webhooks:
                        registered_name = webhook.get("name", "")
                        if registered_name == name:
                            webhook_config = webhook
                            logger.info(f"✅ Found matching webhook config from list: {name}")
                            break
                    if webhook_config:
                        break
            
            # 여전히 찾지 못한 경우, 첫 번째 webhook 사용
            if not webhook_config and webhooks:
                webhook_config = webhooks[0]
                logger.warning(f"⚠️ Webhook config not found for name: '{webhook_name}', using first available webhook: {webhook_config.get('name', 'Unknown')}")
                response_messages.append(f"⚠️ 웹훅 '{webhook_name}' 설정을 찾을 수 없어 첫 번째 webhook 사용: {webhook_config.get('name', 'Unknown')}")
            elif not webhook_config:
                logger.error(f"❌ No webhook configs available at all")
                response_messages.append(f"❌ 웹훅 설정을 찾을 수 없음: {webhook_name}")
                continue
            
            # 웹훅 호출 실행
            webhook_response = await self._execute_webhook_call(
                webhook_config, "", current_state, scenario, memory
            )
            
            if webhook_response is None:
                logger.error(f"Webhook call failed for: {webhook_name}")
                response_messages.append(f"❌ 웹훅 호출 실패: {webhook_name}")
                continue
            
            # 웹훅 응답에서 memory 업데이트
            response_memory = webhook_response.get("memorySlots", {})
            if response_memory:
                memory.update(response_memory)
                logger.info(f"Memory updated from webhook response: {response_memory}")
            
            # NLU_INTENT 추출 및 memory에 문자열로 저장
            nlu_intent = ""
            if "NLU_INTENT" in response_memory:
                nlu_intent_data = response_memory["NLU_INTENT"]
                if isinstance(nlu_intent_data, dict) and "value" in nlu_intent_data:
                    nlu_intent = nlu_intent_data["value"][0] if nlu_intent_data["value"] else ""
                else:
                    nlu_intent = str(nlu_intent_data)
                
                # memory에 문자열로 저장 (조건 평가에서 사용하기 위해)
                memory["NLU_INTENT"] = nlu_intent
            
            logger.info(f"Extracted NLU_INTENT from webhook: {nlu_intent}")
            response_messages.append(f"🔗 웹훅 호출 완료: {webhook_name} (NLU_INTENT = '{nlu_intent}')")
        
        # 웹훅 실행 후 조건 핸들러 확인
        condition_handlers = current_dialog_state.get("conditionHandlers", [])
        matched_condition = False
        
        # 먼저 True가 아닌 조건들을 확인
        for handler in condition_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
                
            condition = handler.get("conditionStatement", "")
            
            # True 조건은 맨 마지막에 체크 (fallback)
            if condition.strip() == "True" or condition.strip() == '"True"':
                continue
                
            # 조건 평가
            if self._evaluate_condition(condition, memory):
                target = handler.get("transitionTarget", {})
                new_state = target.get("dialogState", current_state)
                
                transition = StateTransition(
                    fromState=current_state,
                    toState=new_state,
                    reason=f"웹훅 조건 매칭: {condition}",
                    conditionMet=True,
                    handlerType="condition"
                )
                transitions.append(transition)
                response_messages.append(f"✅ 조건 '{condition}' 매칭됨 → {new_state}")
                matched_condition = True
                break
        
        # 조건에 매칭되지 않으면 fallback (True 조건) 실행
        if not matched_condition:
            for handler in condition_handlers:
                if not isinstance(handler, dict):
                    logger.warning(f"Handler is not a dict: {handler}")
                    continue
                    
                condition = handler.get("conditionStatement", "")
                if condition.strip() == "True" or condition.strip() == '"True"':
                    target = handler.get("transitionTarget", {})
                    new_state = target.get("dialogState", current_state)
                    
                    transition = StateTransition(
                        fromState=current_state,
                        toState=new_state,
                        reason="웹훅 조건 불일치 - fallback 실행",
                        conditionMet=True,
                        handlerType="condition"
                    )
                    transitions.append(transition)
                    response_messages.append(f"❌ 조건 불일치 - fallback으로 {new_state}로 이동")
                    break
        
        # Entry Action 실행 및 자동 전이 확인 (새로운 상태로 전이된 경우)
        if new_state != current_state:
            try:
                logger.info(f"Executing entry action for transition: {current_state} -> {new_state}")
                entry_response = self._execute_entry_action(scenario, new_state)
                logger.info(f"Entry action completed: {entry_response}")
                if entry_response:
                    response_messages.append(entry_response)
                
                # Entry Action 실행 후 자동 전이 확인
                auto_transition_result = await self._check_and_execute_auto_transitions(
                    scenario, new_state, memory, response_messages
                )
                if auto_transition_result:
                    new_state = auto_transition_result["new_state"]
                    response_messages.extend(auto_transition_result["messages"])
                    if auto_transition_result.get("transitions"):
                        transitions.extend(auto_transition_result["transitions"])
            except Exception as e:
                logger.error(f"Error executing entry action: {e}")
                response_messages.append(f"⚠️ Entry action 실행 중 에러: {str(e)}")
        
        # 상태 전이 후 자동으로 webhook 실행 (최종 전이까지 반복)
        while True:
            new_dialog_state = self._find_dialog_state(scenario, new_state)
            if new_dialog_state:
                webhook_actions = new_dialog_state.get("webhookActions", [])
                if webhook_actions:
                    logger.info(f"🔗 New state {new_state} has webhook actions - executing automatically")
                    webhook_result = await self._handle_webhook_actions(
                        new_state, new_dialog_state, scenario, memory
                    )
                    if webhook_result:
                        final_new_state = webhook_result.get("new_state", new_state)
                        webhook_messages = webhook_result.get("response", "").split("\n")
                        response_messages.extend(webhook_messages)
                        if final_new_state != new_state:
                            try:
                                final_entry_response = self._execute_entry_action(scenario, final_new_state)
                                if final_entry_response:
                                    response_messages.append(final_entry_response)
                                final_auto_result = await self._check_and_execute_auto_transitions(
                                    scenario, final_new_state, memory, response_messages
                                )
                                if final_auto_result:
                                    final_new_state = final_auto_result["new_state"]
                                    response_messages.extend(final_auto_result["messages"])
                                    if final_auto_result.get("transitions"):
                                        transitions.extend(final_auto_result["transitions"])
                            except Exception as e:
                                logger.error(f"Error executing final entry action: {e}")
                                response_messages.append(f"⚠️ 최종 Entry action 실행 중 에러: {str(e)}")
                        if final_new_state == new_state:
                            break
                        new_state = final_new_state
                        continue
            break
        
        # transitions 리스트 처리
        try:
            transition_dicts = []
            for t in transitions:
                if hasattr(t, 'dict'):
                    transition_dicts.append(t.dict())
                elif hasattr(t, 'model_dump'):
                    transition_dicts.append(t.model_dump())
                else:
                    logger.warning(f"Transition object has no dict method: {t}")
                    transition_dicts.append(str(t))
        except Exception as e:
            logger.error(f"Error processing transitions in _handle_webhook_actions: {e}")
            transition_dicts = []
        
        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": transition_dicts,
            "intent": "WEBHOOK_PROCESSING",
            "entities": {},
            "memory": memory
        }
    
    async def _handle_normal_input(
        self,
        user_input: str,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        """일반 사용자 입력을 처리합니다."""
        
        # 웹훅 액션이 있는 상태에서는 웹훅을 먼저 실행
        webhook_actions = current_dialog_state.get("webhookActions", [])
        if webhook_actions:
            logger.info(f"🔗 State {current_state} has webhook actions - executing webhook first")
            webhook_result = await self._handle_webhook_actions(
                current_state, current_dialog_state, scenario, memory
            )
            
            # 웹훅 실행 후 새로운 상태에서 intent/condition/event handler 처리
            new_state_after_webhook = webhook_result.get("new_state", current_state)
            new_dialog_state = self._find_dialog_state(scenario, new_state_after_webhook)
            
            if new_dialog_state:
                # 새로운 상태에서 일반 입력 처리 (intent/condition/event handler)
                logger.info(f"🔗 Processing intent/condition/event handlers after webhook execution")
                normal_result = await self._handle_normal_input_after_webhook(
                    user_input, new_state_after_webhook, new_dialog_state, scenario, memory
                )
                
                # 웹훅 결과와 일반 처리 결과를 합침
                combined_response = webhook_result.get("response", "") + "\n" + normal_result.get("response", "")
                combined_transitions = webhook_result.get("transitions", []) + normal_result.get("transitions", [])
                
                return {
                    "new_state": normal_result.get("new_state", new_state_after_webhook),
                    "response": combined_response,
                    "transitions": combined_transitions,
                    "intent": normal_result.get("intent", "WEBHOOK_AND_NORMAL_PROCESSING"),
                    "entities": normal_result.get("entities", {}),
                    "memory": memory
                }
            else:
                # 새로운 상태를 찾을 수 없는 경우 웹훅 결과만 반환
                return webhook_result
        
        # 웹훅 액션이 없는 경우 일반 처리
        return await self._handle_normal_input_after_webhook(
            user_input, current_state, current_dialog_state, scenario, memory
        )
    
    async def _handle_normal_input_after_webhook(
        self,
        user_input: str,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        """웹훅 실행 후 일반 사용자 입력을 처리합니다."""
        
        # 실제 NLU 결과 사용 (프론트엔드에서 받은 결과 우선)
        intent, entities = self._get_nlu_results(user_input, memory, scenario, current_state)
        
        # Entity를 메모리에 저장 (type:role 형태의 키로)
        self._store_entities_to_memory(entities, memory)
        
        transitions = []
        new_state = current_state
        response_messages = []
        
        # 슬롯 필링 대기 중인지 먼저 확인
        waiting_slot = memory.get("_WAITING_FOR_SLOT")
        reprompt_handlers = memory.get("_REPROMPT_HANDLERS")
        reprompt_just_registered = memory.get("_REPROMPT_JUST_REGISTERED", False)
        
        if waiting_slot and reprompt_handlers:
            logger.info(f"🎰 Currently waiting for slot: {waiting_slot}, just_registered: {reprompt_just_registered}")
            
            # 현재 입력으로 대기 중인 슬롯이 채워졌는지 직접 확인
            slot_filled_by_current_input = False
            
            # 현재 다이얼로그 상태에서 슬롯 필링 폼 찾기
            slot_filling_forms = current_dialog_state.get("slotFillingForm", [])
            for form in slot_filling_forms:
                if form.get("name") == waiting_slot:
                    memory_slot_keys = form.get("memorySlotKey", [])
                    
                    # 각 메모리 키를 확인하여 슬롯이 채워졌는지 확인
                    for memory_key in memory_slot_keys:
                        if memory_key in memory and memory[memory_key]:
                            slot_filled_by_current_input = True
                            logger.info(f"🎰 Waiting slot {waiting_slot} filled by current input with key {memory_key}: {memory[memory_key]}")
                            break
                    break
            
            if slot_filled_by_current_input:
                # 슬롯이 채워진 경우 정상적인 슬롯 필링 처리
                logger.info(f"🎰 Slot {waiting_slot} filled, processing slot filling")
                slot_filling_result = self._process_slot_filling(
                    current_dialog_state, memory, scenario, current_state
                )
                
                if slot_filling_result:
                    new_state = slot_filling_result.get("new_state", current_state)
                    response_messages.extend(slot_filling_result.get("messages", []))
                    if slot_filling_result.get("transition"):
                        transitions.append(slot_filling_result["transition"])
                    
                    # 슬롯 필링이 완료되었는지 확인
                    if memory.get("SLOT_FILLING_COMPLETED"):
                        logger.info("🎰 Slot filling completed, clearing reprompt handlers")
                        self._clear_reprompt_handlers(memory, current_state)
            else:
                # 슬롯이 채워지지 않았을 때 처리
                if reprompt_just_registered:
                    # 첫 번째 시도: fill behavior directive만 실행
                    logger.info(f"🔄 First attempt - Slot {waiting_slot} not filled, executing fill behavior directive only")
                    
                    # fill behavior의 promptAction 실행
                    slot_filling_forms = current_dialog_state.get("slotFillingForm", [])
                    for form in slot_filling_forms:
                        if form.get("name") == waiting_slot:
                            fill_behavior = form.get("fillBehavior", {})
                            prompt_action = fill_behavior.get("promptAction", {})
                            if prompt_action:
                                prompt_message = self._execute_prompt_action(prompt_action, memory)
                                if prompt_message:
                                    response_messages.append(prompt_message)
                                    logger.info("🎰 Fill behavior directive executed (first attempt)")
                            break
                    
                    # 첫 번째 시도 플래그 제거
                    memory.pop("_REPROMPT_JUST_REGISTERED", None)
                else:
                    # 두 번째 이후 시도: fill behavior directive + reprompt directive 모두 실행
                    logger.info(f"🔄 Subsequent attempt - Slot {waiting_slot} not filled, executing both directives")
                    
                    # 1. fill behavior의 promptAction 실행
                    slot_filling_forms = current_dialog_state.get("slotFillingForm", [])
                    for form in slot_filling_forms:
                        if form.get("name") == waiting_slot:
                            fill_behavior = form.get("fillBehavior", {})
                            prompt_action = fill_behavior.get("promptAction", {})
                            if prompt_action:
                                prompt_message = self._execute_prompt_action(prompt_action, memory)
                                if prompt_message:
                                    response_messages.append(prompt_message)
                                    logger.info("🎰 Fill behavior directive executed")
                            break
                    
                    # 2. reprompt handler의 directive 실행
                    no_match_result = self._handle_no_match_event(
                        current_dialog_state, memory, scenario, current_state
                    )
                    if no_match_result:
                        response_messages.extend(no_match_result.get("messages", []))
                        logger.info("🔄 Reprompt directive executed")
                
                # 현재 상태 유지
                new_state = current_state
        else:
            # 일반 처리: Slot Filling 상태인지 확인
            slot_filling_result = self._process_slot_filling(
                current_dialog_state, memory, scenario, current_state
            )
            
            if slot_filling_result:
                # Slot Filling 처리 결과
                new_state = slot_filling_result.get("new_state", current_state)
                response_messages.extend(slot_filling_result.get("messages", []))
                if slot_filling_result.get("transition"):
                    transitions.append(slot_filling_result["transition"])
            else:
                # 일반 Intent/Condition 처리
                # 1. Intent Handler 확인
                intent_transition = self._check_intent_handlers(
                    current_dialog_state, intent, memory
                )
                if intent_transition:
                    transitions.append(intent_transition)
                    new_state = intent_transition.toState
                    response_messages.append(f"🎯 인텐트 '{intent}' 처리됨")
                
                # 2. Condition Handler 확인 (전이가 없었을 경우)
                if not intent_transition:
                    condition_transition = self._check_condition_handlers(
                        current_dialog_state, memory
                    )
                    if condition_transition:
                        transitions.append(condition_transition)
                        new_state = condition_transition.toState
                        response_messages.append(f"⚡ 조건 만족으로 전이")
                    else:
                        # 3. 매치되지 않은 경우 NO_MATCH_EVENT 처리
                        if intent == "NO_INTENT_FOUND" or not intent_transition:
                            no_match_result = self._handle_no_match_event(
                                current_dialog_state, memory, scenario, current_state
                            )
                            if no_match_result:
                                new_state = no_match_result.get("new_state", current_state)
                                response_messages.extend(no_match_result.get("messages", []))
                                logger.info("🔄 NO_MATCH_EVENT processed")
        
        # 3. Entry Action 실행 및 자동 전이 확인 (새로운 상태로 전이된 경우)
        if new_state != current_state:
            # 상태가 변경되면 reprompt handler 해제
            self._clear_reprompt_handlers(memory, current_state)
            
            # Entry Action 실행
            entry_response = self._execute_entry_action(scenario, new_state)
            if entry_response:
                response_messages.append(entry_response)
            
            # Entry Action 실행 후 자동 전이 확인
            auto_transition_result = await self._check_and_execute_auto_transitions(
                scenario, new_state, memory, response_messages
            )
            if auto_transition_result:
                new_state = auto_transition_result["new_state"]
                response_messages.extend(auto_transition_result["messages"])
                if auto_transition_result.get("transitions"):
                    transitions.extend(auto_transition_result["transitions"])
        
        # 기본 응답 생성
        if not response_messages:
            response_messages.append(f"💬 '{user_input}' 입력이 처리되었습니다.")
        
        # transitions 리스트 처리
        try:
            transition_dicts = []
            for t in transitions:
                if hasattr(t, 'dict'):
                    transition_dicts.append(t.dict())
                elif hasattr(t, 'model_dump'):
                    transition_dicts.append(t.model_dump())
                else:
                    logger.warning(f"Transition object has no dict method: {t}")
                    transition_dicts.append(str(t))
        except Exception as e:
            logger.error(f"Error processing transitions in _handle_normal_input_after_webhook: {e}")
            transition_dicts = []
        
        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": transition_dicts,
            "intent": intent,
            "entities": entities,
            "memory": memory
        }
    
    def _find_dialog_state(self, scenario: Dict[str, Any], state_name: str) -> Optional[Dict[str, Any]]:
        """시나리오에서 특정 상태를 찾습니다."""
        for plan in scenario.get("plan", []):
            for dialog_state in plan.get("dialogState", []):
                if dialog_state.get("name") == state_name:
                    return dialog_state
        return None
    
    def _clear_reprompt_handlers(self, memory: Dict[str, Any], current_state: str) -> None:
        """reprompt handler 등록을 해제합니다."""
        if memory.get("_WAITING_FOR_SLOT") or memory.get("_REPROMPT_HANDLERS"):
            logger.info(f"🧹 Clearing reprompt handlers when leaving state: {current_state}")
            memory.pop("_WAITING_FOR_SLOT", None)
            memory.pop("_REPROMPT_HANDLERS", None)
            memory.pop("_REPROMPT_JUST_REGISTERED", None)
    
    async def _check_and_execute_auto_transitions(
        self,
        scenario: Dict[str, Any],
        current_state: str,
        memory: Dict[str, Any],
        response_messages: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Entry Action 실행 후 자동 전이가 가능한지 확인하고 실행합니다."""
        
        # 현재 상태 정보 가져오기
        current_dialog_state = self._find_dialog_state(scenario, current_state)
        if not current_dialog_state:
            return None
        
        webhook_actions = current_dialog_state.get("webhookActions", [])
        apicall_handlers = current_dialog_state.get("apicallHandlers", [])
        
        # 1. webhook이 있으면 webhook만 실행 (성공 시 apicall은 실행하지 않음)
        if webhook_actions:
            logger.info(f"State {current_state} has webhook actions - executing webhook first (apicall will be skipped if webhook succeeds)")
            webhook_result = await self._handle_webhook_actions(
                current_state, current_dialog_state, scenario, memory
            )
            if webhook_result:
                new_state = webhook_result.get("new_state", current_state)
                webhook_messages = webhook_result.get("response", "").split("\n")
                response_messages.extend(webhook_messages)
                if new_state != current_state:
                    new_dialog_state = self._find_dialog_state(scenario, new_state)
                    if new_dialog_state:
                        entry_response = self._execute_entry_action(scenario, new_state)
                        if entry_response:
                            response_messages.append(entry_response)
                        max_depth = 10
                        current_depth = memory.get("_AUTO_TRANSITION_DEPTH", 0)
                        if current_depth < max_depth:
                            memory["_AUTO_TRANSITION_DEPTH"] = current_depth + 1
                            next_auto_result = await self._check_and_execute_auto_transitions(
                                scenario, new_state, memory, response_messages
                            )
                            if next_auto_result:
                                new_state = next_auto_result["new_state"]
                                response_messages.extend(next_auto_result["messages"])
                                if next_auto_result.get("transitions"):
                                    webhook_result["transitions"].extend(next_auto_result["transitions"])
                            memory["_AUTO_TRANSITION_DEPTH"] = current_depth
                        else:
                            logger.warning(f"Auto transition depth limit reached ({max_depth})")
                return {
                    "new_state": new_state,
                    "messages": [f"🚀 웹훅 실행 후 자동 전이: {current_state} → {new_state}"],
                    "transitions": webhook_result.get("transitions", [])
                }
            return None
        
        # 2. webhook이 없고 apicall만 있으면 apicall 실행
        if apicall_handlers:
            logger.info(f"State {current_state} has apicall handlers - executing apicall (no webhook present)")
            apicall_result = await self._handle_apicall_handlers(
                current_state, current_dialog_state, scenario, memory
            )
            if apicall_result:
                new_state = apicall_result.get("new_state", current_state)
                apicall_messages = apicall_result.get("response", "").split("\n")
                response_messages.extend(apicall_messages)
                if new_state != current_state:
                    new_dialog_state = self._find_dialog_state(scenario, new_state)
                    if new_dialog_state:
                        entry_response = self._execute_entry_action(scenario, new_state)
                        if entry_response:
                            response_messages.append(entry_response)
                        max_depth = 10
                        current_depth = memory.get("_AUTO_TRANSITION_DEPTH", 0)
                        if current_depth < max_depth:
                            memory["_AUTO_TRANSITION_DEPTH"] = current_depth + 1
                            next_auto_result = await self._check_and_execute_auto_transitions(
                                scenario, new_state, memory, response_messages
                            )
                            if next_auto_result:
                                new_state = next_auto_result["new_state"]
                                response_messages.extend(next_auto_result["messages"])
                                if next_auto_result.get("transitions"):
                                    apicall_result["transitions"].extend(next_auto_result["transitions"])
                            memory["_AUTO_TRANSITION_DEPTH"] = current_depth
                        else:
                            logger.warning(f"Auto transition depth limit reached ({max_depth})")
                return {
                    "new_state": new_state,
                    "messages": [f"🚀 API콜 실행 후 자동 전이: {current_state} → {new_state}"],
                    "transitions": apicall_result.get("transitions", [])
                }
            return None
        
        # 3. 둘 다 없으면 conditionHandlers만 체크
        condition_handlers = current_dialog_state.get("conditionHandlers", [])
        auto_transitions = []
        for handler in condition_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
            condition = handler.get("conditionStatement", "")
            if condition.strip() == "True" or condition.strip() == '"True"':
                target = handler.get("transitionTarget", {})
                new_state = target.get("dialogState", current_state)
                transition = StateTransition(
                    fromState=current_state,
                    toState=new_state,
                    reason="자동 조건: True",
                    conditionMet=True,
                    handlerType="condition"
                )
                auto_transitions.append(transition)
                logger.info(f"Auto condition transition found: {current_state} -> {new_state}")
                break
            else:
                if self._evaluate_condition(condition, memory):
                    target = handler.get("transitionTarget", {})
                    new_state = target.get("dialogState", current_state)
                    transition = StateTransition(
                        fromState=current_state,
                        toState=new_state,
                        reason=f"자동 조건: {condition}",
                        conditionMet=True,
                        handlerType="condition"
                    )
                    auto_transitions.append(transition)
                    logger.info(f"Auto condition transition found: {current_state} -> {new_state} (condition: {condition})")
                    break
        if auto_transitions:
            first_transition = auto_transitions[0]
            new_state = first_transition.toState
            entry_response = self._execute_entry_action(scenario, new_state)
            if entry_response:
                response_messages.append(entry_response)
            max_depth = 10
            current_depth = memory.get("_AUTO_TRANSITION_DEPTH", 0)
            if current_depth < max_depth:
                memory["_AUTO_TRANSITION_DEPTH"] = current_depth + 1
                next_auto_result = await self._check_and_execute_auto_transitions(
                    scenario, new_state, memory, response_messages
                )
                if next_auto_result:
                    new_state = next_auto_result["new_state"]
                    response_messages.extend(next_auto_result["messages"])
                    if next_auto_result.get("transitions"):
                        auto_transitions.extend(next_auto_result["transitions"])
                memory["_AUTO_TRANSITION_DEPTH"] = current_depth
            else:
                logger.warning(f"Auto transition depth limit reached ({max_depth})")
            transition_dicts = []
            for t in auto_transitions:
                if hasattr(t, 'dict'):
                    transition_dicts.append(t.dict())
                elif hasattr(t, 'model_dump'):
                    transition_dicts.append(t.model_dump())
                else:
                    transition_dicts.append(str(t))
            return {
                "new_state": new_state,
                "messages": [f"🚀 자동 전이: {current_state} → {new_state}"],
                "transitions": transition_dicts
            }
        return None
    
    def _store_entities_to_memory(self, entities: Dict[str, Any], memory: Dict[str, Any]) -> None:
        """Entity를 메모리에 type:role 형태의 키로 저장합니다."""
        if not entities:
            return
        
        logger.info(f"🏷️ Storing entities to memory: {entities}")
        
        # NLU 결과에서 받은 entities 처리
        if "NLU_RESULT" in memory:
            nlu_result = memory.get("NLU_RESULT", {})
            results = nlu_result.get("results", [])
            if results and len(results) > 0:
                nlu_nbest = results[0].get("nluNbest", [])
                if nlu_nbest and len(nlu_nbest) > 0:
                    nlu_entities = nlu_nbest[0].get("entities", [])
                    for entity in nlu_entities:
                        if isinstance(entity, dict):
                            entity_type = entity.get("type", "")
                            entity_text = entity.get("text", "")
                            entity_role = entity.get("role", "")
                            
                            if entity_type and entity_text:
                                # role이 있으면 type:role, 없으면 type:type 형태로 저장
                                if entity_role:
                                    key = f"{entity_type}:{entity_role}"
                                else:
                                    key = f"{entity_type}:{entity_type}"
                                
                                memory[key] = entity_text
                                memory[entity_type] = entity_text  # 기존 호환성을 위해 type만으로도 저장
                                logger.info(f"🏷️ Entity stored: {key} = {entity_text}")
        
        # 기존 방식 entities도 처리
        for entity_type, entity_value in entities.items():
            if entity_type and entity_value:
                key = f"{entity_type}:{entity_type}"
                memory[key] = entity_value
                memory[entity_type] = entity_value
                logger.info(f"🏷️ Legacy entity stored: {key} = {entity_value}")
    
    def _process_slot_filling(
        self, 
        current_dialog_state: Dict[str, Any], 
        memory: Dict[str, Any],
        scenario: Dict[str, Any],
        current_state: str
    ) -> Optional[Dict[str, Any]]:
        """복잡한 Slot Filling 로직을 처리합니다."""
        
        slot_filling_forms = current_dialog_state.get("slotFillingForm", [])
        if not slot_filling_forms:
            return None
        
        logger.info(f"🎰 Processing slot filling forms: {len(slot_filling_forms)} forms found")
        
        messages = []
        all_required_filled = True
        reprompt_just_registered = memory.get("_REPROMPT_JUST_REGISTERED", False)
        
        for form in slot_filling_forms:
            slot_name = form.get("name", "")
            required = form.get("required", "N") == "Y"
            memory_slot_keys = form.get("memorySlotKey", [])
            fill_behavior = form.get("fillBehavior", {})
            
            logger.info(f"🎰 Checking slot: {slot_name}, required: {required}, keys: {memory_slot_keys}")
            
            # 메모리에서 슬롯 값 확인
            slot_filled = False
            slot_value = None
            for memory_key in memory_slot_keys:
                if memory_key in memory and memory[memory_key]:
                    slot_filled = True
                    slot_value = memory[memory_key]
                    logger.info(f"🎰 Slot {slot_name} filled with key {memory_key}: {slot_value}")
                    break
            
            if required and not slot_filled:
                all_required_filled = False
                logger.info(f"🎰 Required slot {slot_name} not filled")
                
                # 이미 reprompt handler가 등록되어 있고 방금 등록된 상태가 아니라면 건너뛰기
                if memory.get("_WAITING_FOR_SLOT") == slot_name and not reprompt_just_registered:
                    logger.info(f"🎰 Already waiting for slot {slot_name}, skipping prompt")
                    return None
                
                # fillBehavior의 promptAction 실행
                prompt_action = fill_behavior.get("promptAction", {})
                if prompt_action:
                    prompt_message = self._execute_prompt_action(prompt_action, memory)
                    if prompt_message:
                        messages.append(prompt_message)
                
                # reprompt event handlers 등록 (현재 상태에서 대기)
                reprompt_handlers = fill_behavior.get("repromptEventHandlers", [])
                if reprompt_handlers:
                    logger.info(f"🎰 Registering reprompt handlers for slot {slot_name}")
                    # 여기서는 NO_MATCH_EVENT 처리를 위해 메모리에 상태 저장
                    memory["_WAITING_FOR_SLOT"] = slot_name
                    memory["_REPROMPT_HANDLERS"] = reprompt_handlers
                    memory["_REPROMPT_JUST_REGISTERED"] = True
                
                return {
                    "new_state": current_state,  # 현재 상태에서 대기
                    "messages": messages,
                    "transition": None
                }
            elif slot_filled and memory.get("_WAITING_FOR_SLOT") == slot_name:
                # 슬롯이 방금 채워진 경우
                logger.info(f"🎰 Slot {slot_name} just filled, clearing waiting state")
                memory.pop("_WAITING_FOR_SLOT", None)
                memory.pop("_REPROMPT_HANDLERS", None)
                memory.pop("_REPROMPT_JUST_REGISTERED", None)
        
        # reprompt 방금 등록된 플래그 제거
        if reprompt_just_registered:
            memory.pop("_REPROMPT_JUST_REGISTERED", None)
        
        # 모든 필수 슬롯이 채워진 경우
        if all_required_filled:
            logger.info("🎰 All required slots filled, setting SLOT_FILLING_COMPLETED")
            memory["SLOT_FILLING_COMPLETED"] = ""
            
            # 대기 상태 정리
            memory.pop("_WAITING_FOR_SLOT", None)
            memory.pop("_REPROMPT_HANDLERS", None)
            memory.pop("_REPROMPT_JUST_REGISTERED", None)
            
            # 조건 핸들러 확인
            condition_transition = self._check_condition_handlers(current_dialog_state, memory)
            if condition_transition:
                logger.info(f"🎰 Slot filling completed, transitioning to: {condition_transition.toState}")
                return {
                    "new_state": condition_transition.toState,
                    "messages": messages,
                    "transition": condition_transition
                }
        
        return {
            "new_state": current_state,
            "messages": messages,
            "transition": None
        }
    
    def _execute_prompt_action(self, action: Dict[str, Any], memory: Dict[str, Any]) -> Optional[str]:
        """Prompt action을 실행합니다."""
        directives = action.get("directives", [])
        if not directives:
            return None
        
        # 첫 번째 directive의 내용을 반환
        first_directive = directives[0]
        content = first_directive.get("content", {})
        
        # 간단한 텍스트 추출
        if "text" in content:
            return content["text"]
        
        # 복잡한 구조에서 텍스트 추출
        item = content.get("item", [])
        if item and len(item) > 0:
            first_item = item[0]
            section = first_item.get("section", {})
            section_items = section.get("item", [])
            if section_items and len(section_items) > 0:
                text_item = section_items[0].get("text", {})
                return text_item.get("text", "")
        
        return None

    def create_chatbot_response(
        self,
        new_state: str,
        response_messages: List[str],
        intent: str,
        entities: Dict[str, Any],
        memory: Dict[str, Any],
        scenario: Dict[str, Any],
        used_slots: Optional[List[Dict[str, str]]] = None,
        event_type: Optional[str] = None
    ) -> ChatbotResponse:
        """새로운 챗봇 응답 포맷을 생성합니다."""
        
        # 세션 종료 여부 확인
        end_session = "Y" if new_state == "__END_SESSION__" else "N"
        
        # Directives 생성
        directives = []
        for message in response_messages:
            if message.strip():
                directive_content = DirectiveContent(
                    item=[
                        {
                            "section": {
                                "class": "cb-section section_1",
                                "item": [
                                    {
                                        "text": {
                                            "class": "cb-text text",
                                            "text": f"<p>{message}</p>"
                                        }
                                    }
                                ]
                            }
                        }
                    ]
                )
                directives.append(ChatbotDirective(content=directive_content))
        
        # Used slots 생성
        used_slots_list = []
        if used_slots:
            for slot in used_slots:
                used_slots_list.append(UsedSlot(
                    key=slot.get("key", ""),
                    value=slot.get("value", ""),
                    turn=slot.get("turn", "")
                ))
        
        # Intent 추가
        if intent and intent != "NO_INTENT_FOUND":
            used_slots_list.append(UsedSlot(
                key="__NLU_INTENT__",
                value=intent,
                turn=""
            ))
        
        # Event 추가
        if event_type:
            used_slots_list.append(UsedSlot(
                key="EVENT_TYPE",
                value=event_type,
                turn=""
            ))
        
        # 시나리오 이름 추출
        scenario_name = ""
        if scenario and "plan" in scenario:
            plans = scenario["plan"]
            if plans and len(plans) > 0:
                scenario_name = plans[0].get("name", "")
        
        # Meta 정보 생성
        meta = ResponseMeta(
            intent=[intent] if intent and intent != "NO_INTENT_FOUND" else [""],
            event={"type": event_type} if event_type else {},
            scenario=scenario_name,
            dialogState=new_state,
            fallbackType="not_fallback",
            usedSlots=used_slots_list,
            allowFocusShift="Y"
        )
        
        return ChatbotResponse(
            endSession=end_session,
            error=ErrorInfo(),
            directives=directives,
            dialogResult={},
            meta=meta,
            log={}
        )
    
    def _extract_text_from_custom_payload(self, content: Dict[str, Any]) -> Optional[str]:
        """customPayload에서 텍스트를 추출합니다."""
        try:
            items = content.get("item", [])
            messages = []
            
            for item in items:
                if "section" in item:
                    section_items = item["section"].get("item", [])
                    for section_item in section_items:
                        if "text" in section_item:
                            text_content = section_item["text"].get("text", "")
                            if text_content:
                                # HTML 태그 제거
                                import re
                                clean_text = re.sub(r'<[^>]+>', '', text_content)
                                messages.append(clean_text)
            
            return "; ".join(messages) if messages else None
        except Exception as e:
            logger.warning(f"Error extracting text from custom payload: {e}")
            return None
    
    def _get_nlu_results(self, user_input: str, memory: Dict[str, Any], scenario: Optional[Dict[str, Any]] = None, current_state: str = "") -> Tuple[str, Dict[str, Any]]:
        """실제 NLU 결과를 가져오거나 시뮬레이션을 사용합니다."""
        
        # 메모리에서 NLU 결과 확인 (프론트엔드에서 받은 실제 결과)
        nlu_result = memory.get("NLU_RESULT")
        if nlu_result and isinstance(nlu_result, dict):
            try:
                # NLU 결과에서 intent와 entities 추출
                results = nlu_result.get("results", [])
                if results and len(results) > 0:
                    nlu_nbest = results[0].get("nluNbest", [])
                    if nlu_nbest and len(nlu_nbest) > 0:
                        first_result = nlu_nbest[0]
                        base_intent = first_result.get("intent", "Fallback.Unknown")
                        
                        # 엔티티 추출
                        entities = {}
                        nlu_entities = first_result.get("entities", [])
                        for entity in nlu_entities:
                            if isinstance(entity, dict):
                                entity_type = entity.get("type", "")
                                entity_text = entity.get("text", "")
                                if entity_type and entity_text:
                                    entities[entity_type] = entity_text
                        
                        # DM Intent 매핑 적용
                        final_intent = self._apply_dm_intent_mapping(base_intent, current_state, memory, scenario)
                        
                        logger.info(f"🧠 NLU result: base_intent='{base_intent}', final_intent='{final_intent}', entities={entities}")
                        return final_intent, entities
            except Exception as e:
                logger.warning(f"Error parsing NLU result: {e}")
        
        # NLU 결과가 없으면 기본값 반환 (시뮬레이션 제거)
        logger.info("⚠️ No NLU result found, returning default values")
        return "NO_INTENT_FOUND", {}



    def _apply_dm_intent_mapping(self, base_intent: str, current_state: str, memory: Dict[str, Any], scenario: Optional[Dict[str, Any]] = None) -> str:
        """시나리오의 intentMapping을 적용하여 DM Intent를 결정합니다."""
        
        logger.info(f"🔍 DM Intent mapping - base_intent: {base_intent}, current_state: {current_state}")
        logger.info(f"🔍 Current memory: {memory}")
        
        # 시나리오의 intentMapping과 글로벌 intentMapping을 결합
        intent_mappings = []
        
        # 먼저 글로벌 Intent Mapping 추가
        intent_mappings.extend(self.global_intent_mapping)
        
        # 그 다음 시나리오의 Intent Mapping 추가 (우선순위 높음)
        if scenario:
            intent_mappings.extend(scenario.get("intentMapping", []))
        
        logger.info(f"🔍 Found {len(intent_mappings)} total intent mappings (global: {len(self.global_intent_mapping)}, scenario: {len(scenario.get('intentMapping', []) if scenario else [])})")
        
        for i, mapping in enumerate(intent_mappings):
            try:
                logger.info(f"🔍 Checking mapping {i+1}: {mapping}")
                
                # 시나리오와 상태 매칭 확인
                mapping_scenario = mapping.get("scenario", "")
                mapping_state = mapping.get("dialogState", "")
                
                logger.info(f"🔍 State check - mapping_state: {mapping_state}, current_state: {current_state}")
                
                if mapping_state and mapping_state != current_state:
                    logger.info(f"🔍 State mismatch - skipping mapping {i+1}")
                    continue
                
                # Intent 매칭 확인
                mapped_intents = mapping.get("intents", [])
                logger.info(f"🔍 Intent check - mapped_intents: {mapped_intents}, base_intent: {base_intent}")
                
                if base_intent not in mapped_intents:
                    logger.info(f"🔍 Intent not in mapped list - skipping mapping {i+1}")
                    continue
                
                # 조건 확인
                condition_statement = mapping.get("conditionStatement", "")
                logger.info(f"🔍 Condition check - condition: {condition_statement}")
                
                if condition_statement:
                    condition_result = self._evaluate_condition(condition_statement, memory)
                    logger.info(f"🔍 Condition result: {condition_result}")
                    if not condition_result:
                        logger.info(f"🔍 Condition not met - skipping mapping {i+1}")
                        continue
                
                # 모든 조건이 만족되면 DM Intent 반환
                dm_intent = mapping.get("dmIntent", "")
                if dm_intent:
                    logger.info(f"🎯 DM Intent mapping applied: {base_intent} -> {dm_intent} (state: {current_state})")
                    return dm_intent
                    
            except Exception as e:
                logger.warning(f"Error applying DM intent mapping: {e}")
        
        # 매핑이 없으면 원래 intent 반환
        logger.info(f"🔍 No mapping found - returning original intent: {base_intent}")
        return base_intent
    
    def _check_intent_handlers(
        self, 
        dialog_state: Dict[str, Any], 
        intent: str, 
        memory: Dict[str, Any]
    ) -> Optional[StateTransition]:
        """Intent Handler를 확인하고 전이를 처리합니다."""
        
        intent_handlers = dialog_state.get("intentHandlers", [])
        
        for handler in intent_handlers:
            # handler가 딕셔너리인지 확인
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
                
            handler_intent = handler.get("intent")
            
            # 정확한 인텐트 매칭 또는 __ANY_INTENT__
            if handler_intent == intent or handler_intent == "__ANY_INTENT__":
                # Action 처리 (memoryActions 포함)
                action = handler.get("action", {})
                if action:
                    self._execute_action(action, memory)
                
                target = handler.get("transitionTarget", {})
                
                return StateTransition(
                    fromState=dialog_state.get("name", ""),
                    toState=target.get("dialogState", ""),
                    reason=f"인텐트 '{intent}' 매칭",
                    conditionMet=True,
                    handlerType="intent"
                )
        
                return None

    def _execute_action(self, action: Dict[str, Any], memory: Dict[str, Any]) -> None:
        """Action을 실행합니다 (memoryActions 포함)."""
        try:
            # Memory Actions 처리
            memory_actions = action.get("memoryActions", [])
            for memory_action in memory_actions:
                if not isinstance(memory_action, dict):
                    continue
                
                action_type = memory_action.get("actionType", "")
                memory_slot_key = memory_action.get("memorySlotKey", "")
                memory_slot_value = memory_action.get("memorySlotValue", "")
                action_scope = memory_action.get("actionScope", "SESSION")
                
                if action_type == "ADD" and memory_slot_key:
                    memory[memory_slot_key] = memory_slot_value
                    logger.info(f"💾 Memory action executed: {memory_slot_key} = {memory_slot_value}")
                elif action_type == "REMOVE" and memory_slot_key:
                    if memory_slot_key in memory:
                        del memory[memory_slot_key]
                        logger.info(f"🗑️ Memory action executed: removed {memory_slot_key}")
                
            # 다른 Action 타입들도 여기에 추가 가능 (directives 등)
            
        except Exception as e:
            logger.error(f"Error executing action: {e}")

    def _check_condition_handlers(
        self, 
        dialog_state: Dict[str, Any], 
        memory: Dict[str, Any]
    ) -> Optional[StateTransition]:
        """Condition Handler를 확인하고 전이를 처리합니다."""
        
        condition_handlers = dialog_state.get("conditionHandlers", [])
        
        for handler in condition_handlers:
            # handler가 딕셔너리인지 확인
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
                
            condition = handler.get("conditionStatement", "")
            
            # 조건 평가
            if self._evaluate_condition(condition, memory):
                target = handler.get("transitionTarget", {})
                
                return StateTransition(
                    fromState=dialog_state.get("name", ""),
                    toState=target.get("dialogState", ""),
                    reason=f"조건 '{condition}' 만족",
                    conditionMet=True,
                    handlerType="condition"
                )
        
        return None
    
    def _evaluate_condition(self, condition: str, memory: Dict[str, Any]) -> bool:
        """조건식을 평가합니다."""
        try:
            logger.info(f"🔍 Evaluating condition: '{condition}'")
            logger.info(f"🔍 Available memory keys: {list(memory.keys())}")
            logger.info(f"🔍 NLU_INTENT value in memory: {memory.get('NLU_INTENT', 'NOT_FOUND')} (type: {type(memory.get('NLU_INTENT', 'NOT_FOUND'))})")
            
            # 간단한 조건 평가
            if condition.strip() == "True" or condition.strip() == '"True"':
                logger.info(f"🔍 Condition is literal True")
                return True
            elif condition.strip() == "False" or condition.strip() == '"False"':
                logger.info(f"🔍 Condition is literal False")
                return False
            elif condition == "SLOT_FILLING_COMPLETED":
                # Slot filling 완료 조건 (예시)
                result = memory.get("CITY") is not None
                logger.info(f"🔍 SLOT_FILLING_COMPLETED check: {result}")
                return result
            
            original_condition = condition
            
            # 메모리 변수 치환
            for key, value in memory.items():
                old_condition = condition
                # {key} 형태 치환
                pattern1 = "{" + key + "}"
                condition = condition.replace(pattern1, f'"{value}"')
                # {$key} 형태 치환 
                pattern2 = "{$" + key + "}"
                condition = condition.replace(pattern2, f'"{value}"')
                # ${key} 형태 치환 (기존 형태도 지원)
                pattern3 = "${" + key + "}"
                condition = condition.replace(pattern3, f'"{value}"')
                if old_condition != condition:
                    logger.info(f"🔍 Replaced variable {key} (type: {type(value)}) with '{value}': '{old_condition}' -> '{condition}'")
            
            # NLU_INTENT 치환 (다양한 형태 지원) - 메모리 변수 치환에서 처리되지 않은 경우만
            if "{$NLU_INTENT}" in condition or "{NLU_INTENT}" in condition:
                nlu_intent_data = memory.get("NLU_INTENT", "")
                
                # NLU_INTENT가 배열 형태인 경우 첫 번째 값 사용
                if isinstance(nlu_intent_data, dict) and "value" in nlu_intent_data:
                    nlu_intent = nlu_intent_data["value"][0] if nlu_intent_data["value"] else ""
                elif isinstance(nlu_intent_data, list) and nlu_intent_data:
                    nlu_intent = nlu_intent_data[0]
                else:
                    nlu_intent = str(nlu_intent_data)
                
                old_condition = condition
                condition = condition.replace("{$NLU_INTENT}", f'"{nlu_intent}"')
                condition = condition.replace("{NLU_INTENT}", f'"{nlu_intent}"')
                logger.info(f"🔍 Replaced NLU_INTENT with '{nlu_intent}': '{old_condition}' -> '{condition}'")
            
            logger.info(f"🔍 Final condition after substitution: '{condition}'")
            
            # 간단한 비교 연산 처리
            if "==" in condition:
                left, right = condition.split("==", 1)
                left = left.strip().strip('"')
                right = right.strip().strip('"')
                result = left == right
                logger.info(f"🔍 Condition evaluation: '{left}' == '{right}' -> {result}")
                return result
            
            logger.warning(f"🔍 Unsupported condition format: '{condition}'")
            return False
            
        except Exception as e:
            logger.error(f"🔍 Condition evaluation error: {e}")
            return False
    
    def _execute_entry_action(self, scenario: Dict[str, Any], state_name: str) -> Optional[str]:
        """새로운 상태의 Entry Action을 실행합니다."""
        logger.info(f"Executing entry action for state: {state_name}")
        
        dialog_state = self._find_dialog_state(scenario, state_name)
        if not dialog_state:
            logger.info(f"Dialog state not found: {state_name}")
            return None
        
        logger.info(f"Found dialog state: {dialog_state}")
        
        entry_action = dialog_state.get("entryAction")
        if not entry_action:
            logger.info(f"No entry action for state: {state_name}")
            return None
        
        logger.info(f"Entry action: {entry_action}, type: {type(entry_action)}")
        
        # entry_action이 딕셔너리인지 확인
        if not isinstance(entry_action, dict):
            logger.warning(f"Entry action is not a dict: {entry_action}")
            return None
        
        # Directive 처리 (메시지 추출)
        directives = entry_action.get("directives", [])
        logger.info(f"Directives: {directives}")
        messages = []
        
        for directive in directives:
            logger.info(f"Processing directive: {directive}, type: {type(directive)}")
            
            if not isinstance(directive, dict):
                logger.warning(f"Directive is not a dict: {directive}")
                continue
            
            content = directive.get("content", {})
            logger.info(f"Content: {content}, type: {type(content)}")
            
            if not isinstance(content, dict):
                logger.warning(f"Content is not a dict: {content}")
                continue
            
            items = content.get("item", [])
            logger.info(f"Items: {items}")
            
            for item in items:
                logger.info(f"Processing item: {item}, type: {type(item)}")
                
                if not isinstance(item, dict):
                    logger.warning(f"Item is not a dict: {item}")
                    continue
                
                section = item.get("section", {})
                logger.info(f"Section: {section}, type: {type(section)}")
                
                if not isinstance(section, dict):
                    logger.warning(f"Section is not a dict: {section}")
                    continue
                
                section_items = section.get("item", [])
                logger.info(f"Section items: {section_items}")
                
                for section_item in section_items:
                    logger.info(f"Processing section item: {section_item}, type: {type(section_item)}")
                    
                    if not isinstance(section_item, dict):
                        logger.warning(f"Section item is not a dict: {section_item}")
                        continue
                    
                    text_data = section_item.get("text", {})
                    logger.info(f"Text data: {text_data}, type: {type(text_data)}")
                    
                    if not isinstance(text_data, dict):
                        logger.warning(f"Text data is not a dict: {text_data}")
                        continue
                    
                    text_content = text_data.get("text", "")
                    logger.info(f"Text content: {text_content}")
                    
                    if text_content:
                        # HTML 태그 제거
                        import re
                        clean_text = re.sub(r'<[^>]+>', '', text_content)
                        messages.append(clean_text)
        
        result = f"🤖 {'; '.join(messages)}" if messages else None
        logger.info(f"Entry action result: {result}")
        return result
    
    def _handle_no_match_event(
        self, 
        current_dialog_state: Dict[str, Any],
        memory: Dict[str, Any],
        scenario: Dict[str, Any],
        current_state: str
    ) -> Optional[Dict[str, Any]]:
        """NO_MATCH_EVENT를 처리합니다 (reprompt handler)."""
        
        # 슬롯 대기 중인지 확인
        waiting_slot = memory.get("_WAITING_FOR_SLOT")
        reprompt_handlers = memory.get("_REPROMPT_HANDLERS", [])
        
        if not waiting_slot or not reprompt_handlers:
            return None
        
        logger.info(f"🔄 Handling NO_MATCH_EVENT for slot: {waiting_slot}")
        
        # reprompt event handler 찾기
        for handler in reprompt_handlers:
            event = handler.get("event", {})
            if event.get("type") == "NO_MATCH_EVENT":
                action = handler.get("action", {})
                
                # action의 directive 실행
                action_message = None
                if action.get("directives"):
                    action_message = self._execute_prompt_action(action, memory)
                
                # transition target 확인
                transition_target = handler.get("transitionTarget", {})
                target_state = transition_target.get("dialogState", "__CURRENT_DIALOG_STATE__")
                
                if target_state == "__CURRENT_DIALOG_STATE__":
                    target_state = current_state
                
                return {
                    "new_state": target_state,
                    "messages": [action_message] if action_message else [],
                    "transition": None
                }
        
        return None

    async def _handle_event_trigger(
        self,
        event_type: str,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        """이벤트를 수동으로 트리거하여 처리합니다."""
        
        logger.info(f"Manual event trigger: {event_type} in state {current_state}")
        
        transitions = []
        new_state = current_state
        response_messages = [f"🎯 이벤트 '{event_type}' 트리거됨"]
        
        # Event Handler 확인
        event_handlers = current_dialog_state.get("eventHandlers", [])
        event_matched = False
        
        logger.info(f"Event handlers: {event_handlers}")
        
        for handler in event_handlers:
            logger.info(f"Processing handler: {handler}, type: {type(handler)}")
            
            # handler가 딕셔너리인지 확인
            if not isinstance(handler, dict):
                logger.warning(f"Event handler is not a dict: {handler}")
                continue
                
            # event 필드 안전하게 처리
            event_info = handler.get("event", {})
            logger.info(f"Event info: {event_info}, type: {type(event_info)}")
            
            if isinstance(event_info, dict):
                handler_event_type = event_info.get("type", "")
            elif isinstance(event_info, str):
                handler_event_type = event_info
            else:
                logger.warning(f"Unexpected event format in handler: {event_info}")
                continue
            
            logger.info(f"Handler event type: {handler_event_type}, Expected: {event_type}")
            
            if handler_event_type == event_type:
                target = handler.get("transitionTarget", {})
                logger.info(f"Target: {target}, type: {type(target)}")
                new_state = target.get("dialogState", current_state)
                logger.info(f"New state: {new_state}")
                
                try:
                    transition = StateTransition(
                        fromState=current_state,
                        toState=new_state,
                        reason=f"이벤트 트리거: {event_type}",
                        conditionMet=True,
                        handlerType="event"
                    )
                    logger.info(f"Transition created: {transition}")
                    transitions.append(transition)
                    logger.info(f"Transition appended to list")
                    response_messages.append(f"✅ 이벤트 '{event_type}' 처리됨 → {new_state}")
                    event_matched = True
                    break
                except Exception as e:
                    logger.error(f"Error creating transition: {e}")
                    raise
        
        if not event_matched:
            response_messages.append(f"❌ 이벤트 '{event_type}'에 대한 핸들러가 없습니다.")
        
        # Entry Action 실행 및 자동 전이 확인 (새로운 상태로 전이된 경우)
        if new_state != current_state:
            try:
                logger.info(f"Executing entry action for transition: {current_state} -> {new_state}")
                entry_response = self._execute_entry_action(scenario, new_state)
                logger.info(f"Entry action completed: {entry_response}")
                if entry_response:
                    response_messages.append(entry_response)
                
                # Entry Action 실행 후 자동 전이 확인
                auto_transition_result = await self._check_and_execute_auto_transitions(
                    scenario, new_state, memory, response_messages
                )
                if auto_transition_result:
                    new_state = auto_transition_result["new_state"]
                    response_messages.extend(auto_transition_result["messages"])
                    if auto_transition_result.get("transitions"):
                        transitions.extend(auto_transition_result["transitions"])
            except Exception as e:
                logger.error(f"Error executing entry action: {e}")
                response_messages.append(f"⚠️ Entry action 실행 중 에러: {str(e)}")
        
        # transitions 리스트 처리
        try:
            logger.info(f"Processing transitions: {transitions}")
            transition_dicts = []
            for t in transitions:
                logger.info(f"Processing transition: {t}, type: {type(t)}")
                if hasattr(t, 'dict'):
                    transition_dicts.append(t.dict())
                elif hasattr(t, 'model_dump'):
                    transition_dicts.append(t.model_dump())
                else:
                    logger.warning(f"Transition object has no dict method: {t}")
                    transition_dicts.append(str(t))
            
            logger.info(f"Transition dicts: {transition_dicts}")
            
            return {
                "new_state": new_state,
                "response": "\n".join(response_messages),
                "transitions": transition_dicts,
                "intent": "EVENT_TRIGGER",
                "entities": {},
                "memory": memory
            }
        except Exception as e:
            logger.error(f"Error processing transitions: {e}")
            return {
                "new_state": new_state,
                "response": "\n".join(response_messages),
                "transitions": [],
                "intent": "EVENT_TRIGGER",
                "entities": {},
                "memory": memory
            } 

    async def _handle_apicall_handlers(
        self,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """ApiCall 핸들러를 처리합니다."""
        
        apicall_handlers = current_dialog_state.get("apicallHandlers", [])
        if not apicall_handlers:
            return None
        
        logger.info(f"Processing {len(apicall_handlers)} apicall handlers in state {current_state}")
        
        # sessionId가 메모리에 없으면 설정
        if "sessionId" not in memory:
            import uuid
            memory["sessionId"] = str(uuid.uuid4())
            logger.info(f"🆔 Generated sessionId: {memory['sessionId']}")
        
        for handler in apicall_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Apicall handler is not a dict: {handler}")
                continue
            
            try:
                # API 호출 실행
                apicall_config = handler.get("apicall", {})
                if not apicall_config:
                    logger.warning(f"No apicall config found in handler: {handler}")
                    continue
                
                logger.info(f"🚀 Executing API call: {handler.get('name', 'Unknown')}")
                logger.info(f"📋 Memory before API call: {memory}")
                
                # API 응답 가져오기
                response_data = await self._execute_api_call(apicall_config, memory)
                if response_data is None:
                    logger.warning(f"API call failed for handler: {handler}")
                    continue
                
                logger.info(f"📥 API response received: {response_data}")
                
                # 응답 매핑 처리
                mappings = apicall_config.get("formats", {}).get("responseMappings", {})
                
                # 기본 매핑이 없는 경우 표준 webhook 형식에 맞는 기본 매핑 적용
                if not mappings:
                    # 표준 webhook 응답 형식 감지 (memorySlots 구조)
                    if "memorySlots" in response_data and "NLU_INTENT" in response_data["memorySlots"]:
                        logger.info("📋 Detected standard webhook response format, applying default mappings")
                        mappings = {
                            "NLU_INTENT": "$.memorySlots.NLU_INTENT.value[0]",
                            "STS_CONFIDENCE": "$.memorySlots.STS_CONFIDENCE.value[0]",
                            "USER_TEXT_INPUT": "$.memorySlots.USER_TEXT_INPUT.value[0]"
                        }
                
                if mappings:
                    self._apply_response_mappings(response_data, mappings, memory)
                
                logger.info(f"📋 Memory after response mapping: {memory}")
                
                # API call 실행 후 condition handler도 실행하여 조건에 따른 전이 처리
                logger.info("📋 API call completed, now checking condition handlers...")
                
                # Condition Handler 확인
                condition_handlers = current_dialog_state.get("conditionHandlers", [])
                matched_condition = False
                transitions = []
                response_messages = [f"🔄 API 호출 완료: {handler.get('name', 'Unknown')}"]
                
                # 먼저 True가 아닌 조건들을 확인
                for cond_handler in condition_handlers:
                    if not isinstance(cond_handler, dict):
                        logger.warning(f"Condition handler is not a dict: {cond_handler}")
                        continue
                        
                    condition = cond_handler.get("conditionStatement", "")
                    
                    # True 조건은 맨 마지막에 체크 (fallback)
                    if condition.strip() == "True" or condition.strip() == '"True"':
                        continue
                        
                    # 조건 평가
                    logger.info(f"🔍 Evaluating condition: '{condition}' with memory: {memory}")
                    logger.info(f"🔍 NLU_INTENT in memory: {memory.get('NLU_INTENT', 'NOT_FOUND')}")
                    condition_result = self._evaluate_condition(condition, memory)
                    logger.info(f"🔍 Condition result: {condition_result}")
                    
                    if condition_result:
                        cond_target = cond_handler.get("transitionTarget", {})
                        new_state = cond_target.get("dialogState", current_state)
                        
                        transition = StateTransition(
                            fromState=current_state,
                            toState=new_state,
                            reason=f"API Call + 조건 매칭: {condition}",
                            conditionMet=True,
                            handlerType="apicall_condition"
                        )
                        transitions.append(transition)
                        response_messages.append(f"✅ 조건 '{condition}' 매칭됨 → {new_state}")
                        matched_condition = True
                        break
                
                # 조건에 매칭되지 않으면 fallback (True 조건) 실행
                if not matched_condition:
                    for cond_handler in condition_handlers:
                        if not isinstance(cond_handler, dict):
                            logger.warning(f"Condition handler is not a dict: {cond_handler}")
                            continue
                            
                        condition = cond_handler.get("conditionStatement", "")
                        if condition.strip() == "True" or condition.strip() == '"True"':
                            cond_target = cond_handler.get("transitionTarget", {})
                            new_state = cond_target.get("dialogState", current_state)
                            
                            transition = StateTransition(
                                fromState=current_state,
                                toState=new_state,
                                reason="API Call + 조건 불일치 - fallback 실행",
                                conditionMet=True,
                                handlerType="apicall_condition"
                            )
                            transitions.append(transition)
                            response_messages.append(f"❌ 조건 불일치 - fallback으로 {new_state}로 이동")
                            break
                
                # 조건이 없으면 기본 전이 처리
                if not condition_handlers:
                    target = handler.get("transitionTarget", {})
                    new_state = target.get("dialogState", current_state)
                    response_messages.append(f"조건 없음 → {new_state}")
                
                # Entry Action 실행 (새로운 상태로 전이된 경우)
                if new_state != current_state:
                    try:
                        logger.info(f"Executing entry action for transition: {current_state} -> {new_state}")
                        entry_response = self._execute_entry_action(scenario, new_state)
                        logger.info(f"Entry action completed: {entry_response}")
                        if entry_response:
                            response_messages.append(entry_response)
                    except Exception as e:
                        logger.error(f"Error executing entry action: {e}")
                        response_messages.append(f"⚠️ Entry action 실행 중 에러: {str(e)}")
                
                # transitions 리스트 처리
                try:
                    transition_dicts = []
                    for t in transitions:
                        if hasattr(t, 'dict'):
                            transition_dicts.append(t.dict())
                        elif hasattr(t, 'model_dump'):
                            transition_dicts.append(t.model_dump())
                        else:
                            logger.warning(f"Transition object has no dict method: {t}")
                            transition_dicts.append(str(t))
                except Exception as e:
                    logger.error(f"Error processing transitions in API call handler: {e}")
                    transition_dicts = []
                
                return {
                    "new_state": new_state,
                    "response": "\n".join(response_messages),
                    "transitions": transition_dicts,
                    "intent": "API_CALL_CONDITION",
                    "entities": {},
                    "memory": memory
                }
            
            except Exception as e:
                logger.error(f"Error processing apicall handler: {e}")
                continue
        
        return None

    async def _execute_webhook_call(
        self,
        webhook_config: Dict[str, Any],
        user_input: str,
        current_state: str,
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """실제 Webhook 호출을 실행합니다."""
        
        try:
            url = webhook_config.get("url", "")
            timeout = webhook_config.get("timeoutInMilliSecond", 5000) / 1000  # ms to seconds
            retry_count = webhook_config.get("retry", 3)
            webhook_headers = webhook_config.get("headers", {})
            
            # 세션 ID 및 요청 ID 생성
            session_id = memory.get("sessionId")
            if not session_id:
                # 새로운 세션 ID 생성 및 메모리에 저장
                session_id = f"session-{int(time.time())}-{uuid.uuid4().hex[:8]}"
                memory["sessionId"] = session_id
            
            request_id = f"req-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
            
            # Webhook 요청 데이터 구성 (간단한 형식으로 수정)
            webhook_request = {
                "text": user_input,
                "sessionId": session_id,
                "requestId": request_id,
                "currentState": current_state,
                "memory": memory
            }
            
            # Headers 준비
            headers = {"Content-Type": "application/json"}
            if webhook_headers:
                headers.update(webhook_headers)
            
            logger.info(f"📡 Webhook request to {url}")
            logger.info(f"📋 Request data: {json.dumps(webhook_request, indent=2, ensure_ascii=False)}")
            
            # 재시도 로직
            last_exception = None
            for attempt in range(retry_count):
                try:
                    logger.info(f"🔄 Webhook attempt {attempt + 1}/{retry_count}")
                    
                    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
                        async with session.post(
                            url=url,
                            json=webhook_request,
                            headers=headers
                        ) as response:
                            response_text = await response.text()
                            logger.info(f"📥 Webhook response status: {response.status}")
                            logger.info(f"📥 Webhook response text: {response_text}")
                            
                            if response.status == 200:
                                try:
                                    response_json = json.loads(response_text)
                                    logger.info(f"✅ Webhook call successful: {response_json}")
                                    return response_json
                                except json.JSONDecodeError as e:
                                    logger.error(f"Invalid JSON response: {e}")
                                    logger.error(f"Response text: {response_text}")
                                    return {"raw_response": response_text}
                            else:
                                logger.warning(f"Webhook failed with status {response.status}: {response_text}")
                                last_exception = Exception(f"HTTP {response.status}: {response_text}")
                
                except asyncio.TimeoutError:
                    logger.warning(f"Webhook timeout on attempt {attempt + 1}")
                    last_exception = Exception("Request timeout")
                except Exception as e:
                    logger.warning(f"Webhook error on attempt {attempt + 1}: {e}")
                    last_exception = e
                
                # 마지막 시도가 아니면 잠시 대기
                if attempt < retry_count - 1:
                    await asyncio.sleep(1)
            
            # 모든 재시도 실패
            logger.error(f"Webhook call failed after {retry_count} attempts: {last_exception}")
            return None
            
        except Exception as e:
            logger.error(f"Webhook call execution error: {e}")
            return None

    async def _execute_api_call(
        self,
        apicall_config: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """실제 API 호출을 실행합니다."""
        
        try:
            url = apicall_config.get("url", "")
            timeout = apicall_config.get("timeout", 5000) / 1000  # ms to seconds
            retry_count = apicall_config.get("retry", 3)
            
            formats = apicall_config.get("formats", {})
            method = formats.get("method", "POST").upper()
            request_template = formats.get("requestTemplate", "")
            
            # Request body 준비
            request_data = None
            if request_template and method in ['POST', 'PUT', 'PATCH']:
                # Handlebars 템플릿 처리 (간단한 치환)
                request_body = self._process_template(request_template, memory)
                try:
                    request_data = json.loads(request_body)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in request template: {e}")
                    return None
            
            # Headers 준비
            headers = {"Content-Type": "application/json"}  # 기본 헤더
            
            # 설정된 헤더가 있으면 추가/덮어쓰기
            custom_headers = formats.get("headers", {})
            if custom_headers:
                # 헤더 값에 템플릿 변수가 있으면 처리
                processed_headers = {}
                for key, value in custom_headers.items():
                    processed_value = self._process_template(str(value), memory)
                    processed_headers[key] = processed_value
                    logger.info(f"🔧 Header processed: {key}: {value} -> {processed_value}")
                
                headers.update(processed_headers)
            
            logger.info(f"📡 Final headers: {headers}")

            # API 호출 (재시도 포함)
            for attempt in range(retry_count + 1):
                try:
                    timeout_config = aiohttp.ClientTimeout(total=timeout)
                    async with aiohttp.ClientSession(timeout=timeout_config) as session:
                        
                        if method == "GET":
                            async with session.get(url, headers=headers) as response:
                                if response.status == 200:
                                    return await response.json()
                        elif method in ["POST", "PUT", "PATCH"]:
                            async with session.request(
                                method.lower(), 
                                url, 
                                headers=headers, 
                                json=request_data
                            ) as response:
                                if response.status in [200, 201]:
                                    return await response.json()
                        elif method == "DELETE":
                            async with session.delete(url, headers=headers) as response:
                                if response.status in [200, 204]:
                                    return await response.json() if response.content_length else {}
                        
                        logger.warning(f"API call failed with status {response.status}, attempt {attempt + 1}")
                        
                except asyncio.TimeoutError:
                    logger.warning(f"API call timeout, attempt {attempt + 1}")
                except Exception as e:
                    logger.warning(f"API call error: {e}, attempt {attempt + 1}")
                
                if attempt < retry_count:
                    await asyncio.sleep(1)  # 재시도 전 1초 대기
            
            logger.error(f"API call failed after {retry_count + 1} attempts")
            return None
            
        except Exception as e:
            logger.error(f"Error executing API call: {e}")
            return None

    def _process_template(self, template: str, memory: Dict[str, Any]) -> str:
        """Handlebars 스타일 템플릿을 처리합니다."""
        
        import re
        import uuid
        
        result = template
        
        # {{memorySlots.KEY.value.[0]}} 형태 처리
        pattern = r'\{\{memorySlots\.([^.]+)\.value\.\[(\d+)\]\}\}'
        matches = re.findall(pattern, template)
        
        for key, index in matches:
            if key in memory:
                value = memory[key]
                if isinstance(value, list) and len(value) > int(index):
                    replacement = str(value[int(index)])
                else:
                    replacement = str(value) if value is not None else ""
            else:
                replacement = ""
            
            result = result.replace(f"{{{{memorySlots.{key}.value.[{index}]}}}}", replacement)
        
        # 특별한 값들 처리
        # {{sessionId}} 처리
        session_id = memory.get("sessionId", "")
        result = result.replace("{{sessionId}}", session_id)
        
        # {{requestId}} 처리 - 메모리에 있으면 사용하고, 없으면 새로 생성
        if "{{requestId}}" in result:
            request_id = memory.get("requestId", "")
            if not request_id:
                # requestId가 없으면 새로 생성하고 메모리에 저장
                request_id = f"req-{uuid.uuid4().hex[:8]}"
                memory["requestId"] = request_id
                logger.info(f"🆔 Generated new requestId: {request_id}")
            result = result.replace("{{requestId}}", request_id)
        
        # {{USER_TEXT_INPUT.0}} 또는 {{USER_TEXT_INPUT.[0]}} 형태 처리
        pattern = r'\{\{USER_TEXT_INPUT\.?\[?(\d+)\]?\}\}'
        matches = re.findall(pattern, result)
        for index in matches:
            user_input_list = memory.get("USER_TEXT_INPUT", [])
            if isinstance(user_input_list, list) and len(user_input_list) > int(index):
                replacement = str(user_input_list[int(index)])
            else:
                replacement = ""
            # 다양한 형태 모두 대체
            result = result.replace(f"{{{{USER_TEXT_INPUT.{index}}}}}", replacement)
            result = result.replace(f"{{{{USER_TEXT_INPUT.[{index}]}}}}", replacement)
        
        # 기타 {{key}} 형태 처리 (이미 처리된 것들은 제외)
        pattern = r'\{\{([^}]+)\}\}'
        matches = re.findall(pattern, result)
        
        for key in matches:
            # 이미 처리된 특별한 키들은 건너뛰기
            if key in ['sessionId', 'requestId'] or key.startswith('USER_TEXT_INPUT') or key.startswith('memorySlots'):
                continue
                
            if key in memory:
                value = str(memory[key]) if memory[key] is not None else ""
                result = result.replace(f"{{{{{key}}}}}", value)
                logger.info(f"🔄 Template replacement: {{{{{key}}}}} -> {value}")
        
        logger.info(f"📝 Template processing: '{template}' -> '{result}'")
        return result

    def _apply_response_mappings(
        self,
        response_data: Dict[str, Any],
        mappings: Dict[str, str],
        memory: Dict[str, Any]
    ) -> None:
        """JSONPath를 사용하여 응답 데이터를 메모리에 매핑합니다."""
        
        logger.info(f"📋 Applying response mappings to data: {response_data}")
        logger.info(f"📋 Mappings: {mappings}")
        
        for memory_key, jsonpath_expr in mappings.items():
            try:
                # JSONPath 파싱 및 실행
                jsonpath_parser = parse(jsonpath_expr)
                matches = jsonpath_parser.find(response_data)
                
                if matches:
                    # 첫 번째 매치 사용
                    raw_value = matches[0].value
                    
                    # 값 정규화 및 변환
                    processed_value = self._normalize_response_value(raw_value)
                    
                    memory[memory_key] = processed_value
                    logger.info(f"✅ Mapped {memory_key} <- {jsonpath_expr}: {processed_value} (raw: {raw_value})")
                else:
                    logger.warning(f"❌ No matches found for JSONPath: {jsonpath_expr}")
                    logger.info(f"🔍 Available paths in response: {self._get_all_paths(response_data)}")
                    
            except Exception as e:
                logger.error(f"❌ Error processing JSONPath {jsonpath_expr}: {e}")

    def _normalize_response_value(self, value: Any) -> Any:
        """응답 값을 정규화합니다."""
        
        # None 처리
        if value is None:
            return None
        
        # 문자열이나 숫자는 그대로 반환
        if isinstance(value, (str, int, float, bool)):
            return value
        
        # 객체인 경우 - value 필드가 있으면 그것을 사용, 없으면 전체 객체
        if isinstance(value, dict):
            if 'value' in value:
                logger.info(f"🔄 Found 'value' field in object, extracting: {value['value']}")
                return self._normalize_response_value(value['value'])
            elif len(value) == 1:
                # 단일 키-값 쌍인 경우 값만 추출
                key, val = next(iter(value.items()))
                logger.info(f"🔄 Single key-value pair, extracting value: {val}")
                return self._normalize_response_value(val)
            else:
                # 복잡한 객체는 그대로 반환
                return value
        
        # 배열인 경우
        if isinstance(value, list):
            if len(value) == 1:
                # 단일 요소 배열인 경우 요소만 추출
                logger.info(f"🔄 Single element array, extracting element: {value[0]}")
                return self._normalize_response_value(value[0])
            else:
                # 다중 요소 배열은 그대로 반환
                return value
        
        # 기타 타입은 문자열로 변환
        return str(value)

    def _get_all_paths(self, obj: Any, path: str = '$') -> List[str]:
        """응답 객체의 모든 가능한 JSONPath를 생성합니다."""
        
        paths = []
        
        if obj is None:
            return [path]
        
        if isinstance(obj, dict):
            paths.append(path)
            for key, value in obj.items():
                new_path = f"{path}.{key}" if path != '$' else f"$.{key}"
                paths.extend(self._get_all_paths(value, new_path))
        
        elif isinstance(obj, list):
            paths.append(path)
            for index, value in enumerate(obj):
                new_path = f"{path}[{index}]"
                paths.extend(self._get_all_paths(value, new_path))
        
        else:
            paths.append(path)
        
        return paths 