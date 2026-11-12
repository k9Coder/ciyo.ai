"""Phase 0 probe: native latency of baseline A (mDeBERTa NLI) per check. Writes baseline_speed.json.

A can't ship, so this is informational: it re-reads the message once per rule in <=512-token windows.
"""
import json
import math
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModelForSequenceClassification

MODEL = "MoritzLaurer/mDeBERTa-v3-base-xnli-multilingual-nli-2mil7"
HERE = Path(__file__).resolve().parent
WINDOW, RULE_TOKENS = 512, 24
SCENARIOS = [(150, 5), (500, 5), (1000, 5), (1000, 10), (2000, 5)]


def export(out: Path) -> Path:
    model = AutoModelForSequenceClassification.from_pretrained(MODEL, torch_dtype=torch.float32).eval()
    ids = torch.ones(1, 16, dtype=torch.long)
    fp32, int8 = out / "baseline_fp32.onnx", out / "baseline_int8.onnx"
    torch.onnx.export(model, (ids, torch.ones_like(ids)), str(fp32), opset_version=18, dynamo=False,
                      input_names=["input_ids", "attention_mask"], output_names=["logits"],
                      dynamic_axes={"input_ids": {1: "S"}, "attention_mask": {1: "S"}, "logits": {}})
    quantize_dynamic(str(fp32), str(int8), weight_type=QuantType.QInt8, op_types_to_quantize=["MatMul", "Gather"])
    fp32.unlink()
    return int8


def check_ms(sess, message_tokens: int, rules: int, reps: int = 3) -> float:
    per_window = WINDOW - RULE_TOKENS - 3
    windows = max(1, math.ceil(message_tokens / per_window))
    seqs = [min(WINDOW, min(per_window, message_tokens - w * per_window) + RULE_TOKENS + 3) for w in range(windows)]
    feeds = [{"input_ids": np.ones((1, s), np.int64), "attention_mask": np.ones((1, s), np.int64)} for s in seqs]
    times = []
    for _ in range(reps + 1):
        t = time.perf_counter()
        for _ in range(rules):
            for f in feeds:
                sess.run(["logits"], f)
        times.append((time.perf_counter() - t) * 1000)
    return sorted(times[1:])[len(times[1:]) // 2]


def main():
    out = HERE / "artifacts"
    out.mkdir(exist_ok=True)
    path = export(out)
    so = ort.SessionOptions()
    so.enable_cpu_mem_arena = False
    sess = ort.InferenceSession(str(path), so)
    result = {"model": MODEL, "size_mb": path.stat().st_size / 1e6, "native_ms": {}}
    for tokens, rules in SCENARIOS:
        result["native_ms"][f"{tokens}tok_{rules}rules"] = round(check_ms(sess, tokens, rules))
        print(tokens, rules, result["native_ms"][f"{tokens}tok_{rules}rules"], "ms", flush=True)
    (HERE / "baseline_speed.json").write_text(json.dumps(result, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
