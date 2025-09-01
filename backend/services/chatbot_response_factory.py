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
        event_type: Optional[str] = None,
        directive_queue: Optional[List[Dict[str, Any]]] = None
    ) -> ChatbotResponse:
        end_session = "Y" if new_state == "__END_SESSION__" else "N"
        directives: List[ChatbotDirective] = []

        # botType/시나리오/상태에 따라 directive 타입 결정
        scenario_bot_type = (scenario.get("botConfig", {}) or {}).get("botType", "CHAT_BOT") if isinstance(scenario, dict) else "CHAT_BOT"
        is_callbot = scenario_bot_type.upper() == "CALL_BOT"

        for message in response_messages:
            if not message or not str(message).strip():
                continue
            if is_callbot:
                # bdm-new callbot 스타일: systemUtterance
                directives.append(ChatbotDirective(
                    name="systemUtterance",
                    content={
                        "record": None,
                        "speech": str(message),
                        "display": ""
                    }
                ))
            else:
                # 기존 chatbot 스타일: customPayload
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
                directives.append(ChatbotDirective(name="customPayload", content=directive_content.model_dump()))
        
        # directive_queue에서 추가 directive 처리
        if directive_queue:
            for directive_item in directive_queue:
                try:
                    key = directive_item.get("key", "")
                    value = directive_item.get("value", "")
                    source = directive_item.get("source", "unknown")
                    
                    if key and value:
                        # directive를 ChatbotDirective 형식으로 변환
                        directive_content = DirectiveContent(
                            item=[
                                {
                                    "section": {
                                        "class": "cb-section section_1",
                                        "item": [
                                            {
                                                "text": {
                                                    "class": "cb-text text",
                                                    "text": f"<p>Directive from {source}: {key} = {value}</p>"
                                                }
                                            }
                                        ]
                                    }
                                }
                            ]
                        )
                        if is_callbot:
                            directives.append(ChatbotDirective(
                                name="systemUtterance",
                                content={
                                    "record": None,
                                    "speech": f"Directive from {source}: {key} = {value}",
                                    "display": ""
                                }
                            ))
                        else:
                            directives.append(ChatbotDirective(
                                name="customPayload",
                                content=directive_content.model_dump()
                            ))
                        logger.info(f"✅ Added directive from queue: {key} = {value} (source: {source})")
                except Exception as e:
                    logger.error(f"❌ Error processing directive from queue: {e}")
                    continue
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