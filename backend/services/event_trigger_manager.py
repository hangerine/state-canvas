import logging
from typing import Dict, Any
from models.scenario import StateTransition

logger = logging.getLogger(__name__)

class EventTriggerManager:
    def __init__(self, action_executor, transition_manager):
        self.action_executor = action_executor
        self.transition_manager = transition_manager

    async def handle_event_trigger(
        self,
        event_type: str,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
        logger.info(f"Manual event trigger: {event_type} in state {current_state}")
        transitions = []
        new_state = current_state
        response_messages = [f"🎯 이벤트 '{event_type}' 트리거됨"]
        event_handlers = current_dialog_state.get("eventHandlers", [])
        event_matched = False
        logger.info(f"Event handlers: {event_handlers}")
        for handler in event_handlers:
            logger.info(f"Processing handler: {handler}, type: {type(handler)}")
            if not isinstance(handler, dict):
                logger.warning(f"Event handler is not a dict: {handler}")
                continue
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
        if new_state != current_state:
            try:
                logger.info(f"Executing entry action for transition: {current_state} -> {new_state}")
                entry_response = self.action_executor.execute_entry_action(scenario, new_state)
                logger.info(f"Entry action completed: {entry_response}")
                if entry_response:
                    response_messages.append(entry_response)
                # Entry Action 실행 후 자동 전이 확인
                # (StateEngine에서 orchestrate할 수도 있으나, 필요시 DI로 받아서 호출)
            except Exception as e:
                logger.error(f"Error executing entry action: {e}")
                response_messages.append(f"⚠️ Entry action 실행 중 에러: {str(e)}")
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