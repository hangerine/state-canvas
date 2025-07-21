import logging
import json
import aiohttp
import asyncio
import time
import uuid
from typing import Dict, Any, Optional, List
from models.scenario import StateTransition
from services.base_handler import BaseHandler

logger = logging.getLogger(__name__)

class WebhookHandler(BaseHandler):
    def __init__(self, scenario_manager):
        self.scenario_manager = scenario_manager

    async def handle(self, current_state: str, current_dialog_state: Dict[str, Any], scenario: Dict[str, Any], memory: Dict[str, Any]) -> Dict[str, Any]:
        return await self.handle_webhook_actions(current_state, current_dialog_state, scenario, memory)

    async def handle_webhook_actions(
        self,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Dict[str, Any]:
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
        for webhook_action in webhook_actions:
            if not isinstance(webhook_action, dict):
                logger.warning(f"Webhook action is not a dict: {webhook_action}")
                continue
            webhook_name = webhook_action.get("name", "Unknown")
            logger.info(f"🔗 Processing webhook action: {webhook_name} (type: {type(webhook_name)})")
            logger.info(f"🔗 Raw webhook action data: {webhook_action}")
            webhook_config = None
            webhooks = scenario.get("webhooks", [])
            logger.info(f"📋 Searching for webhook '{webhook_name}' among {len(webhooks)} registered webhooks")
            for webhook in webhooks:
                registered_name = webhook.get("name", "")
                logger.info(f"   - Checking: '{registered_name}' vs '{webhook_name}'")
                if registered_name == webhook_name:
                    webhook_config = webhook
                    logger.info(f"✅ Found matching webhook config: {webhook_name}")
                    break
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
            if not webhook_config and webhooks:
                webhook_config = webhooks[0]
                logger.warning(f"⚠️ Webhook config not found for name: '{webhook_name}', using first available webhook: {webhook_config.get('name', 'Unknown')}")
                response_messages.append(f"⚠️ 웹훅 '{webhook_name}' 설정을 찾을 수 없어 첫 번째 webhook 사용: {webhook_config.get('name', 'Unknown')}")
            elif not webhook_config:
                logger.error(f"❌ No webhook configs available at all")
                response_messages.append(f"❌ 웹훅 설정을 찾을 수 없음: {webhook_name}")
                continue
            webhook_response = await self.execute_webhook_call(
                webhook_config, "", current_state, scenario, memory
            )
            if webhook_response is None:
                logger.error(f"Webhook call failed for: {webhook_name}")
                response_messages.append(f"❌ 웹훅 호출 실패: {webhook_name}")
                continue
            response_memory = webhook_response.get("memorySlots", {})
            if response_memory:
                memory.update(response_memory)
                logger.info(f"Memory updated from webhook response: {response_memory}")
            nlu_intent = ""
            if "NLU_INTENT" in response_memory:
                nlu_intent_data = response_memory["NLU_INTENT"]
                if isinstance(nlu_intent_data, dict) and "value" in nlu_intent_data:
                    nlu_intent = nlu_intent_data["value"][0] if nlu_intent_data["value"] else ""
                else:
                    nlu_intent = str(nlu_intent_data)
                memory["NLU_INTENT"] = nlu_intent
            logger.info(f"Extracted NLU_INTENT from webhook: {nlu_intent}")
            response_messages.append(f"🔗 웹훅 호출 완료: {webhook_name} (NLU_INTENT = '{nlu_intent}')")
        condition_handlers = current_dialog_state.get("conditionHandlers", [])
        matched_condition = False
        for handler in condition_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Handler is not a dict: {handler}")
                continue
            condition = handler.get("conditionStatement", "")
            if condition.strip() == "True" or condition.strip() == '"True"':
                continue
            if self.scenario_manager._evaluate_condition(condition, memory):
                target = handler.get("transitionTarget", {})
                new_state = target.get("dialogState", current_state)
                transition = None
                if hasattr(self.scenario_manager, 'StateTransition'):
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
        if not matched_condition:
            for handler in condition_handlers:
                if not isinstance(handler, dict):
                    logger.warning(f"Handler is not a dict: {handler}")
                    continue
                condition = handler.get("conditionStatement", "")
                if condition.strip() == "True" or condition.strip() == '"True"':
                    target = handler.get("transitionTarget", {})
                    new_state = target.get("dialogState", current_state)
                    transition = None
                    if hasattr(self.scenario_manager, 'StateTransition'):
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
        return {
            "new_state": new_state,
            "response": "\n".join(response_messages),
            "transitions": [t for t in transitions if t],
            "intent": "WEBHOOK_PROCESSING",
            "entities": {},
            "memory": memory
        }

    async def execute_webhook_call(
        self,
        webhook_config: Dict[str, Any],
        user_input: str,
        current_state: str,
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        try:
            url = webhook_config.get("url", "")
            timeout = webhook_config.get("timeoutInMilliSecond", 5000) / 1000
            retry_count = webhook_config.get("retry", 3)
            webhook_headers = webhook_config.get("headers", {})
            session_id = memory.get("sessionId")
            if not session_id:
                session_id = f"session-{int(time.time())}-{uuid.uuid4().hex[:8]}"
                memory["sessionId"] = session_id
            request_id = f"req-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"
            webhook_request = {
                "text": user_input,
                "sessionId": session_id,
                "requestId": request_id,
                "currentState": current_state,
                "memory": memory
            }
            headers = {"Content-Type": "application/json"}
            if webhook_headers:
                headers.update(webhook_headers)
            logger.info(f"📡 Webhook request to {url}")
            logger.info(f"📋 Request data: {json.dumps(webhook_request, indent=2, ensure_ascii=False)}")
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
                if attempt < retry_count - 1:
                    await asyncio.sleep(1)
            logger.error(f"Webhook call failed after {retry_count} attempts: {last_exception}")
            return None
        except Exception as e:
            logger.error(f"Webhook call execution error: {e}")
            return None 