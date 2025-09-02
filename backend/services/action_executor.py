import logging
from typing import Dict, Any, Optional, List
import re

logger = logging.getLogger(__name__)

class ActionExecutor:
    def __init__(self, scenario_manager):
        self.scenario_manager = scenario_manager

    def execute_entry_action(self, scenario: Dict[str, Any], state_name: str) -> Optional[str]:
        logger.info(f"Executing entry action for state: {state_name}")
        
        # 현재 시나리오의 모든 플랜에서 상태를 검색
        found_plan_name: Optional[str] = None
        dialog_state: Optional[Dict[str, Any]] = None
        for plan in scenario.get("plan", []):
            plan_name = plan.get("name")
            logger.info(f"🔍 Checking plan: {plan_name}")
            for ds in plan.get("dialogState", []):
                if ds.get("name") == state_name:
                    dialog_state = ds
                    found_plan_name = plan_name
                    break
            if dialog_state:
                break

        # 플랜 순회에서 못 찾으면 ScenarioManager에 위임해 광범위 검색
        if not dialog_state:
            logger.info(f"🔍 State not found during plan scan, delegating to scenario_manager.find_dialog_state")
            dialog_state = self.scenario_manager.find_dialog_state(scenario, state_name)
            if dialog_state:
                # 찾은 플랜명을 로깅용으로 추정
                for plan in scenario.get("plan", []):
                    if any(s.get("name") == state_name for s in plan.get("dialogState", [])):
                        found_plan_name = plan.get("name")
                        break

        if not dialog_state:
            logger.info(f"❌ Dialog state not found: {state_name}")
            return None

        logger.info(f"✅ Found dialog state in plan '{found_plan_name or 'Unknown'}': {dialog_state}")
        if not dialog_state:
            logger.info(f"❌ Dialog state not found: {state_name}")
            return None
        entry_action = dialog_state.get("entryAction")
        if not entry_action:
            logger.info(f"❌ No entry action for state: {state_name}")
            return None
        logger.info(f"✅ Entry action: {entry_action}, type: {type(entry_action)}")
        if not isinstance(entry_action, dict):
            logger.warning(f"⚠️ Entry action is not a dict: {entry_action}")
            return None
        
        return self._process_entry_action(entry_action, state_name)
    
    def _process_entry_action(self, entry_action: Dict[str, Any], state_name: str) -> Optional[str]:
        """Entry action 처리"""
        directives = entry_action.get("directives", [])
        logger.info(f"Directives: {directives}")
        messages = []
        for directive in directives:
            logger.info(f"Processing directive: {directive}, type: {type(directive)}")
            if not isinstance(directive, dict):
                logger.warning(f"Directive is not a dict: {directive}")
                continue
            
            # 🚀 핵심 수정: speak 타입 directive 처리 추가
            directive_name = directive.get("name", "")
            if directive_name == "speak":
                # speak 타입 directive 처리
                content = directive.get("content", "")
                if content:
                    messages.append(content)
                    logger.info(f"Speak directive content: {content}")
                continue
            
            # 기존 customPayload 타입 directive 처리
            content = directive.get("content", {})
            logger.info(f"Content: {content}, type: {type(content)}")
            if not isinstance(content, dict):
                logger.warning(f"Content is not a dict: {content}")
                continue
            items = content.get("item", [])
            logger.info(f"Items: {items}")
            for item in items:
                logger.info(f"Processing item: {item}, type: {type(item)}")
                if not isinstance(item, dict):
                    logger.warning(f"Item is not a dict: {item}")
                    continue
                section = item.get("section", {})
                logger.info(f"Section: {section}, type: {type(section)}")
                if not isinstance(section, dict):
                    logger.warning(f"Section is not a dict: {section}")
                    continue
                section_items = section.get("item", [])
                logger.info(f"Section items: {section_items}")
                for section_item in section_items:
                    logger.info(f"Processing section item: {section_item}, type: {type(section_item)}")
                    if not isinstance(section_item, dict):
                        logger.warning(f"Section item is not a dict: {section_item}")
                        continue
                    text_data = section_item.get("text", {})
                    logger.info(f"Text data: {text_data}, type: {type(text_data)}")
                    if not isinstance(text_data, dict):
                        logger.warning(f"Text data is not a dict: {text_data}")
                        continue
                    text_content = text_data.get("text", "")
                    logger.info(f"Text content: {text_content}")
                    if text_content:
                        clean_text = re.sub(r'<[^>]+>', '', text_content)
                        messages.append(clean_text)
        
        result = f"🤖 {'; '.join(messages)}" if messages else None
        logger.info(f"Entry action result: {result}")
        return result

    def execute_prompt_action(self, action: Dict[str, Any], memory: Dict[str, Any]) -> Optional[str]:
        directives = action.get("directives", [])
        if not directives:
            return None
        first_directive = directives[0]
        content = first_directive.get("content", {})
        if "text" in content:
            return content["text"]
        item = content.get("item", [])
        if item and len(item) > 0:
            first_item = item[0]
            section = first_item.get("section", {})
            section_items = section.get("item", [])
            if section_items and len(section_items) > 0:
                text_item = section_items[0].get("text", {})
                return text_item.get("text", "")
        return None 
