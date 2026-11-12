import json
import shutil

import pytest
import torch

from judge.backbone import Backbone, spec_to_json
from judge.config import JudgeConfig
from judge.data.schema import Example, write_jsonl
from judge.evaluate.run_eval import main as eval_main, rows_for
from judge.export import export_model_dir
from judge.infer import OnnxJudge
from judge.model import JudgeModel
from tests.conftest import tiny_gemma3


@pytest.fixture()
def model_dir(tmp_path, tiny_tokenizer_dir):
    torch.manual_seed(5)
    m = JudgeModel(Backbone.from_hf_model(tiny_gemma3())).eval()
    run = tmp_path / "run"
    run.mkdir()
    torch.save(m.state_dict(), run / "best.pt")
    (run / "backbone_spec.json").write_text(json.dumps(spec_to_json(m.backbone.spec)))
    JudgeConfig(model_version="t", base_model="tiny", max_message_tokens=600).save(run / "judge_config.json")
    shutil.copytree(tiny_tokenizer_dir, run / "tokenizer")
    return export_model_dir(run, tmp_path / "model", quantize=False)


def _examples():
    long_msg = " ".join(["hello"] * 520) + " password"
    return [Example("m1", long_msg, "he", ("r1",), ("message discloses password",), (1.0,), (True,), True, len(long_msg) - 8),
            Example("m2", "hello thanks", "zh", ("r1",), ("message discloses password",), (0.0,), (True,), False, None)]


def test_rows_for_marks_language_and_late_violations(model_dir):
    rows = rows_for(OnnxJudge(model_dir), _examples())
    assert rows[0].late_violation is True and rows[0].label == 1 and rows[0].language == "he"
    assert rows[1].late_violation is None and rows[1].language == "zh"


def test_cli_writes_report_baseline_gate_and_log(model_dir, tmp_path):
    ex = tmp_path / "test.jsonl"
    write_jsonl(ex, _examples())
    base = tmp_path / "baseline_report.json"
    base.write_text(json.dumps({"test_f2": 0.42}))
    out, log = tmp_path / "report.json", tmp_path / "eval_log.jsonl"
    with pytest.raises(SystemExit):
        eval_main(["--model-dir", str(model_dir), "--examples", str(ex), "--baseline-report", str(base),
                   "--out", str(out), "--log", str(log)])
    report = json.loads(out.read_text())
    assert report["beats_baseline"]["bar"] == 0.42 and "recall_critical" in report
    entry = json.loads(log.read_text().splitlines()[-1])
    assert entry["rows"] == 2 and len(entry["model_sha256"]) == 64
