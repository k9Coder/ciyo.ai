# @mykka/judge-v2

The on-device judge v2 runtime, and the shadow mode it currently runs in. Design:
[`docs/superpowers/specs/2026-11-11-judge-v2-shadow-mode-design.md`](../../docs/superpowers/specs/2026-11-11-judge-v2-shadow-mode-design.md).
The models and their training live in [`models/judge-v2`](../../models/judge-v2/README.md).

## What shadow mode does

- **Primary decides.** Regex and keyword rules block or warn as before. Plain-language (`judge_prompt`) rules are
  not enforced while the shadow run lasts, and Themis is no longer loaded.
- **Judge v2 judges afterwards.** After the primary decision, the extension (offscreen document) or the desktop app
  (main process) runs the cascade on the same text, off the send path. It never delays, blocks or changes a send.
- **Only content-free rows leave the device.** One row per (check, rule) goes to `POST /v1/telemetry/judge-shadow`
  and lands in `judge_shadow_checks`.

## Privacy contract

A row holds: check id (random UUID), surface, rule id, rule kind, primary action, judge v2 verdict, fast and second
scores, span start/end offsets, message length, number of windows, latency, model version and timestamp. Nothing else.
The backend rejects any row with another key or a value outside its enum, UUID, number or format rules. Rows are
removed by the pilot retention purge, member anonymisation and `delete-user`.

## Pieces

| File | Role |
|---|---|
| `src/cascade.ts` | TS port of the Python cascade, with the thresholds locked on dev2 (`LOCKED_POLICY`) |
| `src/scorer.ts`, `sequence.ts`, `span.ts`, `tokenizer.ts` | ONNX scorer matching `judge/infer.py` (parity tests) |
| `src/shadow.ts` | Queue (1 running, 4 waiting), 60 s budget, skip on low memory or model not ready |
| `src/models.ts`, `store-fs.ts`, `store-cache.ts` | Pinned manifest, checksum-verified resumable download, 15 min cooldown after a failure |
| `src/detect-adapter.ts` | Maps `@mykka/detect` policy/results onto runner inputs |

## Tests

```bash
pnpm --filter @mykka/judge-v2 test
# Parity with Python on the real models (≈2 min):
JUDGE_V2_MODELS=<models/judge-v2/artifacts> pnpm --filter @mykka/judge-v2 test
```

Regenerate the parity fixtures with `models/judge-v2/scripts/dump_parity.py` after any model or tokenizer change.

## Publishing the models (owner step)

The app downloads from the GitHub Release `judge-v2-v7` on `yarin-mag/mykka.ai` (`DEFAULT_MODEL_BASE` in
`src/models.ts`). Asset names are `<model>-<file>`, for example `fast_v7-judge.onnx`. To stage and publish them:

```bash
node scripts/hash_models.mjs <artifacts> v7 > src/manifest-v7.json   # only when the model files change
mkdir release && node -e 'const m=require("./src/manifest-v7.json"),fs=require("fs"),p=require("path");for(const f of [...m.fast,...m.second])fs.copyFileSync(p.join(process.argv[1],f.source),p.join("release",f.name))' <artifacts>
gh release create judge-v2-v7 release/* --repo yarin-mag/mykka.ai --title "Judge v2 models v7" --notes "Shadow-mode models"
```

These files are public once released. To test locally instead, serve the `release/` folder
(`python -m http.server 8799`) and set `JUDGE_V2_MODEL_BASE` (desktop) or build the extension with
`VITE_JUDGE_V2_MODEL_BASE` (the dev build gets a host permission for that origin).

## Reading the results

- `pnpm --filter backend report:judge-shadow [--tenant <uuid>]` prints:
  - the verdict mix;
  - per-check agreement with the primary;
  - pending, skipped and error rates;
  - latency p50 and p95 per surface;
  - the model versions seen.
- `node pretzel/scripts/judge-shadow-probes/run-probes.mjs pretzel/dist` runs the 40 planted probes through a built
  extension and writes expected vs actual. This is the ground truth, because real prompts are never stored.

## Known limits

- **Desktop runs in a worker thread** and judges the last 12,000 characters of the body. The extension judges the
  first 50,000 characters of the prompt. Failed downloads back off from 15 minutes up to 24 hours.
- **Desktop judges the raw request body.** It sees the same JSON the regex rules see. The models were trained on
  plain messages, so desktop numbers may come out lower than the extension's.
- **The extension runs single-threaded WASM.** A flagged check that also has to load the second model takes about
  9 s. That stays off the send path.
