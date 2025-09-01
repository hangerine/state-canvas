import logging
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger(__name__)

class NLUProcessor:
    def __init__(self, scenario_manager, transition_manager):
        self.scenario_manager = scenario_manager
        self.transition_manager = transition_manager

    def get_nlu_results(self, user_input: str, memory: Dict[str, Any], scenario: Optional[Dict[str, Any]] = None, current_state: str = "") -> Tuple[str, Dict[str, Any]]:
        nlu_result = memory.get("NLU_RESULT")
        if nlu_result and isinstance(nlu_result, dict):
            try:
                results = nlu_result.get("results", [])
                if results and len(results) > 0:
                    nlu_nbest = results[0].get("nluNbest", [])
                    if nlu_nbest and len(nlu_nbest) > 0:
                        first_result = nlu_nbest[0]
                        base_intent = first_result.get("intent", "Fallback.Unknown")
                        entities = {}
                        nlu_entities = first_result.get("entities", [])
                        for entity in nlu_entities:
                            if isinstance(entity, dict):
                                entity_type = entity.get("type", "")
                                entity_text = entity.get("text", "")
                                if entity_type and entity_text:
                                    entities[entity_type] = entity_text
                        final_intent = self.apply_dm_intent_mapping(base_intent, current_state, memory, scenario)
                        logger.info(f"🧠 NLU result: base_intent='{base_intent}', final_intent='{final_intent}', entities={entities}")
                        return final_intent, entities
            except Exception as e:
                logger.warning(f"Error parsing NLU result: {e}")
        logger.info("⚠️ No NLU result found, returning default values")
        return "NO_INTENT_FOUND", {}

    def apply_dm_intent_mapping(self, base_intent: str, current_state: str, memory: Dict[str, Any], scenario: Optional[Dict[str, Any]] = None) -> str:
        logger.info(f"🔍 DM Intent mapping - base_intent: {base_intent}, current_state: {current_state}")
        logger.info(f"🔍 Current memory: {memory}")
        intent_mappings = []
        intent_mappings.extend(getattr(self.scenario_manager, 'global_intent_mapping', []))
        if scenario:
            intent_mappings.extend(scenario.get("intentMapping", []))
        logger.info(f"🔍 Found {len(intent_mappings)} total intent mappings (global: {len(getattr(self.scenario_manager, 'global_intent_mapping', []))}, scenario: {len(scenario.get('intentMapping', []) if scenario else [])})")
        for i, mapping in enumerate(intent_mappings):
            try:
                logger.info(f"🔍 Checking mapping {i+1}: {mapping}")
                mapping_scenario = mapping.get("scenario", "")
                mapping_state = mapping.get("dialogState", "")
                logger.info(f"🔍 State check - mapping_state: {mapping_state}, current_state: {current_state}")
                if mapping_state and mapping_state != current_state:
                    logger.info(f"🔍 State mismatch - skipping mapping {i+1}")
                    continue
                mapped_intents = mapping.get("intents", [])
                logger.info(f"🔍 Intent check - mapped_intents: {mapped_intents}, base_intent: {base_intent}")
                if base_intent not in mapped_intents:
                    logger.info(f"🔍 Intent not in mapped list - skipping mapping {i+1}")
                    continue
                condition_statement = mapping.get("conditionStatement", "")
                logger.info(f"🔍 Condition check - condition: {condition_statement}")
                if condition_statement:
                    # 🚀 추가: 조건 평가 전 메모리 상태 상세 로깅
                    logger.info(f"🔍 [DM DEBUG] Memory before condition evaluation: {memory}")
                    logger.info(f"🔍 [DM DEBUG] negInterSentence value: {memory.get('negInterSentence', 'NOT_FOUND')}")
                    
                    condition_result = self.transition_manager.evaluate_condition(condition_statement, memory)
                    logger.info(f"🔍 Condition result: {condition_result}")
                    if not condition_result:
                        logger.info(f"🔍 Condition not met - skipping mapping {i+1}")
                        continue
                dm_intent = mapping.get("dmIntent", "")
                if dm_intent:
                    logger.info(f"🎯 DM Intent mapping applied: {base_intent} -> {dm_intent} (state: {current_state})")
                    return dm_intent
            except Exception as e:
                logger.warning(f"Error applying DM intent mapping: {e}")
        logger.info(f"🔍 No mapping found - returning original intent: {base_intent}")
        return base_intent 