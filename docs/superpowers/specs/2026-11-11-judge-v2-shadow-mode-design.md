# Judge v2 shadow mode — design

Status: approved for planning 2026-11-11 (owner chose: regex primary, extension + desktop together,
download on first use). Builds on `models/judge-v2` (branch `feat/judge-v2-zero-cost`, README "v2.2").

## Why

Judge v2 (fast Gemma-270M + second-opinion Qwen3-0.6B cascade) scores well on synthetic test sets
(test2: block precision 1.000, block-or-warn precision 0.955 / recall 0.538) but has never seen real
traffic. Shadow mode runs it on real prompts from pilot companies, records what it *would* have decided
next to what the product *did* decide, and changes nothing for the user. The numbers decide whether v2
is turned on (warn first, then block).

## Goals

- **Primary decides, unchanged in spirit from master:** the deterministic rules (pattern, keyword) block or
  warn exactly as today. Entropy and score stay shadow-only as on staging.
- **Plain-language rules (`judge_prompt`) stop being enforced** for the shadow period. Themis is no longer
  loaded or called on either surface. (Owner's choice: "Regex only, like master".)
- **Secondary = Judge v2 cascade**, run on every check that has at least one enabled `judge_prompt` rule,
  after the primary decision, on both the browser extension and the desktop app.
- **Store both decisions per rule in our DB, with no prompt content.**
- Models download on first use, checksum-verified, cached on the device.

## Non-goals

- No console UI in this PR (the "shadow review" page is later work).
- No change to what the user sees, how long a send takes, or what the audit log (`events`) records.
- No retraining, no threshold changes (locked `artifacts/policy.json`: fast_min 0.85, second_min 0.85,
  warn_fast_min 0.43, warn_second_min 0.70, window_tokens 150, max_windows 3).

## Anti-goals (failure even if it "works")

- Any prompt text, matched text, or text-derived hash leaving the device in shadow telemetry.
- The shadow run delaying, blocking, or altering a send, or crashing the extension/desktop app.
- Shadow rows mixing into `events` or the console's violation counts.
- Spending money: hosting, APIs and CI stay at $0.

## Privacy contract (what a shadow row may contain)

Allowed: tenant id, member id, random per-check id (UUID v4, not derived from content), surface, rule id,
rule kind, primary action, secondary verdict, fast score, second score, character offsets of the model's
span (start/end integers), message length in characters, number of second-opinion windows, latency in ms,
model version, timestamp. **Nothing else.** The backend rejects any payload with extra keys or with string
values outside the fixed enums / UUID / ISO-timestamp / model-version formats. My call: offsets and length
are metadata, not content; owner can veto, in which case drop `span_start`/`span_end` and bucket length.

## Architecture

```
send ─► primary: detectPrompt(text, policy) (no judge passed) ─► decision as today ─► user
                     │ (after decision, never awaited)
                     ▼
        ShadowRunner.submit(text, policy, primaryResult)   — in-memory queue, 1 job at a time, max 4 queued
                     ▼
        Judge v2 cascade (fast on all judge_prompt rules, second on routed rules, ≤3 windows)
                     ▼
        rows (no content) ─► POST /v1/telemetry/judge-shadow ─► judge_shadow_checks
```

- **Runtime package `@mykka/judge-v2`** (new, `packages/judge-v2`): TypeScript port of
  `bench/cascade.mjs` plus an ONNX scorer that matches `judge/infer.py` (`score_with_spans`). The ONNX
  runtime module is injected (`onnxruntime-web` in the extension, `onnxruntime-node` in desktop) so one
  code path serves both. Token ids and probabilities must match Python (parity fixtures).
- **Extension:** the offscreen document (which hosts Themis today) hosts the v2 runner instead. Service
  worker sends `{text, policy rules, primary summary}` to it after deciding; offscreen returns rows; the
  service worker posts them (it holds the auth token). Models cached in the Cache API inside the
  offscreen document; manifest gains `unlimitedStorage` and the download host permissions.
- **Desktop:** `proxy.ts` submits to a runner in the Electron main process after `evaluateRequest`;
  models cached under `app.getPath('userData')/models/<version>/`.
- **Rows:** one row per (check, rule). `judge_prompt` rules get a secondary verdict; pattern/keyword rules
  that the primary matched get a row with `secondary_verdict = 'not_applicable'`, so request-level
  agreement ("did either side act?") can be computed by grouping on `check_id`.
- **Secondary verdicts:** `block` | `warn` | `ok` | `pending` (second model timed out/unavailable) |
  `skipped` (queue full, model not downloaded yet, low memory) | `error` | `not_applicable`.
- **Primary action per row:** the action the primary took for that rule: `block` | `warn` | `log` | `none`
  (`none` = rule did not fire; always `none` for `judge_prompt` during shadow).

## Model delivery

- Files: `fast_v7/{judge.onnx,tokenizer.json,judge_config.json}`, `so_v7/{...}` (141 MB + 290 MB).
- Host: GitHub Release assets on the repo the desktop app already publishes to (free). My call; the
  assets are public, so anyone could download the weights. If the owner objects, the alternative is an
  authenticated backend route (costs bandwidth).
- A manifest compiled into `@mykka/judge-v2` pins version, URL, byte size and SHA-256 per file. Download
  starts only when the policy has ≥1 enabled `judge_prompt` rule, runs in the background, resumes on next
  start if interrupted, verifies SHA-256, then atomically marks the version ready. Old versions deleted.
- Publishing the release is a manual owner step (no publish without OK).

## Resource limits

- One shadow job at a time; queue max 4; newest wins (oldest dropped → `skipped` rows).
- Messages truncated to `max_message_tokens` (4096) as Python does.
- Second model loaded lazily, unloaded after 5 min idle (`idleUnloadMs` in cascade).
- Per-check budget 60 s, second-model call timeout 10 s (shadow, so looser than the live 2.5 s); a
  timeout yields `pending`.
- Skip (`skipped`) when the device reports < 1 GB free memory (desktop: `os.freemem()`; extension:
  `navigator.deviceMemory < 4`).

## Measuring

`backend/src/scripts/judge-shadow-report.ts` prints per tenant and overall: checks, verdict mix,
request-level agreement matrix (primary acted × secondary block/warn/ok), pending/skipped/error rates,
latency p50/p95 per surface, model version. Ground truth comes from planted probe prompts (a dedicated
probe tenant + a fixed probe set with expected verdicts, run through the real extension by Playwright).
Go-live bars (owner-reviewed later, not enforced in code): block ≥ 0.98 correct on probes, warn ≥ 0.85,
p95 latency recorded per surface.

## Left to the builder

Tokenizer library choice in TS (must pass parity), exact retry/backoff numbers for downloads, file layout
inside `packages/judge-v2`, Playwright probe harness details.
