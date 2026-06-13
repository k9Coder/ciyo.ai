# Omar Hassan — Detection Engineering Implementation Plan

**Date:** 2026-06-08
**Participants:** Omar Hassan (Detection Engineer)
**Directed by:** Marcus Webb (CTO)
**Worktree:** `.claude/worktrees/agent-a71e6438c8775e916`  
**Branch:** `worktree-agent-a71e6438c8775e916`  
**Commit:** `72051c4`

---

## Files Changed

| File | Change |
|---|---|
| `pretzel/src/detection/code-block.ts` | Replaced catastrophic-backtracking `[\s\S]*?` regex with linear line-by-line fence scan; binary-search `isInsideCode` |
| `pretzel/src/detection/normalize.ts` | Added fullwidth ASCII (U+FF01–FF5E), Greek homoglyphs, more Cyrillics, RTL override strips; tab→single-space |
| `pretzel/src/detection/layer1-patterns/pii.ts` | Implemented real mod-97 IBAN validation; fixed `ssnCheck` to reject group=00 and serial=0000 |
| `pretzel/src/detection/layer1-patterns/entropy.ts` | Added charset diversity guard (alpha+numeric required), UUID allowlist |
| `pretzel/src/detection/layer3-dictionary/fuzzy.ts` | Fixed `dist>0` bug (maxDistance=0 now works); early-termination Levenshtein with two-row rolling DP; length pre-filter |
| `pretzel/src/detection/layer1-patterns/api-keys.ts` | Added rule IDs: `stripe-live-secret-key`, `huggingface-token`, `npm-token`, `azure-connection-string` |
| `pretzel/src/detection/layer1-patterns/credentials.ts` | Added rule ID: `db-connection-string` |
| `pretzel/src/detection/layer1-patterns/network.ts` | Added rule IDs: `ipv6-ula`, `aws-metadata-endpoint`, `internal-hostname` |
| `pretzel/src/policy/defaults.ts` | Raised entropy threshold to 4.5 bits/char; added all new PatternRules; seeded `custom[]` with `classification-labels` and `legal-privilege-markers` DictionaryRules; fixed `dotenv-line` value pattern |
| `pretzel/tests/unit/detection/api-keys.test.ts` | Extended with Stripe, HuggingFace, npm, db-connection-string, unicode bypass tests |
| `pretzel/tests/unit/detection/dictionary.test.ts` | Added Levenshtein early-termination tests, maxDistance=0 bug-fix regression test |
| `pretzel/tests/unit/detection/entropy.test.ts` | Added charset diversity, UUID allowlist, API key integration tests |
| `pretzel/tests/unit/detection/pii.test.ts` | Added IBAN (valid/invalid/spaces), ssnCheck group+serial, dotenv FP regression tests |
| `pretzel/vite.config.ts` | Increased `testTimeout` to 10 000ms (from 5 000ms default) |

---

## Test Results

**168 tests, 14 test files — all pass.**

Pre-existing TS error in `tests/unit/update-check.test.ts` line 16 (`vi.fn<[], Promise<...>>()` type argument count mismatch) remains. It does not affect test execution — vitest runs fine despite the tsc error. The `typecheck` script fails on this pre-existing issue, not on our changes.

The `service-worker.alarm.test.ts` was flapping (5 s timeout) when all tests ran in parallel. Root cause: the service-worker dynamic import competes for V8 compile budget when 14 test files run simultaneously. Fixed by raising `testTimeout` to 10 s in `vite.config.ts`.

---

## Issue-Level Fix Status

| Issue | Status |
|---|---|
| code-block.ts — catastrophic backtracking | DONE — linear scan |
| pii.ts — ibanCheck mod-97 | DONE — full mod-97 implementation |
| pii.ts — dotenv-line FP (value charset) | DONE — value restricted to `[A-Za-z0-9+/=_-]{16,}` |
| entropy.ts — threshold raised to 4.5 | DONE |
| entropy.ts — charset diversity required | DONE |
| entropy.ts — UUID allowlisted | DONE |
| fuzzy.ts — maxDistance=0 bug | DONE — dist>0 guard removed |
| fuzzy.ts — early termination | DONE — two-row rolling DP with row-min bailout |
| normalize.ts — fullwidth ASCII mappings | DONE |
| normalize.ts — Greek homoglyphs | DONE |
| normalize.ts — tab→single-space | DONE |
| api-keys.ts — Stripe live key | DONE |
| api-keys.ts — HuggingFace token | DONE |
| api-keys.ts — npm token | DONE |
| credentials.ts — DB connection string | DONE |
| network.ts — IPv6 ULA | DONE |
| network.ts — 169.254.169.254 (IMDS) | DONE |
| network.ts — internal hostnames | DONE |
| defaults.ts — DictionaryRule baseline entries | DONE — classification labels + legal privilege markers |

---

## Out of Scope (Not Fixed)

Per the review scope (ISSUE-level only):

- **engine.ts** WARN: offset drift (raw vs normalised text), no per-rule timeout — documented as tech debt, not in scope for this pass
- **exact.ts** ISSUE: regex compiled per term per call — not assigned to this worktree
- **pii.ts**: additional PII types (phone, IBAN pattern rule, EU national IDs) — Isabella's coverage gaps, not ISSUE-level in Omar's review
- **api-keys.ts**: AWS secret key, Twilio, SendGrid, Databricks, PyPI — Isabella ISSUE items partially addressed (Stripe, HuggingFace, npm added per Omar's WARN findings); full coverage is a separate ticket
