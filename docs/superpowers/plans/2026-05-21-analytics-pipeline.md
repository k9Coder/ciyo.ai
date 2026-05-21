# Analytics Pipeline (Sub-project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-rule opt-in analytics reporting — each rule gets a `reportLevel` enum that controls how much data the extension sends to the backend when that rule triggers, stored in a new `events` table.

**Architecture:** Four layers in dependency order: (1) DB schema + migration, (2) backend events ingest service + router, (3) rules service/router + policy compiler pass `reportLevel` through, (4) extension reads `reportLevel` from cached PolicyDoc and fire-and-forgets events to the backend, (5) admin UI rule form gets a report level dropdown. Backend is the authoritative gate — it re-checks `reportLevel` before storing an event even if the extension sends one.

**Tech Stack:** Drizzle ORM, PostgreSQL, Fastify, Vitest + Supertest (backend), Zod (extension schema), TypeScript, React + Tailwind (admin UI)

---

## File Map

**Modify:**
- `backend/src/db/schema.ts` — add `reportLevelEnum`, `reportLevel` column to rules, new `events` table
- `backend/tests/helpers/db.ts` — add events to truncateAll, add buildTestMember helper
- `backend/src/rules/service.ts` — add `reportLevel` to createRule + updateRule params
- `backend/src/rules/router.ts` — accept `reportLevel` in POST + PATCH body
- `backend/src/policy/compiler.ts` — add `reportLevel` to `RulePolicy` interface + `toRulePolicy()`
- `backend/src/app.ts` — register eventsRouter
- `backend/tests/rules.test.ts` — assert reportLevel roundtrips
- `src/policy/schema.ts` — add `reportLevel` to `ResolvedRuleSchema`
- `src/background/service-worker.ts` — dispatch events after DETECT
- `admin/src/types.ts` — add `reportLevel` to `Rule` interface
- `admin/src/api.ts` — add `reportLevel` to rule create/update calls

**Create:**
- `backend/src/events/service.ts` — `ingestEvent()` with server-side report level gate
- `backend/src/events/router.ts` — `POST /v1/events`
- `backend/tests/events.test.ts` — integration tests for event ingest
- `src/events/dispatch.ts` — looks up reportLevel from cached PolicyDoc and POSTs event

**Admin UI:**
- `admin/src/pages/SubjectsPage.tsx` — add `reportLevel` to `RuleFormState` + `RuleForm`

---

## Task 1: DB Schema — reportLevel enum + events table

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add enum, column, and table to schema.ts**

Open `backend/src/db/schema.ts`. Make three additions:

**After the existing enums (after `ruleActionEnum` line 10), add:**
```ts
export const reportLevelEnum = pgEnum('report_level', ['none', 'minimal', 'medium', 'rich'])
```

**Inside the `rules` table definition, add after `active` column (before `createdAt`):**
```ts
  reportLevel: reportLevelEnum('report_level').notNull().default('none'),
```

**After the `siteConfigs` table, add the events table:**
```ts
// ── Events (analytics) ───────────────────────────────────────────────────────
export const events = pgTable('events', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  ruleId:      uuid('rule_id').notNull().references(() => rules.id),
  memberId:    uuid('member_id').references(() => members.id),
  action:      ruleActionEnum('action').notNull(),
  siteUrl:     text('site_url').notNull(),
  matchedTerm: text('matched_term'),
  occurredAt:  timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx: index().on(t.tenantId, t.occurredAt),
  ruleIdx:       index().on(t.ruleId),
}))
```

**At the bottom of the Types section, add:**
```ts
export type Event    = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors about `events` not being imported in test helpers — those are fixed in Task 2.

---

## Task 2: DB Migration + Update Test Helpers

**Files:**
- Modify: `backend/tests/helpers/db.ts`

- [ ] **Step 1: Generate and apply migration**

```bash
cd backend && pnpm db:generate
```

Review the generated SQL file in `backend/drizzle/` — confirm it contains:
- `CREATE TYPE "report_level" AS ENUM ('none', 'minimal', 'medium', 'rich')`
- `ALTER TABLE "rules" ADD COLUMN "report_level" report_level NOT NULL DEFAULT 'none'`
- `CREATE TABLE "events" (...)`

Then apply:
```bash
pnpm db:migrate
```

Expected: `Migration applied successfully`

- [ ] **Step 2: Update truncateAll in db.ts**

Replace `backend/tests/helpers/db.ts` entirely:

```ts
import { db } from '../../src/db/client.js'
import { tenants, policies, divisions, teams, members, memberTeams, subjects, rules, destinationGroups, siteConfigs, events } from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'

