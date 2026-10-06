---
status: active
owner: repository
verified_at: 2026-10-06
sources:
  - docs/superpowers/specs/2026-10-05-local-judge-themis-design.md (Section B — this doc supersedes that section's scope)
  - backend/src/assistant/llm/interface.ts
  - backend/src/assistant/prompt.ts
  - backend/src/assistant/service.ts
  - backend/src/assistant/apply.ts
  - backend/src/db/schema.ts
  - backend/src/policy/compiler.ts
  - packages/detect/src/policy/bridge.ts
  - packages/detect/src/policy/schema.ts
  - packages/detect/src/detection/engine.ts
  - packages/detect/src/judge/ (types.ts, poc-rules.ts, stub-judge.ts)
  - pretzel-console/src/pages/SubjectsPage.tsx (RuleForm, RulesPanel)
  - pretzel-console (ChatPane.tsx, useAssistant.ts, MessageBubble.tsx, PublishPage.tsx)
---

# judge_prompt: Real Rule Authoring and Enforcement

## Why this, and what changed from the original framing

`docs/superpowers/specs/2026-10-05-local-judge-themis-design.md`'s Section B originally scoped this as "wire up authoring, but keep Themis shadow-mode-only until a real-world validation gate proves it's safe to enforce." That sequencing assumed live production traffic to protect.

**There is no production traffic yet — no customers on prod.** That changes the risk calculus completely: there's nothing a false positive or false negative could hurt right now. So this spec inverts the original plan:

- **`judge_prompt` rules enforce for real, immediately** — a Themis match can genuinely block or warn, same as any rule today.
- **Existing `pattern`/`keyword`/`entropy`/`score` rules flip to shadow-mode-only** — they still run and their results still get logged, but they no longer determine the real block/warn/allow outcome. Themis becomes the sole real enforcement mechanism.
- This is a full, one-time flip — not a gradual per-subject migration. Any subject without an authored `judge_prompt` rule yet simply has no real enforcement until one exists. Explicitly accepted: there's no live traffic that gap could hurt today.

Section C's validation gate (real-world recall/FP-rate thresholds, researched and documented in the 2026-10-05 spec) still applies — just later, once there *is* real traffic worth measuring and a reason to reconsider this decision, not as a precondition for this ship.

## Architecture overview

```
Admin describes a rule in pretzel-console chat
  -> backend assistant (Claude) compiles it into a short judge prompt
  -> admin reviews / edits the generated prompt text, applies it
  -> rules table (DB) gains kind='judge_prompt', prompt=<text>
  -> admin clicks Publish
  -> compilePolicy() includes judge_prompt rules in the published PolicyDoc
  -> extension/desktop fetch the policy (sync.ts / policy-sync.ts, unchanged)
  -> bridge.ts maps judge_prompt rules into the engine's Rule union
  -> engine.ts's detectPrompt(), now partly async:
       - runs pattern/keyword/entropy/score rules as today, SHADOW ONLY
         (result never affects the returned verdict, always logged)
       - awaits judge.classify() for each judge_prompt rule — THIS
         determines the real verdict (block/warn/allow)
  -> every rule evaluation (shadow or real) emits a telemetry event:
       {ruleId, kind, verdict, confidence, enforced: boolean, timestamp}
       (never raw content — same privacy posture as the rest of this project)
```

## Data model

### Backend: `backend/src/db/schema.ts`

- `ruleKindEnum` (currently `['keyword','pattern','entropy','score']`) gains `'judge_prompt'`.
- `rules` table gains a nullable `prompt: text('prompt')` column — populated only for `judge_prompt` rows, same way `pattern`/`keywords` are only populated for their respective kinds today.

### Backend: `backend/src/assistant/llm/interface.ts`

- `RuleKind` gains `'judge_prompt'`.
- The `create_rule` action variant gains `prompt?: string`:
  ```typescript
  | { op: 'create_rule'; subjectId: string; kind: RuleKind; keywords?: string[]; pattern?: string;
      prompt?: string; destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  ```
- `update_rule`'s generic `patch: Record<string, unknown>` already supports a `prompt` field with no type change — editing a generated prompt (see Console UX below) goes through this existing action.

### Client: `packages/detect/src/policy/schema.ts`

- `ResolvedRuleSchema`'s kind enum gains `'judge_prompt'`, with a `prompt: z.string()` field (parallel to how `pattern`/`keywords` are already kind-specific optional fields on that schema).
- The engine-facing `RuleSchema` union (consumed by `bridge.ts`'s output type) gains a `JudgePromptRuleSchema` variant: `{ kind: 'judge_prompt', prompt: string, action: 'warn' | 'block', ...base fields }` — `base` fields (`id`, `name`, `description`, `severity`, `enabled`, `tags`) stay identical to every other kind, per `bridge.ts`'s existing `base` object.

No schema changes needed in `pretzel/src/policy/sync.ts` or `pretzel-desktop/electron/policy-sync.ts` — both already validate generically against `PolicyDocSchema`/`RuleSchema` from `packages/detect`.

## Backend assistant

### System prompt (`backend/src/assistant/prompt.ts`)

The `RULE KINDS` section gains a fifth bullet:

```
- judge_prompt: an on-device ML model judges a plain-English description of
  what to flag (e.g. "this message discloses a Social Security Number, even
  if disguised or spelled out"). Use this for intent-based or context-
  dependent rules that have no reliable fixed pattern — things a regex or
  keyword list can't express. Write the prompt as an unambiguous yes/no
  claim about the message, not a question, and not vague ("flag sensitive
  stuff") — vague prompts cause false positives on unrelated content.
```

Plus a `RESPONSE FORMAT` example showing a `create_rule` action with `kind: "judge_prompt"` and a well-formed `prompt` string, mirroring the existing `pattern`/`keyword` examples already in that section.

**This prompt text is the actual prompt-engineering quality control** — the assistant is instructed to always phrase `prompt` as a precise, unambiguous claim, the same discipline already used in `models/themis/categories.py`'s training data and `packages/detect/src/judge/poc-rules.ts`'s existing examples.

### `backend/src/assistant/apply.ts`

`executeActions()`'s `create_rule`/`update_rule` cases already forward whatever payload fields are present to `rulesClient.post`/`.patch` — confirmed in exploration, these need no new branch, just the new `prompt` field flowing through the existing payload object.

### `backend/src/internal/rules.router.ts` / `rules/service.ts`

Accept and persist the new `prompt` column — mechanical extension of the existing create/update handlers, no new logic.

## Console UX

### Manual `RuleForm` (`pretzel-console/src/pages/SubjectsPage.tsx`)

The Kind dropdown gains a fifth option, **`judge_prompt`, disabled** (greyed out, not selectable), with a tooltip/caption: "Only available via AI Assistant." This enforces the prompt-engineering QC the assistant provides — admins can't hand-author an arbitrary judge prompt that bypasses it.

*Deferred, not building now*: if direct manual authoring of `judge_prompt` rules is opened up later, it should go through a second LLM call that validates the submitted prompt isn't vague, isn't a prompt-injection attempt against Themis, and is a legitimate DLP claim — the same quality bar the assistant already enforces by construction. Flagged here so it isn't lost, not scoped into this spec.

### Chat path (`ChatPane.tsx`, `useAssistant.ts`, `MessageBubble.tsx`)

Unchanged mechanism — a `create_rule` action with `kind: "judge_prompt"` shows the same "N proposed changes · review in preview" pill as any other action today. The **generated prompt text is editable** before the admin applies it — this needs a small addition to whatever review surface shows a proposed `create_rule` action's details (today's `MessageBubble`/preview flow shows a pill, not full field-level detail — this spec requires surfacing the generated `prompt` string specifically, in an editable text field, before `useApplyActions()` fires). Edited text is what gets sent to `apply`, not the assistant's original draft.

Once applied, the rule behaves exactly like any other in `RulesPanel`'s list/edit/delete UI — `RuleForm`'s edit path for an *existing* `judge_prompt` rule shows the prompt as an editable textarea (editing an existing judge rule is unrestricted; only *creating* a new one manually is disabled).

## Client-side engine changes

### `packages/detect/src/detection/engine.ts`

`detectPrompt()`'s rule loop currently iterates `[...policy.baseline, ...policy.custom]` synchronously via `runRule()`. This becomes two phases:

1. **Shadow phase** (unchanged mechanically): every `pattern`/`keyword`/`entropy`/`score` rule runs through the existing synchronous `runRule()`. Its match/no-match result is collected for telemetry but **no longer contributes to the function's returned verdict**.
2. **Enforcement phase** (new): every `judge_prompt` rule is evaluated via `await judge.classify({ text: prompt, prompt: rule.prompt })`. A `match` (confidence ≥ the model's own threshold — already baked into `ThemisLocalJudge.classify()`, which returns `verdict: 'match'` only above 0.5) applies that rule's configured `action` (`warn`/`block`) to the real returned verdict, exactly the same mechanic existing rules already use — no new concept, just a new source of the match signal.

`detectPrompt()` becomes genuinely async throughout (it already does one `await` for the final content hash — this generalizes that, not introduces async for the first time).

**Dependency injection**: `packages/detect` is platform-shared code and cannot import a concrete `onnxruntime-web`/`onnxruntime-node` implementation. `detectPrompt()` gains a `judge: LocalJudge` parameter, supplied by the caller — `pretzel/src/background/service-worker.ts` passes its real `ThemisLocalJudge` (offscreen-document-backed), `pretzel-desktop/electron/proxy.ts` passes its own (main-process-backed). This matches `LocalJudge`'s existing documented intent ("every call site only ever depends on this interface").

**Judge-unavailable fallback**: if `judge.isAvailable()` is false when a `judge_prompt` rule needs to run (model still loading, or device doesn't support it), that rule's contribution to the verdict falls back to the policy's existing `failMode` field (`PolicyDoc.failMode`, already present, already governs other error/unavailable cases in this engine) — reusing an existing mechanism rather than inventing a new one.

### `packages/detect/src/policy/bridge.ts`

`bridgeRule()`'s switch gains a `case "judge_prompt":` mapping the resolved rule into the new `JudgePromptRuleSchema` shape — mechanical, same pattern as every other case, TypeScript's exhaustive switch forces this to exist once the schema's kind enum grows.

## Telemetry

Every rule evaluation — shadow or real-enforcing — emits one event (fire-and-forget, same pattern as `reportDegraded`/the existing telemetry dispatch):

```typescript
{ ruleId: string, kind: RuleKind, verdict: 'match' | 'no_match', confidence: number | null, enforced: boolean, timestamp: string }
```

- `confidence` is `null` for pattern/keyword/entropy/score matches (no probability, just matched-or-didn't) and a real 0-1 number for `judge_prompt`.
- `enforced` is `true` only for `judge_prompt` results (they determine the real outcome), `false` for the now-shadow legacy kinds.
- No content, ever — matches this entire project's hard privacy requirement.
- This also directly produces the data Section C's validation gate will eventually need, as a side effect of normal operation — no separate collection mechanism required later.

## Out of scope / deferred

- Gradual per-subject migration (old rule stays live until its judge_prompt replacement exists) — not needed, no production traffic to protect during the gap.
- Manual (non-assistant) authoring of `judge_prompt` rules, and the injection-validator LLM that would need to gate it — flagged, not built.
- Section C's actual validation analysis (querying the new telemetry, deciding if/when to revisit shadow-vs-enforce for either rule family) — this spec only ensures the data exists; analyzing it is separate, later work.
- Section E (capability probe + telemetry) — the new telemetry event here is scoped narrowly to rule verdicts, not device capability data; that's still a separate piece.

## Open risks

- `detectPrompt()`'s async restructuring touches the single most central function in the detection engine, used by both platforms on every proxied request — needs careful test coverage for the shadow/enforce split, not just the new rule kind in isolation.
- No real-world accuracy data exists yet for `judge_prompt` rules the moment they go live-enforcing (this is the explicit, accepted tradeoff of this spec — flagged again here so it's visible to whoever revisits this later, not buried only in the "Why" section above).
- `failMode` behavior for judge-unavailable needs to be verified against its *current* semantics (what does it actually do today for other error cases?) before relying on it here — not independently confirmed in this spec's research pass.
