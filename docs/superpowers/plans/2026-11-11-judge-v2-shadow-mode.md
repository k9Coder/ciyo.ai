# Judge v2 Shadow Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the Judge v2 cascade silently on real prompts in the extension and desktop app, store its verdicts next to the primary (regex/keyword) decision with no prompt content, and stop enforcing `judge_prompt` rules / loading Themis.

**Architecture:** New workspace package `@mykka/judge-v2` (TS cascade + ONNX scorer + shadow runner + model store, ORT injected). Extension hosts it in the offscreen document; desktop in the Electron main process. Rows go to a new `judge_shadow_checks` table via `POST /v1/telemetry/judge-shadow`.

**Tech Stack:** TypeScript, vitest, onnxruntime-web / onnxruntime-node 1.30.0, `@huggingface/transformers` tokenizer, Fastify + Drizzle (Postgres), Electron, Chrome MV3.

**Spec:** `docs/superpowers/specs/2026-11-11-judge-v2-shadow-mode-design.md`

**Worktree / branch:** `C:/Users/yarin/Documents/mykka.ai-shadow`, `feat/judge-v2-shadow` from `origin/staging` (3e8fe60). One PR into `staging` at the end — **only after owner OK**.

## Global Constraints

- No prompt text, matched text, or text-derived hash in any shadow payload; backend rejects extra keys.
- Shadow never awaited on the send path; any shadow exception is swallowed and logged once.
- Locked policy: fast_min 0.85, second_min 0.85, warn_fast_min 0.43, warn_second_min 0.70, window_tokens 150, max_windows 3.
- Queue: 1 job at a time, max 4 queued, oldest dropped → `skipped`. Per-check budget 60 000 ms; second-model timeout 10 000 ms; idle unload 300 000 ms; max_message_tokens 4096.
- Skip when desktop `os.freemem() < 1 GiB` or extension `navigator.deviceMemory < 4`.
- `$0`: no paid services; models on GitHub Release assets. No push / release / PR without owner OK.
- Secondary verdict enum: `block | warn | ok | pending | skipped | error | not_applicable`. Primary action enum: `block | warn | log | none`. Surface enum: `extension | desktop`.

## Review Focus

1. Huge pasted prompt (≥ 100 000 chars): runner truncates to 4096 tokens, finishes within budget, UI unaffected → test in Task 5.
2. Burst of sends (10 in 1 s): queue drops oldest with `skipped` rows, never more than 1 inference in flight → test in Task 5.
3. Download interrupted / checksum mismatch: no partial model used, retried next start → test in Task 6.
4. Policy with zero enabled `judge_prompt` rules: no download, no model load, no rows → test in Task 5.
5. Non-Latin text (Hebrew, Chinese, emoji): span offsets are UTF-16 indices matching Python's mapped offsets → parity fixtures in Task 3 include he/zh/emoji.

---

### Task 0: Bring Judge v2 into the branch

**Files:** merge only.

- [ ] **Step 1:** `git merge --no-ff feat/judge-v2-zero-cost` (from `mykka.ai-shadow`). Expected: clean merge (branch only touches `models/judge-v2`, docs). Resolve any doc-index conflict by keeping both entries.
- [ ] **Step 2:** `cd models/judge-v2 && PYTHONPATH=. python -m pytest -q -m "not slow"` → 189 passed; `node --test bench/` → 18 pass.
- [ ] **Step 3:** Commit is the merge commit.

### Task 1: Stop enforcing `judge_prompt`, unload Themis

**Files:**
- Modify: `packages/detect/src/policy/bridge.ts:55` (`enforced: false` for judge_prompt)
- Modify: `packages/detect/src/detection/engine.ts:306-307` (judge findings use `rule.enforced`, not hard-coded `true`)
- Modify: `pretzel/src/background/service-worker.ts:20-60,126` (no `RemoteLocalJudge`, call `detectPrompt` without judge)
- Modify: `pretzel-desktop/electron/proxy.ts:33-36,151` (no `ThemisLocalJudge`, no judge arg)
- Test: `packages/detect/tests/policy/bridge.test.ts`, `packages/detect/tests/detection/shadow-mode.test.ts`

**Interfaces:** Produces: `detectPrompt` unchanged signature; `judge_prompt` rules never appear in `findings`.

