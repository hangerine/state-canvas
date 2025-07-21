import logging
import json
import aiohttp
import asyncio
import time
import uuid
from typing import Dict, Any, Optional, List
from services import utils
from models.scenario import StateTransition
from services.base_handler import BaseHandler

logger = logging.getLogger(__name__)

class ApiCallHandler(BaseHandler):
    def __init__(self, scenario_manager):
        self.scenario_manager = scenario_manager

    async def handle(self, current_state: str, current_dialog_state: Dict[str, Any], scenario: Dict[str, Any], memory: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        return await self.handle_apicall_handlers(current_state, current_dialog_state, scenario, memory)

    async def handle_apicall_handlers(
        self,
        current_state: str,
        current_dialog_state: Dict[str, Any],
        scenario: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        apicall_handlers = current_dialog_state.get("apicallHandlers", [])
        if not apicall_handlers:
            return None
        logger.info(f"Processing {len(apicall_handlers)} apicall handlers in state {current_state}")
        if "sessionId" not in memory:
            memory["sessionId"] = str(uuid.uuid4())
            logger.info(f"🆔 Generated sessionId: {memory['sessionId']}")
        for handler in apicall_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Apicall handler is not a dict: {handler}")
                continue
            try:
                apicall_config = handler.get("apicall", {})
                if not apicall_config:
                    logger.warning(f"No apicall config found in handler: {handler}")
                    continue
                logger.info(f"🚀 Executing API call: {handler.get('name', 'Unknown')}")
                logger.info(f"📋 Memory before API call: {memory}")
                response_data = await self.execute_api_call(apicall_config, memory)
                if response_data is None:
                    logger.warning(f"API call failed for handler: {handler}")
                    continue
                logger.info(f"📥 API response received: {response_data}")
                mappings = apicall_config.get("formats", {}).get("responseMappings", {})
                if not mappings:
                    if "memorySlots" in response_data and "NLU_INTENT" in response_data["memorySlots"]:
                        logger.info("📋 Detected standard webhook response format, applying default mappings")
                        mappings = {
                            "NLU_INTENT": "$.memorySlots.NLU_INTENT.value[0]",
                            "STS_CONFIDENCE": "$.memorySlots.STS_CONFIDENCE.value[0]",
                            "USER_TEXT_INPUT": "$.memorySlots.USER_TEXT_INPUT.value[0]"
                        }
                if mappings:
                    self.scenario_manager._apply_response_mappings(response_data, mappings, memory)
                logger.info(f"📋 Memory after response mapping: {memory}")
                condition_handlers = current_dialog_state.get("conditionHandlers", [])
                matched_condition = False
                transitions = []
                response_messages = [f"🔄 API 호출 완료: {handler.get('name', 'Unknown')}"]
                for cond_handler in condition_handlers:
                    if not isinstance(cond_handler, dict):
                        logger.warning(f"Condition handler is not a dict: {cond_handler}")
                        continue
                    condition = cond_handler.get("conditionStatement", "")
                    if condition.strip() == "True" or condition.strip() == '"True"':
                        continue
                    logger.info(f"🔍 Evaluating condition: '{condition}' with memory: {memory}")
                    logger.info(f"🔍 NLU_INTENT in memory: {memory.get('NLU_INTENT', 'NOT_FOUND')}")
                    condition_result = self.scenario_manager._evaluate_condition(condition, memory)
                    logger.info(f"🔍 Condition result: {condition_result}")
                    if condition_result:
                        cond_target = cond_handler.get("transitionTarget", {})
                        new_state = cond_target.get("dialogState", current_state)
                        transition = None
                        if hasattr(self.scenario_manager, 'StateTransition'):
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
                if not matched_condition:
                    for cond_handler in condition_handlers:
                        if not isinstance(cond_handler, dict):
                            logger.warning(f"Condition handler is not a dict: {cond_handler}")
                            continue
                        condition = cond_handler.get("conditionStatement", "")
                        if condition.strip() == "True" or condition.strip() == '"True"':
                            cond_target = cond_handler.get("transitionTarget", {})
                            new_state = cond_target.get("dialogState", current_state)
                            transition = None
                            if hasattr(self.scenario_manager, 'StateTransition'):
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
                if not condition_handlers:
                    target = handler.get("transitionTarget", {})
                    new_state = target.get("dialogState", current_state)
                    response_messages.append(f"조건 없음 → {new_state}")
                if new_state != current_state:
                    try:
                        logger.info(f"Executing entry action for transition: {current_state} -> {new_state}")
                        entry_response = self.scenario_manager._execute_entry_action(scenario, new_state)
                        logger.info(f"Entry action completed: {entry_response}")
                        if entry_response:
                            response_messages.append(entry_response)
                    except Exception as e:
                        logger.error(f"Error executing entry action: {e}")
                        response_messages.append(f"⚠️ Entry action 실행 중 에러: {str(e)}")
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

    async def execute_api_call(
        self,
        apicall_config: Dict[str, Any],
        memory: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        try:
            url = apicall_config.get("url", "")
            timeout = apicall_config.get("timeout", 5000) / 1000
            retry_count = apicall_config.get("retry", 3)
            formats = apicall_config.get("formats", {})
            method = formats.get("method", "POST").upper()
            request_template = formats.get("requestTemplate", "")
            request_data = None
            if request_template and method in ['POST', 'PUT', 'PATCH']:
                request_body = utils.process_template(request_template, memory)
                try:
                    request_data = json.loads(request_body)
                except json.JSONDecodeError as e:
                    logger.error(f"Invalid JSON in request template: {e}")
                    return None
            headers = {"Content-Type": "application/json"}
            custom_headers = formats.get("headers", {})
            if custom_headers:
                processed_headers = {}
                for key, value in custom_headers.items():
                    processed_value = utils.process_template(str(value), memory)
                    processed_headers[key] = processed_value
                    logger.info(f"🔧 Header processed: {key}: {value} -> {processed_value}")
                headers.update(processed_headers)
            logger.info(f"📡 Final headers: {headers}")
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
                    await asyncio.sleep(1)
            logger.error(f"API call failed after {retry_count + 1} attempts")
            return None
        except Exception as e:
            logger.error(f"Error executing API call: {e}")
            return None 