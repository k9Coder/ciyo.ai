# Org Structure Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legal-specific `matters` module with a generic `divisions → teams → members` org hierarchy, add `subjects` + `rules` tables as the new policy authoring primitives, and rewrite the policy compiler to read from these tables.

**Architecture:** Clean break — delete `matters` entirely, add 6 new Drizzle tables, create a service/router pair per resource following the existing Fastify plugin pattern. The policy compiler reads from `subjects` + `rules` and continues writing the same JSONB snapshot that the extension already understands — extension sync is unchanged. Division/team scoping enforcement is deferred to Subsystem 2.

**Tech Stack:** Fastify 4, Drizzle ORM, PostgreSQL, Vitest, TypeScript ESM (`.js` imports required)

---

## File Map

**Delete:**
- `backend/src/matters/router.ts`
- `backend/src/matters/service.ts`

**Modify:**
- `backend/src/db/schema.ts` — remove matters, add 6 tables
- `backend/src/app.ts` — swap mattersRouter for new routers
- `backend/src/policy/compiler.ts` — rewrite to read subjects + rules

**Create:**
- `backend/src/divisions/service.ts` + `router.ts`
- `backend/src/teams/service.ts` + `router.ts`
- `backend/src/members/service.ts` + `router.ts`
- `backend/src/auth/join.ts` + router entry in `app.ts`
- `backend/src/subjects/service.ts` + `router.ts`
- `backend/src/rules/service.ts` + `router.ts`
- `backend/tests/divisions.test.ts`
- `backend/tests/teams.test.ts`
- `backend/tests/members.test.ts`
- `backend/tests/subjects.test.ts`
- `backend/tests/rules.test.ts`
- `backend/tests/compiler.test.ts`

---

## Task 1: Rewrite DB Schema

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Replace schema.ts completely**

```ts
import {
  pgTable, pgEnum, uuid, text, boolean, integer,
  timestamp, jsonb, index, unique, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── Enums ────────────────────────────────────────────────────────────────────
export const memberRoleEnum = pgEnum('member_role', ['super_admin', 'division_admin', 'member'])
export const ruleKindEnum   = pgEnum('rule_kind',   ['keyword', 'pattern', 'entropy', 'score'])
export const ruleActionEnum = pgEnum('rule_action', ['warn', 'block'])

// ── Tenants ──────────────────────────────────────────────────────────────────
export const tenants = pgTable('tenants', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  name:               text('name').notNull(),
  slug:               text('slug').notNull(),
  orgTokenHash:       text('org_token_hash').notNull(),
  adminTokenHash:     text('admin_token_hash').notNull(),
  paymentProvider:    text('payment_provider').notNull(),
  externalSubId:      text('external_sub_id').notNull(),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  plan:               text('plan').notNull().default('pro'),
  gracePeriodDays:    integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt:  timestamp('grace_period_ends_at', { withTimezone: true }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq: unique().on(t.slug),
}))

// ── Policies (versioned snapshots — unchanged) ────────────────────────────────
export const policies = pgTable('policies', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  version:     integer('version').notNull(),
  policyJson:  jsonb('policy_json').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantVersionUniq: unique().on(t.tenantId, t.version),
  versionIdx:        index().on(t.tenantId, t.version),
}))

// ── Divisions ────────────────────────────────────────────────────────────────
export const divisions = pgTable('divisions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id),
  name:      text('name').notNull(),
  slug:      text('slug').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantSlugUniq: unique().on(t.tenantId, t.slug),
}))

// ── Teams ────────────────────────────────────────────────────────────────────
export const teams = pgTable('teams', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  divisionId: uuid('division_id').notNull().references(() => divisions.id),
  name:       text('name').notNull(),
  slug:       text('slug').notNull(),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  divisionSlugUniq: unique().on(t.divisionId, t.slug),
}))

// ── Members ──────────────────────────────────────────────────────────────────
export const members = pgTable('members', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').notNull().references(() => tenants.id),
  email:           text('email').notNull(),
  displayName:     text('display_name'),
  role:            memberRoleEnum('role').notNull().default('member'),
  adminDivisionId: uuid('admin_division_id').references(() => divisions.id),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantEmailUniq: unique().on(t.tenantId, t.email),
}))

// ── Member ↔ Team (many-to-many) ─────────────────────────────────────────────
export const memberTeams = pgTable('member_teams', {
  memberId: uuid('member_id').notNull().references(() => members.id),
  teamId:   uuid('team_id').notNull().references(() => teams.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.memberId, t.teamId] }),
}))

// ── Subjects (replaces matters) ───────────────────────────────────────────────
// Scope: teamId set = team-scoped; divisionId set + teamId null = division-scoped; both null = global
export const subjects = pgTable('subjects', {
  id:          uuid('id').primaryKey().defaultRandom(),
  tenantId:    uuid('tenant_id').notNull().references(() => tenants.id),
  divisionId:  uuid('division_id').references(() => divisions.id),
  teamId:      uuid('team_id').references(() => teams.id),
  name:        text('name').notNull(),
  description: text('description'),
  active:      boolean('active').notNull().default(true),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantActiveIdx: index().on(t.tenantId, t.active),
}))

// ── Rules ─────────────────────────────────────────────────────────────────────
export const rules = pgTable('rules', {
  id:           uuid('id').primaryKey().defaultRandom(),
  tenantId:     uuid('tenant_id').notNull().references(() => tenants.id),
  subjectId:    uuid('subject_id').notNull().references(() => subjects.id),
  kind:         ruleKindEnum('kind').notNull(),
  keywords:     text('keywords').array(),
  pattern:      text('pattern'),
  destinations: text('destinations').array().default(sql`'{}'`),
  action:       ruleActionEnum('action').notNull(),
  message:      text('message'),
  active:       boolean('active').notNull().default(true),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  subjectIdx: index().on(t.subjectId),
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
```