- [ ] **Step 1: failing tests**
```ts
test("bridge marks judge_prompt rules not enforced", () => {
  const p = bridgePolicy(docWith({ kind: "judge_prompt", prompt: "contains a customer list", action: "block" }));
  expect(p.custom.find(r => r.kind === "judge_prompt")!.enforced).toBe(false);
});
test("a matching judge_prompt rule produces no enforced finding", async () => {
  const judge = { isAvailable: () => true, classify: async () => ({ verdict: "match", confidence: 0.99 }) };
  const r = await detectPrompt(input("customer list: ..."), policyWithJudgeRule(), undefined, false, judge);
  expect(r.findings).toEqual([]);
  expect(r.highestAction).toBe("log");
});
```
- [ ] **Step 2:** `pnpm --filter @mykka/detect test` → both FAIL.
- [ ] **Step 3:** Implement the two detect changes. Remove judge from both call sites; delete `pretzel/src/offscreen/themis-judge.ts`, `pretzel/src/background/remote-local-judge.ts`, `pretzel-desktop/electron/themis-judge.ts` and their tests; remove Themis `extraResources` from `electron-builder.yml` and `before-pack.js`. Offscreen stays (Task 8 reuses it).
- [ ] **Step 4:** `pnpm --filter @mykka/detect test && pnpm --filter pretzel-extension test && pnpm --filter pretzel-desktop test` → all pass; `pnpm -r typecheck` clean.
- [ ] **Step 5:** `git commit -m "feat(detect): stop enforcing judge_prompt rules and unload Themis for judge v2 shadow"`

### Task 2: `@mykka/judge-v2` package + TS cascade

**Files:**
- Create: `packages/judge-v2/{package.json,tsconfig.json,vitest.config.ts}`, `src/cascade.ts`, `src/index.ts`
- Test: `packages/judge-v2/tests/cascade.test.ts` (port every case of `models/judge-v2/bench/cascade.test.mjs`)

**Interfaces:** Produces:
```ts
export interface Scorer { scoreWithSpans(message: string, rules: string[]): Promise<{ p: number; span: [number, number] | null }[]>; dispose?(): void }
export interface ConfirmPolicy { fastMin: number; secondMin: number; warnFastMin?: number; warnSecondMin?: number }
export interface CascadeOptions { fast: Scorer; second: Scorer | (() => Promise<Scorer>) | null; windowTokens: number; maxWindows: number; secondTimeoutMs: number; idleUnloadMs: number; confirm: ConfirmPolicy }
export interface RuleResult { rule: string; violated: boolean; warn: boolean; pending: boolean; fastP: number; secondP: number | null; span: [number, number] | null; windows: number }
export function createCascade(o: CascadeOptions): { judge(message: string, rules: string[]): Promise<{ violated: boolean; warn: boolean; rules: RuleResult[] }> }
export const LOCKED_POLICY: { confirm: ConfirmPolicy; windowTokens: 150; maxWindows: 3 }
```
`RuleResult` adds `fastP`, `secondP`, `windows` to the JSON contract (needed for rows); everything else mirrors `cascade.mjs` exactly, including `windowsFor` with `pyRound`.

- [ ] **Step 1:** Port the tests (same fixtures/expectations), plus `test("result exposes fastP, secondP and windows used")`.
- [ ] **Step 2:** `pnpm --filter @mykka/judge-v2 test` → FAIL (module missing).
- [ ] **Step 3:** Port `cascade.mjs` to `src/cascade.ts`.
- [ ] **Step 4:** Tests pass.
- [ ] **Step 5:** `git commit -m "feat(judge-v2): TypeScript cascade runtime package"`

### Task 3: ONNX scorer with Python parity

**Files:**
- Create: `packages/judge-v2/src/scorer.ts`, `src/sequence.ts` (port of `judge/sequence.py`: `causal_step`, `rules_step`, `chunk_spans`, `message_windows`), `src/span.ts` (port of `judge/model.py` `span_scores`, `best_span`)
- Create: `models/judge-v2/scripts/dump_parity.py` → writes `packages/judge-v2/tests/fixtures/parity_{fast_v7,so_v7}.json`
- Test: `packages/judge-v2/tests/scorer.parity.test.ts`

