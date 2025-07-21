import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

class MemoryManager:
    def __init__(self, scenario_manager):
        self.scenario_manager = scenario_manager

    def store_entities_to_memory(self, entities: Dict[str, Any], memory: Dict[str, Any]) -> None:
        if not entities:
            return
        logger.info(f"🏷️ Storing entities to memory: {entities}")
        if "NLU_RESULT" in memory:
            nlu_result = memory.get("NLU_RESULT", {})
            results = nlu_result.get("results", [])
            if results and len(results) > 0:
                nlu_nbest = results[0].get("nluNbest", [])
                if nlu_nbest and len(nlu_nbest) > 0:
                    nlu_entities = nlu_nbest[0].get("entities", [])
                    for entity in nlu_entities:
                        if isinstance(entity, dict):
                            entity_type = entity.get("type", "")
                            entity_text = entity.get("text", "")
                            entity_role = entity.get("role", "")
                            if entity_type and entity_text:
                                if entity_role:
                                    key = f"{entity_type}:{entity_role}"
                                else:
                                    key = f"{entity_type}:{entity_type}"
                                memory[key] = entity_text
                                memory[entity_type] = entity_text
                                logger.info(f"🏷️ Entity stored: {key} = {entity_text}")
        for entity_type, entity_value in entities.items():
            if entity_type and entity_value:
                key = f"{entity_type}:{entity_type}"
                memory[key] = entity_value
                memory[entity_type] = entity_value
                logger.info(f"🏷️ Legacy entity stored: {key} = {entity_value}") 