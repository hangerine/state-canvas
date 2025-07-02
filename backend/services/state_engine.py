import logging
import re
import json
from typing import Dict, Any, List, Optional, Tuple
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
                return dialog_states[0].get("name", "")
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
        
        # 2. True 조건 확인 (webhook이나 event handler가 없는 경우에만)
        condition_handlers = current_dialog_state.get("conditionHandlers", [])
        for handler in condition_handlers:
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
            entry_response = self._execute_entry_action(scenario, new_state)
            if entry_response:
                response_messages.append(entry_response)
        
        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": [t.dict() for t in transitions],
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
        
        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": [t.dict() for t in transitions],
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
        dialog_state = self._find_dialog_state(scenario, state_name)
        if not dialog_state:
            return None
        
        entry_action = dialog_state.get("entryAction")
        if not entry_action:
            return None
        
        # Directive 처리 (메시지 추출)
        directives = entry_action.get("directives", [])
        messages = []
        
        for directive in directives:
            content = directive.get("content", {})
            items = content.get("item", [])
            
            for item in items:
                section = item.get("section", {})
                section_items = section.get("item", [])
                
                for section_item in section_items:
                    text_data = section_item.get("text", {})
                    text_content = text_data.get("text", "")
                    
                    if text_content:
                        # HTML 태그 제거
                        import re
                        clean_text = re.sub(r'<[^>]+>', '', text_content)
                        messages.append(clean_text)
        
        return f"🤖 {'; '.join(messages)}" if messages else None
    
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
        
        for handler in event_handlers:
            handler_event_type = handler.get("event", {}).get("type", "")
            
            if handler_event_type == event_type:
                target = handler.get("transitionTarget", {})
                new_state = target.get("dialogState", current_state)
                
                transition = StateTransition(
                    fromState=current_state,
                    toState=new_state,
                    reason=f"이벤트 트리거: {event_type}",
                    conditionMet=True,
                    handlerType="event"
                )
                transitions.append(transition)
                response_messages.append(f"✅ 이벤트 '{event_type}' 처리됨 → {new_state}")
                event_matched = True
                break
        
        if not event_matched:
            response_messages.append(f"❌ 이벤트 '{event_type}'에 대한 핸들러가 없습니다.")
        
        # Entry Action 실행 (새로운 상태로 전이된 경우)
        if new_state != current_state:
            entry_response = self._execute_entry_action(scenario, new_state)
            if entry_response:
                response_messages.append(entry_response)
        
        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": [t.dict() for t in transitions],
            "intent": "EVENT_TRIGGER",
            "entities": {},
            "memory": memory
        } 