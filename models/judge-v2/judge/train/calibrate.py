import argparse
import dataclasses
from pathlib import Path

import numpy as np
import torch

from judge.config import JudgeConfig
from judge.data.schema import Example, read_jsonl
from judge.evaluate.metrics import Row, recall
from judge.model import load_judge, step_tensors
from judge.sequence import single_pass
from judge.tokenize import JudgeTokenizer


def _soft_nll(logits: np.ndarray, targets: np.ndarray, t: float) -> float:
    z = logits / t
    z = z - z.max(1, keepdims=True)
    logp = z - np.log(np.exp(z).sum(1, keepdims=True))
    return float(-(targets * logp[:, 1] + (1 - targets) * logp[:, 0]).mean())


def fit_temperature(logits: np.ndarray, targets: np.ndarray) -> float:
    grid = np.exp(np.linspace(np.log(0.25), np.log(4.0), 400))
    return float(min(grid, key=lambda t: _soft_nll(logits, targets, t)))


def choose_threshold(rows, min_recall_critical: float = 0.95, min_recall_overall: float = 0.90) -> float:
    crit = [r for r in rows if r.critical]
    for thr in sorted({r.p for r in rows}, reverse=True):
        if recall(rows, thr) >= min_recall_overall and (not crit or recall(crit, thr) >= min_recall_critical):
            return float(thr)
    return float(min(r.p for r in rows))


def val_logits(run_dir: Path, examples: list[Example]):
    model = load_judge(run_dir)
    cfg = JudgeConfig.load(run_dir / "judge_config.json")
    remap = run_dir / cfg.vocab_remap_file if cfg.vocab_remap_file else None
    tok = JudgeTokenizer.load(run_dir / "tokenizer", cfg, remap)
    prefix = tok.prefix_ids()
    logits, targets, crit = [], [], []
    k0, v0 = model.backbone.empty_past()
    for ex in examples:
        msg = tok.message_ids(ex.message)
        if len(msg) > cfg.max_message_tokens:
            continue
        st = single_pass(prefix, msg, [tok.rule_ids(r) for r in ex.rules])
        with torch.no_grad():
            out, _, _ = model(*step_tensors(st), k0, v0)
        logits.append(out[0, list(st.verdict_index)].numpy())
        targets.extend(ex.targets)
        crit.extend(ex.critical)
    return np.concatenate(logits), np.asarray(targets), crit, cfg


def onnx_val_logits(model_dir: Path, examples: list[Example]):
    """Validation logits from the exported model, so calibration matches the quantized scores we ship."""
    from judge.infer import OnnxJudge
    judge = OnnxJudge(model_dir)
    cfg = judge.cfg
    judge.cfg = dataclasses.replace(cfg, temperature=1.0)
    logits, targets, crit = [], [], []
    for ex in examples:
        probs = np.clip(np.asarray(judge.score(ex.message, list(ex.rules)), dtype=np.float64), 1e-7, 1 - 1e-7)
        logits.append(np.stack([np.zeros_like(probs), np.log(probs / (1 - probs))], 1))
        targets.extend(ex.targets)
        crit.extend(ex.critical)
    return np.concatenate(logits), np.asarray(targets), crit, cfg


def main(argv=None):
    ap = argparse.ArgumentParser(prog="judge.train.calibrate")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--run-dir", type=Path)
    src.add_argument("--model-dir", type=Path, help="calibrate the exported (quantized) model in place")
    ap.add_argument("--data", type=Path, required=True)
    a = ap.parse_args(argv)
    examples = read_jsonl(a.data / "val.jsonl", Example)
    target_dir = a.model_dir or a.run_dir
    logits, targets, crit, cfg = (onnx_val_logits if a.model_dir else val_logits)(target_dir, examples)
    t = fit_temperature(logits, targets)
    z = logits / t
    z = z - z.max(1, keepdims=True)
    probs = np.exp(z[:, 1]) / np.exp(z).sum(1)
    rows = [Row(float(p), int(y >= 0.5), c, False, None) for p, y, c in zip(probs, targets, crit)]
    # A hair below the boundary score: runtime float32 scores must not round under the chosen threshold.
    thr = min(max(choose_threshold(rows) - 1e-6, 1e-4), 1 - 1e-4)
    dataclasses.replace(cfg, temperature=t, threshold=thr).save(target_dir / "judge_config.json")
    print(f"temperature={t:.3f} threshold={thr:.4f}")


if __name__ == "__main__":
    main()
