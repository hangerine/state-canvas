from backend.services.memory_manager import MemoryManager

def test_store_entities_to_memory_basic():
    mm = MemoryManager(None)
    entities = {"city": "Seoul"}
    memory = {}
    mm.store_entities_to_memory(entities, memory)
    assert memory["city"] == "Seoul"
    assert memory["city:city"] == "Seoul" 