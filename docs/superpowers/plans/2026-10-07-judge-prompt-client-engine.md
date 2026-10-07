# Judge Prompt Client-Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire real, admin-authored `judge_prompt` rules through the on-device Themis model for real enforcement, and flip the legacy `pattern`/`keyword`/`entropy`/`score` rule kinds to shadow-mode-only in the same transition.

**Architecture:** One new boolean field (`enforced`) on the engine's internal `Rule` type decides whether a rule's findings can block/warn (`judge_prompt`, always) or only get reported as shadow telemetry (legacy kinds, always, post-flip). `detectPrompt()` stays a single function: its existing synchronous matcher loop is untouched, a new parallel `Promise.all` block awaits the real `LocalJudge.classify()` call per `judge_prompt` rule, and the combined findings are split by `enforced` before computing `highestAction`. Each platform wires its already-built Themis judge (desktop: native, in-process; extension: message-passed to an offscreen document) into this single call, and a new backend endpoint receives the shadow telemetry.

**Tech Stack:** TypeScript, Zod (`packages/detect`), Vitest, Electron (`pretzel-desktop`), Chrome MV3 extension (`pretzel`), Fastify + Drizzle ORM + Postgres (`backend`).

**Spec:** `docs/superpowers/specs/2026-10-06-judge-prompt-client-engine-design.md`

## Global Constraints

- No raw content is ever sent off-device for judging (Themis runs locally) or included in shadow telemetry — only `{ruleId, kind, verdict, confidence, enforced, timestamp}`.
- `judge_prompt` rules are the sole real enforcement mechanism for their own rule — no fallback matcher.
- Legacy rule kinds (`pattern`/`keyword`/`entropy`/`score`) are shadow-mode-only, unconditionally, for every rule of those kinds — not a per-rule or per-tenant choice.
- When the local judge is unavailable (not loaded, unsupported platform) or a `classify()` call fails/times out (2000ms), the affected `judge_prompt` rule fails open silently — no finding, no telemetry, never fail-closed.
- The existing hardcoded-rule PoC files (`local-judge-poc.ts` on both platforms, `packages/detect/src/judge/poc-rules.ts`) are deleted as part of this plan.
- Shadow telemetry goes to a new, separate endpoint (`POST /v1/telemetry/shadow-verdict`), never mixed into the existing `/v1/events` audit log.

## Review Focus

- A `judge_prompt` rule whose `classify()` call throws or times out must not corrupt or abort the other rules' findings in the same request — one broken rule fails open alone, the rest of detection proceeds normally.
- A policy with zero `judge_prompt` rules must not pay any `Promise.all`/judge overhead — the existing synchronous legacy-rule path stays exactly as fast as before this plan.
- A failed shadow-telemetry POST (network error, backend down) must never affect the returned `DetectionResult` or the request/response path on either platform — fire-and-forget, same as today's audit-event dispatch.
- A `judge_prompt` match's `matchedText` must still respect the existing ~200-char truncation convention every other rule kind follows — an admin reading the audit log shouldn't see one rule kind's snippet balloon to the full message length.
- The new backend endpoint must reject a malformed or oversized batch (invalid `kind`/`verdict` enum value, unparseable `timestamp`, an array larger than a sane cap) with `400`, not crash or silently accept garbage rows.

---

### Task 1: `packages/detect` schema — `enforced` field and `judge_prompt` rule kind

**Files:**
- Modify: `packages/detect/src/policy/schema.ts`
- Modify: `packages/detect/src/policy/defaults.ts`
- Test: `packages/detect/tests/policy/schema.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RuleBaseSchema` gains `enforced: z.boolean().default(true)`; a new `JudgePromptRuleSchema` (`kind: "judge_prompt"`, `prompt: string`) joins `RuleSchema`'s discriminated union. `Rule` (the `z.infer`'d type) becomes a 5-member union. Task 2 consumes this directly in `engine.ts`; Task 4 consumes it in `bridge.ts`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/detect/tests/policy/schema.test.ts — add inside a new describe block at the end of the file

describe("judge_prompt rule kind and enforced field", () => {
  it("parses a judge_prompt rule with a prompt field", () => {
    const rule = {
      id: "jp-1", name: "SSN judge", description: "", severity: "high",
      action: "block", enabled: true, tags: [],
      kind: "judge_prompt", prompt: "Does this message contain a Social Security Number?",
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("judge_prompt");
  });

  it("defaults enforced to true when omitted", () => {
    const rule = {
      id: "d-1", name: "Dict", description: "", severity: "medium",
      action: "warn", enabled: true, tags: [],
      kind: "dictionary", terms: ["secret"], caseSensitive: false,
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enforced).toBe(true);
  });

  it("accepts an explicit enforced: false", () => {
    const rule = {
      id: "d-2", name: "Dict", description: "", severity: "medium",
      action: "warn", enabled: true, tags: [], enforced: false,
      kind: "dictionary", terms: ["secret"], caseSensitive: false,
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.enforced).toBe(false);
  });
});
```

Add `RuleSchema` to this test file's existing import line from `"../../src/policy/schema"` (it currently imports `PolicySchema, PolicyDocSchema` — add `RuleSchema`).

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/detect && npx vitest run tests/policy/schema.test.ts`
Expected: FAIL — `RuleSchema` import works (it's already exported), but the first test fails with `result.success === false` (no `judge_prompt` member in the union yet), and the `enforced` assertions fail (`result.data.enforced` is `undefined`, not `true`/`false`, since the field doesn't exist).

- [ ] **Step 3: Implement the schema changes**

In `packages/detect/src/policy/schema.ts`, add `enforced` to `RuleBaseSchema`:

```typescript
const RuleBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  severity: SeveritySchema,
  action: ActionSchema,
  enabled: z.boolean(),
  tags: z.array(z.string()),
  enforced: z.boolean().default(true),
});
```

Add a new rule schema after `ScoreRuleSchema`:

```typescript
export const JudgePromptRuleSchema = RuleBaseSchema.extend({
  kind: z.literal("judge_prompt"),
  /** The admin's plain-English claim, judged against message content on-device. */
  prompt: z.string().min(1),
});
```

Add it to the union:

```typescript
export const RuleSchema = z.discriminatedUnion("kind", [
  PatternRuleSchema,
  EntropyRuleSchema,
  DictionaryRuleSchema,
  ScoreRuleSchema,
  JudgePromptRuleSchema,
]);
```

Export its derived type alongside the others:

```typescript
export type JudgePromptRule = z.infer<typeof JudgePromptRuleSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/detect && npx vitest run tests/policy/schema.test.ts`
Expected: the 3 new tests PASS. The file's other existing tests likely still pass too (they don't construct bare `Rule`-typed literals outside of `safeParse` calls — see Step 5 for the one place that does need a fix).

- [ ] **Step 5: Fix `defaults.ts`'s compile error**

`DEFAULT_POLICY` in `packages/detect/src/policy/defaults.ts` is typed as `Policy` directly (not run through `.parse()`), so TypeScript now requires `enforced` on all of its literal baseline/custom rule objects (the zod `.default()` only fills in missing fields at parse time — it doesn't make the field optional in the inferred output type). Add `enforced: true,` as a new line directly after `enabled: true,` on every single rule object in both the `baseline` array and the `custom` array (25 objects total: 23 in `baseline`, 2 in `custom` — confirm with `grep -c "^      id:" src/policy/defaults.ts`). This is mechanical — every occurrence of:

```typescript
      enabled: true,
      tags: [...],
```

becomes:

```typescript
      enabled: true,
      enforced: true,
      tags: [...],
```

Explicitly `true` (not relying on the omitted-field default) because these are the extension's own always-on built-in safety net (API keys, SSNs, credit cards, PEM keys, etc.) — a completely separate concern from the backend-authored custom rules this plan flips to shadow in Task 4, and the explicitness makes that distinction auditable rather than accidental.

- [ ] **Step 6: Run the full `packages/detect` suite and typecheck**

Run: `cd packages/detect && npx vitest run && npx tsc --noEmit`
Expected: `vitest run` — all existing tests still pass (dictionary/entropy/pii/api-keys/corpus tests spread `DEFAULT_POLICY.baseline`, so they inherit `enforced: true` automatically). `tsc --noEmit` reports errors in `src/detection/engine.ts` and `src/policy/bridge.ts` — these are **expected and not fixed yet**; `engine.ts`'s `runRule` switch and `bridge.ts`'s `bridgeRule` switch are both now non-exhaustive over the widened 5-member `Rule` union, and `bridge.ts`'s returned rule objects are missing `enforced`. Confirm the errors are confined to exactly those two files (Task 2 fixes `engine.ts`, Task 4 fixes `bridge.ts`) before moving on — any error outside those two files is a real regression to fix now.

- [ ] **Step 7: Commit**

```bash
git add packages/detect/src/policy/schema.ts packages/detect/src/policy/defaults.ts packages/detect/tests/policy/schema.test.ts
git commit -m "feat(detect): add enforced field and judge_prompt rule kind to schema"
```

---

### Task 2: `packages/detect` engine — real `judge_prompt` enforcement via Themis

**Files:**
- Modify: `packages/detect/src/detection/engine.ts`
- Modify: `packages/detect/src/detection/types.ts`
- Test: `packages/detect/tests/detection/judge-prompt.test.ts` (create)

**Interfaces:**
- Consumes: `Rule`/`JudgePromptRule` from Task 1's `policy/schema.ts`; `LocalJudge`/`JudgeInput`/`JudgeVerdict` from the already-existing `packages/detect/src/judge/types.ts` (unchanged).
- Produces: `detectPrompt(input, policy, hostnameOrUndefined?, pasteDetected?, judge?: LocalJudge): Promise<DetectionResult>` — the new 5th parameter. Task 3 extends this same function's rule-splitting logic; Task 5 and Task 6 (platform wiring) call it with a real `judge`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/detect/tests/detection/judge-prompt.test.ts (new file)
import { describe, it, expect } from "vitest";
import { detectPrompt } from "../../src/detection/engine";
import { DEFAULT_POLICY } from "../../src/policy/defaults";
import type { Policy } from "../../src/policy/schema";
import type { JudgeInput, JudgeVerdict, LocalJudge } from "../../src/judge/types";

function policyWithJudgePrompt(prompt: string, action: "warn" | "block" = "block"): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: [],
    custom: [
      {
        id: "jp-1", name: "Judge rule", description: "", severity: "high",
        action, enabled: true, tags: [], enforced: true,
        kind: "judge_prompt", prompt,
      },
    ],
  };
}

