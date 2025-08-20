import logging
from typing import Any, Dict
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

def apply_response_mappings(response_data: Dict[str, Any], mappings: Dict[str, str], memory: Dict[str, Any]) -> None:
    logger.info(f"📋 Applying response mappings to data: {response_data}")
    logger.info(f"📋 Mappings: {mappings}")
    for memory_key, jsonpath_expr in mappings.items():
        try:
            jsonpath_parser = parse(jsonpath_expr)
            matches = jsonpath_parser.find(response_data)
            if matches:
                raw_value = matches[0].value
                processed_value = normalize_response_value(raw_value)
                memory[memory_key] = processed_value
                logger.info(f"✅ Mapped {memory_key} <- {jsonpath_expr}: {processed_value} (raw: {raw_value})")
            else:
                logger.warning(f"❌ No matches found for JSONPath: {jsonpath_expr}")
                logger.info(f"🔍 Available paths in response: {get_all_paths(response_data)}")
        except Exception as e:
            logger.error(f"❌ Error processing JSONPath {jsonpath_expr}: {e}")

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