import pytest
from backend.services import utils

def test_normalize_response_value_basic():
    assert utils.normalize_response_value(None) is None
    assert utils.normalize_response_value(123) == 123
    assert utils.normalize_response_value("abc") == "abc"
    assert utils.normalize_response_value([1]) == 1
    assert utils.normalize_response_value({"value": 5}) == 5
    assert utils.normalize_response_value({"a": 10}) == 10
    assert utils.normalize_response_value([1,2]) == [1,2]
    assert utils.normalize_response_value({"a": 1, "b": 2}) == {"a": 1, "b": 2}

def test_get_all_paths():
    obj = {"a": {"b": [1,2]}, "c": 3}
    paths = utils.get_all_paths(obj)
    assert "$.a.b[0]" in paths
    assert "$.c" in paths

def test_process_template_basic():
    template = "Hello {{sessionId}}!"
    memory = {"sessionId": "abc123"}
    result = utils.process_template(template, memory)
    assert result == "Hello abc123!"

    template2 = "Value: {{memorySlots.foo.value.[0]}}"
    memory2 = {"foo": [42]}
    result2 = utils.process_template(template2, memory2)
    assert result2 == "Value: 42"

    template3 = "User: {{USER_TEXT_INPUT.0}}"
    memory3 = {"USER_TEXT_INPUT": ["hi"]}
    result3 = utils.process_template(template3, memory3)
    assert result3 == "User: hi"

# apply_response_mappings는 jsonpath_ng가 필요하므로, 간단한 케이스만 테스트
@pytest.mark.skip(reason="jsonpath_ng 설치 필요 및 복잡한 mocking 필요")
def test_apply_response_mappings():
    response_data = {"foo": {"bar": 1}}
    mappings = {"x": "$.foo.bar"}
    memory = {}
    utils.apply_response_mappings(response_data, mappings, memory)
    assert memory["x"] == 1 