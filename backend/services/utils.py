import logging
from typing import Any, Dict, Optional, List
from jsonpath_ng import parse
import re
import uuid
import json

logger = logging.getLogger(__name__)

def normalize_response_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        if 'value' in value:
            logger.info(f"🔄 Found 'value' field in object, extracting: {value['value']}")
            return normalize_response_value(value['value'])
        elif len(value) == 1:
            key, val = next(iter(value.items()))
            logger.info(f"🔄 Single key-value pair, extracting value: {val}")
            return normalize_response_value(val)
        else:
            return value
    if isinstance(value, list):
        if len(value) == 1:
            logger.info(f"🔄 Single element array, extracting element: {value[0]}")
            return normalize_response_value(value[0])
        else:
            return value
    return str(value)

def apply_response_mappings(response_data: Dict[str, Any], mappings: Dict[str, Any], memory: Dict[str, Any], directive_queue: Optional[List[Dict[str, Any]]] = None) -> None:
    logger.info(f"📋 Applying response mappings to data: {response_data}")
    logger.info(f"📋 Mappings: {mappings}")
    
    for memory_key, mapping_config in mappings.items():
        try:
            # 새로운 구조: {"type": "memory", "NLU_INTENT": "$.NLU_INTENT.value"}
            if isinstance(mapping_config, dict) and "type" in mapping_config:
                mapping_type = mapping_config.get("type")
                jsonpath_expr = None
                
                # memory 타입인 경우 memory_key를 찾아서 JSONPath 추출
                if mapping_type == "memory":
                    # memory_key와 일치하는 키를 찾아서 JSONPath 추출
                    for key, value in mapping_config.items():
                        if key != "type" and isinstance(value, str):
                            jsonpath_expr = value
                            break
                elif mapping_type == "directive":
                    # directive 타입인 경우 memory_key를 찾아서 JSONPath 추출
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
                jsonpath_expr = mapping_config
                mapping_type = "memory"  # 기본값
                logger.info(f"🔍 Processing legacy mapping: {memory_key} <- {jsonpath_expr}")
            
            # JSONPath 파싱 및 실행
            jsonpath_parser = parse(jsonpath_expr)
            matches = jsonpath_parser.find(response_data)
            
            if matches:
                raw_value = matches[0].value
                processed_value = normalize_response_value(raw_value)
                
                if mapping_type == "memory":
                    memory[memory_key] = processed_value
                    logger.info(f"✅ Mapped to memory {memory_key} <- {jsonpath_expr}: {processed_value} (raw: {raw_value})")
                elif mapping_type == "directive":
                    # directive 타입인 경우 directive_queue에 추가
                    if directive_queue is not None:
                        directive_data = {
                            "key": memory_key,
                            "value": processed_value,
                            "source": "apicall_response_mapping"
                        }
                        directive_queue.append(directive_data)
                        logger.info(f"✅ Added to directive queue: {memory_key} <- {jsonpath_expr}: {processed_value} (raw: {raw_value})")
                    else:
                        # directive_queue가 없으면 memory에 저장
                        memory[f"DIRECTIVE_{memory_key}"] = processed_value
                        logger.info(f"✅ Mapped to directive (no queue): {memory_key} <- {jsonpath_expr}: {processed_value} (raw: {raw_value})")
                else:
                    # 기본적으로 memory에 저장
                    memory[memory_key] = processed_value
                    logger.info(f"✅ Mapped {memory_key} <- {jsonpath_expr}: {processed_value} (raw: {raw_value})")
            else:
                logger.warning(f"❌ No matches found for JSONPath: {jsonpath_expr}")
                logger.info(f"🔍 Available paths in response: {get_all_paths(response_data)}")
                
        except Exception as e:
            logger.error(f"❌ Error processing mapping for {memory_key}: {e}")

def get_all_paths(obj: Any, path: str = '$') -> list:
    paths = []
    if obj is None:
        return [path]
    if isinstance(obj, dict):
        paths.append(path)
        for key, value in obj.items():
            new_path = f"{path}.{key}" if path != '$' else f"$.{key}"
            paths.extend(get_all_paths(value, new_path))
    elif isinstance(obj, list):
        paths.append(path)
        for index, value in enumerate(obj):
            new_path = f"{path}[{index}]"
            paths.extend(get_all_paths(value, new_path))
    else:
        paths.append(path)
    return paths

