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