export async function truncateAll(): Promise<void> {
  await db.delete(events)
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
}

export interface TestTenantResult {
  tenantId: string
  orgToken: string
  adminToken: string
}

export async function buildTestTenant(slug = 'testfirm'): Promise<TestTenantResult> {
  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', slug, orgSecret)
  const adminToken  = formatToken('ps_adm', slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name:               'Test Firm LLP',
    slug,
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      `sub_test_${slug}`,
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}

export async function buildTestMember(tenantId: string, clerkId = 'clerk_test_user'): Promise<string> {
  const [row] = await db.insert(members).values({
    tenantId,
    email:   `${clerkId}@test.com`,
    clerkId,
    role:    'member',
  }).returning({ id: members.id })
  return row!.id
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add backend/src/db/schema.ts backend/drizzle/ backend/tests/helpers/db.ts
git commit -m "feat(db): add reportLevel to rules, add events table"
```

---

## Task 3: Events Service (TDD)

**Files:**
- Create: `backend/tests/events.test.ts`
- Create: `backend/src/events/service.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/events.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant, buildTestMember } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { subjects, rules, events } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let memberId: string
let ruleId: string

beforeAll(async () => { app = buildApp(); await app.ready() })

beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  memberId = await buildTestMember(tenantId)

  const [subject] = await db.insert(subjects).values({
    tenantId, name: 'Test Subject', active: true,
  }).returning({ id: subjects.id })

  const [rule] = await db.insert(rules).values({
    tenantId,
    subjectId:   subject!.id,
    kind:        'keyword',
    keywords:    ['secret'],
    action:      'block',
    reportLevel: 'medium',
  }).returning({ id: rules.id })

  ruleId = rule!.id
})

afterAll(async () => { await app.close() })

import { ingestEvent } from '../src/events/service.js'