def process_template(template: str, memory: Dict[str, Any]) -> str:
    result = template
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
    
    # {$sessionId} 처리 (새로운 내부 치환 구문)
    session_id = memory.get("sessionId", "")
    result = result.replace("{$sessionId}", session_id)
    
    # {$requestId} 처리 (새로운 내부 치환 구문)
    if "{$requestId}" in result:
        request_id = memory.get("requestId", "")
        if not request_id:
            request_id = f"req-{uuid.uuid4().hex[:8]}"
            memory["requestId"] = request_id
            logger.info(f"🆔 Generated new requestId: {request_id}")
        result = result.replace("{$requestId}", request_id)
    
    # {{sessionId}} 처리 (기존 구문 호환성 유지)
    result = result.replace("{{sessionId}}", session_id)
    
    # {{requestId}} 처리 (기존 구문 호환성 유지)
    if "{{requestId}}" in result:
        request_id = memory.get("requestId", "")
        if not request_id:
            request_id = f"req-{uuid.uuid4().hex[:8]}"
            memory["requestId"] = request_id
            logger.info(f"🆔 Generated new requestId: {request_id}")
        result = result.replace("{{requestId}}", request_id)
    
    # {{USER_TEXT_INPUT.0}} 또는 {{USER_TEXT_INPUT.[0]}} 형태 처리 (기존 호환성 유지)
    pattern = r'\{\{USER_TEXT_INPUT\.?\[?(\d+)\]?\}\}'
    matches = re.findall(pattern, result)
    for index in matches:
        user_input_list = memory.get("USER_TEXT_INPUT", [])
        if isinstance(user_input_list, list) and len(user_input_list) > int(index):
            replacement = str(user_input_list[int(index)])
        else:
            replacement = ""
        result = result.replace(f"{{{{USER_TEXT_INPUT.{index}}}}}", replacement)
        result = result.replace(f"{{{{USER_TEXT_INPUT.[{index}]}}}}", replacement)
    
    # {$key} 형태 처리 (새로운 내부 치환 구문)
    pattern = r'\{\$([^}]+)\}'
    matches = re.findall(pattern, result)
    for key in matches:
        if key in memory:
            value = str(memory[key]) if memory[key] is not None else ""
            result = result.replace(f"{{${key}}}", value)
            logger.info(f"🔄 Template replacement: {{${key}}} -> {value}")
    
    # 기존 {{key}} 형태 처리 (호환성 유지)
    pattern = r'\{\{([^}]+)\}\}'
    matches = re.findall(pattern, result)
    for key in matches:
        if key in ['sessionId', 'requestId'] or key.startswith('USER_TEXT_INPUT') or key.startswith('memorySlots'):
            continue
        if key in memory:
            value = str(memory[key]) if memory[key] is not None else ""
            result = result.replace(f"{{{{{key}}}}}", value)
            logger.info(f"🔄 Template replacement: {{{{{key}}}}} -> {value}")
    
    logger.info(f"📝 Template processing: '{template}' -> '{result}'")
    return result 

def replace_template_variables(template: str, memory: Dict[str, Any]) -> str:
    """템플릿 문자열의 변수를 메모리 값으로 치환"""
    if not isinstance(template, str):
        return str(template)
    
    def replace_var(match):
        var_name = match.group(1)
        if var_name in memory:
            return str(memory[var_name])
        else:
            # {$var} 형태의 변수가 메모리에 없으면 빈 문자열로 치환
            return ""
    
    # {$var} 형태의 변수 치환
    result = re.sub(r'\{(\$[^}]+)\}', replace_var, template)
    
    # {{var}} 형태의 변수 치환 (기존 호환성)
    result = re.sub(r'\{\{([^}]+)\}\}', replace_var, result)
    
    return result

def extract_jsonpath_value(data: Any, jsonpath_expr: str) -> Any:
    """JSONPath 표현식을 사용하여 데이터에서 값 추출"""
    try:
        jsonpath_parser = parse(jsonpath_expr)
        matches = jsonpath_parser.find(data)
        
        if matches:
            raw_value = matches[0].value
            return normalize_response_value(raw_value)
        else:
            return None
    except Exception as e:
        logger.error(f"Error extracting JSONPath {jsonpath_expr}: {str(e)}")
        return None 