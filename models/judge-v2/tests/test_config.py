import json

import pytest

from judge.config import INSTRUCTIONS, RULE_PREFIX, VERDICT_SUFFIX, JudgeConfig


def test_roundtrip(tmp_path):
    cfg = JudgeConfig(model_version="t1", base_model="tiny", temperature=1.3, threshold=0.4)
    path = tmp_path / "judge_config.json"
    cfg.save(path)
    assert JudgeConfig.load(path) == cfg
    data = json.loads(path.read_text(encoding="utf-8"))
    assert data["instructions"] == INSTRUCTIONS
    assert data["rule_prefix"] == RULE_PREFIX
    assert data["verdict_suffix"] == VERDICT_SUFFIX


def test_unknown_key_rejected(tmp_path):
    path = tmp_path / "judge_config.json"
    path.write_text(json.dumps({"model_version": "x", "base_model": "y", "bogus": 1}), encoding="utf-8")
    with pytest.raises(TypeError):
        JudgeConfig.load(path)


@pytest.mark.parametrize("kwargs", [
    {"temperature": 0.0},
    {"threshold": 0.0},
    {"threshold": 1.0},
    {"max_chunk_tokens": 0},
    {"window_overlap_tokens": 4096},
])
def test_invalid_values_rejected(kwargs):
    with pytest.raises(ValueError):
        JudgeConfig(model_version="x", base_model="y", **kwargs)