- [ ] **Step 2: Verify TypeScript compiles**

Run from `backend/`:
```
pnpm tsc --noEmit
```
Expected: errors about missing `matters` imports — those get fixed in Task 3.

---

## Task 2: Generate and Apply Migration

**Files:**
- Create: `backend/drizzle/` (generated by drizzle-kit)

- [ ] **Step 1: Generate migration**

Run from `backend/`:
```
pnpm db:generate
```
Expected: a new SQL file in `backend/drizzle/` that drops `matters`, creates the 6 new tables and 3 enums.

- [ ] **Step 2: Review the generated SQL**

Open the generated `.sql` file and confirm it contains:
- `DROP TABLE IF EXISTS "matters"` (or equivalent)
- `CREATE TYPE "member_role" AS ENUM('super_admin', 'division_admin', 'member')`
- `CREATE TYPE "rule_kind" AS ENUM('keyword', 'pattern', 'entropy', 'score')`
- `CREATE TYPE "rule_action" AS ENUM('warn', 'block')`
- `CREATE TABLE "divisions"`, `"teams"`, `"members"`, `"member_teams"`, `"subjects"`, `"rules"`

- [ ] **Step 3: Apply migration**

```
pnpm db:migrate
```
Expected: `Migration applied successfully` (no errors).

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -m "feat(db): replace matters with divisions/teams/members/subjects/rules schema"
```

---

## Task 3: Delete Matters Module

**Files:**
- Delete: `backend/src/matters/router.ts`, `backend/src/matters/service.ts`
- Modify: `backend/src/app.ts`, `backend/src/policy/compiler.ts`

- [ ] **Step 1: Delete the matters files**

Delete `backend/src/matters/router.ts` and `backend/src/matters/service.ts`.

- [ ] **Step 2: Remove matters from app.ts**

Replace the full content of `backend/src/app.ts` with:

```ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import './types.js'
import { policyRouter } from './policy/router.js'
import { handleStripeEvent } from './billing/stripe.js'
import { handlePayPalEvent } from './billing/paypal.js'

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  void app.register(cors)

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (req.url?.startsWith('/webhooks/stripe')) {
      done(null, body)
    } else {
      try { done(null, JSON.parse(body as string)) }
      catch (e) { done(e as Error) }
    }
  })

  app.post('/webhooks/stripe', async (request, reply) => {
    await handleStripeEvent(request.body as string, (request.headers['stripe-signature'] as string) ?? '')
    return reply.status(200).send({ received: true })
  })

  app.post('/webhooks/paypal', async (request, reply) => {
    await handlePayPalEvent(request.body as Record<string, unknown>)
    return reply.status(200).send({ received: true })
  })

  void app.register(policyRouter, { prefix: '/v1' })

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err)
    return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
  })

  app.get('/health', async () => ({ ok: true }))
  return app
}
```

- [ ] **Step 3: Stub out the policy compiler (temporary) to unblock compilation**

Replace `backend/src/policy/compiler.ts` with a stub — the real rewrite is in Task 15:

```ts
export interface PolicyDoc {
  version: 1
  tenantId: string
  baseline: unknown[]
  custom: unknown[]
  perSite: Record<string, unknown>
  allowSendAnywayWithReason: boolean
  auditRetentionDays: number
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  return {
    version: 1,
    tenantId,
    baseline: [],
    custom: [],
    perSite: {},
    allowSendAnywayWithReason: false,
    auditRetentionDays: 365,
  }
}
```

- [ ] **Step 4: Verify compilation**

```
pnpm tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: remove matters module, stub compiler"
```

---

## Task 4: Divisions Service + Tests

**Files:**
- Create: `backend/src/divisions/service.ts`
- Create: `backend/tests/divisions.test.ts`

- [ ] **Step 1: Write the failing tests first**

Create `backend/tests/divisions.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../src/db/client.js')

