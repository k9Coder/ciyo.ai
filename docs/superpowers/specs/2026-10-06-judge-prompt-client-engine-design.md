# Design: judge_prompt client-engine — real on-device enforcement

Status: approved, ready for implementation planning.

## Context

This is the client-engine piece of Section B of `docs/superpowers/specs/2026-10-05-local-judge-themis-design.md` (the on-device local-judge feature), picking up where the Backend plan (`docs/superpowers/specs/2026-10-06-judge-prompt-rule-authoring-design.md`, merged via PR #56) left off.

Today, on-device Themis judging exists on both platforms but only as a shadow-mode proof of concept: a dev-flag-gated, fire-and-forget call (`local-judge-poc.ts` on desktop and extension) that runs the real Themis model against three **hardcoded** test prompts, logs the verdict locally, and never touches enforcement or the network. Meanwhile, the backend now compiles and publishes real, admin-authored `judge_prompt` rules — but `packages/detect/src/policy/bridge.ts` explicitly filters them out before the detection engine ever sees them, since nothing downstream knows how to evaluate them yet.

This plan closes that gap: real `judge_prompt` rules flow through the engine and are judged by the real on-device Themis model, with their verdict actually determining block/warn — the sole real enforcement mechanism for that rule, per the user's explicit, already-settled decision ("i want us to use the themis verdict ONLY"). In the same transition, the legacy rule kinds (`pattern`/`keyword`/`entropy`/`score`) flip to shadow-mode-only: they keep running and keep reporting what they would have matched, but they stop blocking or warning anyone. This is a deliberate, full, one-time flip — not gradual — because there are no production customers yet.

## Decisions carried from brainstorming

- The existing hardcoded-rule PoC files (`local-judge-poc.ts` on both platforms) are deleted; this plan's real wiring replaces them entirely.
- Shadow verdicts from legacy rules go to a **new, separate telemetry stream** (`POST /v1/telemetry/shadow-verdict`), not mixed into the existing `/v1/events` audit log. The audit log keeps meaning "this actually happened"; only real `judge_prompt` enforcement posts there.
- This plan includes the small backend addition needed to receive that telemetry (one endpoint, one table) — building the client emission with nowhere for it to land was rejected.
- When Themis is unavailable on a client (model still loading, unsupported hardware/browser), a `judge_prompt` rule simply fails open and silently does not fire for that request — no coverage-gap telemetry in this plan, matching the project's existing fail-open philosophy and the already-documented coverage caveat.

## Architecture / data flow

The per-request path on both platforms stays structurally the same: one call into `detectPrompt()`. Internally, the rule-evaluation loop runs every rule in `policy.custom` as it does today, but splits results by a new per-rule `enforced` flag:

- **Enforced findings** — after this plan, `judge_prompt` matches only — feed `highestAction` exactly as today: what can trigger `needsDecision()`/block on desktop, or the `DetectionResult` the extension's content script acts on.
- **Shadow findings** — pattern/keyword/entropy/score matches, always, post-flip — never touch `highestAction`. They're collected separately and handed to the new shadow-telemetry dispatcher: fire-and-forget, posting `{ruleId, kind, verdict, confidence, enforced: false, timestamp}` to the new backend endpoint.

`judge_prompt` evaluation calls the platform's real `LocalJudge.classify({text, prompt})`, awaited inline (the function is already `async`). If the judge is unavailable, that rule is skipped silently — no finding, no telemetry.

## Type / schema changes (`packages/detect`)

`RuleBaseSchema` (shared by every kind) gains:
```ts
enforced: z.boolean().default(true)
```
Defaulting to `true` keeps `baseline` rules and any future kind safe without touching every call site.

A new kind joins the `RuleSchema` discriminated union:
```ts
const JudgePromptRuleSchema = RuleBaseSchema.extend({
  kind: z.literal("judge_prompt"),
  prompt: z.string(),
})
```
`Policy["custom"][number]` becomes a 5-member union. `engine.ts`'s `runRule` switch (currently exhaustive over 4 kinds) gains a `case "judge_prompt"`.

`bridge.ts` changes:
- The `NonJudgePromptRule` type and the `.filter(rule => rule.kind !== "judge_prompt")` line are deleted — `judge_prompt` rules flow into `bridgeRule()` like every other kind.
- `bridgeRule()` gains `case "judge_prompt": return { ...base, kind: "judge_prompt" as const, prompt: rule.prompt ?? "", enforced: true }`.
- The other four cases each add `enforced: false` — the full flip, unconditional.

`ResolvedRuleSchema` (the backend-facing shape) is untouched — it already carries `prompt` and includes `"judge_prompt"` in `kind` from the backend plan's C2 fix.

## `engine.ts` changes

`detectPrompt()` gains a 5th, optional parameter:
```ts
export async function detectPrompt(
  input: DetectionInput | string, policy: Policy,
  hostnameOrUndefined?: string, pasteDetected = false,
  judge?: LocalJudge
): Promise<DetectionResult>
```
Omitting `judge` (existing callers, tests) means any `judge_prompt` rule is simply skipped — same as judge-unavailable, no new failure mode for existing call sites.

Rule loop restructure:
- All `judge_prompt` rules in `policy.custom` are gathered and evaluated via `Promise.all(rules.map(r => judge.classify({ text: input.text, prompt: r.prompt })))` — parallel, so N judge_prompt rules cost one Themis round-trip's latency, not N. A `match` verdict produces a `Finding` with `startOffset: 0, endOffset: input.text.length, matchedText: input.text` — there's no sub-span; Themis judges the whole message against the claim.
- Every other rule kind runs exactly as today, synchronously, in the existing loop.
- Findings split by `rule.enforced`: enforced findings go through the existing dedup (`dedupeIdenticalSpanFindings`) and `highestAction` computation unchanged; shadow findings skip dedup and are returned as a new `DetectionResult.shadowFindings` array. The caller dispatches these to telemetry.

`shadowFindings` lives on `DetectionResult` (not a side-channel) because `detectPrompt()` is already the single per-event call site on both platforms — one call, one await, no risk of an enforcement result and a telemetry result getting out of sync.

## Platform wiring

**Desktop (`proxy.ts`)** — `ThemisLocalJudge` already runs in-process (Electron main process, native `onnxruntime-node`); the existing singleton is passed into `evaluateRequest()`:
```ts
export async function evaluateRequest(policy: Policy, hostname: string, body: string, judge: LocalJudge): Promise<DetectionResult> {
  return detectPrompt({ text: body, hostname, inputType: 'prompt' }, policy, hostname, undefined, judge)
}
```
`handleInterceptedRequest()` drops the `void runLocalJudgePoc(hostname, body)` line; after `evaluateRequest()` returns, `result.shadowFindings` (if non-empty) is dispatched to the new telemetry call, same non-blocking pattern as today's audit events.

**Extension (`service-worker.ts`)** — `ThemisLocalJudge` only lives in the offscreen document; service workers can't hold a loaded model. A new adapter, `RemoteLocalJudge implements LocalJudge`, lazily ensures the offscreen document exists, sends a `LOCAL_JUDGE_CLASSIFY` message, and awaits the response — the same message round-trip the PoC already proved works, wrapped behind the `LocalJudge` interface. `isAvailable()` tracks whether the offscreen doc has reported model-ready. The `DETECT` handler passes a singleton `RemoteLocalJudge` into `detectPrompt()`, drops `void runLocalJudgePoc(...)`, dispatches `result.shadowFindings` the same way as desktop.

**Shadow telemetry dispatch** — one new function per platform (`dispatchShadowTelemetry`, mirroring `dispatchEvents`), batching all of a request's shadow findings into a single POST (an array) rather than one call per finding.

## Error handling & timeouts

Two new failure modes, since today's Themis calls are fire-and-forget and their failures are invisible:

- **`classify()` rejects or hangs.** Each `judge_prompt` evaluation is wrapped in its own try/catch and a timeout (`Promise.race` against ~2s) — a rejection or timeout is treated identically to `isAvailable() === false`: no finding, nothing enforced, nothing logged. Caught **per-rule**, not around the whole `Promise.all` — one broken judge_prompt rule must never take down the synchronous legacy-rule findings or the overall `detectPrompt()` promise. A timeout is necessary on both platforms: desktop's native call could hang on a corrupt model file; the extension's message round-trip can hang forever if the offscreen document crashed mid-call.
- **Shadow/telemetry dispatch failure** — already fire-and-forget, same as today's audit events; a failed POST is swallowed, not retried.

Nothing about judge_prompt failure ever flips to fail-closed — that would turn a flaky/slow model into an outage.

## Backend addition — shadow-verdict endpoint + storage

New endpoint: `POST /v1/telemetry/shadow-verdict`, same **Org** auth as `/v1/events`. Body: an array of `{ ruleId: string, kind: string, verdict: "match"|"no_match", confidence: number, enforced: false, timestamp: string }` — `enforced` is always `false` here, since only shadow findings ever reach this endpoint. No raw content, ever.

New table, `shadow_verdicts`: `id, tenantId, ruleId, kind, verdict, confidence, timestamp, createdAt` — `tenantId` from the auth context server-side, not the client payload. No console UI reads this table in this plan; it exists for Section C (real-world validation) to read later. Retention follows the existing `auditRetentionDays` convention (90 days). No per-tenant rate limiting in this plan — shadow volume could exceed today's audit-event volume, but bounding that is a tuning concern for after real data exists.

## Testing strategy

- **Engine tests**: a fake `LocalJudge` drives unit tests for: judge_prompt match → enforced finding → affects `highestAction`; legacy match → shadow finding → does not affect `highestAction`; judge unavailable → no finding, no crash; `classify()` rejecting/timing out → no finding, no crash, other rules in the same call still evaluate.
- **`bridge.ts` tests**: existing tests updated for the new `enforced` field; the current "safely excludes judge_prompt rules" test is replaced with "bridges a judge_prompt rule with `enforced: true`, prompt preserved."
- **Platform tests**: desktop's `evaluateRequest()` tests updated for the new `judge` parameter (fake judge injected); extension's `RemoteLocalJudge` gets unit tests against a fake `chrome.runtime` message channel (lazy offscreen-doc creation, round-trip, timeout).
- **Backend tests**: standard CRUD-style tests for the new endpoint (valid batch insert, auth rejection, tenant scoping).
- No new E2E stack work — correctness is provable at the unit/integration level per layer.

## Out of scope (explicitly)

- **Console-UX** (showing the generated prompt in assistant chat, disabled manual RuleForm option) — separate plan.
- **Section C** (real-world shadow-vs-judge_prompt validation) — needs this plan's real telemetry data first.
- **Section E** (capability probe, coverage telemetry) and **F** (public docs/FAQ, console coverage indicator) — not started.
- **Section D** (model distribution/versioning) — deferred by design.
- Any console UI surfacing `shadow_verdicts` — the data exists for later use, nothing reads it yet.

## Verification

No code written yet. Next step: `superpowers:writing-plans` to turn this into an executable implementation plan.