class FakeJudge implements LocalJudge {
  constructor(
    private readonly verdict: JudgeVerdict,
    private readonly available = true,
    private readonly delayMs = 0,
    private readonly shouldThrow = false,
  ) {}
  isAvailable(): boolean { return this.available; }
  async classify(_input: JudgeInput): Promise<JudgeVerdict> {
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.shouldThrow) throw new Error("judge failed");
    return this.verdict;
  }
}

describe("detectPrompt — judge_prompt enforcement", () => {
  it("blocks when the judge returns a match verdict", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 });
    const result = await detectPrompt("this is a secret", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("block");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("jp-1");
  });

  it("does not block when the judge returns no_match", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "no_match", confidence: 0.9 });
    const result = await detectPrompt("nothing interesting", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("fails open silently when the judge is unavailable", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 }, false);
    const result = await detectPrompt("this is a secret", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("fails open silently when classify() throws, without affecting other rules", async () => {
    const policy: Policy = {
      ...policyWithJudgePrompt("Does this contain a secret?", "block"),
      custom: [
        ...policyWithJudgePrompt("x", "block").custom,
        {
          id: "dict-1", name: "Dict", description: "", severity: "medium",
          action: "warn", enabled: true, tags: [], enforced: true,
          kind: "dictionary", terms: ["banana"], caseSensitive: false,
        },
      ],
    };
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 }, true, 0, true);
    const result = await detectPrompt("I like banana bread", policy, "example.com", false, judge);
    // the broken judge_prompt rule produced nothing; the sync dictionary rule still fired
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.ruleId).toBe("dict-1");
  });

  it("fails open silently when classify() exceeds the timeout", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 }, true, 5000);
    const result = await detectPrompt("this is a secret", policy, "example.com", false, judge);
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  }, 10_000);

  it("omitting judge entirely skips judge_prompt rules with no error", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const result = await detectPrompt("this is a secret", policy, "example.com");
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("does not call classify at all when there are no judge_prompt rules", async () => {
    let calls = 0;
    class CountingJudge extends FakeJudge {
      async classify(input: JudgeInput): Promise<JudgeVerdict> {
        calls++;
        return super.classify(input);
      }
    }
    const judge = new CountingJudge({ verdict: "match", confidence: 0.9 });
    await detectPrompt("hello world", DEFAULT_POLICY, "example.com", false, judge);
    expect(calls).toBe(0);
  });

  it("truncates a judge_prompt match's matchedText to 200 chars, same as every other rule kind", async () => {
    const policy = policyWithJudgePrompt("Does this contain a secret?", "block");
    const judge = new FakeJudge({ verdict: "match", confidence: 0.9 });
    const longText = "x".repeat(500);
    const result = await detectPrompt(longText, policy, "example.com", false, judge);
    expect(result.findings[0]!.matchedText).toHaveLength(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/detect && npx vitest run tests/detection/judge-prompt.test.ts`
Expected: FAIL. `detectPrompt` doesn't accept a 5th `judge` parameter yet (TypeScript error / the argument is silently ignored at runtime since JS doesn't enforce arity — the actual observed failure is that `judge_prompt` rules are passed straight into `runRule()`'s switch, which has no `case "judge_prompt"` and falls through returning `undefined` instead of `Finding[]`, which then breaks the `for (const finding of ruleFindings)` loop with a runtime `TypeError: ruleFindings is not iterable` or produces no findings at all depending on how the fallthrough resolves — run it and confirm you get a genuine failure, not a type-only one, since `vitest run` uses esbuild and won't stop you at the type error).

- [ ] **Step 3: Implement — add `shadowFindings` to `DetectionResult` (prep for Task 3, needed now so `detectPrompt`'s return type is final)**

In `packages/detect/src/detection/types.ts`, add after the `Finding` interface:

```typescript
export interface ShadowFinding {
  ruleId: string;
  /** Engine-internal kind name — see judge/shadow-telemetry.ts for the backend-facing label. */
  kind: "dictionary" | "pattern" | "entropy" | "score";
  verdict: "match";
  confidence: number;
  timestamp: string;
}
```

Add `shadowFindings: ShadowFinding[];` to `DetectionResult`:

```typescript
export interface DetectionResult {
  findings: Finding[];
  shadowFindings: ShadowFinding[];
  highestAction: Action;
  promptHash: string;
  detectedAtMs: number;
  durationMs: number;
  signInNudge?: true;
}
```

(This task doesn't populate `shadowFindings` with real legacy-rule data yet — that's Task 3 — but the field must exist now so `emptyResult()` and the new return statement below compile. It's always `[]` until Task 3.)

- [ ] **Step 4: Implement — judge_prompt evaluation in `engine.ts`**

In `packages/detect/src/detection/engine.ts`, change the imports at the top:

```typescript
import type { Policy, Rule, PatternRule, EntropyRule, DictionaryRule, JudgePromptRule } from "../policy/schema";
import type { DetectionResult, DetectionInput, Finding, ScoreRule, ScoreSignalConfig } from "./types";
import type { LocalJudge } from "../judge/types";
```

Add a type alias and timeout helper right after the imports:

```typescript
/**
 * Rule excludes judge_prompt — runRule's switch stays exhaustive over the
 * kinds it evaluates synchronously; judge_prompt is evaluated separately,
 * in parallel, via LocalJudge (see detectPrompt).
 */
type SyncRule = Exclude<Rule, { kind: "judge_prompt" }>;

const JUDGE_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("judge timeout")), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}
```

Change `runRule`'s signature to use `SyncRule` instead of `Rule`:

```typescript
function runRule(
  text: string,
  normalised: string,
  rule: SyncRule | ScoreRule,
  codeSpans: ReturnType<typeof findCodeSpans>,
  pasteDetected: boolean
): Finding[] {
  if (!rule.enabled) return [];
  switch (rule.kind) {
    case "pattern":
      return runPatternRule(text, normalised, rule, codeSpans);
    case "entropy":
      return runEntropyRule(normalised, rule);
    case "dictionary":
      return runDictionaryRule(normalised, rule);
    case "score":
      return runScoreRule(text, rule, pasteDetected);
  }
}
```

Add a new function for judge_prompt evaluation, after `runRule`:

```typescript
async function runJudgePromptRules(
  text: string,
  rules: JudgePromptRule[],
  judge: LocalJudge | undefined,
): Promise<Finding[]> {
  if (!judge || rules.length === 0 || !judge.isAvailable()) return [];

  const results = await Promise.all(
    rules.map(async (rule): Promise<Finding | null> => {
      try {
        const verdict = await withTimeout(judge.classify({ text, prompt: rule.prompt }), JUDGE_TIMEOUT_MS);
        if (verdict.verdict !== "match") return null;
        return {
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          action: rule.action,
          matchedText: text.slice(0, 200),
          startOffset: 0,
          endOffset: text.length,
        };
      } catch {
        // Fail open: a broken/slow judge never blocks the user, and never
        // takes down the other rules evaluated in this same request.
        return null;
      }
    }),
  );

  return results.filter((f): f is Finding => f !== null);
}
```

Now update `detectPrompt()`'s signature and body. Change the signature:

```typescript
export async function detectPrompt(
  input: DetectionInput | string,
  policy: Policy,
  hostnameOrUndefined?: string,
  pasteDetected = false,
  judge?: LocalJudge,
): Promise<DetectionResult> {
```

Inside the body, after the existing `const allRules = [...policy.baseline, ...policy.custom];` line, split the rules and merge in the judge evaluation:

```typescript
  const allRules = [...policy.baseline, ...policy.custom];
  const syncRules = allRules.filter((r): r is SyncRule => r.kind !== "judge_prompt");
  const judgePromptRules = allRules.filter((r): r is JudgePromptRule => r.kind === "judge_prompt");

  const kindedFindings: KindedFinding[] = [];
  for (const rule of syncRules) {
    const ruleFindings = runRule(promptText, normalised, rule as SyncRule | ScoreRule, codeSpans, effectivePasteDetected);
    const isEntropy = (rule as SyncRule | ScoreRule).kind === "entropy";
    for (const finding of ruleFindings) kindedFindings.push({ finding, isEntropy });
  }

  const judgeFindings = await runJudgePromptRules(promptText, judgePromptRules, judge);
  for (const finding of judgeFindings) kindedFindings.push({ finding, isEntropy: false });

  const findings = dedupeIdenticalSpanFindings(kindedFindings);
```

(The loop body that was `for (const rule of allRules) { ... runRule(... rule as Rule | ScoreRule ...) ... }` is replaced by the `syncRules` loop above — same body, renamed variable and narrowed cast.)

Finally, update the two `return` sites to include `shadowFindings: []` (populated for real in Task 3):

```typescript
  return {
    findings,
    shadowFindings: [],
    highestAction,
    promptHash,
    detectedAtMs: Date.now(),
    durationMs,
  };
}

function emptyResult(_promptText: string, startPerf: number): DetectionResult {
  return {
    findings: [],
    shadowFindings: [],
    highestAction: "log",
    promptHash: "",
    detectedAtMs: Date.now(),
    durationMs: performance.now() - startPerf,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/detect && npx vitest run tests/detection/judge-prompt.test.ts`
Expected: PASS, 8/8.

- [ ] **Step 6: Run the full `packages/detect` suite**

Run: `cd packages/detect && npx vitest run`
Expected: all tests pass, including every existing `detection/*.test.ts` file (none of them construct `judge_prompt` rules, so `syncRules`/`judgePromptRules` filtering is a no-op for them and behavior is unchanged).

- [ ] **Step 7: Commit**

```bash
git add packages/detect/src/detection/engine.ts packages/detect/src/detection/types.ts packages/detect/tests/detection/judge-prompt.test.ts
git commit -m "feat(detect): real judge_prompt rule enforcement via LocalJudge"
```

---

### Task 3: `packages/detect` engine — shadow-mode split for legacy rules

**Files:**
- Modify: `packages/detect/src/detection/engine.ts`
- Create: `packages/detect/src/judge/shadow-telemetry.ts`
- Modify: `packages/detect/src/judge/index.ts`
- Modify: `packages/detect/src/index.ts`
- Test: `packages/detect/tests/detection/shadow-mode.test.ts` (create)

**Interfaces:**
- Consumes: `ShadowFinding` from Task 2's `detection/types.ts`; `Rule.enforced` from Task 1's `schema.ts`.
- Produces: `ShadowVerdictPayload` type and `toShadowVerdictPayload(f: ShadowFinding): ShadowVerdictPayload` function, exported from the package root — Task 5 (desktop) and Task 6 (extension) both consume this to build their telemetry POST bodies.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/detect/tests/detection/shadow-mode.test.ts (new file)
import { describe, it, expect } from "vitest";
import { detectPrompt } from "../../src/detection/engine";
import { DEFAULT_POLICY } from "../../src/policy/defaults";
import type { Policy } from "../../src/policy/schema";

function policyWithShadowDictionary(terms: string[]): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: [],
    custom: [
      {
        id: "shadow-dict-1", name: "Shadow Dict", description: "", severity: "high",
        action: "block", enabled: true, tags: [], enforced: false,
        kind: "dictionary", terms, caseSensitive: false,
      },
    ],
  };
}

function policyWithEnforcedDictionary(terms: string[]): Policy {
  return {
    ...DEFAULT_POLICY,
    baseline: [],
    custom: [
      {
        id: "enforced-dict-1", name: "Enforced Dict", description: "", severity: "high",
        action: "block", enabled: true, tags: [], enforced: true,
        kind: "dictionary", terms, caseSensitive: false,
      },
    ],
  };
}

describe("detectPrompt — shadow-mode split", () => {
  it("a shadow (enforced: false) rule match does not block, and does not appear in findings", async () => {
    const result = await detectPrompt("this has secretword in it", policyWithShadowDictionary(["secretword"]), "example.com");
    expect(result.highestAction).toBe("log");
    expect(result.findings).toHaveLength(0);
  });

  it("a shadow rule match appears in shadowFindings instead", async () => {
    const result = await detectPrompt("this has secretword in it", policyWithShadowDictionary(["secretword"]), "example.com");
    expect(result.shadowFindings).toHaveLength(1);
    expect(result.shadowFindings[0]!.ruleId).toBe("shadow-dict-1");
    expect(result.shadowFindings[0]!.kind).toBe("dictionary");
    expect(result.shadowFindings[0]!.verdict).toBe("match");
    expect(result.shadowFindings[0]!.confidence).toBe(1);
    expect(typeof result.shadowFindings[0]!.timestamp).toBe("string");
  });

  it("an enforced: true rule still blocks and feeds highestAction as before (regression check)", async () => {
    const result = await detectPrompt("this has secretword in it", policyWithEnforcedDictionary(["secretword"]), "example.com");
    expect(result.highestAction).toBe("block");
    expect(result.findings).toHaveLength(1);
    expect(result.shadowFindings).toHaveLength(0);
  });

  it("a rule with no match produces neither a finding nor a shadow finding", async () => {
    const result = await detectPrompt("nothing here", policyWithShadowDictionary(["secretword"]), "example.com");
    expect(result.findings).toHaveLength(0);
    expect(result.shadowFindings).toHaveLength(0);
  });
});
```

Add a second describe block in the same file for `toShadowVerdictPayload`:

```typescript
import { toShadowVerdictPayload } from "../../src/judge/shadow-telemetry";
import type { ShadowFinding } from "../../src/detection/types";

describe("toShadowVerdictPayload", () => {
  it("maps the engine-internal 'dictionary' kind to the backend-facing 'keyword' label", () => {
    const finding: ShadowFinding = {
      ruleId: "r1", kind: "dictionary", verdict: "match", confidence: 1, timestamp: "2026-10-07T00:00:00.000Z",
    };
    const payload = toShadowVerdictPayload(finding);
    expect(payload.kind).toBe("keyword");
    expect(payload.enforced).toBe(false);
    expect(payload.ruleId).toBe("r1");
    expect(payload.verdict).toBe("match");
    expect(payload.confidence).toBe(1);
    expect(payload.timestamp).toBe("2026-10-07T00:00:00.000Z");
  });

  it("passes pattern/entropy/score kinds through unchanged", () => {
    for (const kind of ["pattern", "entropy", "score"] as const) {
      const finding: ShadowFinding = { ruleId: "r2", kind, verdict: "match", confidence: 1, timestamp: "2026-10-07T00:00:00.000Z" };
      expect(toShadowVerdictPayload(finding).kind).toBe(kind);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/detect && npx vitest run tests/detection/shadow-mode.test.ts`
Expected: FAIL. The `enforced: false` rule's finding still ends up in `result.findings`/`highestAction` (nothing splits on `enforced` yet), `result.shadowFindings` is always `[]` (Task 2 left it hardcoded), and `../../src/judge/shadow-telemetry` doesn't exist yet (import error).

- [ ] **Step 3: Implement — `judge/shadow-telemetry.ts`**

```typescript
// packages/detect/src/judge/shadow-telemetry.ts
import type { ShadowFinding } from "../detection/types";

export interface ShadowVerdictPayload {
  ruleId: string;
  kind: string;
  verdict: "match" | "no_match";
  confidence: number;
  enforced: false;
  timestamp: string;
}

/**
 * The engine only knows its own internal kind names (dictionary/pattern/
 * entropy/score — see bridge.ts). The backend's rule records use "keyword"
 * for what the engine calls "dictionary"; every other kind name is shared.
 * Telemetry reports the backend-facing name so it's directly comparable to
 * the rule records Section C will eventually read it alongside.
 */
const RULE_KIND_LABEL: Record<ShadowFinding["kind"], string> = {
  dictionary: "keyword",
  pattern: "pattern",
  entropy: "entropy",
  score: "score",
};

export function toShadowVerdictPayload(finding: ShadowFinding): ShadowVerdictPayload {
  return {
    ruleId: finding.ruleId,
    kind: RULE_KIND_LABEL[finding.kind],
    verdict: finding.verdict,
    confidence: finding.confidence,
    enforced: false,
    timestamp: finding.timestamp,
  };
}
```

- [ ] **Step 4: Implement — split `kindedFindings` by `enforced` in `engine.ts`**

Add `enforced` and `kind` fields to the `KindedFinding` interface (`kind` is captured directly here, rather than re-finding the owning rule by id later, which would be both O(n²) and fragile):

```typescript
interface KindedFinding {
  finding: Finding;
  isEntropy: boolean;
  enforced: boolean;
  kind: "dictionary" | "pattern" | "entropy" | "score" | "judge_prompt";
}
```

Update both places that push into `kindedFindings` in `detectPrompt()` to carry both new fields through:

```typescript
  const kindedFindings: KindedFinding[] = [];
  for (const rule of syncRules) {
    const ruleFindings = runRule(promptText, normalised, rule as SyncRule | ScoreRule, codeSpans, effectivePasteDetected);
    const isEntropy = (rule as SyncRule | ScoreRule).kind === "entropy";
    for (const finding of ruleFindings) kindedFindings.push({ finding, isEntropy, enforced: rule.enforced, kind: rule.kind });
  }

  const judgeFindings = await runJudgePromptRules(promptText, judgePromptRules, judge);
  for (const finding of judgeFindings) kindedFindings.push({ finding, isEntropy: false, enforced: true, kind: "judge_prompt" });
```

Right after that block, replace the existing `const findings = dedupeIdenticalSpanFindings(kindedFindings);` line with the enforced/shadow split:

```typescript
  const enforcedKinded = kindedFindings.filter((k) => k.enforced);
  const shadowKinded = kindedFindings.filter((k) => !k.enforced);

  const findings = dedupeIdenticalSpanFindings(enforcedKinded);

  const shadowTimestamp = new Date().toISOString();
  const shadowFindings: ShadowFinding[] = shadowKinded.map((k) => ({
    ruleId: k.finding.ruleId,
    // shadowKinded only ever contains legacy kinds — judge_prompt rules are
    // always enforced: true (see bridge.ts), so this cast is safe.
    kind: k.kind as ShadowFinding["kind"],
    verdict: "match",
    confidence: 1,
    timestamp: shadowTimestamp,
  }));
```

Update `highestAction` computation to iterate `findings` as before (unchanged — it already only reads from the now-enforced-only `findings` array) and both `return` statements to use the real `shadowFindings` instead of `[]`:

```typescript
  return {
    findings,
    shadowFindings,
    highestAction,
    promptHash,
    detectedAtMs: Date.now(),
    durationMs,
  };
```

(`emptyResult()` keeps `shadowFindings: []` — a per-site-disabled host produces no findings of any kind.)

Add `ShadowFinding` to the type-only import from `"./types"` at the top of `engine.ts`.

- [ ] **Step 5: Update package exports**

In `packages/detect/src/judge/index.ts`, remove the two PoC-only exports and add the new ones:

```typescript
export type { JudgeInput, JudgeVerdict, LocalJudge } from './types'
export type { ShadowVerdictPayload } from './shadow-telemetry'
export { toShadowVerdictPayload } from './shadow-telemetry'
export { StubLocalJudge } from './stub-judge'
```

(Drops `export type { JudgePromptRule } from './poc-rules'` and `export { POC_JUDGE_RULES } from './poc-rules'` — that file is deleted in Task 4, alongside `bridge.ts`'s cleanup, since `bridge.ts` is the only remaining importer worth checking in the same pass. Don't delete `poc-rules.ts` here yet if anything still imports it — check in Task 4.)

In `packages/detect/src/index.ts`, update the judge section:

```typescript
// Local-judge enforcement + shadow-mode telemetry.
export type { JudgeInput, JudgeVerdict, LocalJudge } from './judge'
export type { ShadowVerdictPayload } from './judge'
export { toShadowVerdictPayload, StubLocalJudge } from './judge'
```

Also add the new schema exports from Task 1 that aren't exported yet:

```typescript
export { JudgePromptRuleSchema } from './policy/schema'
export type { JudgePromptRule } from './policy/schema'
```

And add `ShadowFinding` to the existing detection-types export line:

```typescript
export type { DetectionResult, DetectionInput, Finding, ShadowFinding, Action, Severity, InputType, ScoreRule, ScoreSignalConfig } from './detection/types'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd packages/detect && npx vitest run tests/detection/shadow-mode.test.ts`
Expected: PASS, 6/6.

- [ ] **Step 7: Run the full `packages/detect` suite**

Run: `cd packages/detect && npx vitest run`
Expected: all tests pass. `tests/judge/stub-judge.test.ts` is untouched by this task and should be unaffected.

- [ ] **Step 8: Commit**

```bash
git add packages/detect/src/detection/engine.ts packages/detect/src/judge/shadow-telemetry.ts packages/detect/src/judge/index.ts packages/detect/src/index.ts packages/detect/tests/detection/shadow-mode.test.ts
git commit -m "feat(detect): split engine findings into enforced vs shadow by rule.enforced"
```

---

### Task 4: `packages/detect` bridge — real rule mapping + PoC cleanup

**Files:**
- Modify: `packages/detect/src/policy/bridge.ts`
- Delete: `packages/detect/src/judge/poc-rules.ts`
- Test: `packages/detect/tests/policy/bridge.test.ts`

**Interfaces:**
- Consumes: `JudgePromptRuleSchema`/`enforced` from Task 1; `Policy["custom"][number]` (the 5-member union) from Task 1/Task 2.
- Produces: `bridgePolicy(doc: PolicyDoc, disabledSites: string[]): Policy` now returns `judge_prompt` rules with `enforced: true` and every legacy kind with `enforced: false` — this is what Task 5 and Task 6's real platform wiring actually receives from a published policy.

- [ ] **Step 1: Write the failing test**

Replace the existing "safely excludes judge_prompt rules instead of crashing" test in `packages/detect/tests/policy/bridge.test.ts` with:

```typescript
  it("bridges a judge_prompt rule with enforced: true and the prompt text preserved", () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'SSN',
        rules: [
          { id: 'r1', kind: 'judge_prompt', keywords: null, pattern: null, prompt: 'This message discloses a Social Security Number.', destinations: [], action: 'block', message: null, reportLevel: 'none' },
        ],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom).toHaveLength(1)
    expect(p.custom[0]!.kind).toBe('judge_prompt')
    expect(p.custom[0]!.enforced).toBe(true)
    expect((p.custom[0] as { prompt: string }).prompt).toBe('This message discloses a Social Security Number.')
  })

  it("bridges legacy rule kinds with enforced: false", () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Mixed',
        rules: [
          { id: 'r1', kind: 'keyword', keywords: ['secret'], pattern: null, destinations: [], action: 'warn', message: null, reportLevel: 'none' },
          { id: 'r2', kind: 'pattern', keywords: null, pattern: 'sk-[A-Za-z0-9]{20,}', destinations: [], action: 'block', message: null, reportLevel: 'none' },
          { id: 'r3', kind: 'entropy', keywords: null, pattern: null, destinations: [], action: 'warn', message: null, reportLevel: 'none' },
          { id: 'r4', kind: 'score', keywords: null, pattern: null, destinations: [], action: 'block', message: null, reportLevel: 'none' },
        ],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom).toHaveLength(4)
    for (const rule of p.custom) expect(rule.enforced).toBe(false)
  })
