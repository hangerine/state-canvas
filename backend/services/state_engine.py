import logging
import re
import json
import aiohttp
import asyncio
from typing import Dict, Any, List, Optional, Tuple
from jsonpath_ng import parse
from models.scenario import StateTransition

logger = logging.getLogger(__name__)

class StateEngine:
    """시나리오 기반 State 전이 엔진"""
    
    def __init__(self):
        self.scenarios: Dict[str, Dict[str, Any]] = {}
        self.sessions: Dict[str, Dict[str, Any]] = {}
    
    def load_scenario(self, session_id: str, scenario_data: Dict[str, Any]):
        """시나리오를 로드합니다."""
        self.scenarios[session_id] = scenario_data
        logger.info(f"Scenario loaded for session: {session_id}")
        
    def get_scenario(self, session_id: str) -> Optional[Dict[str, Any]]:
        """세션의 시나리오를 반환합니다."""
        return self.scenarios.get(session_id)
    
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
        
        # Webhook이 있는 상태에서는 모든 자동 전이하지 않음 (사용자 입력 대기)
        webhook_actions = current_dialog_state.get("webhookActions", [])
        if webhook_actions:
            logger.info(f"State {current_state} has webhook actions - NO auto transitions, waiting for user input")
            return auto_transitions
        
        # Event Handler가 있는 상태에서는 모든 자동 전이하지 않음 (사용자 이벤트 트리거 대기)
        event_handlers = current_dialog_state.get("eventHandlers", [])
        if event_handlers:
            logger.info(f"State {current_state} has event handlers - NO auto transitions, waiting for manual event trigger")
            return auto_transitions
        
        # ApiCall Handler가 있는 상태에서는 자동 전이하지 않음 (API 호출 대기)
        apicall_handlers = current_dialog_state.get("apicallHandlers", [])
        if apicall_handlers:
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
                if is_webhook_state:
                    logger.info(f"State {current_state} has webhooks - no auto transition on empty input")
                    return {
                        "new_state": current_state,
                        "response": "🔗 Webhook 상태입니다. 응답 값을 입력해주세요.",
                        "transitions": [],
                        "intent": "WEBHOOK_WAITING",
                        "entities": {},
                        "memory": memory
                    }
                else:
                    # ApiCall Handler 확인
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
                logger.info(f"Processing webhook simulation for state: {current_state}")
                return await self._handle_webhook_simulation(
                    user_input, current_state, current_dialog_state, scenario, memory
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
    
    async def _handle_webhook_simulation(
        self,
        user_input: str,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Webhook 시뮬레이션을 처리합니다."""
        
        # 사용자 입력을 NLU_INTENT로 설정
        memory["NLU_INTENT"] = user_input.strip()
        
        transitions = []
        new_state = current_state
        response_messages = [f"🔗 Webhook 응답 시뮬레이션: NLU_INTENT = '{user_input}'"]
        
        # Condition Handler 확인
        condition_handlers = current_dialog_state.get("conditionHandlers", [])
        matched_condition = False
        
        # 먼저 True가 아닌 조건들을 확인
        for handler in condition_handlers:
            # handler가 딕셔너리인지 확인
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
                    reason=f"Webhook 조건 매칭: {condition}",
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
                # handler가 딕셔너리인지 확인
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
                        reason="Webhook 조건 불일치 - fallback 실행",
                        conditionMet=True,
                        handlerType="condition"
                    )
                    transitions.append(transition)
                    response_messages.append(f"❌ 조건 불일치 - fallback으로 {new_state}로 이동")
                    break
        
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
            logger.error(f"Error processing transitions in _handle_webhook_simulation: {e}")
            transition_dicts = []
        
        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": transition_dicts,
            "intent": "WEBHOOK_SIMULATION",
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
        
        # NLU 시뮬레이션 (간단한 키워드 매칭)
        intent, entities = self._simulate_nlu(user_input)
        
        # 메모리 업데이트
        if entities:
            memory.update(entities)
        
        transitions = []
        new_state = current_state
        response_messages = []
        
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
        
        # 3. Entry Action 실행 (새로운 상태로 전이된 경우)
        if new_state != current_state:
            entry_response = self._execute_entry_action(scenario, new_state)
            if entry_response:
                response_messages.append(entry_response)
        
        # 4. Slot Filling 처리
        slot_filling_response = self._handle_slot_filling(
            scenario, new_state, user_input, memory
        )
        if slot_filling_response:
            response_messages.append(slot_filling_response)
        
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
            logger.error(f"Error processing transitions in _handle_normal_input: {e}")
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
    
    def _simulate_nlu(self, user_input: str) -> Tuple[str, Dict[str, Any]]:
        """간단한 NLU 시뮬레이션 (키워드 기반)"""
        input_lower = user_input.lower()
        
        # 인텐트 매칭
        if any(word in input_lower for word in ["날씨", "weather"]):
            intent = "Weather.Inform"
        elif any(word in input_lower for word in ["네", "yes", "좋아", "좋습니다"]):
            intent = "say.yes"
        elif any(word in input_lower for word in ["아니", "no", "싫어", "안됩니다"]):
            intent = "say.no"
        elif any(word in input_lower for word in ["긍정", "positive"]):
            intent = "Positive"
        else:
            intent = "__ANY_INTENT__"
        
        # 엔티티 추출 (도시명 예시)
        entities = {}
        cities = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종"]
        for city in cities:
            if city in user_input:
                entities["CITY"] = city
                break
        
        return intent, entities
    
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
                target = handler.get("transitionTarget", {})
                
                return StateTransition(
                    fromState=dialog_state.get("name", ""),
                    toState=target.get("dialogState", ""),
                    reason=f"인텐트 '{intent}' 매칭",
                    conditionMet=True,
                    handlerType="intent"
                )
        
        return None
    
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
            # 간단한 조건 평가
            if condition.strip() == "True" or condition.strip() == '"True"':
                return True
            elif condition.strip() == "False" or condition.strip() == '"False"':
                return False
            elif condition == "SLOT_FILLING_COMPLETED":
                # Slot filling 완료 조건 (예시)
                return memory.get("CITY") is not None
            
            # 메모리 변수 치환
            for key, value in memory.items():
                condition = condition.replace(f"{{{key}}}", f'"{value}"')
                condition = condition.replace(f"${{{key}}}", f'"{value}"')
            
            # NLU_INTENT 치환
            if "{$NLU_INTENT}" in condition:
                nlu_intent = memory.get("NLU_INTENT", "")
                condition = condition.replace("{$NLU_INTENT}", f'"{nlu_intent}"')
            
            # 간단한 비교 연산 처리
            if "==" in condition:
                left, right = condition.split("==", 1)
                left = left.strip().strip('"')
                right = right.strip().strip('"')
                result = left == right
                logger.info(f"Condition evaluation: {left} == {right} -> {result}")
                return result
            
            return False
            
        except Exception as e:
            logger.error(f"Condition evaluation error: {e}")
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
    
    def _handle_slot_filling(
        self, 
        scenario: Dict[str, Any], 
        state_name: str, 
        user_input: str, 
        memory: Dict[str, Any]
    ) -> Optional[str]:
        """Slot Filling을 처리합니다."""
        dialog_state = self._find_dialog_state(scenario, state_name)
        if not dialog_state:
            return None
        
        slot_filling_forms = dialog_state.get("slotFillingForm", [])
        if not slot_filling_forms:
            return None
        
        messages = []
        for form in slot_filling_forms:
            slot_name = form.get("name")
            required = form.get("required", "N") == "Y"
            memory_slot_keys = form.get("memorySlotKey", [])
            
            # 메모리에 슬롯 값이 있는지 확인
            slot_filled = False
            for memory_key in memory_slot_keys:
                if ":" in memory_key:
                    key = memory_key.split(":")[0]
                    if key in memory:
                        slot_filled = True
                        break
            
            if required and not slot_filled:
                messages.append(f"📝 '{slot_name}' 정보가 필요합니다.")
        
        return "; ".join(messages) if messages else None

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
                if mappings:
                    self._apply_response_mappings(response_data, mappings, memory)
                
                logger.info(f"📋 Memory after response mapping: {memory}")
                
                # 전이 처리
                target = handler.get("transitionTarget", {})
                new_state = target.get("dialogState", current_state)
                
                if new_state != current_state:
                    # Entry Action 실행
                    entry_response = self._execute_entry_action(scenario, new_state)
                    
                    return {
                        "new_state": new_state,
                        "response": entry_response or f"🔄 API 호출 완료 → {new_state}",
                        "transitions": [{
                            "fromState": current_state,
                            "toState": new_state,
                            "reason": f"API Call: {handler.get('name', 'Unknown')}",
                            "conditionMet": True,
                            "handlerType": "apicall"
                        }],
                        "intent": "API_CALL",
                        "entities": {},
                        "memory": memory
                    }
            
            except Exception as e:
                logger.error(f"Error processing apicall handler: {e}")
                continue
        
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