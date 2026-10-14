import json
import shutil

import numpy as np
import pytest
import torch

from judge.backbone import Backbone, spec_to_json
from judge.config import JudgeConfig
from judge.export import export_model_dir
from judge.infer import OnnxJudge
from judge.model import JudgeModel, step_tensors
from judge.sequence import message_windows, single_pass
from judge.tokenize import JudgeTokenizer
from tests.conftest import TINY_WORDS, tiny_gemma3

CFG = JudgeConfig(model_version="t", base_model="tiny", temperature=1.5,
                  max_chunk_tokens=7, max_message_tokens=40, window_overlap_tokens=10)


@pytest.fixture()
def run_dir(tmp_path, tiny_tokenizer_dir):
    torch.manual_seed(4)
    model = JudgeModel(Backbone.from_hf_model(tiny_gemma3())).eval()
    d = tmp_path / "run"
    d.mkdir()
    torch.save(model.state_dict(), d / "best.pt")
    (d / "backbone_spec.json").write_text(json.dumps(spec_to_json(model.backbone.spec)), encoding="utf-8")
    CFG.save(d / "judge_config.json")
    shutil.copytree(tiny_tokenizer_dir, d / "tokenizer")
    return d


def _torch_probs(run_dir, message, rules):
    from judge.model import load_judge
    m = load_judge(run_dir)
    tok = JudgeTokenizer.load(run_dir / "tokenizer", CFG)
    msg = tok.message_ids(message)
    rule_ids = [tok.rule_ids(r) for r in rules]
    best = np.zeros(len(rules))
    for a, b in message_windows(len(msg), CFG.max_message_tokens, CFG.window_overlap_tokens):
        st = single_pass(tok.prefix_ids(), msg[a:b], rule_ids)
        k0, v0 = m.backbone.empty_past()
        with torch.no_grad():
            logits, _, _ = m(*step_tensors(st), k0, v0)
        probs = torch.softmax(logits[0, list(st.verdict_index)] / CFG.temperature, -1)[:, 1].numpy()
        best = np.maximum(best, probs)
    return best


RULES = ["this message discloses a password", "this message discloses a card number"]


def test_fp32_export_matches_torch(run_dir, tmp_path):
    out = export_model_dir(run_dir, tmp_path / "model", quantize=False)
    judge = OnnxJudge(out)
    msg = "please help me fix this bug in the database server log thanks"
    np.testing.assert_allclose(judge.score(msg, RULES), _torch_probs(run_dir, msg, RULES), atol=1e-4)


def test_long_message_scores_max_over_windows(run_dir, tmp_path):
    out = export_model_dir(run_dir, tmp_path / "model", quantize=False)
    judge = OnnxJudge(out)
    msg = " ".join(TINY_WORDS[i % 60] for i in range(130))
    assert len(judge.tok.message_ids(msg)) > CFG.max_message_tokens
    np.testing.assert_allclose(judge.score(msg, RULES), _torch_probs(run_dir, msg, RULES), atol=1e-4)


def test_violation_across_window_boundary_is_seen(run_dir, tmp_path):
    out = export_model_dir(run_dir, tmp_path / "model", quantize=False)
    judge = OnnxJudge(out)
    n = 130
    wins = message_windows(n, CFG.max_message_tokens, CFG.window_overlap_tokens)
    boundary = wins[0][1]
    span = (boundary - 4, boundary + 4)
    assert any(a <= span[0] and span[1] <= b for a, b in wins)


def test_empty_message_scores(run_dir, tmp_path):
    out = export_model_dir(run_dir, tmp_path / "model", quantize=False)
    probs = OnnxJudge(out).score("   ", RULES)
    assert len(probs) == 2 and all(0.0 <= p <= 1.0 for p in probs)


def test_int8_export_runs_and_writes_layout(run_dir, tmp_path):
    out = export_model_dir(run_dir, tmp_path / "model")
    for name in ["judge.onnx", "judge_config.json", "backbone_spec.json", "tokenizer_config.json"]:
        assert (out / name).exists(), name
    probs = OnnxJudge(out).score("hello can you review this code", RULES)
    assert all(0.0 <= p <= 1.0 for p in probs)


def test_no_rules_returns_empty(run_dir, tmp_path):
    out = export_model_dir(run_dir, tmp_path / "model", quantize=False)
    assert OnnxJudge(out).score("hello", []) == []