import { db } from '../src/db/client.js'

describe('listDivisions', () => {
  it('returns all divisions for the tenant', async () => {
    const row = { id: 'd1', tenantId: 't1', name: 'Legal', slug: 'legal', createdAt: new Date() }
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([row]) }),
    } as any)
    const { listDivisions } = await import('../src/divisions/service.js')
    expect(await listDivisions('t1')).toEqual([row])
  })
})

describe('createDivision', () => {
  it('inserts and returns the new division', async () => {
    const row = { id: 'd2', tenantId: 't1', name: 'Engineering', slug: 'engineering', createdAt: new Date() }
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }),
    } as any)
    const { createDivision } = await import('../src/divisions/service.js')
    expect(await createDivision('t1', { name: 'Engineering', slug: 'engineering' })).toEqual(row)
  })
})

describe('updateDivision', () => {
  it('returns null when division not found', async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    } as any)
    const { updateDivision } = await import('../src/divisions/service.js')
    expect(await updateDivision('t1', 'missing', { name: 'X' })).toBeNull()
  })

  it('returns updated division on success', async () => {
    const row = { id: 'd1', tenantId: 't1', name: 'Legal 2', slug: 'legal', createdAt: new Date() }
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }) }),
    } as any)
    const { updateDivision } = await import('../src/divisions/service.js')
    expect(await updateDivision('t1', 'd1', { name: 'Legal 2' })).toEqual(row)
  })
})

describe('deleteDivision', () => {
  it('calls delete without error', async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.delete).mockReturnValue({ where: mockWhere } as any)
    const { deleteDivision } = await import('../src/divisions/service.js')
    await expect(deleteDivision('t1', 'd1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

From `backend/`:
```
pnpm test -- --reporter=verbose divisions
```
Expected: 4 failures — `../src/divisions/service.js` not found.

- [ ] **Step 3: Implement divisions service**

Create `backend/src/divisions/service.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { divisions, type Division, type NewDivision } from '../db/schema.js'

export async function listDivisions(tenantId: string): Promise<Division[]> {
  return db.select().from(divisions).where(eq(divisions.tenantId, tenantId))
}

export async function createDivision(
  tenantId: string,
  data: Pick<NewDivision, 'name' | 'slug'>
): Promise<Division> {
  const [row] = await db.insert(divisions).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateDivision(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewDivision, 'name' | 'slug'>>
): Promise<Division | null> {
  const [row] = await db
    .update(divisions)
    .set(data)
    .where(and(eq(divisions.id, id), eq(divisions.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteDivision(tenantId: string, id: string): Promise<void> {
  await db.delete(divisions).where(and(eq(divisions.id, id), eq(divisions.tenantId, tenantId)))
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```
pnpm test -- --reporter=verbose divisions
```
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/divisions/service.ts backend/tests/divisions.test.ts
git commit -m "feat(divisions): service with CRUD + tests"
```

---

## Task 5: Divisions Router

**Files:**
- Create: `backend/src/divisions/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create divisions router**

```ts
// backend/src/divisions/router.ts
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listDivisions, createDivision, updateDivision, deleteDivision } from './service.js'

export async function divisionsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/divisions', { preHandler: requireAdminToken }, async (req) => {
    return listDivisions(req.tenant.id)
  })

  fastify.post('/divisions', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { name: string; slug: string }
    return reply.status(201).send(await createDivision(req.tenant.id, body))
  })

  fastify.patch('/divisions/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; slug: string }>
    const updated = await updateDivision(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Division not found' })
    return updated
  })

  fastify.delete('/divisions/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteDivision(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 2: Register in app.ts**

Add the import and register call in `backend/src/app.ts`. Add after the policy router line:

```ts
import { divisionsRouter } from './divisions/router.js'
// ...
void app.register(divisionsRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Verify TypeScript**

```
pnpm tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/divisions/router.ts backend/src/app.ts
git commit -m "feat(divisions): router GET/POST/PATCH/DELETE /v1/divisions"
```

---

## Task 6: Teams Service + Tests

**Files:**
- Create: `backend/src/teams/service.ts`
- Create: `backend/tests/teams.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/teams.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db/client.js')
import { db } from '../src/db/client.js'

describe('listTeams', () => {
  it('returns teams for a division', async () => {
    const row = { id: 'tm1', tenantId: 't1', divisionId: 'd1', name: 'M&A', slug: 'ma', createdAt: new Date() }
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([row]) }),
    } as any)
    const { listTeams } = await import('../src/teams/service.js')
    expect(await listTeams('t1', 'd1')).toEqual([row])
  })
})

