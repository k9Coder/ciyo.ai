# judge_prompt Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `judge_prompt` as a real rule kind throughout the backend — DB schema, plan entitlements, the CRUD layer (public + internal routers + service), the AI assistant's action contract and system prompt, and the policy compiler — so an admin can author a judge_prompt rule via the assistant and have it show up, with its prompt text, in a published `PolicyDoc`.

**Architecture:** `judge_prompt` is a new value in the existing `ruleKindEnum`/`RuleKind` type family, threaded through every layer the existing four kinds (`keyword`/`pattern`/`entropy`/`score`) already pass through — no new tables, no new routes, no new action ops. The only new column is a nullable `prompt` text field on `rules`, populated only for `judge_prompt` rows, mirroring how `pattern`/`keywords` are already kind-specific optional fields on the same row.

**Tech Stack:** Fastify, Drizzle ORM (Postgres), Vitest + Supertest (real DB integration tests, not mocks), Anthropic Claude (assistant LLM).

**Spec:** `docs/superpowers/specs/2026-10-06-judge-prompt-rule-authoring-design.md` — this plan implements the "Data model" and "Backend assistant" sections in full, plus the policy-compiler half of "Client-side engine changes" (everything backend-owned). The client-engine (`bridge.ts`/`engine.ts`/telemetry) and console UX sections are separate, later plans.

## Global Constraints

- `judge_prompt` rules are only *exposed* for creation via the assistant's generated-prompt review flow (a later, console-side plan) — the backend API itself has no way to distinguish "assistant call" from "direct API call" (both go through the same `createRule()` service function), so this plan does **not** add any backend-side restriction blocking direct creation. That restriction is UI-only, by design, same as every other rule kind today.
- `judge_prompt` requires the assistant to be enabled on the tenant's plan (`PlanLimits.assistantEnabled`) — it only makes sense on `business`/`enterprise`/`pilot`, which already have `assistantEnabled: true`. `free`/`starter` do not get `judge_prompt` added to `allowedRuleKinds`.
- No raw content (the text being judged) is ever stored or logged anywhere in this plan — only the rule's own authored `prompt` text (an admin-written instruction, not user content) is persisted, same category of data as the existing `message`/`pattern` fields.
- Existing rule kinds (`keyword`/`pattern`/`entropy`/`score`) and their current behavior are completely unaffected by this plan — this plan is additive only.

## Review Focus

- A tenant on a plan without `judge_prompt` entitlement (e.g. `free`) attempts to create one via the assistant/API — must get the same 402-tagged rejection other gated kinds already get, not a silent success or an unrelated error.
- The `ruleKindEnum` migration (adding a value to a live Postgres enum type) must actually apply cleanly against a real database, not just look right in the generated SQL — enum alterations have real Postgres version/transaction quirks worth confirming empirically.
- Existing rule kinds' API responses must keep working unchanged after `rules` gains a new nullable `prompt` column — a reasonable caller expects an added field to be harmless, not break existing response assertions.
- Updating an existing `judge_prompt` rule's `prompt` text through the assistant's generic `update_rule`/patch path must actually persist — this flows through a different code path (`db.update(...).set(data)`) than creation and needs its own explicit test, not inferred from create-path coverage.
- `compilePolicy()` must include the real `prompt` text in a published `PolicyDoc` specifically for `judge_prompt` rows, and `null` for every other kind — a downstream consumer (the future client-engine work) depends on this exact shape.

---

## Task 1: DB schema — `judge_prompt` kind and `prompt` column

**Files:**
- Modify: `backend/src/db/schema.ts:9` (`ruleKindEnum`), `backend/src/db/schema.ts:151-167` (`rules` table)
- Modify: `backend/tests/assistant-prompt.test.ts:13-17` (existing `Rule`-typed literal needs the new field)
- Create: `backend/drizzle/00XX_<generated_name>.sql` (via `drizzle-kit generate`, not hand-written)
- Test: `backend/tests/rules.test.ts` (new test), real Postgres test DB via `backend/tests/helpers/setup.ts`/`db.ts`

