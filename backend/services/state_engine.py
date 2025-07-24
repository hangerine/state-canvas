import logging
import re
import json
import aiohttp
import asyncio
import time
import uuid
from typing import Dict, Any, List, Optional, Tuple, Union
from jsonpath_ng import parse
from models.scenario import StateTransition, ChatbotResponse, ErrorInfo, ChatbotDirective, DirectiveContent, ResponseMeta, UsedSlot
from services.scenario_manager import ScenarioManager
from services.webhook_handler import WebhookHandler
from services.apicall_handler import ApiCallHandler
from services.nlu_processor import NLUProcessor
from services.memory_manager import MemoryManager
from services.action_executor import ActionExecutor
from services.transition_manager import TransitionManager
from services.reprompt_manager import RepromptManager
from services.slot_filling_manager import SlotFillingManager
from services import utils
from services.chatbot_response_factory import ChatbotResponseFactory
from services.event_trigger_manager import EventTriggerManager

logger = logging.getLogger(__name__)

class StateEngine:
    """시나리오 기반 State 전이 엔진"""
    
    def __init__(self, scenario_manager: Optional[ScenarioManager] = None, webhook_handler: Optional[WebhookHandler] = None, apicall_handler: Optional[ApiCallHandler] = None, nlu_processor: Optional[NLUProcessor] = None, memory_manager: Optional[MemoryManager] = None, action_executor: Optional[ActionExecutor] = None, transition_manager: Optional[TransitionManager] = None, reprompt_manager: Optional[RepromptManager] = None, slot_filling_manager: Optional[SlotFillingManager] = None, chatbot_response_factory: Optional[ChatbotResponseFactory] = None, event_trigger_manager: Optional[EventTriggerManager] = None):
        self.scenario_manager = scenario_manager or ScenarioManager()
        self.webhook_handler = webhook_handler or WebhookHandler(self.scenario_manager)
        self.apicall_handler = apicall_handler or ApiCallHandler(self.scenario_manager)
        self.transition_manager = transition_manager or TransitionManager(self.scenario_manager)
        self.nlu_processor = nlu_processor or NLUProcessor(self.scenario_manager, self.transition_manager)
        self.memory_manager = memory_manager or MemoryManager(self.scenario_manager)
        self.action_executor = action_executor or ActionExecutor(self.scenario_manager)
        self.reprompt_manager = reprompt_manager or RepromptManager(self.scenario_manager, self.action_executor)
        self.slot_filling_manager = slot_filling_manager or SlotFillingManager(self.scenario_manager, self.transition_manager, self.reprompt_manager)
        self.chatbot_response_factory = chatbot_response_factory or ChatbotResponseFactory()
        self.event_trigger_manager = event_trigger_manager or EventTriggerManager(self.action_executor, self.transition_manager)
        self.sessions: Dict[str, Dict[str, Any]] = {}
        self.session_stacks: Dict[str, List[Dict[str, Any]]] = {}
        self.global_intent_mapping: List[Dict[str, Any]] = []
    
    def load_scenario(self, session_id: str, scenario_data: Union[List[Dict[str, Any]], Dict[str, Any]]):
        """여러 시나리오를 한 세션에 로드할 수 있도록 확장"""
        if isinstance(scenario_data, list):
            # 여러 시나리오를 한 번에 로드
            for s in scenario_data:
                self.scenario_manager.load_scenario(session_id, s)
            # 첫 번째 시나리오를 초기화에 사용
            first = scenario_data[0] if scenario_data else None
        else:
            self.scenario_manager.load_scenario(session_id, scenario_data)
            first = scenario_data
        if not first:
            logger.error(f"[LOAD_SCENARIO] No scenario data provided for session: {session_id}")
            return
        # Webhook 정보 로딩 확인 (첫 번째 시나리오 기준)
        webhooks = first.get("webhooks", [])
        logger.info(f"📋 Loaded {len(webhooks)} webhooks for session: {session_id}")
        for webhook in webhooks:
            logger.info(f"🔗 Webhook: {webhook.get('name', 'Unknown')} -> {webhook.get('url', 'Unknown URL')}")
        plan = first.get("plan", [])
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
        initial_state = self.get_initial_state(first)
        self.session_stacks[session_id] = [
            {
                "scenarioName": first.get("plan", [{}])[0].get("name", ""),
                "dialogStateName": initial_state,
                "lastExecutedHandlerIndex": -1,
                "entryActionExecuted": False,
            }
        ]

    def switch_to_scenario(self, session_id: str, target_scenario_name: str, target_state: str = None):
        """다른 시나리오로 전이합니다."""
        stack = self.session_stacks.get(session_id, [])
        current_scenario = stack[-1] if stack else None
        
        if current_scenario:
            # 현재 시나리오 정보를 스택에 저장
            current_scenario["lastExecutedHandlerIndex"] = -1
            current_scenario["entryActionExecuted"] = True
        
        # 새로운 시나리오 정보를 스택에 추가
        new_scenario_info = {
            "scenarioName": target_scenario_name,
            "dialogStateName": target_state or "Start",
            "lastExecutedHandlerIndex": -1,
            "entryActionExecuted": False,
        }
        
        stack.append(new_scenario_info)
        self.session_stacks[session_id] = stack
        
        logger.info(f"🔄 Scenario switch: {current_scenario['scenarioName'] if current_scenario else 'Unknown'} -> {target_scenario_name} (state: {new_scenario_info['dialogStateName']})")
        
        return new_scenario_info

    def end_current_scenario(self, session_id: str):
        """현재 시나리오를 종료하고 이전 시나리오로 돌아갑니다."""
        stack = self.session_stacks.get(session_id, [])
        if len(stack) <= 1:
            logger.warning(f"Cannot end scenario: only one scenario in stack for session {session_id}")
            return None
        
        # 현재 시나리오 제거
        ended_scenario = stack.pop()
        previous_scenario = stack[-1]
        
        logger.info(f"🔚 Scenario ended: {ended_scenario['scenarioName']} -> returning to {previous_scenario['scenarioName']}")
        
        return previous_scenario

    def get_current_scenario_info(self, session_id: str):
        """현재 시나리오 정보를 반환합니다."""
        stack = self.session_stacks.get(session_id, [])
        return stack[-1] if stack else None

    def get_scenario_stack(self, session_id: str):
        """시나리오 스택을 반환합니다."""
        return self.session_stacks.get(session_id, [])
    
    def get_scenario(self, session_id: str) -> Optional[Dict[str, Any]]:
        """세션의 시나리오를 반환합니다."""
        return self.scenario_manager.get_scenario(session_id)
    
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
        current_dialog_state = self.scenario_manager.find_dialog_state(scenario, current_state)
        
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
            current_dialog_state = self.scenario_manager.find_dialog_state(scenario, current_state)
            if not current_dialog_state:
                return {
                    "error": f"상태 '{current_state}'를 찾을 수 없습니다.",
                    "new_state": current_state,
                    "response": "❌ 알 수 없는 상태입니다.",
                    "transitions": []
                }
            # --- inter-scenario transition 지원 ---
            # 핸들러 평가 후 transitionTarget.scenario가 현재 시나리오와 다르면 시나리오 전이
            def get_target_scenario_and_state(dialog_state):
                for handler_type in ["intentHandlers", "conditionHandlers", "eventHandlers"]:
                    for handler in dialog_state.get(handler_type, []):
                        target = handler.get("transitionTarget", {})
                        target_scenario = target.get("scenario")
                        target_state = target.get("dialogState")
                        logger.info(f"[SCENARIO TRANSITION CHECK] handler_type={handler_type}, target={target}")
                        if target_scenario and target_scenario != scenario["plan"][0]["name"]:
                            logger.info(f"[SCENARIO TRANSITION DETECTED] from={scenario['plan'][0]['name']} to={target_scenario}, state={str(target_state)}")
                            return target_scenario, target_state
                return None, None
            target_scenario, target_state = get_target_scenario_and_state(current_dialog_state)
            if target_scenario and target_state:
                logger.info(f"[SCENARIO SWITCH] session={session_id}, from={scenario['plan'][0]['name']} to={target_scenario}, state={str(target_state)}")
                self.switch_to_scenario(session_id, target_scenario, target_state)
                scenario_obj = self.scenario_manager.get_scenario_by_name(target_scenario)
                logger.info(f"[SCENARIO OBJ] scenario_obj={scenario_obj}")
                if scenario_obj:
                    return await self.process_input(session_id, user_input, target_state, scenario_obj, memory, event_type)
                else:
                    logger.error(f"[SCENARIO NOT FOUND] target_scenario={target_scenario}")
                    return {
                        "error": f"시나리오 '{target_scenario}'를 찾을 수 없습니다.",
                        "new_state": current_state,
                        "response": f"❌ 시나리오 전이 실패: {target_scenario}",
                        "transitions": []
                    }
            # --- 기존 로직 ---
            return await self._handle_normal_input(
                session_id,
                user_input,
                current_state,
                current_dialog_state,
                scenario,
                memory
            )
            
        except Exception as e:
            logger.error(f"State processing error: {str(e)}")
            return {
                "error": str(e),
                "new_state": current_state,
                "response": f"❌ 처리 오류: {str(e)}",
                "transitions": []
            }
    
    async def _handle_normal_input(
        self,
        session_id: str,
        user_input: str,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        """일반 사용자 입력을 처리합니다."""
        
        # 1. NLU 결과 파싱 및 entity 메모리 저장
        intent, entities = self.nlu_processor.get_nlu_results(user_input, memory, scenario, current_state)
        logger.info(f"[NLU] intent 추출 결과: {intent}, entities: {entities}")
        self.memory_manager.store_entities_to_memory(entities, memory)

        webhook_actions = current_dialog_state.get("webhookActions", [])
        apicall_handlers = current_dialog_state.get("apicallHandlers", [])
        webhook_result = None
        apicall_result = None
        transitions = []
        new_state = current_state
        response_messages = []
        webhook_success = False

        # 2. webhookAction이 있다면 실행
        if webhook_actions:
            logger.info(f"🔗 State {current_state} has webhook actions - executing webhook")
            webhook_result = await self.webhook_handler.handle_webhook_actions(
                current_state, current_dialog_state, scenario, memory
            )
            # webhook 성공 여부 판단 (new_state가 바뀌었거나, 에러가 없는 경우 성공으로 간주)
            if webhook_result and webhook_result.get("new_state", current_state) != current_state:
                webhook_success = True
            elif webhook_result and not webhook_result.get("error"):
                webhook_success = True
            else:
                webhook_success = False

        # 3. webhookAction & apicallHandler가 있다면: webhook 실패 시 apicallHandler 실행
        if webhook_actions and apicall_handlers:
            if not webhook_success:
                logger.info(f"🔗 Webhook failed or no transition, executing apicall handler as fallback")
                apicall_result = await self._handle_apicall_handlers(
                    current_state, current_dialog_state, scenario, memory
                )
        # 4. webhookAction이 없고 apicallHandler만 있다면 apicallHandler 실행
        elif not webhook_actions and apicall_handlers:
            logger.info(f"🔗 State {current_state} has only apicall handlers - executing apicall handler")
            apicall_result = await self._handle_apicall_handlers(
                current_state, current_dialog_state, scenario, memory
            )

        # 결과 병합 및 후처리
        # 우선순위: webhook_result > apicall_result > 일반 처리
        result = None
        if webhook_result and webhook_success:
            # webhook 성공 시, 후처리(EntryAction, 자동전이 등)는 _handle_webhook_actions에서 이미 처리됨
            result = webhook_result
            # webhook 처리 후 intent handler 분기 추가
            new_state = webhook_result.get("new_state", current_state)
            dialog_state_after = self.scenario_manager.find_dialog_state(scenario, new_state)
            if dialog_state_after and dialog_state_after.get("intentHandlers"):
                intent_transition = self.transition_manager.check_intent_handlers(
                    dialog_state_after, intent, memory
                )
                logger.info(f"[INTENT HANDLER][after webhook] intent_transition: {intent_transition}")
                if intent_transition:
                    result["new_state"] = intent_transition.toState
                    if "transitions" not in result:
                        result["transitions"] = []
                    result["transitions"].append(intent_transition)
        elif apicall_result:
            result = apicall_result
            # apicall 처리 후 intent handler 분기 추가
            new_state = apicall_result.get("new_state", current_state)
            dialog_state_after = self.scenario_manager.find_dialog_state(scenario, new_state)
            if dialog_state_after and dialog_state_after.get("intentHandlers"):
                intent_transition = self.transition_manager.check_intent_handlers(
                    dialog_state_after, intent, memory
                )
                logger.info(f"[INTENT HANDLER][after apicall] intent_transition: {intent_transition}")
                if intent_transition:
                    result["new_state"] = intent_transition.toState
                    if "transitions" not in result:
                        result["transitions"] = []
                    result["transitions"].append(intent_transition)
        elif webhook_result:
            # webhook 실패지만 apicall도 없을 때 fallback
            result = webhook_result
        else:
            # webhook/apicall 모두 없는 경우 기존 일반 처리
            result = await self._handle_normal_input_after_webhook(
                session_id,
                user_input,
                current_state,
                current_dialog_state,
                scenario,
                memory
            )

        # entities, intent, memory 최신화
        if result is not None:
            result["entities"] = entities
            result["intent"] = intent
            result["memory"] = memory
            return result
        else:
            # fallback
            return {
                "new_state": current_state,
                "response": f"💬 '{user_input}' 입력이 처리되었습니다.",
                "transitions": [],
                "intent": intent,
                "entities": entities,
                "memory": memory
            }
    
    async def _handle_normal_input_after_webhook(
        self,
        session_id: str,
        user_input: str,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        """웹훅 실행 후 일반 사용자 입력을 처리합니다."""
        
        # 실제 NLU 결과 사용 (프론트엔드에서 받은 결과 우선)
        intent, entities = self.nlu_processor.get_nlu_results(user_input, memory, scenario, current_state)
        
        # Entity를 메모리에 저장 (type:role 형태의 키로)
        self.memory_manager.store_entities_to_memory(entities, memory)
        
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
                slot_filling_result = self.slot_filling_manager.process_slot_filling(
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
                        self.reprompt_manager.clear_reprompt_handlers(memory, current_state)
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
                    no_match_result = self.reprompt_manager.handle_no_match_event(
                        current_dialog_state, memory, scenario, current_state
                    )
                    if no_match_result:
                        response_messages.extend(no_match_result.get("messages", []))
                        logger.info("🔄 Reprompt directive executed")
                
                # 현재 상태 유지
                new_state = current_state
        else:
            # 일반 처리: Slot Filling 상태인지 확인
            slot_filling_result = self.slot_filling_manager.process_slot_filling(
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
                logger.info(f"[DEBUG] [HANDLER] intentHandlers 평가 시작: {current_dialog_state.get('intentHandlers')}")
                intent_transition = self.transition_manager.check_intent_handlers(
                    current_dialog_state, intent, memory
                )
                logger.info(f"[DEBUG] [HANDLER] intent_transition 결과: {intent_transition}")
                if intent_transition:
                    transitions.append(intent_transition)
                    new_state = intent_transition.toState
                    logger.info(f"[STATE] intent 매칭으로 new_state 변경: {new_state}")
                    response_messages.append(f"🎯 인텐트 '{intent}' 처리됨")
                
                # 2. Condition Handler 확인 (전이가 없었을 경우)
                if not intent_transition:
                    logger.info(f"[DEBUG] [HANDLER] conditionHandlers 평가 시작: {current_dialog_state.get('conditionHandlers')}")
                    condition_transition = self.transition_manager.check_condition_handlers(
                        current_dialog_state, memory
                    )
                    logger.info(f"[DEBUG] [HANDLER] condition_transition 결과: {condition_transition}")
                    if condition_transition:
                        transitions.append(condition_transition)
                        new_state = condition_transition.toState
                        logger.info(f"[STATE] condition 매칭으로 new_state 변경: {new_state}")
                        response_messages.append(f"⚡ 조건 만족으로 전이")
                    else:
                        # 3. 매치되지 않은 경우 NO_MATCH_EVENT 처리
                        if intent == "NO_INTENT_FOUND" or not intent_transition:
                            logger.info(f"[DEBUG] [HANDLER] NO_MATCH_EVENT 평가 시작")
                            no_match_result = self.reprompt_manager.handle_no_match_event(
                                current_dialog_state, memory, scenario, current_state
                            )
                            logger.info(f"[DEBUG] [HANDLER] no_match_result: {no_match_result}")
                            if no_match_result:
                                new_state = no_match_result.get("new_state", current_state)
                                response_messages.extend(no_match_result.get("messages", []))
                                logger.info("🔄 NO_MATCH_EVENT processed")
        
        # 3. Entry Action 실행 및 자동 전이 확인 (새로운 상태로 전이된 경우)
        if new_state != current_state:
            logger.info(f"[STATE] 상태 변경 감지: {current_state} -> {new_state}")
            # 상태가 변경되면 reprompt handler 해제
            self.reprompt_manager.clear_reprompt_handlers(memory, current_state)
            
            # Entry Action 실행
            entry_response = self.action_executor.execute_entry_action(scenario, new_state)
            if entry_response:
                response_messages.append(entry_response)
            
            # Entry Action 실행 후 자동 전이 확인
            auto_transition_result = await self._check_and_execute_auto_transitions(
                scenario, new_state, memory, response_messages
            )
            if auto_transition_result:
                logger.info(f"[AUTO TRANSITION] auto_transition_result: {auto_transition_result}")
                new_state = auto_transition_result["new_state"]
                response_messages.extend(auto_transition_result.get("messages", []))
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
        
        if new_state == "__END_SCENARIO__":
            stack = self.session_stacks.get(session_id, [])
            if len(stack) > 1:
                stack.pop()
                prev = stack[-1]
                new_state = prev.get("dialogStateName", new_state)
                # 복귀한 노드에서 entryAction을 실행하지 않고, intent/condition/event 핸들러를 모두 평가
                prev["entryActionExecuted"] = True  # entryAction 재실행 방지
                max_reentry = 10
                reentry_count = 0
                while reentry_count < max_reentry:
                    reentry_count += 1
                    # 복귀한 시나리오/상태 정보
                    scenario_name = prev.get("scenarioName")
                    dialog_state_name = prev.get("dialogStateName")
                    if not scenario_name or not dialog_state_name:
                        break
                    # 현재 시나리오 객체 찾기
                    scenario_obj = self.scenario_manager.get_scenario_by_name(scenario_name)
                    if not scenario_obj:
                        break
                    dialog_state = self.scenario_manager.find_dialog_state(scenario_obj, dialog_state_name)
                    if not dialog_state:
                        break
                    # 1. Intent Handler
                    intent, entities = self.nlu_processor.get_nlu_results(user_input, memory, scenario_obj, str(dialog_state_name))
                    intent_transition = self.transition_manager.check_intent_handlers(dialog_state, intent, memory)
                    if intent_transition:
                        new_state = intent_transition.toState
                        prev["dialogStateName"] = new_state
                        continue
                    # 2. Event Handler
                    event_handlers = dialog_state.get("eventHandlers", [])
                    event_transition = None
                    for handler in event_handlers:
                        if not isinstance(handler, dict):
                            continue
                        event_info = handler.get("event", {})
                        handler_event_type = event_info.get("type") if isinstance(event_info, dict) else event_info if isinstance(event_info, str) else None
                        if handler_event_type == memory.get("lastEventType"):
                            target = handler.get("transitionTarget", {})
                            event_transition = target.get("dialogState")
                            break
                    if event_transition:
                        new_state = event_transition
                        prev["dialogStateName"] = new_state
                        continue
                    # 3. Condition Handler
                    condition_transition = self.transition_manager.check_condition_handlers(dialog_state, memory)
                    if condition_transition:
                        new_state = condition_transition.toState
                        prev["dialogStateName"] = new_state
                        continue
                    # 전이 없음: 루프 종료
                    break
            else:
                new_state = "__END_SESSION__"

        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": transition_dicts,
            "intent": intent,
            "entities": entities,
            "memory": memory,
            "messages": response_messages
        }
    
    async def _check_and_execute_auto_transitions(
        self,
        scenario: Dict[str, Any],
        current_state: str,
        memory: Dict[str, Any],
        response_messages: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Entry Action 실행 후 자동 전이가 가능한지 확인하고 실행합니다."""
        
        # 현재 상태 정보 가져오기
        current_dialog_state = self.scenario_manager.find_dialog_state(scenario, current_state)
        if not current_dialog_state:
            return None
        
        webhook_actions = current_dialog_state.get("webhookActions", [])
        apicall_handlers = current_dialog_state.get("apicallHandlers", [])
        
        # 1. webhook이 있으면 webhook만 실행 (성공 시 apicall은 실행하지 않음)
        if webhook_actions:
            logger.info(f"State {current_state} has webhook actions - executing webhook first (apicall will be skipped if webhook succeeds)")
            webhook_result = await self.webhook_handler.handle_webhook_actions(
                current_state, current_dialog_state, scenario, memory
            )
            if webhook_result:
                new_state = webhook_result.get("new_state", current_state)
                webhook_messages = webhook_result.get("response", "").split("\n")
                response_messages.extend(webhook_messages)
                if new_state != current_state:
                    new_dialog_state = self.scenario_manager.find_dialog_state(scenario, new_state)
                    if new_dialog_state:
                        entry_response = self.action_executor.execute_entry_action(scenario, new_state)
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
                                response_messages.extend(next_auto_result.get("messages", []))
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
                    new_dialog_state = self.scenario_manager.find_dialog_state(scenario, new_state)
                    if new_dialog_state:
                        entry_response = self.action_executor.execute_entry_action(scenario, new_state)
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
                                response_messages.extend(next_auto_result.get("messages", []))
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
            target = handler.get("transitionTarget", {})
            target_scenario = target.get("scenario")
            target_state = target.get("dialogState", current_state)
            # 시나리오 전이 처리 추가
            if target_scenario and target_scenario != scenario["plan"][0]["name"]:
                logger.info(f"[AUTO SCENARIO TRANSITION DETECTED] from={scenario['plan'][0]['name']} to={target_scenario}, state={str(target_state)}")
                self.switch_to_scenario(memory.get('session_id', ''), target_scenario, target_state)
                scenario_obj = self.scenario_manager.get_scenario_by_name(target_scenario)
                if scenario_obj:
                    # process_input을 재귀적으로 호출하여 시나리오 context를 바꾼다
                    return await self.process_input(memory.get('session_id', ''), '', target_state, scenario_obj, memory)
                else:
                    logger.error(f"[AUTO SCENARIO NOT FOUND] target_scenario={target_scenario}")
                    return {
                        "new_state": current_state,
                        "messages": [f"❌ 시나리오 전이 실패: {target_scenario}"],
                        "transitions": []
                    }
            if condition.strip() == "True" or condition.strip() == '"True"':
                new_state = target_state
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
                if self.transition_manager.evaluate_condition(condition, memory):
                    new_state = target_state
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
            entry_response = self.action_executor.execute_entry_action(scenario, new_state)
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
                    response_messages.extend(next_auto_result.get("messages", []))
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
                entry_response = self.action_executor.execute_entry_action(scenario, new_state)
                logger.info(f"Entry action completed: {entry_response}")
                if entry_response:
                    response_messages.append(entry_response)
                
                # Entry Action 실행 후 자동 전이 확인
                auto_transition_result = await self._check_and_execute_auto_transitions(
                    scenario, new_state, memory, response_messages
                )
                if auto_transition_result:
                    new_state = auto_transition_result["new_state"]
                    response_messages.extend(auto_transition_result.get("messages", []))
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
                response_data = await self.apicall_handler.execute_api_call(apicall_config, memory)
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
                        
                    condition_statement = cond_handler.get("conditionStatement", "")
                    
                    # True 조건은 맨 마지막에 체크 (fallback)
                    if condition_statement.strip() == "True" or condition_statement.strip() == '"True"':
                        continue
                        
                    # 조건 평가
                    logger.info(f"🔍 Evaluating condition: '{condition_statement}' with memory: {memory}")
                    logger.info(f"🔍 NLU_INTENT in memory: {memory.get('NLU_INTENT', 'NOT_FOUND')}")
                    condition_result = self.transition_manager.evaluate_condition(condition_statement, memory)
                    logger.info(f"🔍 Condition result: {condition_result}")
                    
                    if condition_result:
                        cond_target = cond_handler.get("transitionTarget", {})
                        new_state = cond_target.get("dialogState", current_state)
                        
                        transition = StateTransition(
                            fromState=current_state,
                            toState=new_state,
                            reason=f"API Call + 조건 매칭: {condition_statement}",
                            conditionMet=True,
                            handlerType="apicall_condition"
                        )
                        transitions.append(transition)
                        response_messages.append(f"✅ 조건 '{condition_statement}' 매칭됨 → {new_state}")
                        matched_condition = True
                        break
                
                # 조건에 매칭되지 않으면 fallback (True 조건) 실행
                if not matched_condition:
                    for cond_handler in condition_handlers:
                        if not isinstance(cond_handler, dict):
                            logger.warning(f"Condition handler is not a dict: {cond_handler}")
                            continue
                            
                        condition_statement = cond_handler.get("conditionStatement", "")
                        if condition_statement.strip() == "True" or condition_statement.strip() == '"True"':
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
                        entry_response = self.action_executor.execute_entry_action(scenario, new_state)
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
                    processed_value = utils.normalize_response_value(raw_value)
                    
                    memory[memory_key] = processed_value
                    logger.info(f"✅ Mapped {memory_key} <- {jsonpath_expr}: {processed_value} (raw: {raw_value})")
                else:
                    logger.warning(f"❌ No matches found for JSONPath: {jsonpath_expr}")
                    logger.info(f"🔍 Available paths in response: {utils.get_all_paths(response_data)}")
                    
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

    def create_chatbot_response(self, *args, **kwargs):
        return self.chatbot_response_factory.create_chatbot_response(*args, **kwargs) 