describe('createTeam', () => {
  it('inserts and returns new team', async () => {
    const row = { id: 'tm2', tenantId: 't1', divisionId: 'd1', name: 'Contracts', slug: 'contracts', createdAt: new Date() }
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) }),
    } as any)
    const { createTeam } = await import('../src/teams/service.js')
    expect(await createTeam('t1', 'd1', { name: 'Contracts', slug: 'contracts' })).toEqual(row)
  })
})

describe('updateTeam', () => {
  it('returns null when not found', async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    } as any)
    const { updateTeam } = await import('../src/teams/service.js')
    expect(await updateTeam('t1', 'missing', { name: 'X' })).toBeNull()
  })
})

describe('deleteTeam', () => {
  it('resolves without error', async () => {
    vi.mocked(db.delete).mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) } as any)
    const { deleteTeam } = await import('../src/teams/service.js')
    await expect(deleteTeam('t1', 'tm1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — confirm failures**

```
pnpm test -- --reporter=verbose teams
```
Expected: 4 failures.

- [ ] **Step 3: Implement teams service**

Create `backend/src/teams/service.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { teams, type Team, type NewTeam } from '../db/schema.js'

export async function listTeams(tenantId: string, divisionId: string): Promise<Team[]> {
  return db.select().from(teams).where(
    and(eq(teams.tenantId, tenantId), eq(teams.divisionId, divisionId))
  )
}

export async function createTeam(
  tenantId: string,
  divisionId: string,
  data: Pick<NewTeam, 'name' | 'slug'>
): Promise<Team> {
  const [row] = await db.insert(teams).values({ tenantId, divisionId, ...data }).returning()
  return row!
}

export async function updateTeam(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewTeam, 'name' | 'slug'>>
): Promise<Team | null> {
  const [row] = await db
    .update(teams)
    .set(data)
    .where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteTeam(tenantId: string, id: string): Promise<void> {
  await db.delete(teams).where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)))
}
```

- [ ] **Step 4: Run — confirm passing**

```
pnpm test -- --reporter=verbose teams
```
Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/teams/service.ts backend/tests/teams.test.ts
git commit -m "feat(teams): service with CRUD + tests"
```

---

## Task 7: Teams Router

**Files:**
- Create: `backend/src/teams/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create teams router**

```ts
// backend/src/teams/router.ts
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listTeams, createTeam, updateTeam, deleteTeam } from './service.js'

export async function teamsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/divisions/:divisionId/teams', { preHandler: requireAdminToken }, async (req) => {
    const { divisionId } = req.params as { divisionId: string }
    return listTeams(req.tenant.id, divisionId)
  })

  fastify.post('/divisions/:divisionId/teams', { preHandler: requireAdminToken }, async (req, reply) => {
    const { divisionId } = req.params as { divisionId: string }
    const body = req.body as { name: string; slug: string }
    return reply.status(201).send(await createTeam(req.tenant.id, divisionId, body))
  })

  fastify.patch('/teams/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; slug: string }>
    const updated = await updateTeam(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Team not found' })
    return updated
  })

  fastify.delete('/teams/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteTeam(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 2: Register in app.ts**

Add to `backend/src/app.ts`:

```ts
import { teamsRouter } from './teams/router.js'
// ...
void app.register(teamsRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Verify + commit**

```
pnpm tsc --noEmit
git add backend/src/teams/router.ts backend/src/app.ts
git commit -m "feat(teams): router GET/POST /v1/divisions/:id/teams + PATCH/DELETE /v1/teams/:id"
```

---

## Task 8: Members Service + Tests

**Files:**
- Create: `backend/src/members/service.ts`
- Create: `backend/tests/members.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/members.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db/client.js')
import { db } from '../src/db/client.js'

const member = {
  id: 'm1', tenantId: 't1', email: 'alice@acme.com',
  displayName: 'Alice', role: 'member' as const,
  adminDivisionId: null, createdAt: new Date(),
}

describe('listMembers', () => {
  it('returns all members for tenant', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([member]) }),
    } as any)
    const { listMembers } = await import('../src/members/service.js')
    expect(await listMembers('t1')).toEqual([member])
  })
})

describe('createMember', () => {
  it('inserts and returns new member', async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([member]) }),
    } as any)
    const { createMember } = await import('../src/members/service.js')
    expect(await createMember('t1', { email: 'alice@acme.com', displayName: 'Alice', role: 'member' })).toEqual(member)
  })
})

describe('deleteMember', () => {
  it('deletes member_teams first then member', async () => {
    const mockWhere = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.delete).mockReturnValue({ where: mockWhere } as any)
    const { deleteMember } = await import('../src/members/service.js')
    await deleteMember('t1', 'm1')
    expect(db.delete).toHaveBeenCalledTimes(2)
  })
})

describe('assignTeam', () => {
  it('inserts into member_teams', async () => {
    const mockOnConflict = vi.fn().mockResolvedValue(undefined)
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({ onConflictDoNothing: mockOnConflict }),
    } as any)
    const { assignTeam } = await import('../src/members/service.js')
    await assignTeam('m1', 'tm1')
    expect(mockOnConflict).toHaveBeenCalled()
  })
})

describe('importMembers', () => {
  it('returns empty array for empty input', async () => {
    const { importMembers } = await import('../src/members/service.js')
    expect(await importMembers('t1', [])).toEqual([])
  })
})
```

- [ ] **Step 2: Run — confirm failures**

```
pnpm test -- --reporter=verbose members
```
Expected: 5 failures.

- [ ] **Step 3: Implement members service**

Create `backend/src/members/service.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { members, memberTeams, type Member, type NewMember } from '../db/schema.js'

export async function listMembers(tenantId: string): Promise<Member[]> {
  return db.select().from(members).where(eq(members.tenantId, tenantId))
}

export async function getMemberByEmail(tenantId: string, email: string): Promise<Member | null> {
  const [row] = await db.select().from(members).where(
    and(eq(members.tenantId, tenantId), eq(members.email, email))
  )
  return row ?? null
}

export async function createMember(
  tenantId: string,
  data: Pick<NewMember, 'email' | 'displayName' | 'role'>
): Promise<Member> {
  const [row] = await db.insert(members).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateMember(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewMember, 'displayName' | 'role' | 'adminDivisionId'>>
): Promise<Member | null> {
  const [row] = await db
    .update(members)
    .set(data)
    .where(and(eq(members.id, id), eq(members.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteMember(tenantId: string, id: string): Promise<void> {
  await db.delete(memberTeams).where(eq(memberTeams.memberId, id))
  await db.delete(members).where(and(eq(members.id, id), eq(members.tenantId, tenantId)))
}

export async function assignTeam(memberId: string, teamId: string): Promise<void> {
  await db.insert(memberTeams).values({ memberId, teamId }).onConflictDoNothing()
}

export async function removeTeam(memberId: string, teamId: string): Promise<void> {
  await db.delete(memberTeams).where(
    and(eq(memberTeams.memberId, memberId), eq(memberTeams.teamId, teamId))
  )
}

export async function importMembers(
  tenantId: string,
  rows: Array<{ email: string; displayName?: string }>
): Promise<Member[]> {
  if (rows.length === 0) return []
  const toInsert = rows.map(r => ({
    tenantId,
    email: r.email,
    displayName: r.displayName ?? null,
    role: 'member' as const,
  }))
  return db.insert(members).values(toInsert).onConflictDoNothing().returning()
}
```

- [ ] **Step 4: Run — confirm passing**

```
pnpm test -- --reporter=verbose members
```
Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/members/service.ts backend/tests/members.test.ts
git commit -m "feat(members): service with CRUD, team assignment, CSV import + tests"
```

---

## Task 9: Members Router

**Files:**
- Create: `backend/src/members/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create members router**

```ts
// backend/src/members/router.ts
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import {
  listMembers, createMember, updateMember, deleteMember,
  assignTeam, removeTeam, importMembers,
} from './service.js'

export async function membersRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/members', { preHandler: requireAdminToken }, async (req) => {
    return listMembers(req.tenant.id)
  })

  fastify.post('/members', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { email: string; displayName?: string; role?: 'member' | 'division_admin' | 'super_admin' }
    const member = await createMember(req.tenant.id, {
      email: body.email,
      displayName: body.displayName,
      role: body.role ?? 'member',
    })
    return reply.status(201).send(member)
  })

  fastify.post('/members/import', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { rows: Array<{ email: string; displayName?: string }> }
    const imported = await importMembers(req.tenant.id, body.rows ?? [])
    return reply.status(201).send(imported)
  })

  fastify.patch('/members/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ displayName: string; role: string; adminDivisionId: string }>
    const updated = await updateMember(req.tenant.id, id, body as any)
    if (!updated) return reply.status(404).send({ error: 'Member not found' })
    return updated
  })

  fastify.delete('/members/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteMember(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })

  fastify.post('/members/:id/teams', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { teamId } = req.body as { teamId: string }
    await assignTeam(id, teamId)
    return reply.status(204).send()
  })

  fastify.delete('/members/:id/teams/:teamId', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id, teamId } = req.params as { id: string; teamId: string }
    await removeTeam(id, teamId)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 2: Register in app.ts**

```ts
import { membersRouter } from './members/router.js'
// ...
void app.register(membersRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Verify + commit**

```
pnpm tsc --noEmit
git add backend/src/members/router.ts backend/src/app.ts
git commit -m "feat(members): router /v1/members CRUD + team assignment"
```

---

## Task 10: Auth Join Endpoint

**Files:**
- Create: `backend/src/auth/join.ts`
- Modify: `backend/src/app.ts`

The join flow: employee sends their org token (Bearer `ps_live_*`) + email. Backend validates the org token (existing auth), creates a member record if one doesn't exist, returns the member.

- [ ] **Step 1: Create join handler**

```ts
// backend/src/auth/join.ts
import type { FastifyInstance } from 'fastify'
import { requireOrgToken } from './middleware.js'
import { getMemberByEmail, createMember } from '../members/service.js'

export async function joinRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/auth/join', { preHandler: requireOrgToken }, async (req, reply) => {
    const { email } = req.body as { email: string }
    if (!email || !email.includes('@')) {
      return reply.status(400).send({ error: 'Valid email required' })
    }
    const existing = await getMemberByEmail(req.tenant.id, email)
    if (existing) return reply.status(200).send(existing)
    const member = await createMember(req.tenant.id, { email, role: 'member' })
    return reply.status(201).send(member)
  })
}
```

- [ ] **Step 2: Register in app.ts**

```ts
import { joinRouter } from './auth/join.js'
// ...
void app.register(joinRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Verify + commit**

```
pnpm tsc --noEmit
git add backend/src/auth/join.ts backend/src/app.ts
git commit -m "feat(auth): POST /v1/auth/join — extension member self-registration"
```

---

## Task 11: Subjects Service + Tests

**Files:**
- Create: `backend/src/subjects/service.ts`
- Create: `backend/tests/subjects.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/subjects.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db/client.js')
import { db } from '../src/db/client.js'

const subject = {
  id: 's1', tenantId: 't1', divisionId: 'd1', teamId: null,
  name: 'Zuckerberg Contract', description: null,
  active: true, createdAt: new Date(),
}

describe('listSubjects', () => {
  it('returns active subjects for tenant', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([subject]) }),
    } as any)
    const { listSubjects } = await import('../src/subjects/service.js')
    expect(await listSubjects('t1')).toEqual([subject])
  })
})