```

Also update the three existing passing tests ("maps keyword rule to DictionaryRule", "maps pattern rule to PatternRule", "maps entropy rule with defaults") to additionally assert `expect(p.custom[0]!.enforced).toBe(false)` — these already pass today on the old code (no `enforced` field exists to check), so adding the assertion is what turns them into part of this task's RED state.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/detect && npx vitest run tests/policy/bridge.test.ts`
Expected: FAIL — the new judge_prompt test fails because `bridgePolicy` still filters `judge_prompt` rules out entirely (`p.custom` has length 0, not 1); the `enforced` assertions on every test fail because `bridgeRule()` doesn't set that field at all yet (`undefined !== false`/`undefined !== true`).

- [ ] **Step 3: Implement the bridge changes**

Replace the full contents of `packages/detect/src/policy/bridge.ts`:

```typescript
import type { PolicyDoc, Policy } from "./schema";

type EngineAction = "log" | "warn" | "require_confirmation" | "block"
type Severity = "low" | "medium" | "high" | "critical"

function toEngineAction(a: "warn" | "block"): EngineAction {
  return a
}

function toSeverity(a: "warn" | "block"): Severity {
  return a === "block" ? "high" : "medium"
}

const DEFAULT_SCORE_SIGNALS = [
  { id: "paste_detected",      description: "Text was pasted",              points: 20, enabled: true },
  { id: "long_text",           description: "More than 400 words",          points: 20, enabled: true, threshold: 400 },
  { id: "legal_terms_whereas", description: "Legal boilerplate detected",   points: 25, enabled: true },
  { id: "numbered_paragraphs", description: "Numbered paragraph structure", points: 15, enabled: true },
  { id: "long_avg_sentence",   description: "Long average sentence length", points: 10, enabled: true },
  { id: "formal_heading",      description: "All-caps heading detected",    points: 10, enabled: true },
  { id: "block_quote",         description: "Block quote or indented text", points: 10, enabled: true },
]

function bridgeRule(rule: PolicyDoc["subjects"][number]["rules"][number], subjectName: string): Policy["custom"][number] {
  const base = {
    id:          rule.id,
    name:        `${subjectName} — ${rule.kind}`,
    description: rule.message ?? "",
    severity:    toSeverity(rule.action),
    action:      toEngineAction(rule.action),
    enabled:     true,
    tags:        [] as string[],
  }

  switch (rule.kind) {
    case "keyword":
      return { ...base, kind: "dictionary" as const, terms: rule.keywords ?? [], caseSensitive: false, enforced: false }
    case "pattern":
      return { ...base, kind: "pattern" as const, pattern: rule.pattern ?? "", flags: "gi", validator: "none" as const, scope: "all" as const, enforced: false }
    case "entropy":
      return { ...base, kind: "entropy" as const, minTokenLength: 24, minBitsPerChar: 4.0, enforced: false }
    case "score":
      return { ...base, kind: "score" as const, signals: DEFAULT_SCORE_SIGNALS, warnThreshold: 40, confirmThreshold: 70, enforced: false }
    case "judge_prompt":
      // The sole real enforcement mechanism for its own rule — never shadow.
      return { ...base, kind: "judge_prompt" as const, prompt: rule.prompt ?? "", enforced: true }
  }
}

export function bridgePolicy(doc: PolicyDoc, disabledSites: string[]): Policy {
  const allRules = doc.subjects.flatMap(subject =>
    subject.rules.map(rule => bridgeRule(rule, subject.name))
  )

  const perSite: Record<string, { enabled: boolean }> = {}
  for (const hostname of disabledSites) {
    perSite[hostname] = { enabled: false }
  }

  return {
    version:                   1,
    tenantId:                  doc.tenantId,
    baseline:                  [],
    custom:                    allRules,
    perSite,
    allowSendAnywayWithReason: false,
    auditRetentionDays:        90,
    failMode:                  doc.failMode,
  }
}
```

