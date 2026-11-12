# Judge v2.2: realistic retrain (design)

Date: 2026-10-26. Owner decision: "We will go with B" (grow realistic data and retrain both models, no pilot gate), budget = the owner's current Claude plan only, no extra credit, no API spend, $0.

## Why

The single test run of v2.1 failed the owner's bar (blocks must be real leaks, ≥ 99%): precision 0.903, recall 0.312. A new development set built like the test (`data/dev2/dev2.jsonl`, 866 examples, 114 over 1,600 characters, leak rate 0.40) reproduces it (precision 0.913, recall 0.261). Thresholds cannot fix it: at 99% precision the best setting catches 0.2% of leaks. Both models rank leaks only moderately (AUC 0.83 fast, 0.82 second) on realistic messages in unseen categories, languages and styles. About 80% of their training messages were template-made, and the second model was trained on 400-token windows but runs on 150-token windows.

## Goal

Same product contract as v2.1 (fast model + second opinion, JSON with rule and exact span, confirm policy, both platforms). On `data/dev2`: precision ≥ 0.99 at the chosen thresholds, with recall as high as possible. The result is reported honestly on a fresh test set used once.

## What changes

1. **Realistic training data in waves.** Sonnet subagents write new messages with the dev2 recipe (PROMPTS.md PAIRS plus the length mix), only for training-split languages, categories and styles. Each message also gets one invented company-specific rule (category `custom_other`). About 50% of messages are hard negatives. Target: about 3,500 new messages in 2 waves.
2. **Multiplied pairs.** Every new message is re-paired with 4 extra rules from other messages (same language or English, training categories only), labeled blind by Sonnet. This is cheap per pair compared with writing.
3. **Long training examples.** Training gets buried-violation long examples (the same builder as the test set), from training-split messages only.
4. **Second model on the windows it runs on.** Train on 150-token windows. The runtime checks up to 3 windows per flagged rule (the first centred on the fast model's span, then tiled across the message) and blocks if any window confirms. Latency stays within the v2.1 limits (≤ 3 s short, ≤ 10 s large).
5. **Retrain both models** with the existing recipes. Fast: stage1 → stage2 on the new mix, span head trained afterwards with `--span-only`. Second: Qwen3-0.6B LoRA r16. Exports stay hybrid int8 (fast) and 4-bit (second).
6. **Thresholds** come from `choose_confirm` on dev2. The test set from v2.1 is spent. A fresh test set (dev2 recipe, a new seed, test-condition orders) is generated last and run once.

## Hard boundaries

- dev2 and both test sets are never trained on. Every training text is checked for no overlap with them.
- Held-out languages (it, nl), held-out categories and held-out styles never appear in training.
- Subagent work pauses when the plan's usage limit is hit and resumes after the reset. No extra credit and no paid API.
- No push, PR or publish without the owner's OK.

## Success and honesty

Primary metric: dev2 recall at precision ≥ 0.99 (baseline 0.002). Report at 0.98 and 0.95 too. If, after both waves and retrains, dev2 recall at 0.99 stays under 0.30, stop and report: the owner decides on bigger models or a lower bar.