**Interfaces:**
- Produces: `Rule.prompt: string | null` and `NewRule.prompt?: string | null` (auto-inferred by Drizzle from the new column — no manual type to write), and `'judge_prompt'` as a valid value wherever `RuleKind`/`ruleKindEnum` is used elsewhere in the codebase.

- [ ] **Step 1: Write the failing test**

```typescript
// append to backend/tests/rules.test.ts, inside the existing describe('POST /v1/subjects/:subjectId/rules') block
  it('creates a judge_prompt rule', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'judge_prompt',
        prompt: 'This message discloses a Social Security Number, even if disguised or spelled out.',
        action: 'block',
      })
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('judge_prompt')
    expect(res.body.prompt).toBe('This message discloses a Social Security Number, even if disguised or spelled out.')
    expect(res.body.pattern).toBeNull()
    expect(res.body.keywords).toBeNull()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/rules.test.ts -t "creates a judge_prompt rule"`
Expected: FAIL — Postgres rejects `kind: 'judge_prompt'` (not a valid `rule_kind` enum value yet) and/or the `prompt` field doesn't exist as a column.

- [ ] **Step 3: Update the schema**

In `backend/src/db/schema.ts`, change line 9:

```typescript
export const ruleKindEnum    = pgEnum('rule_kind',    ['keyword', 'pattern', 'entropy', 'score', 'judge_prompt'])
```

And add a `prompt` column to the `rules` table (after `pattern`, before `destinations`, lines 151-167):

```typescript
export const rules = pgTable('rules', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  subjectId:           uuid('subject_id').notNull().references(() => subjects.id),
  kind:                ruleKindEnum('kind').notNull(),
  keywords:            text('keywords').array(),
  pattern:             text('pattern'),
  // Only populated for kind='judge_prompt' — the plain-English claim the
  // on-device model judges against captured content (not user content
  // itself, an admin-authored instruction, same privacy class as `message`).
  prompt:              text('prompt'),
  destinations:        text('destinations').array().default(sql`'{}'`),
  destinationGroupIds: uuid('destination_group_ids').array().default(sql`'{}'`),
  action:              ruleActionEnum('action').notNull(),
  message:             text('message'),
  active:              boolean('active').notNull().default(true),
  reportLevel:         reportLevelEnum('report_level').notNull().default('none'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  subjectIdx: index().on(t.subjectId),
}))
```

- [ ] **Step 4: Generate the migration**

Run: `cd backend && pnpm db:generate`
Expected: a new file appears under `backend/drizzle/`, e.g. `00XX_<two-word-name>.sql`, containing an `ALTER TYPE "rule_kind" ADD VALUE 'judge_prompt';` statement and an `ALTER TABLE "rules" ADD COLUMN "prompt" text;` statement. Read the generated file to confirm both statements are present before continuing — do not hand-edit it.

- [ ] **Step 5: Apply the migration to the test database**

Run: `cd backend && pnpm db:migrate`
Expected: migration applies with no errors (this is Review Focus item 2 — confirm it actually works against a real database, not just that the SQL file looks right).

- [ ] **Step 6: Confirm the schema/migration layer is correct**

The test from Step 1 goes through `backend/src/rules/router.ts`, whose inline body type doesn't accept `kind: 'judge_prompt'` yet (that's Task 3's job) — so it will keep failing at the HTTP layer even though this task's schema/migration work is done. Don't chase that failure here. Instead, confirm this task's own scope is complete:

Run: `cd backend && npx tsc --noEmit`
Expected: the only errors are about `Rule`-typed object literals missing the new `prompt` field (fixed in Step 7 below) — no errors about the `rule_kind` enum or a missing `prompt` column. That confirms Steps 3-5 are correct without needing Task 3's router changes first.

- [ ] **Step 7: Fix the resulting type error in the existing prompt test fixture**

`backend/tests/assistant-prompt.test.ts`'s `snapshot.rules` array now fails to typecheck — `Rule` requires a `prompt` field. Add it:

```typescript
// backend/tests/assistant-prompt.test.ts:14-17, add prompt: null to the one rule literal
  rules: [
    { id: 'r1', subjectId: 's1', tenantId: 't1', kind: 'keyword', keywords: ['SSN'], pattern: null,
      prompt: null, destinations: [], destinationGroupIds: [], action: 'block', message: null,
      active: true, reportLevel: 'none', createdAt: new Date() },
  ],
```

