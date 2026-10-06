---
status: active
owner: repository
verified_at: 2026-10-05
sources:
  - .claude/plans/let-s-think-together-if-humble-church.md (original Plan A/B brainstorm, superseded by this doc for anything that conflicts)
  - models/themis/README.md
  - pretzel/src/offscreen/themis-judge.ts
  - commit c37099d (spike/local-judge-poc) — extension-side Themis swap, verified in a real browser
  - pretzel-desktop/build/electron-builder.yml
---

# Local Judge (Themis): From Proven Spike to Shippable Feature

## Where this picks up

The spike (`spike/local-judge-poc`) answered the open technical question: can an on-device model judge arbitrary natural-language rules against content, fast and accurately enough, with nothing leaving the device? On the extension, yes — verified in a real unpacked Chromium extension, real offscreen document, real WASM, no network dependency: `ThemisLocalJudge` (DeBERTa-v3-small, fine-tuned + vocabulary-pruned to 138.8MB) returns correct verdicts matching the Python/Node benchmark (F1 0.800, recall 1.000, precision 0.667 on a 71-case held-out set spanning 5 rule categories never seen in training), at ~0.5-2.7s/call real-browser latency (vs. the first attempt, Qwen2.5-0.5B-Instruct, at 483MB and 20-30s/call).

Desktop hasn't been wired yet — `pretzel-desktop/electron/local-judge-poc.ts` still uses `StubLocalJudge`.

