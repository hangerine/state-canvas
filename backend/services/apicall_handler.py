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
from services.transition_manager import TransitionManager

logger = logging.getLogger(__name__)

class ApiCallHandler(BaseHandler):
    def __init__(self, scenario_manager, transition_manager=None):
        self.scenario_manager = scenario_manager
        self.transition_manager = transition_manager or TransitionManager(scenario_manager)

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
        new_state = current_state
        for handler in apicall_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Apicall handler is not a dict: {handler}")
                continue
            try:
                apicall_name = handler.get("name")
                apicall_config = None
                # 우선 unified webhooks(type='apicall')에서 검색
                for ap in scenario.get("webhooks", []):
                    try:
                        if ap.get("type") == "apicall" and ap.get("name") == apicall_name:
                            apicall_config = {
                                "name": ap.get("name"),
                                "url": ap.get("url", ""),
                                "timeout": ap.get("timeout", ap.get("timeoutInMilliSecond", 5000)),
                                "retry": ap.get("retry", 3),
                                "formats": ap.get("formats", {})
                            }
                            break
                    except Exception:
                        continue
                # 레거시 apicalls fallback
                if not apicall_config:
                    for apicall in scenario.get("apicalls", []):
                        if apicall.get("name") == apicall_name:
                            apicall_config = apicall
                            break
                if not apicall_config:
                    logger.warning(f"No apicall config found for name: {apicall_name}")
                    continue
                logger.info(f"🚀 Executing API call: {handler.get('name', 'Unknown')}")
                logger.info(f"📋 Memory before API call: {memory}")
                response_data = await self.execute_api_call(apicall_config, memory)
                if response_data is None:
                    logger.warning(f"API call failed for handler: {handler}")
                    continue
                logger.info(f"📥 API response received: {response_data}")
                mappings = apicall_config.get("formats", {}).get("responseMappings", [])
                if not mappings:
                    logger.info("No response mappings defined, skipping response processing")
                    continue
                
                # 새로운 responseMappings 배열 구조 처리
                for mapping in mappings:
                    if not isinstance(mapping, dict):
                        logger.warning(f"Invalid mapping format: {mapping}")
                        continue
                    
                    mapping_type = mapping.get("type")
                    mapping_map = mapping.get("map")
                    
                    if not mapping_type or not mapping_map:
                        logger.warning(f"Invalid mapping structure: {mapping}")
                        continue
                    
                    # 메모리에 응답 데이터 매핑
                    for memory_key, jsonpath in mapping_map.items():
                        if not isinstance(jsonpath, str) or not jsonpath.startswith('$'):
                            logger.warning(f"Invalid JSONPath: {jsonpath}")
                            continue
                        
                        try:
                            # JSONPath를 사용하여 응답에서 값 추출
                            extracted_value = utils.extract_jsonpath_value(response_data, jsonpath)
                            if extracted_value is not None:
                                if mapping_type == "memory":
                                    memory[memory_key] = extracted_value
                                    logger.info(f"📝 Memory updated: {memory_key} = {extracted_value}")
                                elif mapping_type == "directive":
                                    # directive 타입은 향후 확장 가능
                                    logger.info(f"📝 Directive mapping: {memory_key} = {extracted_value}")
                                else:
                                    logger.warning(f"Unknown mapping type: {mapping_type}")
                            else:
                                logger.warning(f"JSONPath {jsonpath} not found in response")
                        except Exception as e:
                            logger.error(f"Error processing mapping {memory_key}: {jsonpath} - {str(e)}")
                            continue
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
                    condition_result = self.transition_manager.evaluate_condition(condition, memory)
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

    async def execute_api_call(self, apicall_config: Dict[str, Any], memory: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """API 호출 실행"""
        try:
            url = apicall_config.get("url", "")
            if not url:
                logger.error("API call URL is empty")
                return None

            # 기본 설정
            timeout = apicall_config.get("timeoutInMilliSecond", 5000)
            retry_count = apicall_config.get("retry", 0)
            formats = apicall_config.get("formats", {})
            
            # HTTP 메서드와 헤더
            method = formats.get("method", "POST").upper()
            headers = formats.get("headers", {})
            contentType = formats.get("contentType", "application/json")
            
            # Content-Type 헤더 자동 설정
            if contentType and "Content-Type" not in headers:
                headers["Content-Type"] = contentType
            
            # 쿼리 파라미터 처리
            query_params = formats.get("queryParams", [])
            if query_params:
                # 메모리 변수 치환
                processed_params = []
                for param in query_params:
                    name = param.get("name", "")
                    value = param.get("value", "")
                    if name:
                        # {$var} 형태의 변수 치환
                        processed_value = utils.replace_template_variables(value, memory)
                        processed_params.append((name, processed_value))
                
                # URL에 쿼리 파라미터 추가
                if processed_params:
                    from urllib.parse import urlencode
                    separator = '&' if '?' in url else '?'
                    url += separator + urlencode(processed_params)

            # 요청 본문 처리
            data = None
            if method in ["POST", "PUT", "PATCH"]:
                request_template = formats.get("requestTemplate")
                if request_template:
                    # 템플릿 변수 치환
                    processed_template = utils.replace_template_variables(request_template, memory)
                    try:
                        data = json.loads(processed_template)
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON in request template: {processed_template}")
                        data = processed_template
                


            # 재시도 로직
            last_exception = None
            for attempt in range(retry_count + 1):
                try:
                    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout/1000)) as session:
                        logger.info(f"API call attempt {attempt + 1}/{retry_count + 1}: {method} {url}")
                        
                        if method == "GET":
                            async with session.get(url, headers=headers) as response:
                                response.raise_for_status()
                                response_data = await response.json()
                        elif method == "DELETE":
                            async with session.delete(url, headers=headers) as response:
                                response.raise_for_status()
                                response_data = await response.json()
                        else:
                            async with session.request(method, url, headers=headers, json=data if contentType == "application/json" else data) as response:
                                response.raise_for_status()
                                response_data = await response.json()
                        
                        logger.info(f"API call successful: {response_data}")
                        return response_data
                        
                except Exception as e:
                    last_exception = e
                    if attempt < retry_count:
                        wait_time = (2 ** attempt) * 0.1  # 지수 백오프
                        logger.warning(f"API call attempt {attempt + 1} failed, retrying in {wait_time}s: {str(e)}")
                        await asyncio.sleep(wait_time)
                    else:
                        logger.error(f"API call failed after {retry_count + 1} attempts: {str(e)}")
            
            if last_exception:
                logger.error(f"Final API call error: {str(last_exception)}")
            return None
            
        except Exception as e:
            logger.error(f"Error executing API call: {str(e)}")
            return None 