- [ ] **Step 8: Run the full backend typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors. If other files construct a full `Rule`-typed object literal (not a partial `db.insert(...).values(...)` call, which doesn't require every nullable column), fix each the same way — add `prompt: null`. (`backend/tests/assistant-apply.test.ts`, `assistant-revert.test.ts`, `events.test.ts`, `policy-diff.test.ts`, `tests/subjects/snapshot.test.ts` are the other files that construct rule-shaped literals matching the pattern this grep found: `grep -rln "reportLevel: 'none'" tests/` — check each for whether it's a typed literal needing the fix or a partial insert that doesn't.)

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/rules.test.ts -t "creates a judge_prompt rule"`
Expected: still FAILs at this point if Task 3 hasn't landed yet (the router rejects the kind) — that's correct and expected. Confirm instead: `cd backend && npx tsc --noEmit` is clean, and `cd backend && npx vitest run tests/rules.test.ts` (full file, no `-t` filter) shows every *other* test in that file still passing (Review Focus item 3 — existing kinds unaffected).

- [ ] **Step 10: Commit**

```bash
cd backend
git add src/db/schema.ts drizzle/ tests/assistant-prompt.test.ts tests/rules.test.ts
git add tests/assistant-apply.test.ts tests/assistant-revert.test.ts tests/events.test.ts tests/policy-diff.test.ts tests/subjects/snapshot.test.ts
git commit -m "feat(backend): add judge_prompt rule kind and prompt column to schema"
```

(Only `git add` the test files that actually needed the `prompt: null` fix in Step 8 — some of the five listed may turn out to use partial inserts that don't need changes; don't stage files you didn't touch.)

---

## Task 2: Plan entitlement for `judge_prompt`

**Files:**
- Modify: `backend/src/billing/limits.ts`
- Test: `backend/tests/` — find or create a limits test file (check `backend/tests/` for an existing `billing`/`limits` test first; if none exists, create `backend/tests/billing-limits.test.ts`)

**Interfaces:**
- Consumes: nothing from Task 1 directly (this is a pure type/data change, independent of the DB).
- Produces: `isRuleKindAllowed('business' | 'enterprise' | 'pilot', 'judge_prompt') === true`, `isRuleKindAllowed('free' | 'starter', 'judge_prompt') === false` — consumed by Task 3's `createRule`/`updateRule` via the existing `assertRuleKindAllowed()` choke point.

- [ ] **Step 1: Check for an existing limits test file**

Run: `cd backend && find tests -iname "*limit*" -o -iname "*billing*"`

If a file exists, add the test there following its existing style. If none exists, create `backend/tests/billing-limits.test.ts` with the step below as its first tests, importing the same way other unit-style (non-DB) tests in this repo do — check `backend/tests/` for an existing pure-unit test (no `beforeAll`/`startTestApp`) to match import conventions, e.g. a simple `describe`/`it`/`expect` from `vitest` with no DB setup.

- [ ] **Step 2: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { isRuleKindAllowed } from '../src/billing/limits.js'

describe('isRuleKindAllowed — judge_prompt', () => {
  it('is allowed on business, enterprise, and pilot plans', () => {
    expect(isRuleKindAllowed('business', 'judge_prompt')).toBe(true)
    expect(isRuleKindAllowed('enterprise', 'judge_prompt')).toBe(true)
    expect(isRuleKindAllowed('pilot', 'judge_prompt')).toBe(true)
  })

  it('is NOT allowed on free or starter plans', () => {
    expect(isRuleKindAllowed('free', 'judge_prompt')).toBe(false)
    expect(isRuleKindAllowed('starter', 'judge_prompt')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/billing-limits.test.ts` (or whatever file you added it to)
Expected: FAIL — both assertions return `false` today (`judge_prompt` isn't in any plan's `allowedRuleKinds` yet, and isn't even a valid type member).

- [ ] **Step 3: Write minimal implementation**

In `backend/src/billing/limits.ts`:

```typescript
// Change the type:
  allowedRuleKinds:       ReadonlyArray<'keyword' | 'pattern' | 'entropy' | 'score' | 'judge_prompt'>

// Add 'judge_prompt' to allowedRuleKinds for these three plans only (leave free/starter untouched):
  business: {
    ...
    allowedRuleKinds:       ['keyword', 'pattern', 'entropy', 'score', 'judge_prompt'],
    ...
  },
  enterprise: {
    ...
    allowedRuleKinds:       ['keyword', 'pattern', 'entropy', 'score', 'judge_prompt'],
    ...
  },
  pilot: {
    ...
    allowedRuleKinds:       ['keyword', 'pattern', 'entropy', 'score', 'judge_prompt'],
    ...
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/billing-limits.test.ts`
Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/billing/limits.ts tests/billing-limits.test.ts
git commit -m "feat(backend): entitle judge_prompt rules on business/enterprise/pilot plans"
```

---

## Task 3: CRUD layer accepts `prompt` end-to-end

**Files:**
- Modify: `backend/src/rules/service.ts` (`createRule`, `updateRule` — extend the `Pick<NewRule, ...>` types)
- Modify: `backend/src/internal/rules.router.ts:29,35` (extend the `Pick<NewRule, ...>` body types)
- Modify: `backend/src/rules/router.ts` (extend the inline body type literals on POST and PATCH, both the `kind` union and the new `prompt` field)
- Test: `backend/tests/rules.test.ts` (the test from Task 1 Step 1 now needs to actually pass; add an update test too)

**Interfaces:**
- Consumes: `Rule`/`NewRule` with `prompt` (Task 1), `isRuleKindAllowed`/`assertRuleKindAllowed` entitled for `judge_prompt` on `business` (Task 2 — this plan's test tenant defaults to `business`, see `backend/tests/helpers/db.ts:54`).
- Produces: `createRule(tenantId, subjectId, { kind: 'judge_prompt', prompt: string, action, ... })` and `updateRule(tenantId, id, { prompt: string })` both work end-to-end through every layer (public router, internal router, service).

- [ ] **Step 1: Write the failing tests**

```typescript
// append to backend/tests/rules.test.ts, inside describe('POST /v1/subjects/:subjectId/rules')
// (the "creates a judge_prompt rule" test from Task 1 goes here if not already added)

  it('rejects a judge_prompt rule missing a prompt with a clear error, not a silent null', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'judge_prompt', action: 'block' })
    // The DB column is nullable (Task 1), so this currently succeeds with
    // prompt=null rather than a validation error — documenting the actual
    // current behavior rather than assuming a 400. If stricter validation
    // is wanted later, that's a separate, deliberate change.
    expect(res.status).toBe(201)
    expect(res.body.prompt).toBeNull()
  })