**Interfaces:**
```ts
export interface ModelFiles { onnx: Uint8Array | string; tokenizerJson: string; config: JudgeConfig }
export function createOnnxScorer(ort: typeof import("onnxruntime-common"), files: ModelFiles, opts?: { threads?: number }): Promise<Scorer & { modelVersion: string }>
```
`ort` is injected (`onnxruntime-node` or `onnxruntime-web`); tokenizer via `@huggingface/transformers` `PreTrainedTokenizer` built from `tokenizerJson` + config (no network). Offsets are UTF-16 indices.

- [ ] **Step 1:** `dump_parity.py`: 24 dev2 messages (8 en, 4 he, 4 zh, 2 ar, 2 with emoji, 4 longer than 600 chars), 3 rules each; writes `{message, rules, token_ids_first_step, results:[{p, span}]}` using `OnnxJudge`. Run it for both models; commit fixtures.
- [ ] **Step 2: failing test**
```ts
const dir = process.env.JUDGE_V2_MODELS; // e.g. ../../models/judge-v2/artifacts
test.skipIf(!dir)("fast_v7 matches Python", async () => {
  const s = await createOnnxScorer(ortNode, await loadDir(`${dir}/fast_v7`));
  for (const c of fixture("fast_v7")) {
    const out = await s.scoreWithSpans(c.message, c.rules);
    out.forEach((o, i) => { expect(Math.abs(o.p - c.results[i].p)).toBeLessThan(1e-3); expect(o.span).toEqual(c.results[i].span); });
  }
});
// same for so_v7; plus a non-skipped unit test of best_span/chunk_spans against small hand cases from tests/test_model.py / test_sequence.py
```
- [ ] **Step 3:** `JUDGE_V2_MODELS=... pnpm --filter @mykka/judge-v2 test` → FAIL.
- [ ] **Step 4:** Implement the ports.
- [ ] **Step 5:** Pass for both models. Record wall time of the fixture run in the commit body.
- [ ] **Step 6:** `git commit -m "feat(judge-v2): ONNX scorer with Python parity fixtures"`

### Task 4: Backend table + endpoint

