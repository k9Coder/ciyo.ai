# Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add destination groups (reusable domain lists), embed them in policy snapshots, and implement on-the-fly per-member policy resolution scoped by team/division membership.

**Architecture:** The policy compiler stores group IDs (not expanded domains) in the snapshot. At `GET /v1/policy` time, if an `X-Member-Id` header is present, the resolver filters the snapshot to only the subjects applicable to that member's teams/divisions, resolves conflicts (team scope beats division beats global; block beats warn at same level), then expands group IDs into domain strings before returning. The stored snapshot is never mutated.

**Tech Stack:** Fastify 4, Drizzle ORM (PostgreSQL), TypeScript ESM (`.js` imports), Vitest + supertest (integration tests, no mocks).

---

## File Map

| File | Action |
|---|---|
| `backend/src/db/schema.ts` | Add `destinationGroups` table, add `destinationGroupIds` column to `rules` |
| `backend/drizzle/0002_policy_engine.sql` | Migration: new table + new column |
| `backend/drizzle/meta/_journal.json` | Register migration entry |
| `backend/tests/helpers/db.ts` | Add `destinationGroups` to `truncateAll` |
| `backend/src/destination-groups/service.ts` | Create: CRUD for destination groups |
| `backend/src/destination-groups/router.ts` | Create: API routes |
| `backend/src/app.ts` | Register `destinationGroupsRouter` |
| `backend/src/rules/service.ts` | Add `destinationGroupIds` to `createRule` + `updateRule` Pick |
| `backend/src/rules/router.ts` | Add `destinationGroupIds` to POST + PATCH body types |
| `backend/src/policy/compiler.ts` | Add `destinationGroupIds` to `RulePolicy` + `toRulePolicy` |
| `backend/src/policy/resolver.ts` | Create: member scoping + conflict resolution + group expansion |
| `backend/src/policy/router.ts` | Handle `X-Member-Id` header, delegate to resolver |
| `backend/tests/destination-groups.test.ts` | Create: CRUD tests |
| `backend/tests/policy-resolver.test.ts` | Create: resolver integration tests |
| `backend/tests/policy-routes.test.ts` | Add X-Member-Id scoping tests, update BASE_POLICY |
| `backend/tests/policy-compiler.test.ts` | Add `destinationGroupIds` assertion |

---

### Task 1: Schema + migration

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0002_policy_engine.sql`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/tests/helpers/db.ts`

- [ ] **Step 1: Add `destinationGroupIds` to the `rules` table and add the `destinationGroups` table in `backend/src/db/schema.ts`**

Replace the `rules` table block (lines 101–116) and the types section (lines 118–137) with:

```ts
// ── Rules ─────────────────────────────────────────────────────────────────────
export const rules = pgTable('rules', {
  id:                   uuid('id').primaryKey().defaultRandom(),
  tenantId:             uuid('tenant_id').notNull().references(() => tenants.id),
  subjectId:            uuid('subject_id').notNull().references(() => subjects.id),
  kind:                 ruleKindEnum('kind').notNull(),
  keywords:             text('keywords').array(),
  pattern:              text('pattern'),
  destinations:         text('destinations').array().default(sql`'{}'`),
  destinationGroupIds:  uuid('destination_group_ids').array().default(sql`'{}'`),
  action:               ruleActionEnum('action').notNull(),
  message:              text('message'),
  active:               boolean('active').notNull().default(true),
  createdAt:            timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  subjectIdx: index().on(t.subjectId),
}))

// ── Destination Groups ────────────────────────────────────────────────────────
export const destinationGroups = pgTable('destination_groups', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  divisionId: uuid('division_id').references(() => divisions.id),
  teamId:     uuid('team_id').references(() => teams.id),
  name:       text('name').notNull(),
  domains:    text('domains').array().notNull().default(sql`'{}'`),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index().on(t.tenantId),
}))

// ── Types ─────────────────────────────────────────────────────────────────────
export type Tenant    = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type PolicyRow = typeof policies.$inferSelect

export type Division    = typeof divisions.$inferSelect
export type NewDivision = typeof divisions.$inferInsert

export type Team    = typeof teams.$inferSelect
export type NewTeam = typeof teams.$inferInsert

export type Member    = typeof members.$inferSelect
export type NewMember = typeof members.$inferInsert

export type Subject    = typeof subjects.$inferSelect
export type NewSubject = typeof subjects.$inferInsert

export type Rule    = typeof rules.$inferSelect
export type NewRule = typeof rules.$inferInsert

export type DestinationGroup    = typeof destinationGroups.$inferSelect
export type NewDestinationGroup = typeof destinationGroups.$inferInsert
```