describe('ingestEvent', () => {
  it('returns null and stores nothing when reportLevel is none', async () => {
    await db.update(rules).set({ reportLevel: 'none' }).where(
      (await import('drizzle-orm')).eq(rules.id, ruleId)
    )
    const result = await ingestEvent(tenantId, ruleId, memberId, { action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(result).toBeNull()
    const stored = await db.select().from(events)
    expect(stored).toHaveLength(0)
  })

  it('stores event without memberId for minimal level', async () => {
    await db.update(rules).set({ reportLevel: 'minimal' }).where(
      (await import('drizzle-orm')).eq(rules.id, ruleId)
    )
    const result = await ingestEvent(tenantId, ruleId, memberId, { action: 'warn', siteUrl: 'https://gemini.google.com' })
    expect(result).not.toBeNull()
    expect(result!.memberId).toBeNull()
    expect(result!.matchedTerm).toBeNull()
    expect(result!.action).toBe('warn')
    expect(result!.siteUrl).toBe('https://gemini.google.com')
  })

  it('stores event with memberId for medium level', async () => {
    const result = await ingestEvent(tenantId, ruleId, memberId, { action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(result).not.toBeNull()
    expect(result!.memberId).toBe(memberId)
    expect(result!.matchedTerm).toBeNull()
  })

  it('stores event with memberId + matchedTerm for rich level', async () => {
    await db.update(rules).set({ reportLevel: 'rich' }).where(
      (await import('drizzle-orm')).eq(rules.id, ruleId)
    )
    const result = await ingestEvent(tenantId, ruleId, memberId, {
      action: 'block', siteUrl: 'https://chat.openai.com', matchedTerm: 'Project Zeus',
    })
    expect(result).not.toBeNull()
    expect(result!.memberId).toBe(memberId)
    expect(result!.matchedTerm).toBe('Project Zeus')
  })

  it('returns null for unknown ruleId', async () => {
    const result = await ingestEvent(tenantId, '00000000-0000-0000-0000-000000000000', memberId, {
      action: 'block', siteUrl: 'https://chat.openai.com',
    })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && npx vitest run tests/events.test.ts 2>&1 | tail -5
```

Expected: FAIL — `ingestEvent` module not found.

- [ ] **Step 3: Create events service**

Create `backend/src/events/service.ts`:

```ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, rules, type Event } from '../db/schema.js'

export async function ingestEvent(
  tenantId: string,
  ruleId: string,
  memberId: string | null,
  data: { action: 'warn' | 'block'; siteUrl: string; matchedTerm?: string }
): Promise<Event | null> {
  const [rule] = await db.select({ reportLevel: rules.reportLevel })
    .from(rules)
    .where(eq(rules.id, ruleId))

  if (!rule || rule.reportLevel === 'none') return null

  const [row] = await db.insert(events).values({
    tenantId,
    ruleId,
    action:      data.action,
    siteUrl:     data.siteUrl,
    memberId:    rule.reportLevel === 'minimal' ? null : memberId,
    matchedTerm: rule.reportLevel === 'rich' ? (data.matchedTerm ?? null) : null,
  }).returning()

  return row!
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run tests/events.test.ts 2>&1 | tail -5
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/src/events/service.ts backend/tests/events.test.ts
git commit -m "feat(events): ingestEvent service with report level gate"
```

---

## Task 4: Events Router

**Files:**
- Create: `backend/src/events/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create router**

Create `backend/src/events/router.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { ingestEvent } from './service.js'

export async function eventsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/events', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const body = req.body as {
      ruleId: string
      action: 'warn' | 'block'
      siteUrl: string
      matchedTerm?: string
    }

    if (!body.ruleId || !body.action || !body.siteUrl) {
      return reply.status(400).send({ error: 'ruleId, action, and siteUrl are required' })
    }

    const memberId = req.member?.id ?? null
    const event = await ingestEvent(req.tenant.id, body.ruleId, memberId, {
      action:      body.action,
      siteUrl:     body.siteUrl,
      matchedTerm: body.matchedTerm,
    })

    if (!event) return reply.status(204).send()
    return reply.status(201).send({ id: event.id })
  })
}
```

- [ ] **Step 2: Register in app.ts**

In `backend/src/app.ts`, add import and register call alongside the other routers:

```ts
import { eventsRouter } from './events/router.js'
// ...
void app.register(eventsRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Add HTTP-level integration test to events.test.ts**

Append to `backend/tests/events.test.ts` (after the existing describe blocks):

```ts
describe('POST /v1/events', () => {
  it('returns 201 when event is stored', async () => {
    const { orgToken } = await buildTestTenant('firm2')
    // Re-use the ruleId from beforeEach (medium level)
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ ruleId, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it('returns 204 when rule has reportLevel none', async () => {
    await db.update(rules).set({ reportLevel: 'none' }).where(
      (await import('drizzle-orm')).eq(rules.id, ruleId)
    )
    const { orgToken } = await buildTestTenant('firm3')
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ ruleId, action: 'warn', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(204)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post('/v1/events')
      .send({ ruleId, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(401)
  })
})
```

Wait — the `orgToken` from `buildTestTenant('firm2')` is a different tenant from the one that owns `ruleId`. The `ingestEvent` validates by `tenantId` — but the router uses `req.tenant.id`. The rule belongs to the first tenant. Posting with firm2's org token would try to ingest an event for firm2's tenantId with a ruleId that belongs to firm1 — the rule lookup `where eq(rules.id, ruleId)` doesn't filter by tenantId in the service, but the event's tenantId would be firm2's.

Fix: the HTTP test should use the same tenant's org token. Update the test:

```ts
describe('POST /v1/events HTTP', () => {
  it('returns 201 when event is stored (medium level)', async () => {
    const t = await buildTestTenant('httptenant')
    const [subj] = await db.insert(subjects).values({ tenantId: t.tenantId, name: 'S', active: true }).returning({ id: subjects.id })
    const [r] = await db.insert(rules).values({ tenantId: t.tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['x'], action: 'block', reportLevel: 'medium' }).returning({ id: rules.id })
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${t.orgToken}`)
      .send({ ruleId: r!.id, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it('returns 204 when rule reportLevel is none', async () => {
    const t = await buildTestTenant('httptenant2')
    const [subj] = await db.insert(subjects).values({ tenantId: t.tenantId, name: 'S', active: true }).returning({ id: subjects.id })
    const [r] = await db.insert(rules).values({ tenantId: t.tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['x'], action: 'block', reportLevel: 'none' }).returning({ id: rules.id })
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${t.orgToken}`)
      .send({ ruleId: r!.id, action: 'warn', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(204)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post('/v1/events')
      .send({ ruleId, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(401)
  })
})
```

Replace the describe block you appended in Step 3 with this corrected version. The full addition to `backend/tests/events.test.ts` after the existing `ingestEvent` describe block is:

```ts
describe('POST /v1/events HTTP', () => {
  it('returns 201 when event is stored (medium level)', async () => {
    const t = await buildTestTenant('httptenant')
    const [subj] = await db.insert(subjects)
      .values({ tenantId: t.tenantId, name: 'S', active: true })
      .returning({ id: subjects.id })
    const [r] = await db.insert(rules)
      .values({ tenantId: t.tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['x'], action: 'block', reportLevel: 'medium' })
      .returning({ id: rules.id })
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${t.orgToken}`)
      .send({ ruleId: r!.id, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it('returns 204 when rule reportLevel is none', async () => {
    const t = await buildTestTenant('httptenant2')
    const [subj] = await db.insert(subjects)
      .values({ tenantId: t.tenantId, name: 'S', active: true })
      .returning({ id: subjects.id })
    const [r] = await db.insert(rules)
      .values({ tenantId: t.tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['x'], action: 'block', reportLevel: 'none' })
      .returning({ id: rules.id })
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${t.orgToken}`)
      .send({ ruleId: r!.id, action: 'warn', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(204)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post('/v1/events')
      .send({ ruleId, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 4: Run all events tests**

```bash
cd backend && npx vitest run tests/events.test.ts 2>&1 | tail -5
```

Expected: 8/8 PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/src/events/router.ts backend/src/app.ts backend/tests/events.test.ts
git commit -m "feat(events): POST /v1/events router + HTTP tests"
```

---

## Task 5: Rules — pass reportLevel through service + router

**Files:**
- Modify: `backend/src/rules/service.ts`
- Modify: `backend/src/rules/router.ts`
- Modify: `backend/tests/rules.test.ts`

- [ ] **Step 1: Update rules service**

Replace `backend/src/rules/service.ts` entirely:

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { rules, type Rule, type NewRule } from '../db/schema.js'

export async function listRules(tenantId: string, subjectId: string): Promise<Rule[]> {
  return db.select().from(rules).where(
    and(eq(rules.tenantId, tenantId), eq(rules.subjectId, subjectId), eq(rules.active, true))
  )
}

export async function listAllActiveRules(tenantId: string): Promise<Rule[]> {
  return db.select().from(rules).where(
    and(eq(rules.tenantId, tenantId), eq(rules.active, true))
  )
}

export async function createRule(
  tenantId: string,
  subjectId: string,
  data: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'reportLevel'>
): Promise<Rule> {
  const [row] = await db.insert(rules).values({ tenantId, subjectId, ...data }).returning()
  return row!
}

export async function updateRule(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'active' | 'reportLevel'>>
): Promise<Rule | null> {
  const [row] = await db
    .update(rules)
    .set(data)
    .where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteRule(tenantId: string, id: string): Promise<void> {
  await db.delete(rules).where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
}
```

- [ ] **Step 2: Update rules router**

Replace `backend/src/rules/router.ts` entirely:

```ts
import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { listRules, createRule, updateRule, deleteRule } from './service.js'

export async function rulesRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/subjects/:subjectId/rules', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { subjectId } = req.params as { subjectId: string }
    return listRules(req.tenant.id, subjectId)
  })

  fastify.post('/subjects/:subjectId/rules', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { subjectId } = req.params as { subjectId: string }
    const body = req.body as {
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords?: string[]
      pattern?: string
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
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords: string[]
      pattern: string
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

  fastify.delete('/rules/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await deleteRule(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 3: Add reportLevel assertions to rules.test.ts**

In `backend/tests/rules.test.ts`, add to the existing `POST` test after `expect(res.body.id).toBeDefined()`:

```ts
    expect(res.body.reportLevel).toBe('none') // default
```

Also add a new test in the `POST` describe block:

```ts
  it('creates a rule with custom reportLevel', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'keyword', keywords: ['secret'], action: 'block', reportLevel: 'rich' })
    expect(res.status).toBe(201)
    expect(res.body.reportLevel).toBe('rich')
  })
```

And in the `PATCH` describe block, add:

```ts
  it('can update reportLevel', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'keyword', keywords: ['x'], action: 'warn' })
    const res = await supertest(app.server)
      .patch(`/v1/rules/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reportLevel: 'medium' })
    expect(res.status).toBe(200)
    expect(res.body.reportLevel).toBe('medium')
  })
```

- [ ] **Step 4: Run rules + events tests**

```bash
cd backend && npx vitest run tests/rules.test.ts tests/events.test.ts 2>&1 | tail -6
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/src/rules/service.ts backend/src/rules/router.ts backend/tests/rules.test.ts
git commit -m "feat(rules): pass reportLevel through service, router, and tests"
```

---

## Task 6: Policy Compiler — add reportLevel to compiled rules

**Files:**
- Modify: `backend/src/policy/compiler.ts`

- [ ] **Step 1: Update RulePolicy interface and toRulePolicy**

Replace `backend/src/policy/compiler.ts` entirely:

```ts
import { eq } from 'drizzle-orm'
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import { db } from '../db/client.js'
import { siteConfigs } from '../db/schema.js'
import type { Rule } from '../db/schema.js'

export interface SiteConfig {
  inputSelector: string
  sendButtonSelector: string
}

export interface RulePolicy {
  id:                  string
  kind:                'keyword' | 'pattern' | 'entropy' | 'score'
  keywords:            string[] | null
  pattern:             string | null
  destinations:        string[]
  destinationGroupIds: string[]
  action:              'warn' | 'block'
  message:             string | null
  reportLevel:         'none' | 'minimal' | 'medium' | 'rich'
}

export interface SubjectPolicy {
  id:         string
  name:       string
  divisionId: string | null
  teamId:     string | null
  rules:      RulePolicy[]
}

export interface PolicyDoc {
  version:     1
  tenantId:    string
  subjects:    SubjectPolicy[]
  siteConfigs: Record<string, SiteConfig>
}

function toRulePolicy(r: Rule): RulePolicy {
  return {
    id:                  r.id,
    kind:                r.kind,
    keywords:            r.keywords ?? null,
    pattern:             r.pattern ?? null,
    destinations:        r.destinations ?? [],
    destinationGroupIds: r.destinationGroupIds ?? [],
    action:              r.action,
    message:             r.message ?? null,
    reportLevel:         r.reportLevel,
  }
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const [allSubjects, allRules, allSiteConfigs] = await Promise.all([
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
    db.select().from(siteConfigs).where(eq(siteConfigs.tenantId, tenantId)),
  ])

  const rulesBySubject = new Map<string, Rule[]>()
  for (const rule of allRules) {
    const arr = rulesBySubject.get(rule.subjectId) ?? []
    arr.push(rule)
    rulesBySubject.set(rule.subjectId, arr)
  }

  const siteConfigsMap: Record<string, SiteConfig> = {}
  for (const sc of allSiteConfigs) {
    siteConfigsMap[sc.domain] = { inputSelector: sc.inputSelector, sendButtonSelector: sc.sendButtonSelector }
  }

  return {
    version:  1,
    tenantId,
    subjects: allSubjects.map(s => ({
      id:         s.id,
      name:       s.name,
      divisionId: s.divisionId ?? null,
      teamId:     s.teamId ?? null,
      rules:      (rulesBySubject.get(s.id) ?? []).map(toRulePolicy),
    })),
    siteConfigs: siteConfigsMap,
  }
}
```

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && npx vitest run 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add backend/src/policy/compiler.ts
git commit -m "feat(compiler): include reportLevel in compiled rule policy"
```

---

## Task 7: Extension Schema — add reportLevel to ResolvedRuleSchema

**Files:**
- Modify: `src/policy/schema.ts`

- [ ] **Step 1: Add reportLevel to ResolvedRuleSchema**

In `src/policy/schema.ts`, find `ResolvedRuleSchema` (around line 96) and add `reportLevel`:

```ts
export const ResolvedRuleSchema = z.object({
  id:           z.string(),
  kind:         z.enum(["keyword", "pattern", "entropy", "score"]),
  keywords:     z.array(z.string()).nullable(),
  pattern:      z.string().nullable(),
  destinations: z.array(z.string()),
  action:       z.enum(["warn", "block"]),
  message:      z.string().nullable(),
  reportLevel:  z.enum(["none", "minimal", "medium", "rich"]).default("none"),
})
```

The `.default("none")` means existing cached policies without this field still parse correctly.

- [ ] **Step 2: Run extension tests**

```bash
cd "c:/Users/yarin/Documents/code/prompt-saviour" && npx vitest run tests/ 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add src/policy/schema.ts
git commit -m "feat(extension): add reportLevel to ResolvedRuleSchema"
```

---

## Task 8: Extension — dispatch events after detection

**Files:**
- Create: `src/events/dispatch.ts`
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Create dispatch module**

Create `src/events/dispatch.ts`:

```ts
import { API_BASE } from "@/shared/constants";
import { PolicyDocSchema } from "@/policy/schema";
import type { DetectionResult, Finding } from "@/detection/types";

async function getAuthToken(): Promise<string | null> {
  const clerkResult = await chrome.storage.local.get("clerkSessionToken") as Record<string, unknown>;
  if (typeof clerkResult["clerkSessionToken"] === "string") return clerkResult["clerkSessionToken"];
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null;
}

function getRuleReportLevel(ruleId: string, policyDoc: unknown): "none" | "minimal" | "medium" | "rich" {
  const parsed = PolicyDocSchema.safeParse(policyDoc);
  if (!parsed.success) return "none";
  for (const subject of parsed.data.subjects) {
    const rule = subject.rules.find(r => r.id === ruleId);
    if (rule) return rule.reportLevel;
  }
  return "none";
}

export async function dispatchEvents(
  result: DetectionResult,
  hostname: string
): Promise<void> {
  const actionable = result.findings.filter(
    (f): f is Finding & { action: "warn" | "block" } =>
      f.action === "warn" || f.action === "block"
  );
  if (actionable.length === 0) return;

  const [token, stored] = await Promise.all([
    getAuthToken(),
    chrome.storage.local.get("policyDoc") as Promise<Record<string, unknown>>,
  ]);
  if (!token) return;

  const policyDoc = stored["policyDoc"];

  for (const finding of actionable) {
    const reportLevel = getRuleReportLevel(finding.ruleId, policyDoc);
    if (reportLevel === "none") continue;

    const body: Record<string, unknown> = {
      ruleId:  finding.ruleId,
      action:  finding.action,
      siteUrl: hostname,
    };
    if (reportLevel === "rich") {
      body["matchedTerm"] = finding.matchedText;
    }

    fetch(`${API_BASE}/v1/events`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    }).catch(() => {}); // fire-and-forget
  }
}
```

- [ ] **Step 2: Wire into service-worker.ts**

In `src/background/service-worker.ts`, add import at the top:

```ts
import { dispatchEvents } from "@/events/dispatch";
```

In the `DETECT` case handler, add the fire-and-forget dispatch after awaiting the result. The current handler is:

```ts
case "DETECT": {
  const { text, hostname, pasteDetected } = message.payload;
  const policy = await loadPolicy();
  return detectPrompt(text, policy, hostname, pasteDetected ?? false);
}
```

Replace with:

```ts
case "DETECT": {
  const { text, hostname, pasteDetected } = message.payload;
  const policy = await loadPolicy();
  const result = await detectPrompt(text, policy, hostname, pasteDetected ?? false);
  void dispatchEvents(result, hostname);
  return result;
}
```

- [ ] **Step 3: Run extension tests**

```bash
cd "c:/Users/yarin/Documents/code/prompt-saviour" && npx vitest run tests/ 2>&1 | tail -5
```

Expected: all pass (dispatch is not tested at unit level — integration tested manually).

- [ ] **Step 4: Typecheck extension**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/events/dispatch.ts src/background/service-worker.ts
git commit -m "feat(extension): dispatch analytics events after detection (fire-and-forget)"
```

---

## Task 9: Admin types + API

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`

- [ ] **Step 1: Add reportLevel to Rule interface in types.ts**

In `admin/src/types.ts`, find the `Rule` interface and add `reportLevel`:

```ts
export interface Rule {
  id: string
  tenantId: string
  subjectId: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  destinationGroupIds: string[]
  action: 'warn' | 'block'
  message: string | null
  reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
  active: boolean
  createdAt: string
}
```

- [ ] **Step 2: Add reportLevel to api.ts rule calls**

In `admin/src/api.ts`, find `api.rules.create` and `api.rules.update`. Add `reportLevel` to both payloads. The exact lines to change:

For `rules.create` (find the method that posts to `/subjects/${subjectId}/rules`), add `reportLevel?: 'none' | 'minimal' | 'medium' | 'rich'` to the data parameter type.

For `rules.update` (find the method that patches to `/rules/${id}`), add `reportLevel?: 'none' | 'minimal' | 'medium' | 'rich'` to the data parameter type.

To find the exact location run:
```bash
grep -n "rules" admin/src/api.ts | head -20
```

Then update the create and update rule method signatures to include `reportLevel` in the accepted data object. The payload is passed directly to the fetch body, so no other changes are needed.

- [ ] **Step 3: Run admin tests**

```bash
cd admin && npx vitest run 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd ..
git add admin/src/types.ts admin/src/api.ts
git commit -m "feat(admin): add reportLevel to Rule type and api.rules create/update"
```

---

## Task 10: Admin UI — Report Level dropdown in RuleForm

**Files:**
- Modify: `admin/src/pages/SubjectsPage.tsx`

- [ ] **Step 1: Add reportLevel to RuleFormState**

In `admin/src/pages/SubjectsPage.tsx`, find `RuleFormState` (around line 42):

```ts
type RuleFormState = {
  kind: Rule['kind']
  action: Rule['action']
  keywords: string
  pattern: string
  message: string
  destinationGroupIds: string
}
```

Replace with:

```ts
type RuleFormState = {
  kind:         Rule['kind']
  action:       Rule['action']
  keywords:     string
  pattern:      string
  message:      string
  destinationGroupIds: string
  reportLevel:  Rule['reportLevel']
}
```

- [ ] **Step 2: Add reportLevel dropdown to RuleForm component**

In `RuleForm`, add the dropdown after the existing `action` select. Find the closing `</div>` of the 2-column grid (after the `action` select), and add a new full-width field below it:

```tsx
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Report to analytics</label>
        <select
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          value={value.reportLevel}
          onChange={e => onChange({ ...value, reportLevel: e.target.value as Rule['reportLevel'] })}
        >
          <option value="none">None — don't report</option>
          <option value="minimal">Minimal — action + site + time</option>
          <option value="medium">Medium — + who triggered it</option>
          <option value="rich">Rich — + matched term/pattern</option>
        </select>
      </div>
```

- [ ] **Step 3: Update all RuleFormState initializers in SubjectsPage.tsx**

Search for every place `RuleFormState` is initialized (when opening create modal or populating edit modal). Add `reportLevel` to each:

For **new rule** (the initial empty state), set `reportLevel: 'none'`.

For **editing existing rule**, set `reportLevel: rule.reportLevel`.

Run to find all occurrences:
```bash
grep -n "kind:" admin/src/pages/SubjectsPage.tsx
```

Update each found initializer to include `reportLevel`.

- [ ] **Step 4: Update rule create/update calls to pass reportLevel**

Find where `api.rules.create` and `api.rules.update` are called in `SubjectsPage.tsx`. Add `reportLevel: formState.reportLevel` to the payload object in each call.

- [ ] **Step 5: Run admin tests + typecheck**

```bash
cd admin && npx vitest run 2>&1 | tail -5 && npx tsc --noEmit
```

Expected: all tests pass, 0 type errors (except the pre-existing AppLayout error).

- [ ] **Step 6: Commit**

```bash
cd ..
git add admin/src/pages/SubjectsPage.tsx
git commit -m "feat(admin): add report level dropdown to rule form"
```

---

## Task 11: Full verification

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx vitest run 2>&1 | tail -6
```

Expected: all tests pass.

- [ ] **Step 2: Run all extension tests**

```bash
cd "c:/Users/yarin/Documents/code/prompt-saviour" && npx vitest run tests/ 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 3: Run all admin tests**

```bash
cd admin && npx vitest run 2>&1 | tail -5
```

Expected: all pass.

- [ ] **Step 4: Typecheck all three**

```bash
cd "c:/Users/yarin/Documents/code/prompt-saviour" && npx tsc --noEmit
cd backend && npx tsc --noEmit
cd ../admin && npx tsc --noEmit
```

Expected: 0 errors each (the pre-existing AppLayout `afterSignOutUrl` error in admin is exempt).
