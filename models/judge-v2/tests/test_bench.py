import json
import shutil

import pytest
import torch

from judge.backbone import Backbone, spec_to_json
from judge.bench.gates import check
from judge.bench.make_inputs import SCENARIOS, main as make_inputs_main
from judge.config import JudgeConfig
from judge.export import export_model_dir
from judge.model import JudgeModel
from tests.conftest import tiny_gemma3


def test_scenarios_mirror_spec_gates():
    gated = {(s["platform"], s["kind"], s["tokens"], s["rules"]): s["gate_ms"] for s in SCENARIOS if s["gate_ms"]}
    assert gated == {
        ("web", "send_after_typing", 2000, 10): 2000,
        ("web", "paste_then_send", 1000, 5): 5000,
        ("native", "paste_then_send", 1000, 10): 2000,
        ("native", "paste_then_send", 2000, 5): 5000,
    }


def test_make_inputs_tokenizes_to_exact_lengths(tmp_path, tiny_tokenizer_dir):
    torch.manual_seed(6)
    m = JudgeModel(Backbone.from_hf_model(tiny_gemma3())).eval()
    run = tmp_path / "run"
    run.mkdir()
    torch.save(m.state_dict(), run / "best.pt")
    (run / "backbone_spec.json").write_text(json.dumps(spec_to_json(m.backbone.spec)))
    JudgeConfig(model_version="t", base_model="tiny").save(run / "judge_config.json")
    shutil.copytree(tiny_tokenizer_dir, run / "tokenizer")
    model = export_model_dir(run, tmp_path / "model", quantize=False)
    out = tmp_path / "inputs.json"
    make_inputs_main(["--model-dir", str(model), "--out", str(out)])
    data = json.loads(out.read_text())
    assert data["layers"] == 3 and data["chunk"] == 500 and data["prefixIds"][0] == 1
    for sc in data["scenarios"]:
        assert len(sc["messageIds"]) == sc["tokens"] and len(sc["ruleIds"]) == sc["rules"]


def test_check_gates():
    native = {"platform": "native", "peak_rss_mb": 380,
              "scenarios": [{"name": "a", "ms": 1500, "gate_ms": 2000}, {"name": "b", "ms": 900, "gate_ms": None}]}
    web = {"platform": "web", "scenarios": [{"name": "c", "ms": 5200, "gate_ms": 5000}]}
    rep = check([native, web], model_size_mb=132)
    assert rep["scenarios"]["a"]["pass"] and "b" not in rep["scenarios"]
    assert not rep["scenarios"]["c"]["pass"] and not rep["pass"]
    assert rep["peak_rss_mb"]["pass"] and rep["size_mb"]["pass"]
    assert not check([dict(native, peak_rss_mb=420)], 132)["pass"]
    assert not check([native], 150)["pass"]