- [ ] **Step 2: Create `backend/drizzle/0002_policy_engine.sql`**

```sql
ALTER TABLE rules ADD COLUMN destination_group_ids uuid[] NOT NULL DEFAULT '{}';

CREATE TABLE destination_groups (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id),
  division_id  uuid REFERENCES divisions(id),
  team_id      uuid REFERENCES teams(id),
  name         text NOT NULL,
  domains      text[] NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON destination_groups(tenant_id);
```

- [ ] **Step 3: Register the migration in `backend/drizzle/meta/_journal.json`**

Add a third entry to the `entries` array:

```json
{
  "idx": 2,
  "version": "6",
  "when": 1778877458000,
  "tag": "0002_policy_engine",
  "breakpoints": true
}
```

- [ ] **Step 4: Update `backend/tests/helpers/db.ts` — add `destinationGroups` to `truncateAll` (must delete before `divisions`/`teams` due to FK)**

```ts
import { db } from '../../src/db/client.js'
import { tenants, policies, divisions, teams, members, memberTeams, subjects, rules, destinationGroups } from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'

export async function truncateAll(): Promise<void> {
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
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
  const orgSecret = generateSecret()
  const adminSecret = generateSecret()
  const orgToken = formatToken('ps_live', slug, orgSecret)
  const adminToken = formatToken('ps_adm', slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name: 'Test Firm LLP',
    slug,
    orgTokenHash: await hashToken(orgSecret),
    adminTokenHash: await hashToken(adminSecret),
    paymentProvider: 'stripe',
    externalSubId: `sub_test_${slug}`,
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}
```

