# Phase 0 feasibility report

- GPU: NVIDIA GeForce GTX 1650 (4GB; ~0.6GB already used by the desktop during the run)
- Date: 2026-10-14
- Model: google/gemma-3-270m with embeddings trimmed to 80000 rows (simulates the trimmed vocabulary)

## Training measurements (batch 1, optimizer step every example)

| seq | precision | grad checkpointing | fits | sec/example | peak GB |
|---|---|---|---|---|---|
| 128 | fp32 | True | True | 0.50 | 3.05 |
| 256 | fp32 | True | True | 0.49 | 3.06 |
| 512 | fp32 | True | True | 0.62 | 3.06 |
| 1024 | fp32 | True | True | 1.04 | 3.07 |
| 1536 | fp32 | True | True | 1.71 | 3.08 |
| 2048 | fp32 | True | True | 2.40 | 3.07 |
| 3072 | fp32 | True | True | 4.43 | 3.07 |
| 4096 | fp32 | True | True | 14.29 | 3.44 |
| 128 | fp16 | True | True | 0.86 | 3.05 |
| 256 | fp16 | True | True | 1.46 | 3.05 |
| 512 | fp16 | True | True | 1.53 | 3.06 |
| 1024 | fp16 | True | True | 2.95 | 1.25 |
| 1536 | fp16 | True | True | 5.04 | 3.08 |
| 2048 | fp16 | True | True | 6.81 | 3.07 |
| 3072 | fp16 | True | True | 12.32 | 3.07 |
| 4096 | fp16 | True | True | 17.90 | 3.44 |
| 128 | fp32 | False | True | 0.37 | 3.05 |
| 512 | fp32 | False | True | 0.46 | 3.07 |

4096 tokens fits but is ~3x slower per token than 3072 (peak 3.44GB: the driver spills into system RAM).

## Numerical stability (300 real SNLI steps, seq <= 128)

| precision | finite | skipped steps | loss first 50 | loss last 50 |
|---|---|---|---|---|
| fp32 | True | 0 | 1.485 | 0.642 |
| fp16 | True | 7 | 2.142 | 0.642 |

## Estimated GPU time (conservative: optimizer step per example, checkpointing on)

| precision | Stage 1 (400k short pairs) | Stage 2 (40k pairs x 2 epochs) |
|---|---|---|
| fp32 | 55.9 h | 21.7 h |
| fp16 | 96.0 h | 57.5 h |

Real training updates weights every 16 examples (grad accumulation) and Stage 1 runs without checkpointing (0.37 s vs 0.50 s per example at 128 tokens, same memory), so actual times should be lower.

## Baseline A (mDeBERTa NLI, int8, native CPU, informational: A never ships)

- File size: 338 MB

| scenario | ms |
|---|---|
| 150tok_5rules | 1067 |
| 500tok_5rules | 7314 |
| 1000tok_5rules | 14852 |
| 1000tok_10rules | 27982 |
| 2000tok_5rules | 27210 |

## Chosen settings

- `PRECISION`: **fp32**. fp16 meets the stability rule (finite, 7 skipped steps, loss falls) but is ~3x slower on this GPU (no tensor cores), so fp32 is chosen.
- `MAX_TOKENS`: **3072**. Longest length that trains without spilling into system RAM; longer messages rely on runtime windowing.
- `GRAD_CHECKPOINTING`: **true for Stage 2**; Stage 1 (sequences <= 256) runs **without** it (same memory, ~25% faster).

## Decision

**GO**: fp32 Stage 1 56 h <= 72 h and Stage 2 22 h <= 72 h.
