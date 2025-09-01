import logging
import json
import aiohttp
import asyncio
import time
import uuid
from typing import Dict, Any, Optional, List
from services import utils
from models.scenario import StateTransition
# from services.base_handler import BaseHandler  # 제거 - 기존 Handler는 BaseHandler 상속 불필요
from services.transition_manager import TransitionManager

logger = logging.getLogger(__name__)

class ApiCallHandler:
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
        
        results = []
        for handler in apicall_handlers:
            if not isinstance(handler, dict):
                logger.warning(f"Apicall handler is not a dict: {handler}")
                continue
                
            try:
                apicall_name = handler.get("name")
                apicall_config = handler.get("apicall", {})
                
                if not apicall_config:
                    logger.warning(f"No apicall config found for handler: {apicall_name}")
                    continue
                
                logger.info(f"🚀 Executing API call: {apicall_name}")
                logger.info(f"📋 Memory before API call: {memory}")
                
                # API 호출 실행
                response_data = await self.execute_api_call(apicall_config, memory)
                
                if response_data is None:
                    logger.warning(f"API call failed for handler: {apicall_name}")
                    continue
                
                logger.info(f"📥 API response received: {response_data}")
                
                # 응답 매핑 처리
                response_mappings = apicall_config.get("formats", {}).get("responseMappings", {})
                if response_mappings:
                    self._process_response_mappings(response_mappings, response_data, memory)
                
                results.append({
                    "name": apicall_name,
                    "response": response_data,
                    "config": apicall_config
                })
                
                # 🚀 핵심 수정: 조건 핸들러 처리 추가
                logger.info(f"[APICALL] Processing condition handlers after API call")
                condition_handlers = current_dialog_state.get("conditionHandlers", [])
                
                for cond_handler in condition_handlers:
                    if not isinstance(cond_handler, dict):
                        continue
                    
                    condition_statement = cond_handler.get("conditionStatement", "")
                    logger.info(f"[APICALL] Evaluating condition: '{condition_statement}'")
                    
                    # 조건 평가 (간단한 구현)
                    if condition_statement == "True" or condition_statement == '"True"':
                        cond_target = cond_handler.get("transitionTarget", {})
                        target_scenario = cond_target.get("scenario")
                        target_state = cond_target.get("dialogState")
                        
                        logger.info(f"[APICALL] Condition matched: '{condition_statement}' -> {target_scenario}.{target_state}")
                        
                        # 플랜 전이 확인
                        if target_scenario and target_scenario != "Main":  # 현재 플랜이 Main이라고 가정
                            logger.info(f"[APICALL] 🚨 PLAN TRANSITION DETECTED!")
                            logger.info(f"[APICALL] 🚨 target_scenario: {target_scenario}")
                            logger.info(f"[APICALL] 🚨 current plan: Main")
                            
                            # 플랜 전이 결과 반환
                            from services.base_handler import create_plan_transition_result
                            return create_plan_transition_result(
                                target_scenario, target_state,
                                [f"⚡ 조건 '{condition_statement}' 만족으로 플랜 전이: {target_scenario}"]
                            )
                        
                        # 일반 상태 전이
                        elif target_state and target_state != current_state:
                            from services.base_handler import create_state_transition_result
                            return create_state_transition_result(
                                target_state, 
                                [f"✅ API 호출 후 조건 '{condition_statement}' 매칭됨 → {target_state}"]
                            )
                
            except Exception as e:
                logger.error(f"Error processing apicall handler {handler}: {e}")
                continue
        
        return results if results else None

    async def process_apicall_handlers_with_transitions(self, current_dialog_state: Dict[str, Any], current_state: str, memory: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """API Call Handler 처리 (전이 포함)"""
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
                apicall_name = handler.get("name")
                apicall_config = handler.get("apicall", {})
                
                if not apicall_config:
                    logger.warning(f"No apicall config found for handler: {apicall_name}")
                    continue
                
                logger.info(f"🚀 Executing API call: {apicall_name}")
                logger.info(f"📋 Memory before API call: {memory}")
                
                # API 호출 실행
                response_data = await self.execute_api_call(apicall_config, memory)
                
                if response_data is None:
                    logger.warning(f"API call failed for handler: {apicall_name}")
                    continue
                
                logger.info(f"📥 API response received: {response_data}")
                
                # 응답 매핑 처리
                response_mappings = apicall_config.get("formats", {}).get("responseMappings", {})
                if response_mappings:
                    self._process_response_mappings(response_mappings, response_data, memory)
                
                # 🚀 핵심 수정: 조건 핸들러 처리 추가
                logger.info(f"[APICALL] Processing condition handlers after API call")
                condition_handlers = current_dialog_state.get("conditionHandlers", [])
                
                for cond_handler in condition_handlers:
                    if not isinstance(cond_handler, dict):
                        continue
                    
                    condition_statement = cond_handler.get("conditionStatement", "")
                    logger.info(f"[APICALL] Evaluating condition: '{condition_statement}'")
                    
                    # 조건 평가 (간단한 구현)
                    if condition_statement == "True" or condition_statement == '"True"':
                        cond_target = cond_handler.get("transitionTarget", {})
                        target_scenario = cond_target.get("scenario")
                        target_state = cond_target.get("dialogState")
                        
                        logger.info(f"[APICALL] Condition matched: '{condition_statement}' -> {target_scenario}.{target_state}")
                        
                        # 플랜 전이 확인
                        if target_scenario and target_scenario != "Main":  # 현재 플랜이 Main이라고 가정
                            logger.info(f"[APICALL] 🚨 PLAN TRANSITION DETECTED!")
                            logger.info(f"[APICALL] 🚨 target_scenario: {target_scenario}")
                            logger.info(f"[APICALL] 🚨 current plan: Main")
                            
                            # 플랜 전이 결과 반환
                            return {
                                "type": "plan_transition",
                                "target_plan": target_scenario,
                                "target_state": target_state,
                                "message": f"⚡ 조건 '{condition_statement}' 만족으로 플랜 전이: {target_scenario}"
                            }
                        
                        # 일반 상태 전이
                        elif target_state and target_state != current_state:
                            return {
                                "type": "state_transition",
                                "target_state": target_state,
                                "message": f"✅ API 호출 후 조건 '{condition_statement}' 매칭됨 → {target_state}"
                            }
                
            except Exception as e:
                logger.error(f"Error processing apicall handler {handler}: {e}")
                continue
        
        return None

    def _process_response_mappings(self, response_mappings: Dict[str, Any], response_data: Dict[str, Any], memory: Dict[str, Any]):
        """응답 매핑 처리 (시나리오 구조에 맞춤)"""
        
        logger.info(f"📋 Processing response mappings: {response_mappings}")
        
        for memory_key, mapping_config in response_mappings.items():
            try:
                # 새로운 구조: {"type": "memory", "NLU_INTENT": "$.NLU_INTENT.value"}
                if isinstance(mapping_config, dict) and "type" in mapping_config:
                    mapping_type = mapping_config.get("type")
                    jsonpath_expr = None
                    
                    # memory 타입인 경우 memory_key와 일치하는 키를 찾아서 JSONPath 추출
                    if mapping_type == "memory":
                        for key, value in mapping_config.items():
                            if key != "type" and isinstance(value, str):
                                jsonpath_expr = value
                                break
                    elif mapping_type == "directive":
                        # directive 타입인 경우 memory_key와 일치하는 키를 찾아서 JSONPath 추출
                        for key, value in mapping_config.items():
                            if key != "type" and isinstance(value, str):
                                jsonpath_expr = value
                                break
                    
                    if not jsonpath_expr:
                        logger.warning(f"❌ No JSONPath found in mapping config for {memory_key}: {mapping_config}")
                        continue
                        
                    logger.info(f"🔍 Processing {mapping_type} mapping: {memory_key} <- {jsonpath_expr}")
                    
                else:
                    # 기존 구조: "NLU_INTENT": "$.NLU_INTENT.value"
                    if not isinstance(mapping_config, str):
                        logger.warning(f"❌ Invalid mapping config for {memory_key}: {mapping_config}")
                        continue
                    jsonpath_expr = mapping_config
                    mapping_type = "memory"  # 기본값
                    logger.info(f"🔍 Processing legacy mapping: {memory_key} <- {jsonpath_expr}")
                
                # JSONPath를 사용하여 응답에서 값 추출
                value = self._extract_value_from_response(response_data, jsonpath_expr)
                
                if value is not None:
                    if mapping_type == "memory":
                        # 메모리 슬롯에 저장
                        memory[memory_key] = value
                        logger.info(f"✅ Mapped to memory {memory_key} <- {jsonpath_expr}: {value}")
                    
                    elif mapping_type == "directive":
                        # 지시사항으로 처리 (필요시 구현)
                        logger.info(f"📋 Response directive mapping: {memory_key} = {value}")
                        
            except Exception as e:
                logger.error(f"Error processing response mapping {memory_key}: {e}")

    def _extract_value_from_response(self, response: Dict[str, Any], json_path: str) -> Any:
        """JSON 응답에서 특정 경로의 값 추출"""
        try:
            if not json_path.startswith("$."):
                return response.get(json_path)
            
            # JSONPath 표현식 처리 (예: $.NLU_INTENT.value)
            path_parts = json_path[2:].split(".")
            current = response
            
            for part in path_parts:
                if isinstance(current, dict) and part in current:
                    current = current[part]
                else:
                    return None
            
            return current
            
        except Exception as e:
            logger.error(f"Error extracting value from response: {e}")
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