- [ ] **Step 5: Run TypeScript check to confirm schema compiles**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/0002_policy_engine.sql backend/drizzle/meta/_journal.json backend/tests/helpers/db.ts
git commit -m "feat(schema): destination_groups table + rules.destination_group_ids column"
```

---

### Task 2: Destination groups service + tests

**Files:**
- Create: `backend/tests/destination-groups.test.ts`
- Create: `backend/src/destination-groups/service.ts`

- [ ] **Step 1: Write the failing tests in `backend/tests/destination-groups.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  orgToken = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/destination-groups', () => {
  it('creates a global group and returns it', async () => {
    const res = await supertest(app.server)
      .post('/v1/destination-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'External Email', domains: ['gmail.com', 'yahoo.com'] })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('External Email')
    expect(res.body.domains).toContain('gmail.com')
    expect(res.body.divisionId).toBeNull()
    expect(res.body.teamId).toBeNull()
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/destination-groups')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: 'X', domains: [] })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/destination-groups', () => {
  it('lists all groups for the tenant', async () => {
    await supertest(app.server).post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', domains: [] })
    await supertest(app.server).post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'B', domains: [] })
    const res = await supertest(app.server).get('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/destination-groups/:id', () => {
  it('updates name and domains', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Old', domains: ['a.com'] })
    const res = await supertest(app.server)
      .patch(`/v1/destination-groups/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New', domains: ['b.com', 'c.com'] })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New')
    expect(res.body.domains).toContain('b.com')
  })

  it('returns 404 for unknown id', async () => {
    const res = await supertest(app.server)
      .patch('/v1/destination-groups/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /v1/destination-groups/:id', () => {
  it('removes the group', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Delete Me', domains: [] })
    expect((await supertest(app.server).delete(`/v1/destination-groups/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((g: { id: string }) => g.id === created.id)).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && npx vitest run tests/destination-groups.test.ts 2>&1 | head -20`
Expected: FAIL (router not found / 404 responses)

- [ ] **Step 3: Create `backend/src/destination-groups/service.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { destinationGroups, type DestinationGroup, type NewDestinationGroup } from '../db/schema.js'

export async function listDestinationGroups(tenantId: string): Promise<DestinationGroup[]> {
  return db.select().from(destinationGroups).where(eq(destinationGroups.tenantId, tenantId))
}

export async function createDestinationGroup(
  tenantId: string,
  data: Pick<NewDestinationGroup, 'name' | 'domains' | 'divisionId' | 'teamId'>
): Promise<DestinationGroup> {
  const [row] = await db.insert(destinationGroups).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateDestinationGroup(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewDestinationGroup, 'name' | 'domains' | 'divisionId' | 'teamId'>>
): Promise<DestinationGroup | null> {
  const [row] = await db
    .update(destinationGroups)
    .set(data)
    .where(and(eq(destinationGroups.id, id), eq(destinationGroups.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteDestinationGroup(tenantId: string, id: string): Promise<void> {
  await db.delete(destinationGroups).where(
    and(eq(destinationGroups.id, id), eq(destinationGroups.tenantId, tenantId))
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/tests/destination-groups.test.ts backend/src/destination-groups/service.ts
git commit -m "feat(destination-groups): service + failing tests"
```

---

### Task 3: Destination groups router

**Files:**
- Create: `backend/src/destination-groups/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create `backend/src/destination-groups/router.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listDestinationGroups, createDestinationGroup, updateDestinationGroup, deleteDestinationGroup } from './service.js'

export async function destinationGroupsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/destination-groups', { preHandler: requireAdminToken }, async (req) => {
    return listDestinationGroups(req.tenant.id)
  })

  fastify.post('/destination-groups', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { name: string; domains: string[]; divisionId?: string; teamId?: string }
    return reply.status(201).send(await createDestinationGroup(req.tenant.id, body))
  })

  fastify.patch('/destination-groups/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; domains: string[]; divisionId: string; teamId: string }>
    const updated = await updateDestinationGroup(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Destination group not found' })
    return updated
  })

  fastify.delete('/destination-groups/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteDestinationGroup(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 2: Register in `backend/src/app.ts` — add after the `joinRouter` line**

Add to imports:
```ts
import { destinationGroupsRouter } from './destination-groups/router.js'
```

Add after `void app.register(joinRouter, { prefix: '/v1' })`:
```ts
void app.register(destinationGroupsRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Run tests to confirm they pass**

Run: `cd backend && npx vitest run tests/destination-groups.test.ts 2>&1 | tail -10`
Expected: all 7 tests PASS (or FAIL with ECONNREFUSED if no DB — that's fine)

- [ ] **Step 4: Commit**

```bash
git add backend/src/destination-groups/router.ts backend/src/app.ts
git commit -m "feat(destination-groups): CRUD router registered"
```

---

### Task 4: Update rules service + compiler for `destinationGroupIds`

**Files:**
- Modify: `backend/src/rules/service.ts`
- Modify: `backend/src/rules/router.ts`
- Modify: `backend/src/policy/compiler.ts`
- Modify: `backend/tests/policy-compiler.test.ts`

- [ ] **Step 1: Update `backend/src/rules/service.ts` — add `destinationGroupIds` to `createRule` and `updateRule`**

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
  data: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message'>
): Promise<Rule> {
  const [row] = await db.insert(rules).values({ tenantId, subjectId, ...data }).returning()
  return row!
}

export async function updateRule(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'active'>>
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

- [ ] **Step 2: Update `backend/src/rules/router.ts` — add `destinationGroupIds` to POST and PATCH body types**

```ts
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listRules, createRule, updateRule, deleteRule } from './service.js'

export async function rulesRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/subjects/:subjectId/rules', { preHandler: requireAdminToken }, async (req) => {
    const { subjectId } = req.params as { subjectId: string }
    return listRules(req.tenant.id, subjectId)
  })

  fastify.post('/subjects/:subjectId/rules', { preHandler: requireAdminToken }, async (req, reply) => {
    const { subjectId } = req.params as { subjectId: string }
    const body = req.body as {
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords?: string[]
      pattern?: string
      destinations?: string[]
      destinationGroupIds?: string[]
      action: 'warn' | 'block'
      message?: string
    }
    return reply.status(201).send(await createRule(req.tenant.id, subjectId, body))
  })

  fastify.patch('/rules/:id', { preHandler: requireAdminToken }, async (req, reply) => {
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
    }>
    const updated = await updateRule(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Rule not found' })
    return updated
  })

  fastify.delete('/rules/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteRule(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 3: Update `backend/src/policy/compiler.ts` — add `destinationGroupIds` to `RulePolicy` and `toRulePolicy`**

```ts
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import type { Rule } from '../db/schema.js'

export interface RulePolicy {
  id: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  destinationGroupIds: string[]
  action: 'warn' | 'block'
  message: string | null
}

export interface SubjectPolicy {
  id: string
  name: string
  divisionId: string | null
  teamId: string | null
  rules: RulePolicy[]
}

export interface PolicyDoc {
  version: 1
  tenantId: string
  subjects: SubjectPolicy[]
}

function toRulePolicy(r: Rule): RulePolicy {
  return {
    id: r.id,
    kind: r.kind,
    keywords: r.keywords ?? null,
    pattern: r.pattern ?? null,
    destinations: r.destinations ?? [],
    destinationGroupIds: r.destinationGroupIds ?? [],
    action: r.action,
    message: r.message ?? null,
  }
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const [allSubjects, allRules] = await Promise.all([
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
  ])

  const rulesBySubject = new Map<string, Rule[]>()
  for (const rule of allRules) {
    const arr = rulesBySubject.get(rule.subjectId) ?? []
    arr.push(rule)
    rulesBySubject.set(rule.subjectId, arr)
  }

  return {
    version: 1,
    tenantId,
    subjects: allSubjects.map(s => ({
      id: s.id,
      name: s.name,
      divisionId: s.divisionId ?? null,
      teamId: s.teamId ?? null,
      rules: (rulesBySubject.get(s.id) ?? []).map(toRulePolicy),
    })),
  }
}
```

- [ ] **Step 4: Add a test to `backend/tests/policy-compiler.test.ts` verifying `destinationGroupIds` is stored in snapshot**

Add this test inside the existing `describe('compilePolicy', ...)` block:

```ts
  it('stores destinationGroupIds in snapshot (not expanded)', async () => {
    const subject = await createSubject(tenantId, { name: 'Test' })
    await createRule(tenantId, subject.id, {
      kind: 'keyword',
      keywords: ['secret'],
      action: 'block',
      destinationGroupIds: ['00000000-0000-0000-0000-000000000001'],
    })
    const policy = await compilePolicy(tenantId)
    expect(policy.subjects[0]!.rules[0]!.destinationGroupIds).toContain('00000000-0000-0000-0000-000000000001')
  })
```

- [ ] **Step 5: Run TypeScript check**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/rules/service.ts backend/src/rules/router.ts backend/src/policy/compiler.ts backend/tests/policy-compiler.test.ts
git commit -m "feat(policy): include destinationGroupIds in snapshot; update rules service"
```

---

### Task 5: Policy resolver

**Files:**
- Create: `backend/tests/policy-resolver.test.ts`
- Create: `backend/src/policy/resolver.ts`

- [ ] **Step 1: Write the failing tests in `backend/tests/policy-resolver.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { divisions, teams, members, memberTeams, destinationGroups } from '../src/db/schema.js'
import { createSubject } from '../src/subjects/service.js'
import { createRule } from '../src/rules/service.js'
import { compilePolicy } from '../src/policy/compiler.js'
import { resolveMemberPolicy } from '../src/policy/resolver.js'

let tenantId: string
let divisionId: string
let teamId: string
let memberId: string

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId

  const [div] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning()
  divisionId = div!.id

  const [team] = await db.insert(teams).values({ tenantId, divisionId, name: 'Corp', slug: 'corp' }).returning()
  teamId = team!.id

  const [member] = await db.insert(members).values({ tenantId, email: 'alice@example.com', role: 'member' }).returning()
  memberId = member!.id
})

describe('resolveMemberPolicy', () => {
  it('member with no teams gets only global subjects', async () => {
    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const teamSubject = await createSubject(tenantId, { name: 'Team Only', teamId, divisionId })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['classified'], action: 'block' })

    const snapshot = await compilePolicy(tenantId)
    const resolved = await resolveMemberPolicy(tenantId, memberId, snapshot)

    expect(resolved.subjects).toHaveLength(1)
    expect(resolved.subjects[0]!.name).toBe('Global')
  })

  it('member in a team gets global + division + team subjects', async () => {
    await db.insert(memberTeams).values({ memberId, teamId })

    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['global'], action: 'warn' })

    const divSubject = await createSubject(tenantId, { name: 'Division', divisionId })
    await createRule(tenantId, divSubject.id, { kind: 'keyword', keywords: ['division'], action: 'warn' })

    const teamSubject = await createSubject(tenantId, { name: 'Team', teamId, divisionId })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['team'], action: 'block' })

    const snapshot = await compilePolicy(tenantId)
    const resolved = await resolveMemberPolicy(tenantId, memberId, snapshot)

    const names = resolved.subjects.map(s => s.name)
    expect(names).toContain('Global')
    expect(names).toContain('Division')
    expect(names).toContain('Team')
  })

  it('team scope beats global for same detection key', async () => {
    await db.insert(memberTeams).values({ memberId, teamId })

    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const teamSubject = await createSubject(tenantId, { name: 'Team', teamId, divisionId })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'block' })

    const snapshot = await compilePolicy(tenantId)
    const resolved = await resolveMemberPolicy(tenantId, memberId, snapshot)

    const allRules = resolved.subjects.flatMap(s => s.rules)
    expect(allRules).toHaveLength(1)
    expect(allRules[0]!.action).toBe('block')
  })

  it('block beats warn at the same scope level', async () => {
    const subject1 = await createSubject(tenantId, { name: 'SubjectA' })
    await createRule(tenantId, subject1.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const subject2 = await createSubject(tenantId, { name: 'SubjectB' })
    await createRule(tenantId, subject2.id, { kind: 'keyword', keywords: ['secret'], action: 'block' })

    const snapshot = await compilePolicy(tenantId)
    const resolved = await resolveMemberPolicy(tenantId, memberId, snapshot)

    const allRules = resolved.subjects.flatMap(s => s.rules)
    expect(allRules).toHaveLength(1)
    expect(allRules[0]!.action).toBe('block')
  })

  it('expands destination group IDs into domain strings', async () => {
    const [group] = await db.insert(destinationGroups).values({
      tenantId, name: 'External Email', domains: ['gmail.com', 'yahoo.com'],
    }).returning()

    const subject = await createSubject(tenantId, { name: 'Confidential' })
    await createRule(tenantId, subject.id, {
      kind: 'keyword', keywords: ['secret'], action: 'block',
      destinationGroupIds: [group!.id],
    })

    const snapshot = await compilePolicy(tenantId)
    const resolved = await resolveMemberPolicy(tenantId, memberId, snapshot)

    const rule = resolved.subjects[0]!.rules[0]!
    expect(rule.destinations).toContain('gmail.com')
    expect(rule.destinations).toContain('yahoo.com')
  })

  it('merges explicit destinations with group domains, deduplicates', async () => {
    const [group] = await db.insert(destinationGroups).values({
      tenantId, name: 'Cloud', domains: ['dropbox.com', 'shared.com'],
    }).returning()

    const subject = await createSubject(tenantId, { name: 'Files' })
    await createRule(tenantId, subject.id, {
      kind: 'keyword', keywords: ['confidential'], action: 'warn',
      destinations: ['drive.google.com', 'shared.com'],
      destinationGroupIds: [group!.id],
    })

    const snapshot = await compilePolicy(tenantId)
    const resolved = await resolveMemberPolicy(tenantId, memberId, snapshot)

    const rule = resolved.subjects[0]!.rules[0]!
    expect(rule.destinations).toContain('drive.google.com')
    expect(rule.destinations).toContain('dropbox.com')
    expect(rule.destinations.filter(d => d === 'shared.com')).toHaveLength(1)
  })

  it('does not include destinationGroupIds in resolved output', async () => {
    const subject = await createSubject(tenantId, { name: 'Test' })
    await createRule(tenantId, subject.id, { kind: 'keyword', keywords: ['x'], action: 'warn' })

    const snapshot = await compilePolicy(tenantId)
    const resolved = await resolveMemberPolicy(tenantId, memberId, snapshot)

    expect((resolved.subjects[0]!.rules[0]! as Record<string, unknown>)['destinationGroupIds']).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

Run: `cd backend && npx vitest run tests/policy-resolver.test.ts 2>&1 | head -20`
Expected: FAIL (`resolveMemberPolicy` not found)

- [ ] **Step 3: Create `backend/src/policy/resolver.ts`**

```ts
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { memberTeams, teams, destinationGroups } from '../db/schema.js'
import type { PolicyDoc, RulePolicy, SubjectPolicy } from './compiler.js'

export interface ResolvedRulePolicy {
  id: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  action: 'warn' | 'block'
  message: string | null
}

export interface ResolvedSubjectPolicy {
  id: string
  name: string
  rules: ResolvedRulePolicy[]
}

export interface ResolvedPolicy {
  version: number
  tenantId: string
  subjects: ResolvedSubjectPolicy[]
}

type Scope = 'global' | 'division' | 'team'
const SCOPE_PRIORITY: Record<Scope, number> = { global: 0, division: 1, team: 2 }

function scopeOf(s: SubjectPolicy): Scope {
  if (s.teamId) return 'team'
  if (s.divisionId) return 'division'
  return 'global'
}

function detectionKey(r: RulePolicy): string {
  if (r.kind === 'keyword') return `keyword:${[...(r.keywords ?? [])].sort().join(',')}`
  if (r.kind === 'pattern') return `pattern:${r.pattern ?? ''}`
  return r.kind
}

export async function resolveMemberPolicy(
  tenantId: string,
  memberId: string,
  snapshot: PolicyDoc,
): Promise<ResolvedPolicy> {
  const teamRows = await db
    .select({ teamId: memberTeams.teamId })
    .from(memberTeams)
    .where(eq(memberTeams.memberId, memberId))
  const memberTeamIds = new Set(teamRows.map(r => r.teamId))

  let memberDivisionIds = new Set<string>()
  if (memberTeamIds.size > 0) {
    const divRows = await db
      .select({ divisionId: teams.divisionId })
      .from(teams)
      .where(inArray(teams.id, [...memberTeamIds]))
    memberDivisionIds = new Set(divRows.map(r => r.divisionId))
  }

  const applicable = snapshot.subjects.filter(s => {
    if (!s.teamId && !s.divisionId) return true
    if (s.teamId) return memberTeamIds.has(s.teamId)
    if (s.divisionId) return memberDivisionIds.has(s.divisionId)
    return false
  })

  type RuleEntry = { rule: RulePolicy; scope: Scope; subjectId: string; subjectName: string }
  const byKey = new Map<string, RuleEntry>()

  for (const subject of applicable) {
    const scope = scopeOf(subject)
    for (const rule of subject.rules) {
      const key = detectionKey(rule)
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, { rule, scope, subjectId: subject.id, subjectName: subject.name })
      } else {
        const ep = SCOPE_PRIORITY[existing.scope]
        const np = SCOPE_PRIORITY[scope]
        if (np > ep || (np === ep && rule.action === 'block')) {
          byKey.set(key, { rule, scope, subjectId: subject.id, subjectName: subject.name })
        }
      }
    }
  }

  const allGroupIds = [...new Set([...byKey.values()].flatMap(e => e.rule.destinationGroupIds ?? []))]
  const groupDomainsMap: Record<string, string[]> = {}
  if (allGroupIds.length > 0) {
    const groupRows = await db
      .select({ id: destinationGroups.id, domains: destinationGroups.domains })
      .from(destinationGroups)
      .where(inArray(destinationGroups.id, allGroupIds))
    for (const row of groupRows) {
      groupDomainsMap[row.id] = row.domains ?? []
    }
  }

  const subjectMap = new Map<string, ResolvedSubjectPolicy>()
  for (const { rule, subjectId, subjectName } of byKey.values()) {
    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, { id: subjectId, name: subjectName, rules: [] })
    }
    const merged = [
      ...(rule.destinations ?? []),
      ...(rule.destinationGroupIds ?? []).flatMap(gid => groupDomainsMap[gid] ?? []),
    ]
    subjectMap.get(subjectId)!.rules.push({
      id: rule.id,
      kind: rule.kind,
      keywords: rule.keywords,
      pattern: rule.pattern,
      destinations: [...new Set(merged)],
      action: rule.action,
      message: rule.message,
    })
  }

  return {
    version: snapshot.version,
    tenantId,
    subjects: [...subjectMap.values()],
  }
}
```

- [ ] **Step 4: Run TypeScript check**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/tests/policy-resolver.test.ts backend/src/policy/resolver.ts
git commit -m "feat(policy): member policy resolver — scope filtering + conflict resolution + group expansion"
```

---

### Task 6: Update policy router + routes test

**Files:**
- Modify: `backend/src/policy/router.ts`
- Modify: `backend/tests/policy-routes.test.ts`

- [ ] **Step 1: Update `backend/src/policy/router.ts` — handle `X-Member-Id` header**

```ts
import type { FastifyInstance } from 'fastify'
import { requireOrgToken, requireAdminToken } from '../auth/middleware.js'
import { getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback } from './service.js'
import { compilePolicy, type PolicyDoc } from './compiler.js'
import { resolveMemberPolicy } from './resolver.js'

export async function policyRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/policy/version', { preHandler: requireOrgToken }, async (req, reply) => {
    const version = await getVersionOnly(req.tenant.id)
    if (version === null) return reply.status(404).send({ error: 'No policy published' })
    return { version }
  })

  fastify.get('/policy', { preHandler: requireOrgToken }, async (req, reply) => {
    const tenant = req.tenant

    if (tenant.subscriptionStatus === 'cancelled') {
      return reply.status(402).send({ error: 'subscription_cancelled' })
    }
    if (tenant.subscriptionStatus === 'past_due') {
      const expired = tenant.gracePeriodEndsAt && tenant.gracePeriodEndsAt < new Date()
      if (expired) return reply.status(402).send({ error: 'subscription_expired' })
    }

    const row = await getLatestPolicy(tenant.id)
    if (!row) return reply.status(404).send({ error: 'No policy published' })

    const snapshot = row.policyJson as PolicyDoc
    const memberId = req.headers['x-member-id'] as string | undefined
    const policy = memberId
      ? await resolveMemberPolicy(tenant.id, memberId, snapshot)
      : snapshot

    const response: Record<string, unknown> = {
      version: row.version,
      policy,
      tenantName: tenant.name,
      plan: tenant.plan,
      expiresAt: tenant.gracePeriodEndsAt?.toISOString() ?? null,
    }
    if (tenant.subscriptionStatus === 'past_due') response['warning'] = 'subscription_expiring'
    return response
  })

  fastify.post('/policy/publish', { preHandler: requireAdminToken }, async (req) => {
    const policy = await compilePolicy(req.tenant.id)
    const version = await publishPolicy(req.tenant.id, policy)
    return { version }
  })

  fastify.get('/policy/history', { preHandler: requireAdminToken }, async (req) => {
    return getHistory(req.tenant.id)
  })

  fastify.post('/policy/rollback/:version', { preHandler: requireAdminToken }, async (req, reply) => {
    const { version } = req.params as { version: string }
    const newVersion = await rollback(req.tenant.id, parseInt(version, 10))
    return { version: newVersion }
  })
}
```

- [ ] **Step 2: Add X-Member-Id tests to `backend/tests/policy-routes.test.ts`**

Update the `BASE_POLICY` constant and add a new describe block. Replace the top of the file through `afterAll`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { publishPolicy } from '../src/policy/service.js'
import { db } from '../src/db/client.js'
import { tenants, divisions, teams, members, memberTeams } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { createSubject } from '../src/subjects/service.js'
import { createRule } from '../src/rules/service.js'
import { compilePolicy } from '../src/policy/compiler.js'

const BASE_POLICY = {
  version: 1 as const,
  tenantId: 'placeholder',
  subjects: [],
}

let app: FastifyInstance
let tenantId: string
let orgToken: string
let adminToken: string

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  orgToken = t.orgToken
  adminToken = t.adminToken
  await publishPolicy(tenantId, BASE_POLICY)
})
afterAll(async () => { await app.close() })
```

Then add at the end of the file:

```ts
describe('GET /v1/policy with X-Member-Id', () => {
  it('returns only global subjects for a member with no teams', async () => {
    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const [div] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning()
    const [team] = await db.insert(teams).values({ tenantId, divisionId: div!.id, name: 'Corp', slug: 'corp' }).returning()
    const teamSubject = await createSubject(tenantId, { name: 'Team Only', teamId: team!.id, divisionId: div!.id })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['classified'], action: 'block' })

    const [member] = await db.insert(members).values({ tenantId, email: 'alice@example.com', role: 'member' }).returning()
    await publishPolicy(tenantId, await compilePolicy(tenantId))

    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
      .set('X-Member-Id', member!.id)
    expect(res.status).toBe(200)
    expect(res.body.policy.subjects).toHaveLength(1)
    expect(res.body.policy.subjects[0].name).toBe('Global')
  })

  it('returns full snapshot when X-Member-Id header is absent', async () => {
    const subject1 = await createSubject(tenantId, { name: 'A' })
    await createRule(tenantId, subject1.id, { kind: 'keyword', keywords: ['x'], action: 'warn' })
    const subject2 = await createSubject(tenantId, { name: 'B' })
    await createRule(tenantId, subject2.id, { kind: 'keyword', keywords: ['y'], action: 'block' })
    await publishPolicy(tenantId, await compilePolicy(tenantId))

    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.policy.subjects).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run TypeScript check**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/policy/router.ts backend/tests/policy-routes.test.ts
git commit -m "feat(policy): GET /v1/policy resolves member-scoped rules via X-Member-Id header"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full TypeScript check**

Run: `cd backend && npx tsc --noEmit`
Expected: exits 0, no output

- [ ] **Step 2: Run full test suite**

Run: `cd backend && npx vitest run 2>&1 | tail -15`
Expected: all non-DB tests pass; DB tests fail with `ECONNREFUSED` only (no assertion failures)

- [ ] **Step 3: Confirm tokens.test.ts still passes (no DB needed)**

Run: `cd backend && npx vitest run tests/tokens.test.ts`
Expected: 9 tests PASS

- [ ] **Step 4: Final commit if any files unstaged**

```bash
git status
# if clean: nothing to do
# if dirty: git add <files> && git commit -m "chore: policy engine subsystem complete"
```