(The `NonJudgePromptRule` narrowing type and the `.filter()` call are both gone — `bridgeRule`'s parameter type is now `PolicyDoc["subjects"][number]["rules"][number]`, i.e. the full `ResolvedRule` shape including `judge_prompt`, and its switch is exhaustive over all 5 kinds directly.)

- [ ] **Step 4: Delete the PoC rules file and finish the export cleanup**

```bash
rm packages/detect/src/judge/poc-rules.ts
```

Confirm nothing else imports it:

Run: `cd packages/detect && grep -rn "poc-rules\|POC_JUDGE_RULES" src tests`
Expected: no output (Task 3's Step 5 already removed the `judge/index.ts` and `src/index.ts` re-exports).

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/detect && npx vitest run tests/policy/bridge.test.ts`
Expected: PASS, 7/7 (the 5 original scenario tests that weren't removed — empty rules, keyword, pattern, entropy, disabledSites — plus the 2 new ones replacing the old exclusion test).

- [ ] **Step 6: Run the full `packages/detect` suite and typecheck**

Run: `cd packages/detect && npx vitest run && npx tsc --noEmit`
Expected: all tests pass, `tsc --noEmit` reports zero errors anywhere in `packages/detect` — this is the task that closes out every type error Task 1 flagged as expected-but-deferred.

- [ ] **Step 7: Commit**

```bash
git add -A packages/detect
git commit -m "feat(detect): bridge judge_prompt rules for real, flip legacy kinds to shadow"
```

---

### Task 5: Desktop wiring — real judge + shadow dispatch

**Files:**
- Modify: `pretzel-desktop/electron/proxy.ts`
- Delete: `pretzel-desktop/electron/local-judge-poc.ts`
- Create: `pretzel-desktop/electron/report-shadow-telemetry.ts`
- Test: `pretzel-desktop/tests/unit/proxy-guard.test.ts` (existing file — already tests `evaluateRequest`/`needsDecision`/`isMonitoredHost`/`isNoisePath` against `DEFAULT_POLICY`)
- Test: `pretzel-desktop/electron/report-shadow-telemetry.test.ts` (create)

**Interfaces:**
- Consumes: `detectPrompt`'s new `judge` parameter and `DetectionResult.shadowFindings` from Task 2/3; `toShadowVerdictPayload` from Task 3; `ThemisLocalJudge` (unchanged, already exists at `pretzel-desktop/electron/themis-judge.ts`).
- Produces: `evaluateRequest(policy, hostname, body, judge?: LocalJudge): Promise<DetectionResult>` — the new, optional 4th parameter (optional so the two existing calls in `proxy-guard.test.ts`, which pass only 3 arguments against `DEFAULT_POLICY` and have no judge_prompt rules to evaluate, keep compiling and passing unchanged).

- [ ] **Step 1: Write the failing test**

Add to `pretzel-desktop/tests/unit/proxy-guard.test.ts`:

```typescript
// Add near the top with the other imports:
import type { LocalJudge, JudgeInput, JudgeVerdict } from '@mykka/detect'

class FakeJudge implements LocalJudge {
  constructor(private readonly verdict: JudgeVerdict, private readonly available = true) {}
  isAvailable(): boolean { return this.available }
  async classify(_input: JudgeInput): Promise<JudgeVerdict> { return this.verdict }
}

// Add as a new describe block, alongside the file's existing
// describe('evaluateRequest + needsDecision', ...) block:
describe('evaluateRequest — judge_prompt', () => {
  it('passes the judge through and lets a real match block', async () => {
    const policy: Policy = {
      version: 1, baseline: [], perSite: {}, allowSendAnywayWithReason: false,
      auditRetentionDays: 90, failMode: 'open',
      custom: [{
        id: 'jp-1', name: 'Judge rule', description: '', severity: 'high',
        action: 'block', enabled: true, tags: [], enforced: true,
        kind: 'judge_prompt', prompt: 'Does this leak a secret?',
      }],
    }
    const judge = new FakeJudge({ verdict: 'match', confidence: 0.9 })
    const result = await evaluateRequest(policy, 'example.com', 'leaking a secret', judge)
    expect(result.highestAction).toBe('block')
  })
})
```

Adjust the literal `Policy` object's imports/types to match whatever `Policy` import this test file already uses. It currently imports `DEFAULT_POLICY` (not the `Policy` type) from `@mykka/detect` — add `Policy` as a type-only import alongside it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pretzel-desktop && npx vitest run tests/unit/proxy-guard.test.ts`
Expected: FAIL — `evaluateRequest` only takes 3 parameters today; the 4th `judge` argument is silently dropped (JS doesn't enforce arity), the judge_prompt rule is never evaluated, and `result.highestAction` is `'log'`, not `'block'`.

- [ ] **Step 3: Implement — `evaluateRequest`'s new optional parameter**

In `pretzel-desktop/electron/proxy.ts`, change `evaluateRequest`:

```typescript
export async function evaluateRequest(
  policy: Policy,
  hostname: string,
  body: string,
  judge?: LocalJudge,
): Promise<DetectionResult> {
  return detectPrompt({ text: body, hostname, inputType: 'prompt' }, policy, hostname, undefined, judge)
}
```

Add `LocalJudge` to the existing type-only import from `@mykka/detect` at the top of the file (it already imports `DetectionResult`/`Policy` from there).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pretzel-desktop && npx vitest run tests/unit/proxy-guard.test.ts`
Expected: PASS, including the 2 pre-existing `evaluateRequest` tests (they pass `undefined` for `judge` implicitly, which is now valid) and the new one.

- [ ] **Step 5: Write the failing test for the shadow telemetry dispatcher**

```typescript
// pretzel-desktop/electron/report-shadow-telemetry.test.ts (new file)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShadowFinding } from '@mykka/detect'

vi.mock('./auth', () => ({ loadToken: vi.fn() }))
vi.mock('./env', () => ({ env: { PRETZEL_API_URL: 'https://api.test' } }))

import { loadToken } from './auth'
import { reportShadowTelemetry } from './report-shadow-telemetry'

describe('reportShadowTelemetry', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('does nothing when there are no shadow findings', async () => {
    await reportShadowTelemetry([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when there is no stored token', async () => {
    vi.mocked(loadToken).mockResolvedValue(null)
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await reportShadowTelemetry(findings)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the mapped payload array to the shadow-verdict endpoint', async () => {
    vi.mocked(loadToken).mockResolvedValue('pd_test_token')
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await reportShadowTelemetry(findings)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/v1/telemetry/shadow-verdict',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(body).toEqual([{ ruleId: 'r1', kind: 'keyword', verdict: 'match', confidence: 1, enforced: false, timestamp: '2026-10-07T00:00:00.000Z' }])
  })

  it('swallows a fetch failure without throwing', async () => {
    vi.mocked(loadToken).mockResolvedValue('pd_test_token')
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'pattern', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await expect(reportShadowTelemetry(findings)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd pretzel-desktop && npx vitest run electron/report-shadow-telemetry.test.ts`
Expected: FAIL — `./report-shadow-telemetry` doesn't exist yet (import error).

- [ ] **Step 7: Implement the shadow telemetry dispatcher**

```typescript
// pretzel-desktop/electron/report-shadow-telemetry.ts
/**
 * Reports legacy-rule shadow matches (pattern/keyword/entropy/score,
 * shadow-mode-only after docs/superpowers/specs/2026-10-06-judge-prompt-
 * client-engine-design.md) to a dedicated backend endpoint — never the
 * audit log, which now means "this actually happened." Fire-and-forget,
 * same as report-event.ts: a failed POST never affects the request path,
 * which has already completed by the time this runs.
 */
import { loadToken } from './auth'
import { env } from './env'
import { toShadowVerdictPayload } from '@mykka/detect'
import type { ShadowFinding } from '@mykka/detect'

const PRETZEL_API_BASE = env.PRETZEL_API_URL

export async function reportShadowTelemetry(shadowFindings: ShadowFinding[]): Promise<void> {
  if (shadowFindings.length === 0) return
  const token = await loadToken()
  if (!token) return

  try {
    await fetch(`${PRETZEL_API_BASE}/v1/telemetry/shadow-verdict`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(shadowFindings.map(toShadowVerdictPayload)),
    })
  } catch {
    // Best-effort — same reasoning as report-event.ts.
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd pretzel-desktop && npx vitest run electron/report-shadow-telemetry.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 9: Wire the real judge singleton and dispatcher into `proxy.ts`'s real call site**

Add a module-level judge singleton near the top of `pretzel-desktop/electron/proxy.ts`, alongside its other imports (mirroring exactly how `local-judge-poc.ts` instantiated it before deletion):

```typescript
import { ThemisLocalJudge } from './themis-judge'
import { reportShadowTelemetry } from './report-shadow-telemetry'

const judge: LocalJudge = new ThemisLocalJudge()
```

Update the one real call site inside `handleInterceptedRequest()` (where `evaluateRequest` and `void runLocalJudgePoc(hostname, body)` are currently called together):

```typescript
      try {
        const result = await evaluateRequest(this.policy, hostname, body, judge)
        void reportShadowTelemetry(result.shadowFindings)
        if (body.includes('AKIA')) {
```

Remove the `void runLocalJudgePoc(hostname, body)` line and its now-unused import of `runLocalJudgePoc` from `'./local-judge-poc'`.

- [ ] **Step 10: Delete the PoC file**

```bash
rm pretzel-desktop/electron/local-judge-poc.ts
```

Confirm nothing else references it:

Run: `cd pretzel-desktop && grep -rn "local-judge-poc\|isLocalJudgePocEnabled\|runLocalJudgePoc" electron main.ts 2>/dev/null`
Expected: no output.

- [ ] **Step 11: Run the full desktop suite**

Run: `cd pretzel-desktop && npx vitest run`
Expected: all tests pass, including `tests/unit/proxy-guard.test.ts`.

- [ ] **Step 12: Commit**

```bash
git add pretzel-desktop/electron/proxy.ts pretzel-desktop/electron/report-shadow-telemetry.ts pretzel-desktop/electron/report-shadow-telemetry.test.ts pretzel-desktop/tests/unit/proxy-guard.test.ts
git rm pretzel-desktop/electron/local-judge-poc.ts
git commit -m "feat(desktop): wire real judge_prompt enforcement and shadow telemetry"
```

---

### Task 6: Extension wiring — `RemoteLocalJudge` + shadow dispatch

**Files:**
- Create: `pretzel/src/background/remote-local-judge.ts`
- Modify: `pretzel/src/background/service-worker.ts`
- Delete: `pretzel/src/background/local-judge-poc.ts`
- Create: `pretzel/src/events/shadow-dispatch.ts`
- Test: `pretzel/src/background/remote-local-judge.test.ts` (create)
- Test: `pretzel/src/events/shadow-dispatch.test.ts` (create)

**Interfaces:**
- Consumes: `LocalJudge`/`JudgeInput`/`JudgeVerdict` from `@mykka/detect` (unchanged); `detectPrompt`'s new `judge` parameter and `DetectionResult.shadowFindings` from Task 2/3; `toShadowVerdictPayload` from Task 3; the existing offscreen document (`pretzel/src/offscreen/offscreen.ts`, unchanged — already handles `LOCAL_JUDGE_CLASSIFY` messages).
- Produces: `RemoteLocalJudge` class (a `LocalJudge` implementation), consumed only by `service-worker.ts` in this task.

- [ ] **Step 1: Write the failing test for `RemoteLocalJudge`**

```typescript
// pretzel/src/background/remote-local-judge.test.ts (new file)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RemoteLocalJudge } from './remote-local-judge'

describe('RemoteLocalJudge', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        getContexts: vi.fn().mockResolvedValue([]),
        sendMessage: vi.fn(),
        ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      },
      offscreen: {
        createDocument: vi.fn().mockResolvedValue(undefined),
        Reason: { WORKERS: 'WORKERS' },
      },
    })
  })

  it('isAvailable() is false before any classify call has succeeded', () => {
    const judge = new RemoteLocalJudge()
    expect(judge.isAvailable()).toBe(false)
  })

  it('classify() lazily creates the offscreen document, then sends the message', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'match', confidence: 0.8 })
    const judge = new RemoteLocalJudge()
    const result = await judge.classify({ text: 'hello', prompt: 'is this a secret?' })
    expect(result).toEqual({ verdict: 'match', confidence: 0.8 })
    expect(chrome.offscreen.createDocument).toHaveBeenCalledOnce()
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: 'LOCAL_JUDGE_CLASSIFY',
      payload: { prompt: 'is this a secret?', text: 'hello' },
    })
  })

  it('isAvailable() becomes true after a successful classify call', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
    const judge = new RemoteLocalJudge()
    await judge.classify({ text: 'hello', prompt: 'is this a secret?' })
    expect(judge.isAvailable()).toBe(true)
  })

  it('does not re-create the offscreen document on a second classify call', async () => {
    vi.mocked(chrome.runtime.getContexts).mockResolvedValue([{ contextType: 'OFFSCREEN_DOCUMENT' }] as unknown[])
    vi.mocked(chrome.runtime.sendMessage).mockResolvedValue({ verdict: 'no_match', confidence: 0.1 })
    const judge = new RemoteLocalJudge()
    await judge.classify({ text: 'a', prompt: 'p' })
    await judge.classify({ text: 'b', prompt: 'p' })
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled()
  })

  it('propagates a sendMessage rejection to the caller (engine-level try/catch handles it)', async () => {
    vi.mocked(chrome.runtime.sendMessage).mockRejectedValue(new Error('offscreen doc gone'))
    const judge = new RemoteLocalJudge()
    await expect(judge.classify({ text: 'a', prompt: 'p' })).rejects.toThrow('offscreen doc gone')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pretzel && npx vitest run src/background/remote-local-judge.test.ts`
Expected: FAIL — `./remote-local-judge` doesn't exist yet (import error).

- [ ] **Step 3: Implement `RemoteLocalJudge`**

```typescript
// pretzel/src/background/remote-local-judge.ts
/**
 * LocalJudge implementation for the extension: the real ThemisLocalJudge
 * only runs inside the offscreen document (offscreen/offscreen.ts) — MV3
 * service workers are killed after ~30s idle and can't hold a loaded model
 * in memory. This class lazily ensures that document exists and proxies
 * classify() calls to it over chrome.runtime messaging — the same
 * lazy-create + message-passing logic local-judge-poc.ts already proved
 * works, now wrapped behind the LocalJudge interface instead of bespoke
 * PoC-only code.
 */
import type { JudgeInput, JudgeVerdict, LocalJudge } from "@mykka/detect";

const OFFSCREEN_URL = "src/offscreen/index.html";

export class RemoteLocalJudge implements LocalJudge {
  private offscreenReady: Promise<void> | null = null;
  private hasClassifiedSuccessfully = false;

  private async ensureOffscreenDocument(): Promise<void> {
    if (this.offscreenReady) return this.offscreenReady;

    this.offscreenReady = (async () => {
      const existing = await chrome.runtime.getContexts({
        contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
      });
      if (existing.length > 0) return;

      await chrome.offscreen.createDocument({
        url: OFFSCREEN_URL,
        reasons: [chrome.offscreen.Reason.WORKERS],
        justification: "Hosts the local-judge model outside the service worker's idle-kill lifecycle.",
      });
    })();

    return this.offscreenReady;
  }

  isAvailable(): boolean {
    return this.hasClassifiedSuccessfully;
  }

  async classify(input: JudgeInput): Promise<JudgeVerdict> {
    await this.ensureOffscreenDocument();
    const result = (await chrome.runtime.sendMessage({
      type: "LOCAL_JUDGE_CLASSIFY",
      payload: { prompt: input.prompt, text: input.text },
    })) as JudgeVerdict;
    this.hasClassifiedSuccessfully = true;
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd pretzel && npx vitest run src/background/remote-local-judge.test.ts`
Expected: PASS, 5/5.

- [ ] **Step 5: Write the failing test for `shadow-dispatch.ts`**

```typescript
// pretzel/src/events/shadow-dispatch.test.ts (new file)
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShadowFinding } from '@mykka/detect'

vi.mock('@/policy/auth', () => ({ getAuthToken: vi.fn() }))
vi.mock('@/auth/headers', () => ({ buildAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer t' }) }))

import { getAuthToken } from '@/policy/auth'
import { dispatchShadowTelemetry } from './shadow-dispatch'

describe('dispatchShadowTelemetry', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('does nothing when there are no shadow findings', async () => {
    await dispatchShadowTelemetry([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when signed out', async () => {
    vi.mocked(getAuthToken).mockResolvedValue(null)
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await dispatchShadowTelemetry(findings)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the mapped payload array, fire-and-forget', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('clerk_token')
    const findings: ShadowFinding[] = [
      { ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' },
      { ruleId: 'r2', kind: 'entropy', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' },
    ]
    await dispatchShadowTelemetry(findings)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toContain('/v1/telemetry/shadow-verdict')
    const body = JSON.parse(init!.body as string)
    expect(body).toHaveLength(2)
    expect(body[0]).toEqual({ ruleId: 'r1', kind: 'keyword', verdict: 'match', confidence: 1, enforced: false, timestamp: '2026-10-07T00:00:00.000Z' })
  })

  it('swallows a fetch failure without throwing', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('clerk_token')
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'score', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await expect(dispatchShadowTelemetry(findings)).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd pretzel && npx vitest run src/events/shadow-dispatch.test.ts`
Expected: FAIL — `./shadow-dispatch` doesn't exist yet.

- [ ] **Step 7: Implement `shadow-dispatch.ts`**

```typescript
// pretzel/src/events/shadow-dispatch.ts
import { API_BASE } from "@/shared/constants";
import { toShadowVerdictPayload } from "@mykka/detect";
import type { ShadowFinding } from "@mykka/detect";
import { getAuthToken } from "@/policy/auth";
import { buildAuthHeaders } from "@/auth/headers";

export async function dispatchShadowTelemetry(shadowFindings: ShadowFinding[]): Promise<void> {
  if (shadowFindings.length === 0) return;
  const token = await getAuthToken();
  if (!token) return;

  const authHeaders = await buildAuthHeaders(token);
  fetch(`${API_BASE}/v1/telemetry/shadow-verdict`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify(shadowFindings.map(toShadowVerdictPayload)),
  }).catch(() => {}); // fire-and-forget, same as dispatchEvents
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd pretzel && npx vitest run src/events/shadow-dispatch.test.ts`
Expected: PASS, 4/4.

- [ ] **Step 9: Wire both into `service-worker.ts`, delete the PoC file**

In `pretzel/src/background/service-worker.ts`, replace the import of `runLocalJudgePoc` with the two new modules:

```typescript
import { RemoteLocalJudge } from "@/background/remote-local-judge";
import { dispatchShadowTelemetry } from "@/events/shadow-dispatch";
```

Add a module-level singleton near the top (after the imports, alongside the other module-level state):

```typescript
const localJudge = new RemoteLocalJudge();
```

In the `DETECT` case, change:

```typescript
      const policy = await loadPolicy();
      const result = await detectPrompt(detectInput, policy, undefined, undefined, localJudge);
      void dispatchEvents(result, hostname);
      void dispatchShadowTelemetry(result.shadowFindings);
      const limitReached = await isScanLimitReached();
      if (!limitReached) void dispatchScan();
      return result;
```

(`detectPrompt`'s 3rd/4th parameters, `hostnameOrUndefined`/`pasteDetected`, are left `undefined` here — `detectInput` already carries `hostname`/`pasteDetected` as part of its own object, exactly as the original 2-argument call site did; `localJudge` is passed as the 5th argument.)

Remove the `void runLocalJudgePoc(hostname, text);` line and its import.

- [ ] **Step 10: Delete the PoC file**

```bash
rm pretzel/src/background/local-judge-poc.ts
```

Confirm nothing else references it:

Run: `cd pretzel && grep -rn "local-judge-poc\|runLocalJudgePoc" src`
Expected: no output.

- [ ] **Step 11: Run the full extension suite**

Run: `cd pretzel && npx vitest run`
Expected: all tests pass. There is no existing `service-worker.test.ts` in this codebase today, so this change has no pre-existing test assertions to update — the new coverage for this wiring is `remote-local-judge.test.ts` and `shadow-dispatch.test.ts` from Steps 1-8.

- [ ] **Step 12: Commit**

```bash
git add pretzel/src/background/remote-local-judge.ts pretzel/src/background/remote-local-judge.test.ts pretzel/src/background/service-worker.ts pretzel/src/events/shadow-dispatch.ts pretzel/src/events/shadow-dispatch.test.ts
git rm pretzel/src/background/local-judge-poc.ts
git commit -m "feat(extension): wire real judge_prompt enforcement and shadow telemetry"
```

---

### Task 7: Backend — shadow-verdict endpoint and retention

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/00XX_<generated_name>.sql` (via `drizzle-kit generate`)
- Modify: `backend/src/telemetry/service.ts`
- Modify: `backend/src/telemetry/router.ts`
- Modify: `backend/src/scans/service.ts`
- Test: `backend/tests/telemetry-shadow-verdict.test.ts` (create)
- Test: `backend/tests/scans-retention.test.ts` (extend existing)

**Interfaces:**
- Consumes: the `ShadowVerdictPayload` shape `{ruleId, kind, verdict, confidence, enforced, timestamp}` that Tasks 5/6 POST.
- Produces: `POST /v1/telemetry/shadow-verdict` (Org auth), a `shadow_verdicts` table, and `purgeExpired()`'s return type gaining a `shadowVerdicts: number` field — nothing downstream in this plan consumes that beyond the retention test itself.

- [ ] **Step 1: Write the failing test for the endpoint**

```typescript
// backend/tests/telemetry-shadow-verdict.test.ts (new file)
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { shadowVerdicts } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let orgToken: string
let tenantId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  orgToken = t.orgToken
  tenantId = t.tenantId
})
afterAll(async () => { await app.close() })

const VALID_ITEM = { ruleId: 'r1', kind: 'keyword', verdict: 'match', confidence: 1, enforced: false, timestamp: '2026-10-07T00:00:00.000Z' }

describe('POST /v1/telemetry/shadow-verdict', () => {
  it('accepts a batch and stores it scoped to the tenant', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([VALID_ITEM])
    expect(res.status).toBe(204)

    const rows = await db.select().from(shadowVerdicts).where(eq(shadowVerdicts.tenantId, tenantId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ruleId).toBe('r1')
    expect(rows[0]!.kind).toBe('keyword')
    expect(rows[0]!.verdict).toBe('match')
    expect(Number(rows[0]!.confidence)).toBe(1)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await supertest(app.server).post('/v1/telemetry/shadow-verdict').send([VALID_ITEM])
    expect(res.status).toBe(401)
  })

  it('rejects an item with an invalid kind', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([{ ...VALID_ITEM, kind: 'judge_prompt' }])
    expect(res.status).toBe(400)
  })

  it('rejects an item with an invalid verdict', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([{ ...VALID_ITEM, verdict: 'maybe' }])
    expect(res.status).toBe(400)
  })

  it('rejects an unparseable timestamp', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([{ ...VALID_ITEM, timestamp: 'not-a-date' }])
    expect(res.status).toBe(400)
  })

  it('rejects a batch larger than the cap', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send(Array.from({ length: 201 }, () => VALID_ITEM))
    expect(res.status).toBe(400)
  })

  it('accepts an empty array as a no-op', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([])
    expect(res.status).toBe(204)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/telemetry-shadow-verdict.test.ts`
Expected: FAIL — `../src/db/schema.js` has no `shadowVerdicts` export, so every test errors on import before even running.

- [ ] **Step 3: Implement the schema + migration**

In `backend/src/db/schema.ts`, add near `enforcementSignals` (same section):

```typescript
export const shadowVerdictKindEnum = pgEnum('shadow_verdict_kind', [
  'keyword',
  'pattern',
  'entropy',
  'score',
])

export const shadowVerdictOutcomeEnum = pgEnum('shadow_verdict_outcome', [
  'match',
  'no_match',
])

// Shadow-mode telemetry for the now-demoted legacy rule kinds (pattern/
// keyword/entropy/score — see docs/superpowers/specs/2026-10-06-judge-
// prompt-client-engine-design.md). No raw content, ever — only what would
// have matched and what the real verdict was.
export const shadowVerdicts = pgTable('shadow_verdicts', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  ruleId:     uuid('rule_id').notNull(),
  kind:       shadowVerdictKindEnum('kind').notNull(),
  verdict:    shadowVerdictOutcomeEnum('verdict').notNull(),
  confidence: numeric('confidence', { precision: 4, scale: 3 }).notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx: index().on(t.tenantId, t.occurredAt),
}))
```

Check the top of `schema.ts` for whether `numeric` is already imported from `drizzle-orm/pg-core` (it's used elsewhere for money/decimal columns — confirm with `grep -n "^import" backend/src/db/schema.ts` and add it to the existing import list if missing).

Run: `cd backend && npx drizzle-kit generate`
Expected: a new file appears under `backend/drizzle/`, numbered after `0012_romantic_speedball.sql`, containing `CREATE TYPE "shadow_verdict_kind" ...`, `CREATE TYPE "shadow_verdict_outcome" ...`, and `CREATE TABLE "shadow_verdicts" ...` matching the schema above. Review its contents before applying.

Apply it to the test database:

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/promptshield_test npx drizzle-kit migrate` (adjust the connection string to match whatever local Postgres this environment is using — see `backend/.env.test`).

- [ ] **Step 4: Implement the service function**

In `backend/src/telemetry/service.ts`, add:

```typescript
import { shadowVerdicts } from '../db/schema.js'

export type ShadowVerdictKind = 'keyword' | 'pattern' | 'entropy' | 'score'
export const SHADOW_VERDICT_KINDS: ShadowVerdictKind[] = ['keyword', 'pattern', 'entropy', 'score']
export type ShadowVerdictOutcome = 'match' | 'no_match'
export const SHADOW_VERDICT_OUTCOMES: ShadowVerdictOutcome[] = ['match', 'no_match']

export interface ShadowVerdictInput {
  ruleId: string
  kind: ShadowVerdictKind
  verdict: ShadowVerdictOutcome
  confidence: number
  timestamp: string
}

export async function recordShadowVerdicts(tenantId: string, items: ShadowVerdictInput[]): Promise<void> {
  if (items.length === 0) return
  await db.insert(shadowVerdicts).values(items.map((item) => ({
    tenantId,
    ruleId:     item.ruleId,
    kind:       item.kind,
    verdict:    item.verdict,
    confidence: String(item.confidence),
    occurredAt: new Date(item.timestamp),
  })))
}
```

- [ ] **Step 5: Implement the route**

In `backend/src/telemetry/router.ts`, add imports and a new route:

```typescript
import {
  recordEnforcementSignal,
  recordShadowVerdicts,
  recentDegraded,
  silentFailureSuspected,
  ENFORCEMENT_REASONS,
  SHADOW_VERDICT_KINDS,
  SHADOW_VERDICT_OUTCOMES,
  type EnforcementReason,
  type ShadowVerdictInput,
} from './service.js'

const MAX_SHADOW_VERDICT_BATCH = 200

// Client (desktop/extension) reports legacy-rule shadow matches. No prompt
// content — only ruleId/kind/verdict/confidence/timestamp.
fastify.post('/telemetry/shadow-verdict', { preHandler: requireOrgTokenOrClerkAuth, bodyLimit: 64 * 1024 }, async (req, reply) => {
  const body = req.body
  if (!Array.isArray(body)) {
    return reply.status(400).send({ error: 'request body must be an array' })
  }
  if (body.length > MAX_SHADOW_VERDICT_BATCH) {
    return reply.status(400).send({ error: `batch too large (max ${MAX_SHADOW_VERDICT_BATCH} items)` })
  }
  if (body.length === 0) {
    return reply.status(204).send()
  }

  const items: ShadowVerdictInput[] = []
  for (const raw of body as unknown[]) {
    const item = raw as Partial<ShadowVerdictInput & { enforced: unknown }>
    if (!item.ruleId || typeof item.ruleId !== 'string') {
      return reply.status(400).send({ error: 'ruleId is required' })
    }
    if (!SHADOW_VERDICT_KINDS.includes(item.kind as never)) {
      return reply.status(400).send({ error: 'kind must be one of ' + SHADOW_VERDICT_KINDS.join(', ') })
    }
    if (!SHADOW_VERDICT_OUTCOMES.includes(item.verdict as never)) {
      return reply.status(400).send({ error: 'verdict must be one of ' + SHADOW_VERDICT_OUTCOMES.join(', ') })
    }
    if (typeof item.confidence !== 'number' || item.confidence < 0 || item.confidence > 1) {
      return reply.status(400).send({ error: 'confidence must be a number between 0 and 1' })
    }
    if (typeof item.timestamp !== 'string' || Number.isNaN(new Date(item.timestamp).getTime())) {
      return reply.status(400).send({ error: 'timestamp must be a valid ISO date string' })
    }
    items.push({
      ruleId:     item.ruleId,
      kind:       item.kind as ShadowVerdictInput['kind'],
      verdict:    item.verdict as ShadowVerdictInput['verdict'],
      confidence: item.confidence,
      timestamp:  item.timestamp,
    })
  }

  await recordShadowVerdicts(req.tenant.id, items)
  return reply.status(204).send()
})
```

Place this new route inside the existing `telemetryRouter` function, after the `/telemetry/enforcement` route and before its closing brace.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/telemetry-shadow-verdict.test.ts`
Expected: PASS, 7/7.

- [ ] **Step 7: Extend retention — write the failing test**

Add to `backend/tests/scans-retention.test.ts`, inside the existing `describe('retention: purgeExpired', ...)` block (replacing its single test with one that also covers the new table):

```typescript
  it('deletes only rows older than the retention window, across all three tables', async () => {
    await db.insert(scans).values([
      { tenantId, memberId: null, occurredAt: daysAgo(PILOT_RETENTION_DAYS + 1) },
      { tenantId, memberId: null, occurredAt: daysAgo(1) },
    ])
    await db.insert(enforcementSignals).values([
      { tenantId, memberId: null, hostname: 'chat.openai.com', reason: 'decision_timeout', occurredAt: daysAgo(PILOT_RETENTION_DAYS + 5) },
      { tenantId, memberId: null, hostname: 'chat.openai.com', reason: 'bridge_error',     occurredAt: daysAgo(2) },
    ])
    await db.insert(shadowVerdicts).values([
      { tenantId, ruleId: 'r1', kind: 'keyword', verdict: 'match', confidence: '1', occurredAt: daysAgo(PILOT_RETENTION_DAYS + 3) },
      { tenantId, ruleId: 'r2', kind: 'pattern', verdict: 'match', confidence: '1', occurredAt: daysAgo(1) },
    ])

    const counts = await purgeExpired()
    expect(counts.scans).toBe(1)
    expect(counts.enforcementSignals).toBe(1)
    expect(counts.shadowVerdicts).toBe(1)

    const remainingShadow = await db.select().from(shadowVerdicts).where(eq(shadowVerdicts.tenantId, tenantId))
    expect(remainingShadow).toHaveLength(1)
  })
```

Remove the old single-table test this replaces, and add `shadowVerdicts` to the file's existing import line from `'../src/db/schema.js'`.

- [ ] **Step 8: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/scans-retention.test.ts`
Expected: FAIL — `counts.shadowVerdicts` is `undefined` (`purgeExpired()`'s return type doesn't have that field yet).

- [ ] **Step 9: Implement the retention extension**

In `backend/src/scans/service.ts`:

```typescript
import { scans, enforcementSignals, shadowVerdicts } from '../db/schema.js'
```

```typescript
export async function purgeExpired(): Promise<{ scans: number; enforcementSignals: number; shadowVerdicts: number }> {
  const cutoff = new Date(Date.now() - PILOT_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const deletedScans = await db.delete(scans)
    .where(lt(scans.occurredAt, cutoff))
    .returning({ id: scans.id })
  const deletedSignals = await db.delete(enforcementSignals)
    .where(lt(enforcementSignals.occurredAt, cutoff))
    .returning({ id: enforcementSignals.id })
  const deletedShadowVerdicts = await db.delete(shadowVerdicts)
    .where(lt(shadowVerdicts.occurredAt, cutoff))
    .returning({ id: shadowVerdicts.id })

  return { scans: deletedScans.length, enforcementSignals: deletedSignals.length, shadowVerdicts: deletedShadowVerdicts.length }
}
```

Update the one other caller, `scheduleRetentionPurge()`'s log line, to include the new count:

```typescript
      const counts = await purgeExpired()
      logger.info('retention purge complete', {
        retentionDays: PILOT_RETENTION_DAYS,
        scansDeleted: counts.scans,
        enforcementSignalsDeleted: counts.enforcementSignals,
        shadowVerdictsDeleted: counts.shadowVerdicts,
      })
```

- [ ] **Step 10: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/scans-retention.test.ts`
Expected: PASS.

- [ ] **Step 11: Run the full backend suite and typecheck**

Run: `cd backend && npx vitest run && npx tsc --noEmit`
Expected: all tests pass, zero type errors.

- [ ] **Step 12: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle backend/src/telemetry/service.ts backend/src/telemetry/router.ts backend/src/scans/service.ts backend/tests/telemetry-shadow-verdict.test.ts backend/tests/scans-retention.test.ts
git commit -m "feat(backend): add shadow-verdict telemetry endpoint and retention"
```

---

## Final cross-check (not its own task — run after Task 7)

Run all three suites once more from a clean state to confirm the full plan holds together end-to-end:

```bash
cd packages/detect && npx vitest run && npx tsc --noEmit
cd ../../pretzel-desktop && npx vitest run
cd ../pretzel && npx vitest run
cd ../backend && npx vitest run && npx tsc --noEmit
```

Expected: every suite green, both `tsc --noEmit` runs clean.