**Jev** (TypeSafe AI's actual product) was evaluated and ruled out early, structurally, not on quality: it's closed-weight, hosted-API-only. Using it would mean sending captured content to their server, which violates the one hard requirement this whole feature exists under (content never leaves the device). Themis is our own independently fine-tuned substitute, not a stand-in *for* Jev's weights — there's no relationship between the two beyond "same shape of idea."

This doc scopes what's left to turn the proven spike into a real, shippable feature — the implementation plan (via `writing-plans`) will be built from this.

## Scope

### A. Desktop parity

Close the spike out on the second platform. Desktop is the easier runtime (long-lived Electron main process, no MV3 idle-kill, no CSP/offscreen-document complexity) but needs a different stack than the extension:
- `onnxruntime-node` (native binding) instead of `onnxruntime-web` (WASM) — no browser sandbox, no WASM runtime to bundle.
- Model shipped via electron-builder `extraResources`, not a `public/` web asset.
- `ThemisLocalJudge` (desktop variant) wired into `local-judge-poc.ts` in place of `StubLocalJudge`, same `LocalJudge` interface, same shadow-mode-only behavior.

### B. Real rule authoring

Today's spike hardcodes 2-3 test rules (`POC_JUDGE_RULES`). The real mechanism:
- Backend assistant (`backend/src/assistant/`) gains a new action kind (e.g. `create_judge_rule`) that turns an admin's plain-language description into a short, unambiguous prompt string — this is prompt-engineering quality control, not a passthrough, so individual admins can't ship vague prompts that cause false positives/negatives.
- Policy compiler (`backend/src/policy/compiler.ts`) ships this as a new rule `kind: "judge_prompt"` in the published `PolicyDoc`.
- `packages/detect/src/policy/bridge.ts` gets a new case for `kind === "judge_prompt"` that passes straight through to `LocalJudge.classify({ prompt, content })` — no fixed-function mapping.
- pretzel-console shows the admin what prompt was actually generated, with a way to refine it.

### C. Real-world validation gate

The spike's F1/recall/precision numbers are measured on a synthetic held-out set — a controlled generalization test, not proof the model holds up on real traffic. Before any `judge_prompt` rule is allowed to move from shadow-mode (log only) to enforcement (block/warn), it needs to clear a real bar, measured on real shadow-mode data:

| Metric | Bar | Why this number |
|---|---|---|
| Recall, compliance-critical categories (SSN/PII-shaped rules) | ≥ 0.95 | Benchmarked general-purpose PII tools land at 57-73% recall and that's explicitly called a "systematic compliance failure" at 70%; better solutions hit 90-95%. Our synthetic recall is already 1.000 — this bar is "does that hold on real data," not a stretch target. |
| False-positive rate, all flagged events | ≤ 15% | Mature SOC teams target 10-15% FP rate on alert volume; 20-30%+ is flagged industry-wide as a sign something is structurally wrong. Our synthetic precision (0.667 → ~33% of flags wrong) is in that red-flag range and needs real-data confirmation it's actually this bad or better before enforcement. |
| Latency, per call | ≤ 1s sustained | One real endpoint-threat-detection system targeted 500ms round-trip, shipped under 2s. Already met (~0.5-2.7s observed, mostly load-time on first call). |

These are my synthesis of general industry DLP/content-moderation benchmarks (sourced, see below), not a customer-specific SLA — revisit once real customer/compliance requirements exist.

Sources: [Why Your DLP False Positive Rate Is a Security Problem](https://www.cyberhaven.com/blog/dlp-false-positives), [What Percentage of SOC Alerts Are False Positives](https://www.secure.com/blog/soc/soc-alerts), [PII Redaction Accuracy: Why 70% Is Not Good Enough](https://www.getlimina.ai/en/blog/pii-redaction-accuracy), [SafeGuard: real-time endpoint threat detection latency](https://arxiv.org/pdf/2607.10027).

### D. Model distribution & versioning — deferred, not needed at launch

**Decision: ship via bundling, not a separate distribution channel, for now.**

- Extension: model stays bundled in the extension package (`pretzel/public/models/themis/`). Chrome Web Store already auto-updates installed extensions, including bundled files, on every new version — zero extra infrastructure, zero extra cost.
- Desktop: same approach — model ships via electron-builder `extraResources` inside the app package. `electron-builder.yml`'s `publish: provider: github` means update distribution already goes through GitHub Releases, which doesn't meter bandwidth on release assets regardless of file size — confirmed in this repo's own config, no change needed there either.

**Why this is fine for launch**: the only thing a separate distribution channel buys is updating the model *without* shipping a whole new app version. That's a nice-to-have once model-iteration cadence outpaces release cadence — not a blocker, since the feature itself isn't live yet.

**Deferred option, revisit trigger**: if/when model updates need to ship faster than app releases, use Cloudflare R2 (zero egress fees, ~$0.002/mo storage for a 140MB file, free tier covers the realistic request volume at current scale) — not Render (bandwidth overage at $0.15/GB would make routing a 140MB file through the paid backend a real recurring cost at any meaningful user count: ~$21 per 1,000-user update cycle, ~$210 per 10,000). This repo's `backend` Render plan should never serve this file.

### E. Capability probe + telemetry

`LocalJudge.isAvailable()` currently just reflects "did the model finish loading" — no real signal about whether the device *should* attempt loading it in the first place. Needs:
- A probe: desktop (`os.cpus()`/`os.totalmem()`/`os.arch()` — exact), extension (`navigator.deviceMemory`/`hardwareConcurrency` — deliberately coarse, fingerprinting-resistant).
- A new telemetry event (same fire-and-forget pattern as `reportDegraded`) reporting probe result + whether the model actually loaded.

Two purposes, not just observability: (1) gates the load attempt itself — don't try loading 174MB on a low-RAM device, bad UX; (2) fleet-wide visibility for support/admin ("why does this seat show baseline-only detection") — feeds the pretzel-console status indicator in F.

### F. Public documentation

- mykka.ai FAQ entry: enhanced (on-device) detection is available on supported platforms/hardware; baseline detection (today's fixed-function engine) always runs regardless.
- pretzel-console: admin-facing status indicator per seat — enhanced vs. baseline-only — so org admins understand fleet coverage isn't 100% by design, not a bug.

### G. Store/release readiness — ✅ done (confirmed by user, 2026-10-06)

Before any public release of this feature:
- Chrome Web Store developer account — ✅ already paid ($5, one-time).
- Package size vs. current published Chrome Web Store limits — ✅ done.
- Permissions justification (`offscreen` permission) and privacy-practices disclosure updated to reflect the bundled model — ✅ done. This is a selling point (nothing leaves the device) once declared correctly, not a liability.

## Cost summary (confirmed 2026-10-05)

| Section | New recurring cost |
|---|---|
| A (desktop parity) | $0 — onnxruntime-node is free/open-source |
| B (real rule authoring) | $0 new — adds calls to the Claude API already paid for today's rule-creation flow, triggered only on admin rule edits |
| C (validation) | $0 — log rows into the existing DB, no content, negligible volume |
| D (distribution) | $0 at launch (bundling); R2 deferred, effectively $0 if/when adopted (~$0.002/mo storage, $0 egress) — explicitly must NOT route through Render |
| E (probe + telemetry) | $0 — extra fields on existing telemetry |
| F (public docs) | $0 — static content on existing mykka-web |
| G (store readiness) | $0 — $5 one-time fee already paid |

**Total new recurring cost: $0.** Only risk is self-inflicted (routing model downloads through Render instead of R2, if D is ever built) — explicitly called out above to prevent that mistake.

## Open items carried over from the original spike plan, still unresolved

- No fleet hardware/browser telemetry exists today — E is net-new, not an extension of something partial.
- Coverage caveat (neither platform reaches 100% of devices/browsers) still needs the public documentation in F before this ships broadly.
- Exact current Chrome Web Store package size limit — not verified with confidence, check live docs before G's submission step.