**Files:**
- Modify: `backend/src/db/schema.ts` (new enums + `judgeShadowChecks`), generate migration with `pnpm --filter backend db:generate`
- Modify: `backend/src/telemetry/{router.ts,service.ts}`
- Test: `backend/tests/telemetry/judge-shadow.test.ts` (follow the existing shadow-verdict route test file's setup)

**Interfaces:** Table `judge_shadow_checks`: `id uuid pk`, `tenant_id` fk, `member_id` fk nullable, `check_id uuid not null`, `surface` enum, `rule_id uuid not null`, `rule_kind` text-enum (`keyword|pattern|judge_prompt`), `primary_action` enum, `secondary_verdict` enum, `fast_score numeric(4,3)` null, `second_score numeric(4,3)` null, `span_start int` null, `span_end int` null, `message_chars int not null`, `windows smallint not null`, `latency_ms int not null`, `model_version text not null` (regex `^[a-z0-9_.-]{1,32}$`), `occurred_at timestamptz`, `created_at` default now; indexes `(tenant_id, occurred_at)`, `(check_id)`.
Route `POST /v1/telemetry/judge-shadow`, same auth + `bodyLimit: 64*1024`, body = array ≤ 100 of `JudgeShadowRow` (Task 5), camelCase keys.

- [ ] **Step 1: failing tests:** 204 + rows stored for a valid batch; 400 for: unknown key (`{..., text: "x"}`), non-UUID `checkId`/`ruleId`, bad enum, score outside [0,1], negative/NaN ints, `spanEnd < spanStart`, `modelVersion` failing regex, batch of 101; 401 without auth; rows never land in `events` or `shadow_verdicts`.
- [ ] **Step 2:** `pnpm --filter backend test -- judge-shadow` → FAIL.
- [ ] **Step 3:** Implement; strict whitelist of keys.
- [ ] **Step 4:** Pass; full `pnpm --filter backend test` green.
- [ ] **Step 5:** `git commit -m "feat(backend): judge_shadow_checks table and telemetry endpoint"`

### Task 5: Shadow runner

**Files:** Create `packages/judge-v2/src/shadow.ts`; test `packages/judge-v2/tests/shadow.test.ts`

**Interfaces:**
```ts
export interface JudgeShadowRow { checkId: string; surface: "extension" | "desktop"; ruleId: string; ruleKind: "keyword" | "pattern" | "judge_prompt";
  primaryAction: "block" | "warn" | "log" | "none"; secondaryVerdict: "block" | "warn" | "ok" | "pending" | "skipped" | "error" | "not_applicable";
  fastScore: number | null; secondScore: number | null; spanStart: number | null; spanEnd: number | null;
  messageChars: number; windows: number; latencyMs: number; modelVersion: string; occurredAt: string }
export interface ShadowRule { id: string; kind: "keyword" | "pattern" | "judge_prompt"; prompt?: string }
export interface PrimarySummary { actionByRuleId: Record<string, "block" | "warn" | "log"> }
export function createShadowRunner(o: { surface: JudgeShadowRow["surface"]; getCascade: () => Promise<ReturnType<typeof createCascade> | null>;
  modelVersion: () => string | null; report: (rows: JudgeShadowRow[]) => void; lowMemory: () => boolean; now?: () => number; budgetMs?: number; maxQueue?: number }):
  { submit(text: string, rules: ShadowRule[], primary: PrimarySummary): void; idle(): Promise<void> }
```
Rows: one per enabled `judge_prompt` rule (cascade result → `block` if violated, `warn` if warn, `pending` if pending, else `ok`), plus one `not_applicable` row per keyword/pattern rule in `primary.actionByRuleId`. `getCascade()` returning null (model not ready) → `skipped` rows. `checkId = crypto.randomUUID()`. Text reference dropped after the job.

- [ ] **Step 1: failing tests:** `submit` returns synchronously and never throws even when cascade rejects (→ `error` rows); rows contain no key outside `JudgeShadowRow` and no string value equal to/containing the message; zero `judge_prompt` rules and no primary hits → no rows, `getCascade` never called; 10 rapid submits with a slow fake cascade → at most 1 concurrent `judge`, 5 `skipped` checks (1 running + 4 queued kept); `lowMemory()` true → `skipped`; budget exceeded → `pending`; 100 000-char message passes through without error (cascade fake asserts it was called); primary keyword hit recorded as `not_applicable` with its action.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat(judge-v2): shadow runner producing content-free rows"`

### Task 6: Model manifest + store

**Files:** Create `packages/judge-v2/src/models.ts` (manifest + `ensureModels`), `src/store-fs.ts` (desktop), `src/store-cache.ts` (extension Cache API); tests `tests/models.test.ts`

**Interfaces:**
```ts
export interface ModelFile { name: string; url: string; bytes: number; sha256: string }
export interface ModelManifest { version: string; fast: ModelFile[]; second: ModelFile[] }
export const MANIFEST: ModelManifest; // version "v7", URLs https://github.com/<owner>/<repo>/releases/download/judge-v2-v7/<name>
export interface ModelStore { has(version: string, name: string): Promise<boolean>; read(version: string, name: string): Promise<Uint8Array>;
  write(version: string, name: string, data: Uint8Array): Promise<void>; markReady(version: string): Promise<void>; isReady(version: string): Promise<boolean>; prune(keep: string): Promise<void> }
export function ensureModels(m: ModelManifest, store: ModelStore, fetchFn: typeof fetch): Promise<"ready" | "downloading" | "failed">
```
Fill `MANIFEST` sha256/bytes from `scripts/hash_models.mjs` (prints the manifest from `artifacts/`). Owner/repo = the repo the desktop app publishes to (`electron-builder.yml` `publish`).

- [ ] **Step 1: failing tests** (in-memory store, fake fetch): sha mismatch → file not written, status `failed`, `isReady` false; interrupted (fetch throws mid-way) → next call re-downloads only missing files; all good → `markReady`, older versions pruned; concurrent `ensureModels` calls share one download.
- [ ] **Step 2–4:** FAIL → implement → PASS. Desktop store writes `<file>.part` then renames.
- [ ] **Step 5:** `git commit -m "feat(judge-v2): model manifest and checksum-verified store"`

### Task 7: Desktop wiring

**Files:** Create `pretzel-desktop/electron/judge-shadow.ts`, `report-judge-shadow.ts`; modify `proxy.ts` (after `evaluateRequest`, line ~415), `main.ts` (start `ensureModels` after policy sync when a `judge_prompt` rule exists); test `pretzel-desktop/tests/unit/judge-shadow.test.ts`

- [ ] **Step 1: failing tests:** proxy forwards/blocks exactly as before when the runner throws or is slow (use a fake runner whose `submit` throws; assert response unchanged and timing not awaited); `report-judge-shadow` POSTs to `/v1/telemetry/judge-shadow` in batches ≤ 100 and swallows network errors; runner gets `ShadowRule[]` mapped from policy (judge_prompt prompt text, keyword/pattern ids) and `PrimarySummary` from `result.findings`.
- [ ] **Step 2–4:** FAIL → implement (`onnxruntime-node` already a dependency, `asarUnpack` already covers it; `lowMemory = os.freemem() < 2**30`) → PASS.
- [ ] **Step 5:** Manual: `pnpm --filter pretzel-desktop dev`, point `JUDGE_V2_MODEL_BASE` at a local dir with the v7 artifacts, send one prompt with a judge_prompt rule, see a row in local DB. Record result in commit body.
- [ ] **Step 6:** `git commit -m "feat(desktop): run judge v2 in shadow after the primary decision"`

### Task 8: Extension wiring

**Files:** Modify `pretzel/src/offscreen/offscreen.ts` (host runner, `JUDGE_SHADOW_SUBMIT` message, returns rows via `JUDGE_SHADOW_ROWS` to SW), `pretzel/src/background/service-worker.ts` (after decision at line ~126: send submit; on rows message → `dispatchJudgeShadow`), create `pretzel/src/events/judge-shadow-dispatch.ts`; `manifest.config.ts` add `unlimitedStorage` + host permissions `https://github.com/*`, `https://objects.githubusercontent.com/*`, `https://release-assets.githubusercontent.com/*`; keep `wasm-unsafe-eval`. Tests in `pretzel/tests/unit/offscreen/` and `tests/unit/events/`.

- [ ] **Step 1: failing tests:** SW decision path resolves before the submit message is answered (fake `chrome.runtime.sendMessage` that never resolves); offscreen handler returns rows with no message text; dispatch batches ≤ 100, fire-and-forget; `lowMemory` uses `navigator.deviceMemory < 4` (undefined → false); offscreen creation failure → no throw, no rows.
- [ ] **Step 2–4:** FAIL → implement (onnxruntime-web WASM files already bundled under `public/ort/`; `ort.env.wasm.numThreads = 2` to limit CPU) → PASS.
- [ ] **Step 5:** Manual: load unpacked build with `VITE_JUDGE_V2_MODEL_BASE` pointing at a local server (`python -m http.server` over artifacts), send a ChatGPT prompt with a judge_prompt rule, confirm a row arrives and the send was not delayed. Record numbers (first-load time, per-check ms) in commit body.
- [ ] **Step 6:** `git commit -m "feat(extension): run judge v2 in shadow in the offscreen document"`

### Task 9: Report script + probe harness

**Files:** Create `backend/src/scripts/judge-shadow-report.ts` (+ `"report:judge-shadow"` script), `e2e/judge-shadow/probes.json` (≥ 40 probes: 20 should-block, 10 should-warn-or-block, 10 benign near-misses; synthetic only), `e2e/judge-shadow/probes.spec.ts`; test `backend/tests/scripts/judge-shadow-report.test.ts`

- [ ] **Step 1: failing test:** report over seeded rows prints: checks, verdict mix, agreement matrix (primary acted yes/no × secondary block/warn/ok/other), pending/skipped/error %, latency p50/p95 per surface, per model version; `--tenant` filter works.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5:** Probe spec (runs only with `PROBE_TENANT_TOKEN` set, skipped in CI): sends each probe sequentially through the extension on the probe tenant, polls the DB for the row by time order, writes `e2e/judge-shadow/probe-results.json` with expected vs actual. Not a pass/fail gate.
- [ ] **Step 6:** `git commit -m "feat: judge v2 shadow report and probe harness"`

### Task 10: Docs + release prep (no publish)

- [ ] **Step 1:** Update `docs/index.md` with spec/plan links; README section in `packages/judge-v2/README.md`: how shadow works, privacy contract, how to publish models (`gh release create judge-v2-v7 artifacts/fast_v7/* artifacts/so_v7/*` with renamed files matching `MANIFEST`), how to read the report.
- [ ] **Step 2:** Full suites: `pnpm -r test`, `pnpm -r typecheck`, `models/judge-v2` pytest → all green.
- [ ] **Step 3:** `git commit -m "docs: judge v2 shadow mode"`
- [ ] **Step 4:** STOP. Ask owner to (a) publish the release assets, (b) OK the PR into `staging`.
