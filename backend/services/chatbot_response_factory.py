import logging
from typing import List, Dict, Any, Optional
from models.scenario import ChatbotResponse, ErrorInfo, ChatbotDirective, DirectiveContent, ResponseMeta, UsedSlot

logger = logging.getLogger(__name__)

class ChatbotResponseFactory:
    def __init__(self):
        pass

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
        end_session = "Y" if new_state == "__END_SESSION__" else "N"
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
        used_slots_list = []
        if used_slots:
            for slot in used_slots:
                used_slots_list.append(UsedSlot(
                    key=slot.get("key", ""),
                    value=slot.get("value", ""),
                    turn=slot.get("turn", "")
                ))
        if intent and intent != "NO_INTENT_FOUND":
            used_slots_list.append(UsedSlot(
                key="__NLU_INTENT__",
                value=intent,
                turn=""
            ))
        if event_type:
            used_slots_list.append(UsedSlot(
                key="EVENT_TYPE",
                value=event_type,
                turn=""
            ))
        scenario_name = ""
        if scenario and "plan" in scenario:
            plans = scenario["plan"]
            if plans and len(plans) > 0:
                scenario_name = plans[0].get("name", "")
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