describe('createSubject', () => {
  it('inserts and returns subject', async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([subject]) }),
    } as any)
    const { createSubject } = await import('../src/subjects/service.js')
    const result = await createSubject('t1', { name: 'Zuckerberg Contract', divisionId: 'd1' })
    expect(result).toEqual(subject)
  })
})

describe('updateSubject', () => {
  it('returns null when not found', async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    } as any)
    const { updateSubject } = await import('../src/subjects/service.js')
    expect(await updateSubject('t1', 'missing', { name: 'X' })).toBeNull()
  })
})

describe('deleteSubject', () => {
  it('resolves without error', async () => {
    vi.mocked(db.delete).mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) } as any)
    const { deleteSubject } = await import('../src/subjects/service.js')
    await expect(deleteSubject('t1', 's1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — confirm failures**

```
pnpm test -- --reporter=verbose subjects
```

- [ ] **Step 3: Implement subjects service**

Create `backend/src/subjects/service.ts`:

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { subjects, type Subject, type NewSubject } from '../db/schema.js'

export async function listSubjects(tenantId: string): Promise<Subject[]> {
  return db.select().from(subjects).where(
    and(eq(subjects.tenantId, tenantId), eq(subjects.active, true))
  )
}

export async function createSubject(
  tenantId: string,
  data: Pick<NewSubject, 'name' | 'description' | 'divisionId' | 'teamId'>
): Promise<Subject> {
  const [row] = await db.insert(subjects).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateSubject(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewSubject, 'name' | 'description' | 'active' | 'divisionId' | 'teamId'>>
): Promise<Subject | null> {
  const [row] = await db
    .update(subjects)
    .set(data)
    .where(and(eq(subjects.id, id), eq(subjects.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteSubject(tenantId: string, id: string): Promise<void> {
  await db.delete(subjects).where(
    and(eq(subjects.id, id), eq(subjects.tenantId, tenantId))
  )
}
```

- [ ] **Step 4: Run — confirm passing**

```
pnpm test -- --reporter=verbose subjects
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/subjects/service.ts backend/tests/subjects.test.ts
git commit -m "feat(subjects): service with CRUD + tests"
```

---

## Task 12: Subjects Router

**Files:**
- Create: `backend/src/subjects/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create subjects router**

```ts
// backend/src/subjects/router.ts
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listSubjects, createSubject, updateSubject, deleteSubject } from './service.js'

export async function subjectsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/subjects', { preHandler: requireAdminToken }, async (req) => {
    return listSubjects(req.tenant.id)
  })

  fastify.post('/subjects', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { name: string; description?: string; divisionId?: string; teamId?: string }
    return reply.status(201).send(await createSubject(req.tenant.id, body))
  })

  fastify.patch('/subjects/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; description: string; active: boolean; divisionId: string; teamId: string }>
    const updated = await updateSubject(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Subject not found' })
    return updated
  })

  fastify.delete('/subjects/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteSubject(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 2: Register in app.ts**

```ts
import { subjectsRouter } from './subjects/router.js'
// ...
void app.register(subjectsRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Verify + commit**

```
pnpm tsc --noEmit
git add backend/src/subjects/router.ts backend/src/app.ts
git commit -m "feat(subjects): router GET/POST/PATCH/DELETE /v1/subjects"
```

---

## Task 13: Rules Service + Tests

**Files:**
- Create: `backend/src/rules/service.ts`
- Create: `backend/tests/rules.test.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/rules.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db/client.js')
import { db } from '../src/db/client.js'

const rule = {
  id: 'r1', tenantId: 't1', subjectId: 's1',
  kind: 'keyword' as const, keywords: ['Zuckerberg', 'Project Zeus'],
  pattern: null, destinations: [], action: 'block' as const,
  message: null, active: true, createdAt: new Date(),
}

describe('listRules', () => {
  it('returns active rules for subject', async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([rule]) }),
    } as any)
    const { listRules } = await import('../src/rules/service.js')
    expect(await listRules('t1', 's1')).toEqual([rule])
  })
})

describe('createRule', () => {
  it('inserts and returns rule', async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([rule]) }),
    } as any)
    const { createRule } = await import('../src/rules/service.js')
    const result = await createRule('t1', 's1', {
      kind: 'keyword', keywords: ['Zuckerberg'], action: 'block',
    })
    expect(result).toEqual(rule)
  })
})

describe('updateRule', () => {
  it('returns null when not found', async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }) }),
    } as any)
    const { updateRule } = await import('../src/rules/service.js')
    expect(await updateRule('t1', 'missing', { action: 'warn' })).toBeNull()
  })
})

describe('deleteRule', () => {
  it('resolves without error', async () => {
    vi.mocked(db.delete).mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) } as any)
    const { deleteRule } = await import('../src/rules/service.js')
    await expect(deleteRule('t1', 'r1')).resolves.toBeUndefined()
  })
})
```

- [ ] **Step 2: Run — confirm failures**

```
pnpm test -- --reporter=verbose rules
```

- [ ] **Step 3: Implement rules service**

Create `backend/src/rules/service.ts`:

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
  data: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'action' | 'message'>
): Promise<Rule> {
  const [row] = await db.insert(rules).values({ tenantId, subjectId, ...data }).returning()
  return row!
}

export async function updateRule(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'action' | 'message' | 'active'>>
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

- [ ] **Step 4: Run — confirm passing**

```
pnpm test -- --reporter=verbose rules
```

- [ ] **Step 5: Commit**

```bash
git add backend/src/rules/service.ts backend/tests/rules.test.ts
git commit -m "feat(rules): service with CRUD + tests"
```

---

## Task 14: Rules Router

**Files:**
- Create: `backend/src/rules/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create rules router**

```ts
// backend/src/rules/router.ts
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

- [ ] **Step 2: Register in app.ts**

```ts
import { rulesRouter } from './rules/router.js'
// ...
void app.register(rulesRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Verify + commit**

```
pnpm tsc --noEmit
git add backend/src/rules/router.ts backend/src/app.ts
git commit -m "feat(rules): router GET/POST /v1/subjects/:id/rules + PATCH/DELETE /v1/rules/:id"
```

---

## Task 15: Rewrite Policy Compiler

**Files:**
- Modify: `backend/src/policy/compiler.ts`
- Create: `backend/tests/compiler.test.ts`

The compiler reads all active subjects + rules for the tenant, maps them to the JSONB format the extension already understands, and returns the policy doc. Division/team scoping is included as tags on each rule but enforcement is deferred to Subsystem 2.

- [ ] **Step 1: Write failing test**

Create `backend/tests/compiler.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../src/db/client.js')
import { db } from '../src/db/client.js'

describe('compilePolicy', () => {
  it('returns empty custom array when no rules exist', async () => {
    // listAllActiveRules returns []
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
    } as any)
    const { compilePolicy } = await import('../src/policy/compiler.js')
    const doc = await compilePolicy('t1')
    expect(doc.tenantId).toBe('t1')
    expect(doc.version).toBe(1)
    expect(doc.custom).toEqual([])
  })

  it('maps a keyword rule to a dictionary entry', async () => {
    const rule = {
      id: 'r1', tenantId: 't1', subjectId: 's1',
      kind: 'keyword' as const, keywords: ['ProjectZeus', 'PZ'],
      pattern: null, destinations: ['chat.openai.com'],
      action: 'block' as const, message: 'Confidential matter',
      active: true, createdAt: new Date(),
    }
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([rule]) }),
    } as any)
    const { compilePolicy } = await import('../src/policy/compiler.js')
    const doc = await compilePolicy('t1')
    expect(doc.custom).toHaveLength(1)
    expect(doc.custom[0]).toMatchObject({
      kind: 'dictionary',
      id: 'r1',
      action: 'block',
      terms: ['ProjectZeus', 'PZ'],
    })
  })

  it('maps a pattern rule correctly', async () => {
    const rule = {
      id: 'r2', tenantId: 't1', subjectId: 's1',
      kind: 'pattern' as const, keywords: null,
      pattern: '\\bProject\\s+Zeus\\b', destinations: [],
      action: 'warn' as const, message: null,
      active: true, createdAt: new Date(),
    }
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([rule]) }),
    } as any)
    const { compilePolicy } = await import('../src/policy/compiler.js')
    const doc = await compilePolicy('t1')
    expect(doc.custom[0]).toMatchObject({
      kind: 'pattern',
      id: 'r2',
      action: 'warn',
      pattern: '\\bProject\\s+Zeus\\b',
    })
  })
})
```

- [ ] **Step 2: Run — confirm failures**

```
pnpm test -- --reporter=verbose compiler
```
Expected: 3 failures.

- [ ] **Step 3: Rewrite compiler**

Replace `backend/src/policy/compiler.ts`:

```ts
import { listAllActiveRules } from '../rules/service.js'
import type { Rule } from '../db/schema.js'

