import sys
import json
import time
import numpy as np
import onnxruntime as ort
from transformers import AutoTokenizer

MODEL_FILE = sys.argv[1] if len(sys.argv) > 1 else "deberta_judge_vocabpruned.onnx"

with open("deberta_vocab_pruned_backbone/vocab_remap.json") as f:
    remap_info = json.load(f)
OLD_TO_NEW = {int(k): v for k, v in remap_info["old_to_new"].items()}
FALLBACK_ID = remap_info["fallback_new_id"]

def remap_ids(ids):
    return [OLD_TO_NEW.get(i, FALLBACK_ID) for i in ids]

tok = AutoTokenizer.from_pretrained("./deberta-v3-small-vocabpruned-ft")
sess = ort.InferenceSession(MODEL_FILE, providers=["CPUExecutionProvider"])

rows = []
with open("eval_heldout.jsonl", encoding="utf-8") as f:
    for line in f:
        rows.append(json.loads(line))

correct = 0
tp = fp = tn = fn = 0
latencies = []
errors = []

for row in rows:
    enc = tok(row["text"], row["claim"], truncation=True, max_length=96, padding="max_length", return_tensors="np")
    ids = np.array([remap_ids(enc["input_ids"][0].tolist())], dtype=np.int64)
    start = time.time()
    logits = sess.run(["logits"], {"input_ids": ids, "attention_mask": enc["attention_mask"].astype(np.int64)})[0]
    latencies.append(time.time() - start)
    exp = np.exp(logits - logits.max())
    probs = exp / exp.sum()
    pred = int(np.argmax(logits))
    true = row["label"]
    if pred == true:
        correct += 1
    if true == 1 and pred == 1: tp += 1
    if true == 0 and pred == 1: fp += 1
    if true == 0 and pred == 0: tn += 1
    if true == 1 and pred == 0: fn += 1
    if pred != true:
        errors.append((row["source"], row["text"], true, pred, probs[0][1]))

n = len(rows)
acc = correct / n
precision = tp / (tp + fp) if (tp + fp) else 0
recall = tp / (tp + fn) if (tp + fn) else 0
f1 = 2 * precision * recall / (precision + recall) if (precision + recall) else 0
avg_ms = sum(latencies) / len(latencies) * 1000

print(f"=== {MODEL_FILE} on full held-out set (n={n}) ===")
print(f"acc={acc:.3f} precision={precision:.3f} recall={recall:.3f} f1={f1:.3f}")
print(f"avg latency: {avg_ms:.1f}ms")
print(f"\nErrors ({len(errors)}):")
for src, text, true, pred, p in errors:
    print(f"  [{src}] expected={true} got={pred} (p_match={p:.3f}) \"{text[:60]}\"")
