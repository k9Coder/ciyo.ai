# Themis

Research spike (branch `spike/local-judge-poc`) — an on-device judge model for
scoring arbitrary natural-language policy rules against captured text,
entirely locally, with no content leaving the device. Named for the Greek
goddess of divine law and judgment.

**Status: integrated.** This model backs real `judge_prompt` rule enforcement
in both the shipped Pretzel extension (`pretzel/src/offscreen/themis-judge.ts`)
and desktop app (`pretzel-desktop/electron/themis-judge.ts`) — not just a
research artifact. This directory is also what makes the benchmark numbers on
the `/themis` marketing page reproducible, per this repo's `CONTENT_CLAIMS.md`
discipline.

## What it is

Base: `microsoft/deberta-v3-small`, fine-tuned as a binary sequence-pair
classifier (`[CLS] message [SEP] rule claim [SEP]` → match / no_match), then
vocabulary-pruned (128,001 → 18,916 tokens: training corpus + top-20k English
words via `wordfreq` + special tokens) and re-trained on the pruned
vocabulary, then exported to ONNX and 8-bit quantized
(`onnxruntime.quantization.matmul_nbits_quantizer`'s `DefaultWeightOnlyQuantConfig`,
`bits=8`, `block_size=32` — not `RTNWeightOnlyQuantConfig`, which silently
quantizes to int4 regardless of the `bits` argument in onnxruntime 1.30).

The vocabulary pruning is why this is small: DeBERTa-v3's embedding table
alone is 128,001 × 768 ≈ 98M params — most of the model's size — built for a
broad multilingual vocabulary this narrow judgment task doesn't need. The
embedding table itself is not quantized (it's a `Gather` op, not a `MatMul`,
so the weight-only quantizer never touches it) — it stays plain float32,
58.1MB of the model's ~138.9MB total.

## Benchmark (held-out set, n=81, 6 categories never seen in training)

| Metric | Value |
|---|---|
| Size | 138.9MB (`themis.onnx` + `themis.onnx.data`) |
| F1 | 0.906 |
| Precision | 0.857 |
| Recall | 0.960 |
| Accuracy | 0.938 |
| Latency | ~169ms/call (CPU, onnxruntime, this dev machine) |

Retrained 2026-10-07 to fix a live false-positive bug: `judge_prompt` claims
naming a specific rare/invented term (e.g. an internal project codename) were
unreliable against unrelated content, apparently because the term fell
outside the pruned vocabulary's common-word coverage. Added a training
category teaching "match the claim's specific referent, not any unusual
word" (`named_codename` in `categories.py`) and reinforced "attaching a
scan/document for an identity or access process is sensitive" in two
existing categories, which incidentally also improved the held-out
`biometric` category's recall. Confirmed via live testing that the original
false-positive case is fixed and that the fix generalizes to a brand-new
codename never seen in training — see the git history of this directory for
the full before/after.

Checkpoint selection uses F2 (recall weighted 2× precision), not F1 — this
is a DLP judge, and plain F1 selection was observed to trade real recall for
precision gains when harder negative examples were added. `train.py` now
also seeds `torch.manual_seed`/`torch.cuda.manual_seed_all` in addition to
Python's `random.seed` — without it, "the same seed" was silently
non-deterministic in weight init, dropout, and DataLoader shuffling, which
cost real time attributing differences between runs to data changes that
were actually just training noise.

## Reproducing this

```
python build_dataset.py                   # regenerates train.jsonl / eval_heldout.jsonl from categories.py
python prepare_vocab_pruned_backbone.py   # builds the pruned backbone + vocab_remap.json (reads the files above)
python train.py                            # trains on train.jsonl, evaluates on eval_heldout.jsonl
python export_onnx.py                      # exports the fine-tuned model to fp32 ONNX
# then quantize (see export_onnx.py's docstring for the exact 8-bit call)
python verify.py themis.onnx               # re-runs the held-out benchmark against the exported ONNX graph
python check_fixed.py                      # fixed regression set: the live bug fix + biometric generalization, compared across training rounds
```

`categories.py` / `build_dataset.py` regenerate `train.jsonl` /
`eval_heldout.jsonl` from the same synthetic category definitions — run
`build_dataset.py` first if you've edited `categories.py`, since
`prepare_vocab_pruned_backbone.py` scans the regenerated `train.jsonl` /
`eval_heldout.jsonl` text to decide which tokens survive pruning.

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
