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
vocabulary-pruned (128,001 → 28,971 tokens: training corpus + top-20k English
words via `wordfreq`, each scanned in isolation, with a leading space, AND in
a hyphen-adjacent context + special tokens) and re-trained on the pruned
vocabulary, then exported to ONNX and 8-bit quantized
(`onnxruntime.quantization.matmul_nbits_quantizer`'s `DefaultWeightOnlyQuantConfig`,
`bits=8`, `block_size=32` — not `RTNWeightOnlyQuantConfig`, which silently
quantizes to int4 regardless of the `bits` argument in onnxruntime 1.30).

The vocabulary pruning is why this is small: DeBERTa-v3's embedding table
alone is 128,001 × 768 ≈ 98M params — most of the model's size — built for a
broad multilingual vocabulary this narrow judgment task doesn't need. The
embedding table itself is not quantized (it's a `Gather` op, not a `MatMul`,
so the weight-only quantizer never touches it) — it stays plain float32,
~88.6MB of the model's ~169.8MB total.

## Benchmark (held-out set, n=81, 6 categories never seen in training)

| Metric | Value |
|---|---|
| Size | 169.8MB (`themis.onnx` + `themis.onnx.data`) |
| F1 | 0.877 |
| Precision | 0.781 |
| Recall | **1.000** — zero missed violations in the held-out set |
| Accuracy | 0.914 |
| Latency | ~170ms/call (CPU, onnxruntime, this dev machine) |
| RAM (desktop, steady state) | ~386MB |

Retrained 2026-10-07 to fix a live false-positive bug, found via `/qa`
against real staging traffic: a `judge_prompt` claim naming a specific
rare/invented term (an internal project codename) made the judge unreliable
against *completely unrelated* content — e.g. a plain "help me write a
Python CSV parser" message scored as a match against a claim about a
codename that shares no meaning with it at all.

Root cause, found by tracing actual token IDs rather than guessing: the
vocabulary-pruning step only ever tokenized common words in isolation (bare,
and with a leading space) when deciding which tokens to keep. A compound,
hyphenated term — exactly the shape of an invented codename like
`zephyr-watermelon-9` — gets split by SentencePiece into *different* subword
pieces in that context (`water` + `melon`, not the whole-word `▁watermelon`
token that survived pruning), and those pieces had never been scanned, so
they fell back to a blanket UNK id. The model wasn't failing to reason about
rare words; it was being fed a garbled, lossy encoding of common ones.
Fixed by also scanning every common word in a hyphen-adjacent context
(`"x-" + word`, `word + "-x"`) and explicit standalone/hyphenated digit
tokens (`prepare_vocab_pruned_backbone.py`) — confirmed by direct token-ID
inspection before and after, not just end-to-end accuracy. Also separately
confirmed (via `train_full_vocab_diagnostic.py`, a throwaway, gitignored
diagnostic) that training on the *full*, unpruned vocabulary independently
fixes the same case — proving the failure really was a pruning artifact, not
a deeper small-model limitation, before committing to this fix.

Also added a `named_codename` training category (`categories.py`) teaching
"match the claim's specific referent, not any unusual word" — this and the
tokenizer fix together closed the live bug and incidentally also improved
the held-out `biometric` category's recall.

Two determinism bugs fixed along the way, costing real time before being
found: `train.py` wasn't seeding `torch.manual_seed`/`torch.cuda.manual_seed_all`
(only Python's `random.seed`), so "the same seed" silently varied in weight
init, dropout, and DataLoader shuffling; separately,
`prepare_vocab_pruned_backbone.py`'s randomly-initialized classifier head
had no seed at all, so regenerating the backbone changed results even with
`train.py`'s seed fixed. Both now seeded. Checkpoint selection also now uses
F2 (recall weighted 2× precision) instead of F1, matching this project's own
stated DLP priority (over-flagging is safer than missing a violation)
instead of leaving it to whichever epoch's F1 happens to peak first.

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

`train_full_vocab_diagnostic.py` is not part of this pipeline — a one-off
diagnostic that trains on the full, unpruned vocabulary to check whether a
given failure is a pruning artifact or a deeper model limitation. Keep it
around for the next time this question comes up; its own output directory
is gitignored like the other training artifacts.

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