```

```typescript
// new describe block, same file
describe('PATCH /v1/rules/:id — judge_prompt', () => {
  it('updates an existing judge_prompt rule\'s prompt text', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'judge_prompt', prompt: 'original claim', action: 'warn' })

    const res = await supertest(app.server)
      .patch(`/v1/rules/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ prompt: 'revised, more precise claim' })

    expect(res.status).toBe(200)
    expect(res.body.prompt).toBe('revised, more precise claim')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/rules.test.ts -t "judge_prompt"`
Expected: FAIL — the public router's inline body types don't include `'judge_prompt'` in the `kind` union or a `prompt` field, so Fastify/TypeScript either strips the field silently or the request body shape mismatches what the service expects (the exact failure depends on whether Fastify validates against the TS type at runtime here — check the actual error message to confirm, don't assume).

- [ ] **Step 3: Write minimal implementation**

`backend/src/rules/service.ts` — extend both `Pick<>` types:

```typescript
export async function createRule(
  tenantId: string,
  subjectId: string,
  data: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'prompt' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'reportLevel'>
): Promise<Rule> {
  await enforceRuleKind(tenantId, data.kind)
  if (data.pattern) validatePattern(data.pattern)
  const [row] = await db.insert(rules).values({ tenantId, subjectId, ...data }).returning()
  return row!
}

export async function updateRule(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'prompt' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'active' | 'reportLevel'>>
): Promise<Rule | null> {
  if (data.kind) await enforceRuleKind(tenantId, data.kind)
  if (data.pattern) validatePattern(data.pattern)
  const [row] = await db
    .update(rules)
    .set(data)
    .where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
    .returning()
  return row ?? null
}
```

`backend/src/internal/rules.router.ts:29` — extend the `Pick<>` in the POST body type:

```typescript
  app.post<{ Body: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'prompt' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'reportLevel'> & { subjectId: string } }>('/', async (req, reply) => {
```

(`:35`'s PATCH route already types its body as `Parameters<typeof updateRule>[2]` — no change needed there, it automatically picks up the new field once `updateRule`'s own signature changes above.)

`backend/src/rules/router.ts` — extend both inline body type literals:

```typescript
  fastify.post('/subjects/:subjectId/rules', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { subjectId } = req.params as { subjectId: string }
    const body = req.body as {
      kind: 'keyword' | 'pattern' | 'entropy' | 'score' | 'judge_prompt'
      keywords?: string[]
      pattern?: string
      prompt?: string
      destinations?: string[]
      destinationGroupIds?: string[]
      action: 'warn' | 'block'
      message?: string
      reportLevel?: 'none' | 'minimal' | 'medium' | 'rich'
    }
    return reply.status(201).send(await createRule(req.tenant.id, subjectId, body))
  })

  fastify.patch('/rules/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{
      kind: 'keyword' | 'pattern' | 'entropy' | 'score' | 'judge_prompt'
      keywords: string[]
      pattern: string
      prompt: string
      destinations: string[]
      destinationGroupIds: string[]
      action: 'warn' | 'block'
      message: string
      active: boolean
      reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
    }>
    const updated = await updateRule(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Rule not found' })
    return updated
  })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/rules.test.ts`
Expected: PASS, every test in the file (including the pre-existing ones — Review Focus item 3).

- [ ] **Step 5: Write and run the entitlement-rejection test**

`buildTestTenant(nameSuffix?: string)` (`backend/tests/helpers/db.ts:42-63`) takes only a name suffix, not a plan — it always inserts `plan: 'business'` (line 54). To test a plan without the `judge_prompt` entitlement, build a tenant normally, then directly update its `plan` column:

```typescript
// add these imports at the top of backend/tests/rules.test.ts if not already present
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'

// append to backend/tests/rules.test.ts
describe('judge_prompt entitlement', () => {
  it('rejects judge_prompt on a plan without the entitlement', async () => {
    const freeTenant = await buildTestTenant('free-plan')
    await db.update(tenants).set({ plan: 'free' }).where(eq(tenants.id, freeTenant.tenantId))

    const { body: freeSubject } = await supertest(app.server)
      .post('/v1/subjects')
      .set('Authorization', `Bearer ${freeTenant.adminToken}`)
      .send({ name: 'Free Plan Subject' })

    const res = await supertest(app.server)
      .post(`/v1/subjects/${freeSubject.id}/rules`)
      .set('Authorization', `Bearer ${freeTenant.adminToken}`)
      .send({ kind: 'judge_prompt', prompt: 'test claim', action: 'block' })
    expect(res.status).toBe(402)
  })
})
```

Run: `cd backend && npx vitest run tests/rules.test.ts -t "entitlement"`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/rules/service.ts src/internal/rules.router.ts src/rules/router.ts tests/rules.test.ts
git commit -m "feat(backend): accept prompt field for judge_prompt rules through the CRUD layer"
```

---

## Task 4: Assistant Action type and apply path

**Files:**
- Modify: `backend/src/assistant/llm/interface.ts:1,7-9` (`RuleKind`, `create_rule` action variant)
- Modify: `backend/src/assistant/apply.ts:56-66` (`create_rule` case's explicit payload object)
- Test: `backend/tests/assistant-apply.test.ts`

**Interfaces:**
- Consumes: `createRule()` accepting `prompt` (Task 3).
- Produces: `{ op: 'create_rule', subjectId, kind: 'judge_prompt', prompt: string, action, ... }` as a valid `Action`, and `executeActions()` correctly forwards it to a real created rule.

- [ ] **Step 1: Write the failing test**

```typescript
// append to backend/tests/assistant-apply.test.ts, inside describe('executeActions')
  it('creates a judge_prompt rule', async () => {
    const { applied, errors } = await runWithCtx(tenantId, () =>
      executeActions(tenantId, [
        { op: 'create_rule', subjectId, kind: 'judge_prompt',
          prompt: 'This message discloses a Social Security Number, even if disguised or spelled out.',
          action: 'block' },
      ])
    )
    expect(errors).toHaveLength(0)
    expect(applied).toHaveLength(1)
    const [rule] = await db.select().from(rules).where(eq(rules.subjectId, subjectId))
    expect(rule?.kind).toBe('judge_prompt')
    expect(rule?.prompt).toBe('This message discloses a Social Security Number, even if disguised or spelled out.')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/assistant-apply.test.ts -t "creates a judge_prompt rule"`
Expected: FAIL — TypeScript rejects `kind: 'judge_prompt'` on the `Action` union (compile error) and, even if that's worked around, `apply.ts`'s `create_rule` case doesn't forward a `prompt` field at all (it's not in the explicit object it builds).

- [ ] **Step 3: Write minimal implementation**

`backend/src/assistant/llm/interface.ts`:

```typescript
export type RuleKind    = 'keyword' | 'pattern' | 'entropy' | 'score' | 'judge_prompt'
...
export type Action =
  | { op: 'create_rule'; subjectId: string; kind: RuleKind; keywords?: string[]; pattern?: string;
      prompt?: string; destinations?: string[]; destinationGroupIds?: string[];
      action: RuleAction; message?: string; reportLevel?: ReportLevel }
  | ...
```

`backend/src/assistant/apply.ts:56-66` — add `prompt` to the posted payload:

```typescript
        case 'create_rule':
          await rulesClient.post('/', {
            subjectId: action.subjectId,
            kind: action.kind,
            keywords: action.keywords ?? null,
            pattern: action.pattern ?? null,
            prompt: action.prompt ?? null,
            destinations: action.destinations ?? [],
            destinationGroupIds: action.destinationGroupIds ?? [],
            action: action.action,
            message: action.message ?? null,
            reportLevel: action.reportLevel ?? 'none',
          })
          applied.push(action)
          break
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/assistant-apply.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/assistant/llm/interface.ts src/assistant/apply.ts tests/assistant-apply.test.ts
git commit -m "feat(backend): extend assistant Action type and apply path for judge_prompt"
```

---

## Task 5: Assistant system prompt content

**Files:**
- Modify: `backend/src/assistant/prompt.ts:64-111`
- Test: `backend/tests/assistant-prompt.test.ts`

**Interfaces:**
- Consumes: nothing new from earlier tasks (pure string-content change).
- Produces: `buildSystemPrompt()`'s output text teaches the model when and how to emit a `judge_prompt` action, matching the "unambiguous claim, not a question, not vague" discipline the spec requires.

- [ ] **Step 1: Write the failing test**

```typescript
// append to backend/tests/assistant-prompt.test.ts, inside describe('buildSystemPrompt')
  it('documents judge_prompt as a rule kind', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('judge_prompt')
    expect(prompt).toContain('on-device')
  })

  it('includes a judge_prompt example in RESPONSE FORMAT', () => {
    const prompt = buildSystemPrompt(snapshot)
    expect(prompt).toContain('"kind":"judge_prompt"')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run tests/assistant-prompt.test.ts -t "judge_prompt"`
Expected: FAIL — neither string appears in the current prompt text.

- [ ] **Step 3: Write minimal implementation**

In `backend/src/assistant/prompt.ts`, extend the `RULE KINDS` section (after line 76's `score` bullet):

```typescript
- judge_prompt: an on-device ML model judges a plain-English description of
  what to flag (e.g. "this message discloses a Social Security Number, even
  if disguised or spelled out"). Use this for intent-based or context-
  dependent rules that have no reliable fixed pattern — things a regex or
  keyword list can't express. Write the prompt as an unambiguous yes/no
  claim about the message, not a question, and not vague ("flag sensitive
  stuff") — vague prompts cause false positives on unrelated content.
```

And extend the `Rule` line in the `DATA MODEL` section (line 69) and the action-types list in `RESPONSE FORMAT` (after line 90):

```typescript
- Rule: a detection rule attached to a subject. Fields: kind (keyword|pattern|entropy|score|judge_prompt), keywords[], pattern, prompt (for judge_prompt), action (warn|block), message, reportLevel (none|minimal|medium|rich)
```

```typescript
- {"op":"create_rule","subjectId":"...","kind":"judge_prompt","prompt":"This message discloses <specific claim>, even if disguised.","action":"block"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run tests/assistant-prompt.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/assistant/prompt.ts tests/assistant-prompt.test.ts
git commit -m "feat(backend): teach the assistant system prompt about judge_prompt rules"
```

---

## Task 6: Policy compiler includes `prompt`

**Files:**
- Modify: `backend/src/policy/compiler.ts:13-23` (`RulePolicy`), `:41-53` (`toRulePolicy`)
- Test: `backend/tests/policy-compiler.test.ts`

**Interfaces:**
- Consumes: `createRule()` with `kind: 'judge_prompt'` (Task 3).
- Produces: `RulePolicy.prompt: string | null`, populated in a published `PolicyDoc` — the exact shape the future client-engine plan's `bridge.ts` work will consume.

- [ ] **Step 1: Write the failing test**

```typescript
// append to backend/tests/policy-compiler.test.ts, inside describe('compilePolicy')
  it('includes prompt for a judge_prompt rule', async () => {
    const subject = await createSubject(tenantId, { name: 'Judged Data' })
    await createRule(tenantId, subject.id, {
      kind: 'judge_prompt',
      prompt: 'This message discloses a Social Security Number, even if disguised or spelled out.',
      action: 'block',
    })

    const policy = await compile(tenantId)
    expect(policy.subjects[0]!.rules[0]!.kind).toBe('judge_prompt')
    expect(policy.subjects[0]!.rules[0]!.prompt).toBe('This message discloses a Social Security Number, even if disguised or spelled out.')
  })

  it('returns null prompt for non-judge_prompt rules', async () => {
    const subject = await createSubject(tenantId, { name: 'Pattern Data' })
    await createRule(tenantId, subject.id, { kind: 'keyword', keywords: ['x'], action: 'warn' })

    const policy = await compile(tenantId)
    expect(policy.subjects[0]!.rules[0]!.prompt).toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run tests/policy-compiler.test.ts -t "prompt"`
Expected: FAIL — TypeScript rejects `kind: 'judge_prompt'` passed to `createRule` until Task 3/4 land (if run in isolation before those), or (once those land) `policy.subjects[0].rules[0].prompt` is `undefined`, not present on `RulePolicy` at all.

- [ ] **Step 3: Write minimal implementation**

`backend/src/policy/compiler.ts`:

```typescript
export interface RulePolicy {
  id:                  string
  kind:                'keyword' | 'pattern' | 'entropy' | 'score' | 'judge_prompt'
  keywords:            string[] | null
  pattern:             string | null
  prompt:              string | null
  destinations:        string[]
  destinationGroupIds: string[]
  action:              'warn' | 'block'
  message:             string | null
  reportLevel:         'none' | 'minimal' | 'medium' | 'rich'
}

...

function toRulePolicy(r: Rule): RulePolicy {
  return {
    id:                  r.id,
    kind:                r.kind,
    keywords:            r.keywords ?? null,
    pattern:             r.pattern ?? null,
    prompt:              r.prompt ?? null,
    destinations:        r.destinations ?? [],
    destinationGroupIds: r.destinationGroupIds ?? [],
    action:              r.action,
    message:             r.message ?? null,
    reportLevel:         r.reportLevel,
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run tests/policy-compiler.test.ts`
Expected: PASS, every test in the file.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npx vitest run`
Expected: every test file passes — this is the final cross-check that nothing elsewhere in the backend broke from the schema/type changes across all six tasks.

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/policy/compiler.ts tests/policy-compiler.test.ts
git commit -m "feat(backend): include prompt in compiled policy for judge_prompt rules"
```
