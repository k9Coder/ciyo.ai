# Judge v2 (zero-cost)

Our own multilingual on-device LLM judge for `judge_prompt` rules, trained at $0 on the owner's GPU.
Spec: `docs/superpowers/specs/2026-10-14-judge-v2-zero-cost-design.md`.
Plan: `docs/superpowers/plans/2026-10-14-judge-v2-zero-cost.md`.

## Layout

- `spike/`: Phase 0 feasibility spike and go/no-go report.
- `templates/`: Faker message/rule templates per language (training data source).
- `judge/`: Python package (model, data, Claude Code teacher tooling, NLI prep, training, eval, bench).
- `bench/`: Node/Chrome latency harness.
- `tests/`: run `python -m pytest`. Add `-m slow` for tests that download public models.

Generated data (`data/`), training runs (`runs/`) and exported models (`artifacts/`) are git-ignored.

## Fast model with spans (Judge v2.1)

`artifacts/fast_spans`: `final3` (Stage 2 on the half-data set, hybrid int8 export) plus a pointer span head
trained alone on top of the frozen judge (`--span-only`), so the verdict path is bit-identical to `final3`.

| Measure | Value |
|---|---|
| Calibration (shipped int8) | temperature 2.096, threshold 0.369 |
| Validation best precision at recall ≥ 0.90 (critical ≥ 0.95) | 0.829 (same as `final3`) |
| Validation + cross-category dev set | 0.725 (same as `final3`) |
| Cross-category false-alarm rate at threshold | 6.7% |
| Span accuracy (violations flagged at threshold, validation) | 266 / 281 = 94.7% |
| Size | 139.3 MB |
| Peak RSS (native) | 352 MB |
| Native latency, 1,000 tokens / 10 rules | 2.1-2.3 s (final3: 1.9 s) |
| Native latency, 2,000 tokens / 5 rules | 4.3-4.6 s |
| Chrome, 2,000 tokens typed / 10 rules | 1.1 s |
| Chrome, 500 tokens / 5 rules | 1.9 s |
| Chrome, 1,000 tokens pasted / 5 rules | 4.3 s |

Joint verdict+span training (span weight 0.5) was tried first and wrecked the verdict (validation precision
0.53, cross-category false alarms 48%), which is why the span head is trained separately.

## v2.2 results (realistic retrain, two-tier policy)

Models: `artifacts/fast_v7` (Gemma 3 270M judge + span head, hybrid int8) and `artifacts/so_v7` (Qwen3-0.6B
second opinion, LoRA r16 merged, 4-bit). Policy `artifacts/policy.json`, chosen on dev2 only:

- **Block** (`violated: true`): fast ≥ 0.85 and second ≥ 0.85. Target precision 0.99.
- **Warn** (`warn: true`, user may still send): fast ≥ 0.43 and second ≥ 0.70, when not blocked. Target 0.95.
- Second opinion runs on 150-token windows, up to 3 per flagged rule; a window that clears the bar ends the search.

| Set | Rule rows (pos) | Block P | Block R | Block-or-warn P | Block-or-warn R | Span acc. |
|---|---|---|---|---|---|---|
| dev2 + extra long (thresholds) | 3,135 (1,262) | 0.991 | 0.088 | 0.951 | 0.548 | 0.917 |
| test2 (fresh, run once) | 2,917 (1,229) | 0.991 | 0.094 | 0.955 | 0.530 | 0.922 |

test2 block-or-warn recall: critical 0.62, disguised 0.42, late violations 0.35; per language 0.42 (de, en) to
0.62 (it).

Why two tiers: the original bar (recall ≥ 0.30 at precision 0.99 on dev2) was missed twice (v6 0.173, v7 0.088).
Ranking is good (AUC 0.90) but the top false alarms are near-misses: client contacts against a supplier rule, a
Stripe key against a "Stripe and AWS together" rule, prescriptions against a diagnosis rule. A hand audit of the
top 30 dev2 false alarms found no label errors. A targeted near-miss data wave (5,508 twin pairs) did not move it.

| Measure | Value |
|---|---|
| Size | fast 141 MB, second 290 MB |
| Peak RSS (native) | fast 349 MB, second 463 MB |
| Fast, 150 tokens / 1 rule | 0.36 s |
| Fast, 1,000 tokens / 10 rules | 2.1 s |
| Fast, 2,000 tokens / 5 rules | 4.4 s |
| Second, one 150-token window | 1.2 s (cold load 2.4 s) |

Latency per message = fast + 1.2 s per second-opinion window. Short message with one flagged rule: about 1.5 s
warm. The warn tier sends every rule with fast ≥ 0.43 to the second model, so a long message with several flagged
rules and no confirming window can need many windows (up to 3 per rule) and pass 10 s.

Data recipe: all5 + wave 3 (1,836 near-miss messages written as minimal-edit twins, labeled blind twice with an
Opus tie-break, 96.2% agreement); continuation retrain on a 20,880-example mix (1/3 wave 3); dev2, test1 and test2
excluded from training.
