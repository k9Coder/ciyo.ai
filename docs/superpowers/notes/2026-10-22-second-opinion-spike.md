# Second-opinion candidate decision (Judge v2.1, Task 13)

All numbers on development data only (validation + cross-category set); the test set was not used.

## Training fit on the 4 GB GTX 1650 (LoRA rank 16, frozen weights in fp16, gradient checkpointing, 400-token windows)

| Candidate | Peak GPU | Speed | One epoch (38.8k windows) |
|---|---|---|---|
| Gemma 3 1B | 3,819 MiB | 15.5 s / 16 windows | ~10.4 h |
| Qwen3 0.6B | 3,539 MiB | 12.8 s / 16 windows | ~8.6 h |

Both use a pruned vocabulary (Gemma: the fast model's 56,473-token vocabulary; Qwen: 38,478 tokens, gate pass).

## Spike training (8,000 windows, LoRA lr 2e-4), then 4-bit weight-only export

| Candidate | Window val F2 (fp32) | 4-bit size | Verdict |
|---|---|---|---|
| Gemma 3 1B | 0.840 | 478.5 MB | over the 400 MB budget |
| Qwen3 0.6B | 0.862 | 301.1 MB | **winner** |

## Policy finding

Routing only the fast model's uncertain band within 15% of messages reaches about a third of the false alarms
(10 of the 123 are fast-model scores ≥ 0.95). The owner then set precision first ("we cannot block anything
that's not a real leak"). A double-check policy (fast flags, second model must confirm) with Qwen 4-bit:

| Policy | Blocks that are real leaks | False alarms | Leaks caught |
|---|---|---|---|
| Fast only, threshold 0.80 | 95.4% | 10 / 216 | 58.7% |
| Fast ≥ 0.70 and second ≥ 0.70 | 99.1% | 2 / 219 | 61.8% |
| Fast ≥ 0.70 and second ≥ 0.90 | 100% | 0 / 169 | 48.1% |
| Fast ≥ 0.37 and second ≥ 0.70 | 95.9% | 11 / 267 | 72.9% |

Decision: Qwen3 0.6B, 4-bit, as the second opinion, used to confirm every fast-model block.