export interface PolicyDoc {
  version: 1
  tenantId: string
  baseline: unknown[]
  custom: unknown[]
  perSite: Record<string, unknown>
  allowSendAnywayWithReason: boolean
  auditRetentionDays: number
}

function ruleToCustomEntry(rule: Rule): unknown {
  const base = {
    id: rule.id,
    name: `Rule ${rule.id.slice(0, 8)}`,
    description: rule.message ?? '',
    severity: rule.action === 'block' ? 'critical' : 'high',
    action: rule.action,
    enabled: true,
    tags: ['custom'],
    destinations: rule.destinations ?? [],
  }

  if (rule.kind === 'keyword') {
    return { ...base, kind: 'dictionary', terms: rule.keywords ?? [], caseSensitive: false }
  }
  if (rule.kind === 'pattern') {
    return { ...base, kind: 'pattern', pattern: rule.pattern ?? '' }
  }
  if (rule.kind === 'entropy') {
    return { ...base, kind: 'entropy' }
  }
  // score — pass through as-is
  return { ...base, kind: 'score' }
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const activeRules = await listAllActiveRules(tenantId)
  const custom = activeRules.map(ruleToCustomEntry)

  return {
    version: 1,
    tenantId,
    baseline: [],
    custom,
    perSite: {},
    allowSendAnywayWithReason: false,
    auditRetentionDays: 365,
  }
}
```

- [ ] **Step 4: Run — confirm passing**

```
pnpm test -- --reporter=verbose compiler
```
Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add backend/src/policy/compiler.ts backend/tests/compiler.test.ts
git commit -m "feat(compiler): rewrite to read from subjects+rules tables"
```

