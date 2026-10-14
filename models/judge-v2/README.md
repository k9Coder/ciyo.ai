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
