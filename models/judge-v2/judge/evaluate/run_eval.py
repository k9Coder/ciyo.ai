import argparse
import hashlib
import json
import subprocess
import sys
import time
from pathlib import Path

from judge.data.schema import Example, read_jsonl
from judge.evaluate.metrics import Row, gate_report
from judge.infer import OnnxJudge


def rows_for(judge: OnnxJudge, examples) -> list[Row]:
    rows = []
    for ex in examples:
        probs = judge.score(ex.message, list(ex.rules))
        pos = (judge.tok.char_to_token_index(ex.message, ex.violation_char_start)
               if ex.violation_char_start is not None else None)
        for p, t, c in zip(probs, ex.targets, ex.critical):
            label = int(t >= 0.5)
            late = (pos >= 500) if (label == 1 and pos is not None) else None
            rows.append(Row(p, label, c, ex.adversarial, late, ex.language))
    return rows


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def _git_commit() -> str:
    try:
        return subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.evaluate.run_eval")
    ap.add_argument("--model-dir", type=Path, required=True)
    ap.add_argument("--examples", type=Path, required=True)
    ap.add_argument("--baseline-report", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--log", type=Path, required=True)
    a = ap.parse_args(argv)
    judge = OnnxJudge(a.model_dir)
    rows = rows_for(judge, read_jsonl(a.examples, Example))
    baseline_f2 = json.loads(a.baseline_report.read_text(encoding="utf-8"))["test_f2"]
    report = gate_report(rows, judge.cfg.threshold, baseline_f2=baseline_f2)
    a.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    entry = {"ts": time.time(), "model_sha256": _sha256(a.model_dir / "judge.onnx"), "git_commit": _git_commit(),
             "examples": str(a.examples), "rows": len(rows), "report": report}
    with a.log.open("a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    print(json.dumps(report, indent=2))
    if not report["pass"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