---

## Task 16: Run Full Test Suite + Final Verification

**Files:** none

- [ ] **Step 1: Run all backend tests**

From `backend/`:
```
pnpm test
```
Expected: all tests pass. Note the count — should be 20+ passing tests across divisions, teams, members, subjects, rules, compiler.

- [ ] **Step 2: Confirm TypeScript clean**

```
pnpm tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 3: Start the server and hit /health**

```
pnpm dev
```
In another terminal:
```
curl http://localhost:3000/health
```
Expected: `{"ok":true}`

- [ ] **Step 4: Smoke test the API endpoints**

With a valid admin token from your `.env`, confirm the new endpoints are reachable:

```bash
TOKEN="ps_adm_<your-slug>_<your-secret>"

# divisions
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/divisions
# Expected: []

# subjects
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/v1/subjects
# Expected: []
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(org-structure): complete org hierarchy redesign — divisions, teams, members, subjects, rules"
```

---

## Notes

- **Role enforcement (super_admin vs division_admin):** All new endpoints currently accept any valid admin token. Role-based access control (enforcing that division admins can only touch their own division) is implemented in Subsystem 3 (Admin Web App).
- **Extension scoping:** The compiled policy currently includes ALL rules for the tenant. Per-user scoping (only apply rules matching the member's division/team) is implemented in Subsystem 2 (Policy Engine).
- **Admin SPA:** The MattersPage in `admin/src/pages/MattersPage.tsx` still references the old `/v1/matters` API. It will be rewritten in Subsystem 3 (Admin Web App).
- **Admin API client:** `admin/src/api.ts` still has `api.matters.*` methods. These will be replaced in Subsystem 3.
- **Join code endpoints deferred:** The spec lists `GET /v1/tenants/join-code` and `POST /v1/tenants/join-code/regenerate`. These are intentionally deferred: the `POST /v1/auth/join` in Task 10 uses the existing org token (Bearer `ps_live_*`) as the join credential — the CISO shares it from the settings page. A dedicated short join code (with its own column and regenerate endpoint) is a UX improvement to implement in Subsystem 3 alongside the admin UI.
