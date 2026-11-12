# Judge v2.1: fast judge with spans + second-opinion model

**Status:** approved in conversation 2026-10-22, pending owner review of this document.
**Builds on:** `2026-10-14-judge-v2-zero-cost-design.md` (Spec 1) and the shipped `final3` model.
**Budget:** $0. Training on the owner's GTX 1650 (4GB); teacher labels from Claude Code subagents on the owner's plan.

## Why

`final3` meets every speed, memory and size limit. On the held-out test set it catches 86% of leaks, but about 1 in 3 of its blocks is a false alarm (precision 0.65). Analysis showed:

- The model is accurate on familiar rule/data combinations (validation precision 0.83-0.86 at 90% recall) and confused on unfamiliar ones: a familiar rule meeting a different kind of sensitive data (e.g. a password rule on a license key).
- More synthetic data of the same kind, rule-variety data, and mined false alarms did not move validation results; the 270M-parameter model is the limit.
- A bigger model alone is 3-7x slower and breaks the latency limits.

Inspired by TypeSafe's Jev (a non-autoregressive "System 1" decision model that reads its input once and returns typed, calibrated answers), the judge stays a one-pass decision model and gains (A) a second-opinion model for the uncertain cases and (B) a structured JSON output that says where each violation is.

## Goals and limits

| Target | Value |
|---|---|
| Leaks caught (recall, whole system) | at least 90% |
| False alarms (whole system) | at most 1 in 20 blocks (precision 0.95); stretch 1 in 50 (0.98). Zero is not achievable. |
| Latency, short messages (up to ~500 tokens), including any second opinion | at most 3 s |
| Latency, large pastes | at most 10 s |
| Share of messages sent to the second opinion | at most 15% |
| Span accuracy | the returned span overlaps the true offending text in at least 90% of flagged violations |
| Fast model | at most 140 MB on disk, 400 MB RAM (unchanged) |
| Second-opinion model | at most 400 MB on disk, 700 MB RAM, loaded only when needed |
| Platforms | the same model files run in the Chrome extension and the desktop app; fully offline after download |

## Architecture

1. **Fast model** (upgraded `final3`) reads rules + message once (stateless). Per rule it returns a calibrated score and a predicted span (start, end).
2. **Three bands per rule**, thresholds chosen on development data:
   - score below `low`: not violated, decided by the fast model;
   - score at or above `high`: violated, decided by the fast model;
   - between: sent to the second opinion.
3. **Second opinion** reads that rule plus a window of about 400 tokens centred on the fast model's span (whole message if shorter) and returns the final score and span.
4. **Fallback**: if the second-opinion model is not downloaded, not loaded in time, or fails, the result is `pending: true` and the company's "When a check takes too long" setting applies (Hold until checked, default; or Let through and flag).
5. Output is the JSON contract below.

## Fast model changes (B)

- Same backbone, data and recipe as `final3` (Stage 1 checkpoint, Stage 2 on the half data set, hybrid int8 export with weight-only down_proj).
- New **span head**: during message prefill the model emits a small per-token key vector; in the rules step each rule's verdict position emits start and end query vectors; span scores are dot products, so span cost is negligible and the one-pass design is kept.
- Training: span loss (cross-entropy over message tokens for start and end) on positive pairs whose offending text is known (`violating_excerpt`); no span loss elsewhere.
- Windowed long messages: spans map back to character offsets in the original message.
- Must still meet the fast-model limits after the change.

## Second-opinion model (A)

- **Candidates:** Gemma 3 1B (same tokenizer family as today, so vocabulary pruning carries over) and Qwen3 0.6B. A head-to-head spike on development data picks one by accuracy, compressed size and latency.
- **Compression:** likely 4-bit to fit 400 MB; the spike measures its accuracy cost against 8-bit. If no candidate fits the budget with acceptable accuracy, stop and report.
- **Input:** one rule plus a window of about 400 tokens. **Output:** score plus span, same heads as the fast model.
- **Training:** LoRA on frozen base weights with gradient checkpointing (fits 4GB). No NLI pre-stage. Data: existing training examples cut into windows around the offending text (positives) and random or hard windows (negatives), plus the 1,275 mined false alarms and their 206 true matches. Train-split messages only.
- **Calibration:** temperature and thresholds fitted on development data, on the exported compressed model.

## JSON contract

```json
{
  "violated": true,
  "warn": false,
  "decided_by": "second_opinion",
  "latency_ms": 1840,
  "pending": false,
  "rules": [
    {"rule_id": "r-17", "violated": true, "warn": false, "confidence": 0.96,
     "span": {"start": 212, "end": 231, "text": "4539 1488 0343 6467"}},
    {"rule_id": "r-04", "violated": false, "warn": false, "confidence": 0.91, "span": null}
  ]
}
```

- `violated`: any rule violated. `decided_by`: `fast` or `second_opinion` (the latter if any rule went to it).
- `span`: character offsets into the message as typed (UTF-16 code units in JS runtimes, documented), `null` when not violated.
- `pending: true`: at least one rule is unresolved; the company setting decides.
- `warn` (added in v2.2, owner decision 2026-11-10): two tiers. A rule is blocked (`violated: true`) only at the strict
  block thresholds (about 99% precision). A rule that is not blocked but clears the looser warn thresholds (about 95%
  precision) gets `warn: true` and a `span`; the user is warned and may still send. Top-level `warn` is true when any
  rule warns. Policies without warn thresholds never warn.

## Evaluation

- **Development sets** (all decisions here): existing validation set, plus a new **cross-category development set**: validation-split messages paired with rules of other categories, labeled blind by Claude Code subagents.
- **Test set:** used once, at the end, for the whole system. Results reported as-is.
- **Gates:** every target in the table above, measured on the exported files, in Chrome (WASM) and natively.
- **If a gate fails:** stop, report numbers and options to the owner; no tuning on the test set.

## Packaging and runtime

- The fast model ships inside the extension and the desktop app.
- The second-opinion model downloads in the background on first use, is cached on the device, and works offline afterwards. Only the model file is downloaded; messages never leave the device.
- The second model loads on the first uncertain case and unloads after a few idle minutes.
- Both files are versioned; update checks follow the app's own schedule.
- This project delivers the models, the JSON contract and reference runtimes (Python and JS). Product UI is out of scope.

## Out of scope (Spec 2, product)

Console setting UI, admin flag dashboard, "not a leak" feedback, rule rewriter, consented real-data loop.

## Risks

- **4-bit accuracy loss** on the second model: measured in the spike; fall back to the smaller candidate at 8-bit if it fits.
- **Training time** on a 4GB GPU (1-2 days per run); the laptop must stay awake.
- **Teacher label noise** in new data: blind labeling, spot checks.
- **Unfamiliar rules remain hardest**; the second opinion reduces but cannot remove these errors.
