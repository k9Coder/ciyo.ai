# Themis

Research spike (branch `spike/local-judge-poc`) — an on-device judge model for
scoring arbitrary natural-language policy rules against captured text,
entirely locally, with no content leaving the device. Named for the Greek
goddess of divine law and judgment.

**Status: research artifact, not integrated into the shipped Pretzel
extension or desktop app.** This directory exists to make the benchmark
numbers on the `/themis` marketing page reproducible, per this repo's
`CONTENT_CLAIMS.md` discipline — it is not a deployment.

## What it is

Base: `microsoft/deberta-v3-small`, fine-tuned as a binary sequence-pair
classifier (`[CLS] message [SEP] rule claim [SEP]` → match / no_match), then
vocabulary-pruned (128,100 → 18,899 tokens: training corpus + top-20k English
words via `wordfreq` + special tokens) and re-trained on the pruned
vocabulary, then exported to ONNX and 8-bit quantized
(`onnxruntime.quantization.matmul_nbits_quantizer`, `bits=8`, `block_size=32`).

The vocabulary pruning is why this is small: DeBERTa-v3's embedding table
alone is 128,100 × 768 ≈ 98M params — most of the model's size — built for a
broad multilingual vocabulary this narrow judgment task doesn't need.

## Benchmark (held-out set, n=71, 5 categories never seen in training)

| Metric | Value |
|---|---|
| Size | 138.8MB (`themis.onnx` + `themis.onnx.data`) |
| F1 | 0.800 |
| Precision | 0.667 |
| Recall | **1.000** — zero missed violations in the held-out set |
| Accuracy | 0.845 |
| Latency | ~207ms/call (CPU, onnxruntime, this dev machine) |

Recall is perfect; every error is a false positive, mostly cross-category
confusion (e.g. SSN-shaped text flagged against an unrelated claim). For a
DLP-style judge, over-flagging is the safer failure direction than missing a
real violation — but it is also exactly what caps F1 at the reported value
rather than higher.

## Reproducing this

```
python prepare_vocab_pruned_backbone.py   # builds the pruned backbone + vocab_remap.json
python train.py                            # trains on train.jsonl, evaluates on eval_heldout.jsonl
python verify.py themis.onnx               # re-runs the held-out benchmark against the exported ONNX graph
```

`categories.py` / `build_dataset.py` regenerate `train.jsonl` /
`eval_heldout.jsonl` from the same synthetic category definitions.

## How this fits the broader investigation

This is the result of an extended comparison across architectures
(generative small LLMs via a custom prefill-only scoring head, DistilBERT,
DeBERTa) and compression techniques (int4/int8 quantization, vocabulary
pruning, layer pruning, quantization-aware training). Vocabulary pruning was
the only lever that reliably improved both size *and* accuracy at once;
aggressive layer pruning catastrophically broke the model; quantization-aware
training (tested properly, with gradient flow through a straight-through
estimator) slightly underperformed plain post-training quantization on this
small a dataset.
