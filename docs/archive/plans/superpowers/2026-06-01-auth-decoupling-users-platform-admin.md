# Auth Decoupling — Clerk Authn Only, Users Table, Platform Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple Clerk from org management — Clerk issues JWTs only; all identity, membership, and authorization live in our own DB — and add a platform-admin role that can view and manage all tenants.

**Architecture:** A new `users` table holds global identity (clerkId, email, name, avatar, isPlatformAdmin). The `members` table adds a nullable `userId` FK to `users` and drops all Clerk-owned identity columns. The JWT flow becomes `sub → users → members → tenant`. Clerk org webhooks are removed and replaced with `user.created`/`user.deleted` handlers. A new `/platform/v1/` route namespace guarded by `requirePlatformAdmin` gives internal staff read+write access across all tenants.

**Tech Stack:** Drizzle ORM + Postgres, Fastify, `@clerk/backend` (verifyToken only), Vitest + supertest, TypeScript ESM.

**Spec:** `docs/superpowers/specs/2026-06-01-auth-decoupling-users-platform-admin-design.md`

---

## File Map

**Create:**
- `backend/src/users/service.ts` — CRUD for the `users` table
- `backend/src/platform/service.ts` — list all tenants with member counts, tenant detail
- `backend/src/platform/router.ts` — `/platform/v1/` routes, all protected by `requirePlatformAdmin`
- `backend/tests/platform.test.ts` — platform admin API tests

**Modify:**
- `backend/src/db/schema.ts` — add `users` table; remove `clerkOrgId` from `tenants`; update `members` (add `userId` FK, drop `clerkId`/`firstName`/`lastName`/`avatarUrl`)
- `backend/src/types.ts` — add `user?: User` and `platformUser?: User` to `FastifyRequest`
- `backend/src/auth/middleware.ts` — rewrite `resolveClerkJwt` (JWT.sub → users → members → tenant), add `requirePlatformAdmin`
- `backend/src/webhooks/clerk.ts` — remove 3 org handlers; add `user.created` + `user.deleted`; retarget `user.updated` to `users` table
- `backend/src/members/service.ts` — update `listMembers` to LEFT JOIN `users`, return `MemberRow`
- `backend/src/app.ts` — register `platformRouter` at `/platform/v1`
- `backend/tests/helpers/db.ts` — add `users` to `truncateAll`, add `buildTestUser`, update `buildTestMember`
- `backend/tests/clerk-auth.test.ts` — rewrite for new auth flow (no `org_id`, uses `users` table)
- `backend/tests/clerk-webhook.test.ts` — rewrite for new webhook handlers
- `backend/src/scripts/seed-e2e.ts` — remove `clerkOrgId`, add `users` row, reference `userId` on members
- `backend/src/scripts/seed-fintech.ts` — remove all `clerk.organizations.*` calls, use `users` table

**Auto-generated:**
- `backend/drizzle/0007_users_platform.sql` — via `npm run db:generate`

---

## Task 1 — Update `schema.ts`

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add `users` table and update `members` + `tenants`**

Open `backend/src/db/schema.ts`. Make the following changes in one edit:

```typescript
import {
  pgTable, pgEnum, uuid, text, boolean, integer,
  timestamp, jsonb, index, unique, primaryKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── Enums ────────────────────────────────────────────────────────────────────
export const memberRoleEnum  = pgEnum('member_role',  ['super_admin', 'division_admin', 'member'])
export const ruleKindEnum    = pgEnum('rule_kind',    ['keyword', 'pattern', 'entropy', 'score'])
export const ruleActionEnum  = pgEnum('rule_action',  ['warn', 'block'])
export const reportLevelEnum = pgEnum('report_level', ['none', 'minimal', 'medium', 'rich'])

// ── Users (global identity, not tenant-scoped) ────────────────────────────────
export const users = pgTable('users', {
  id:              uuid('id').primaryKey().defaultRandom(),
  clerkId:         text('clerk_id').unique(),          // nullable — nulled on Clerk account deletion
  email:           text('email').notNull().unique(),
  firstName:       text('first_name'),
  lastName:        text('last_name'),
  avatarUrl:       text('avatar_url'),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:       timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

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

// ── Policies (versioned snapshots) ───────────────────────────────────────────
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
// userId is nullable for pre-enrolled members (admin added by email before sign-up).
// It is stamped by the user.created webhook once the user creates a Clerk account.
export const members = pgTable('members', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').notNull().references(() => tenants.id),
  userId:          uuid('user_id').references(() => users.id),
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

// ── Subjects ──────────────────────────────────────────────────────────────────
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
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  subjectId:           uuid('subject_id').notNull().references(() => subjects.id),
  kind:                ruleKindEnum('kind').notNull(),
  keywords:            text('keywords').array(),
  pattern:             text('pattern'),
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

// ── Site Configs ──────────────────────────────────────────────────────────────
export const siteConfigs = pgTable('site_configs', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  domain:              text('domain').notNull(),
  inputSelector:       text('input_selector').notNull(),
  sendButtonSelector:  text('send_button_selector').notNull(),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantDomainUniq: unique().on(t.tenantId, t.domain),
}))

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

// ── Scans ─────────────────────────────────────────────────────────────────────
export const scans = pgTable('scans', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  memberId:   uuid('member_id').references(() => members.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx: index().on(t.tenantId, t.occurredAt),
}))

// ── Chat Sessions ─────────────────────────────────────────────────────────────
export const chatMessageRoleEnum = pgEnum('chat_message_role', ['user', 'assistant'])

export const chatSessions = pgTable('chat_sessions', {
  id:        uuid('id').primaryKey().defaultRandom(),
  tenantId:  uuid('tenant_id').notNull().references(() => tenants.id),
  memberId:  uuid('member_id').references(() => members.id),
  title:     text('title').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantIdx: index().on(t.tenantId),
}))

// ── Chat Messages ─────────────────────────────────────────────────────────────
export const chatMessages = pgTable('chat_messages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   uuid('session_id').notNull().references(() => chatSessions.id),
  role:        chatMessageRoleEnum('role').notNull(),
  content:     text('content').notNull(),
  actionsJson: jsonb('actions_json'),
  appliedAt:   timestamp('applied_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  sessionIdx: index().on(t.sessionId),
}))

// ── Types ─────────────────────────────────────────────────────────────────────
export type User       = typeof users.$inferSelect
export type NewUser    = typeof users.$inferInsert

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

export type SiteConfig    = typeof siteConfigs.$inferSelect
export type NewSiteConfig = typeof siteConfigs.$inferInsert

export type Event    = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert

export type Scan    = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert

export type ChatSession    = typeof chatSessions.$inferSelect
export type NewChatSession = typeof chatSessions.$inferInsert
export type ChatMessage    = typeof chatMessages.$inferSelect
export type NewChatMessage = typeof chatMessages.$inferInsert
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors (or only errors in files that still reference removed fields — those will be fixed in later tasks).

---

## Task 2 — Generate and Apply Migration

**Files:**
- Generate: `backend/drizzle/0007_users_platform.sql`

- [ ] **Step 1: Generate the migration**

```bash
cd backend && npm run db:generate
```

Expected: a new file `drizzle/0007_*.sql` is created. Open it and verify it contains:
- `CREATE TABLE "users"` with all columns including `is_platform_admin`
- `ALTER TABLE "tenants" DROP COLUMN "clerk_org_id"` (and its unique constraint)
- `ALTER TABLE "members" ADD COLUMN "user_id"` with FK to users
- `ALTER TABLE "members" DROP COLUMN "clerk_id"`, `"first_name"`, `"last_name"`, `"avatar_url"`
- `DROP INDEX` on `members_clerk_id_unique`

If the generated SQL looks wrong, check that you saved schema.ts correctly.

- [ ] **Step 2: Apply the migration**

```bash
cd backend && npm run db:migrate
```

Expected: `Migrations complete` with no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/
git commit -m "feat(schema): add users table, decouple identity from members, remove clerkOrgId"
```

---

## Task 3 — Update Test Helpers

**Files:**
- Modify: `backend/tests/helpers/db.ts`

- [ ] **Step 1: Rewrite `helpers/db.ts`**

```typescript
import { db } from '../../src/db/client.js'
import {
  tenants, policies, divisions, teams, users, members, memberTeams,
  subjects, rules, destinationGroups, siteConfigs, events, scans,
  chatMessages, chatSessions,
} from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'
import type { User } from '../../src/db/schema.js'

export async function truncateAll(): Promise<void> {
  await db.delete(events)
  await db.delete(scans)
  await db.delete(chatMessages)
  await db.delete(chatSessions)
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
  await db.delete(users)
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
  const adminToken  = formatToken('ps_adm',  slug, adminSecret)

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

export async function buildTestUser(clerkId = 'clerk_test_user', email?: string): Promise<User> {
  const [row] = await db.insert(users).values({
    clerkId,
    email: email ?? `${clerkId}@test.com`,
  }).returning()
  return row!
}

export async function buildTestMember(tenantId: string, user: User): Promise<string> {
  const [row] = await db.insert(members).values({
    tenantId,
    userId: user.id,
    email:  user.email,
    role:   'member',
  }).returning({ id: members.id })
  return row!.id
}
```

Note: `truncateAll` now deletes `users` **last** (after members, since members.userId references users).

- [ ] **Step 2: Check for other test files that call `buildTestMember` with the old signature**

```bash
grep -rn "buildTestMember" backend/tests/
```

Update any call site that passes a `clerkId` string to instead call `buildTestUser` first, then `buildTestMember(tenantId, user)`.

- [ ] **Step 3: Run tests to see current failures (baseline)**

```bash
cd backend && npm test 2>&1 | head -60
```

Expected: failures in `clerk-auth.test.ts`, `clerk-webhook.test.ts`, and any test that referenced `clerkId`/`clerkOrgId` on DB rows. This is expected — we'll fix each in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/helpers/db.ts
git commit -m "test(helpers): add buildTestUser, remove clerkId from buildTestMember, truncate users table"
```

---

## Task 4 — Create `users` Service

**Files:**
- Create: `backend/src/users/service.ts`

- [ ] **Step 1: Write the service**

```typescript
import { eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { users, members, type User, type NewUser } from '../db/schema.js'

export async function getUserByClerkId(clerkId: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.clerkId, clerkId))
  return row ?? null
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email))
  return row ?? null
}

export async function createUser(data: Pick<NewUser, 'clerkId' | 'email' | 'firstName' | 'lastName' | 'avatarUrl'>): Promise<User> {
  const [row] = await db.insert(users).values(data).onConflictDoNothing().returning()
  return row!
}

export async function updateUserProfile(
  clerkId: string,
  data: Partial<Pick<NewUser, 'firstName' | 'lastName' | 'avatarUrl'>>,
): Promise<void> {
  await db.update(users)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(users.clerkId, clerkId))
}

export async function nullifyClerkId(clerkId: string): Promise<void> {
  await db.update(users).set({ clerkId: null }).where(eq(users.clerkId, clerkId))
}

export async function setPlatformAdmin(userId: string, value: boolean): Promise<void> {
  await db.update(users).set({ isPlatformAdmin: value }).where(eq(users.id, userId))
}

// Returns all member rows for this email that have no userId yet (pre-enrolled).
export async function claimPendingMembers(email: string, userId: string): Promise<void> {
  await db.update(members)
    .set({ userId })
    .where(eq(members.email, email))
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep "users/service"
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add backend/src/users/service.ts
git commit -m "feat(users): add users service with clerk-id lookup, profile sync, pending-member claim"
```

---

## Task 5 — Rewrite Webhook Handler + Tests

**Files:**
- Modify: `backend/src/webhooks/clerk.ts`
- Modify: `backend/tests/clerk-webhook.test.ts`

- [ ] **Step 1: Write the failing tests first**

Replace the entire contents of `backend/tests/clerk-webhook.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants, members, users } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockImplementation((body: string) => JSON.parse(body)),
  })),
}))

let app: FastifyInstance

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => { await truncateAll() })
afterAll(async () => { await app.close() })

function makeWebhookRequest(payload: object) {
  return supertest(app.server)
    .post('/webhooks/clerk')
    .set('svix-id', 'msg_test')
    .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
    .set('svix-signature', 'v1,test_signature')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload))
}

describe('POST /webhooks/clerk — user.created', () => {
  it('auto-provisions tenant + super_admin member when no pre-enrolled member exists', async () => {
    const res = await makeWebhookRequest({
      type: 'user.created',
      data: {
        id: 'user_new123',
        first_name: 'Alice',
        last_name: 'Chen',
        image_url: 'https://img.example.com/alice.jpg',
        email_addresses: [{ email_address: 'alice@newco.com' }],
      },
    })
    expect(res.status).toBe(200)

    const userRows = await db.select().from(users).where(eq(users.clerkId, 'user_new123'))
    expect(userRows).toHaveLength(1)
    expect(userRows[0]!.email).toBe('alice@newco.com')
    expect(userRows[0]!.firstName).toBe('Alice')

    const memberRows = await db.select().from(members).where(eq(members.email, 'alice@newco.com'))
    expect(memberRows).toHaveLength(1)
    expect(memberRows[0]!.role).toBe('super_admin')
    expect(memberRows[0]!.userId).toBe(userRows[0]!.id)

    const tenantRows = await db.select().from(tenants)
    expect(tenantRows).toHaveLength(1)
  })

  it('connects a pre-enrolled member instead of auto-provisioning a new tenant', async () => {
    const { tenantId } = await buildTestTenant()
    await db.insert(members).values({ tenantId, email: 'bob@acme.com', role: 'member' })

    const res = await makeWebhookRequest({
      type: 'user.created',
      data: {
        id: 'user_bob99',
        first_name: 'Bob',
        last_name: 'Smith',
        image_url: '',
        email_addresses: [{ email_address: 'bob@acme.com' }],
      },
    })
    expect(res.status).toBe(200)

    const userRows = await db.select().from(users).where(eq(users.clerkId, 'user_bob99'))
    expect(userRows).toHaveLength(1)

    const memberRows = await db.select().from(members).where(eq(members.email, 'bob@acme.com'))
    expect(memberRows[0]!.userId).toBe(userRows[0]!.id)

    // Must NOT have created an extra tenant
    const tenantRows = await db.select().from(tenants)
    expect(tenantRows).toHaveLength(1)
  })
})

describe('POST /webhooks/clerk — user.updated', () => {
  it('syncs name and avatar to the users table', async () => {
    await buildTestUser('user_bob1', 'bob@acme.com')

    const res = await makeWebhookRequest({
      type: 'user.updated',
      data: {
        id: 'user_bob1',
        first_name: 'Robert',
        last_name: 'Jones',
        image_url: 'https://example.com/bob-new.jpg',
        email_addresses: [{ email_address: 'bob@acme.com' }],
      },
    })
    expect(res.status).toBe(200)

    const rows = await db.select().from(users).where(eq(users.clerkId, 'user_bob1'))
    expect(rows[0]!.firstName).toBe('Robert')
    expect(rows[0]!.lastName).toBe('Jones')
    expect(rows[0]!.avatarUrl).toBe('https://example.com/bob-new.jpg')
  })
})

describe('POST /webhooks/clerk — user.deleted', () => {
  it('nulls clerkId on the users row', async () => {
    await buildTestUser('user_del1', 'del@acme.com')

    const res = await makeWebhookRequest({
      type: 'user.deleted',
      data: { id: 'user_del1', deleted: true },
    })
    expect(res.status).toBe(200)

    const rows = await db.select().from(users).where(eq(users.email, 'del@acme.com'))
    expect(rows[0]!.clerkId).toBeNull()
  })
})

describe('POST /webhooks/clerk — invalid signature', () => {
  it('returns 400 when Svix signature check fails', async () => {
    const { Webhook } = await import('svix')
    ;(Webhook as ReturnType<typeof vi.fn>).mockImplementationOnce(() => ({
      verify: () => { throw new Error('Invalid signature') },
    }))
    const res = await makeWebhookRequest({ type: 'user.created', data: {} })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd backend && npm test clerk-webhook 2>&1 | tail -20
```

Expected: all tests fail (handlers not implemented yet).

- [ ] **Step 3: Rewrite the webhook handler**

Replace the entire contents of `backend/src/webhooks/clerk.ts`:

```typescript
import { and, eq, isNull } from 'drizzle-orm'
import { Webhook } from 'svix'
import { db } from '../db/client.js'
import { tenants, members, users } from '../db/schema.js'
import { generateSecret, hashToken } from '../auth/tokens.js'
import { getUserByClerkId, createUser, updateUserProfile, nullifyClerkId, claimPendingMembers } from '../users/service.js'
import type { FastifyInstance } from 'fastify'

type ClerkWebhookEvent =
  | { type: 'user.created'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'user.updated'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'user.deleted'; data: { id: string; deleted?: boolean } }

export async function clerkWebhookRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/webhooks/clerk', async (req, reply) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET
    if (!secret) return reply.status(500).send({ error: 'Webhook secret not configured' })

    let event: ClerkWebhookEvent
    try {
      const wh = new Webhook(secret)
      event = wh.verify(req.body as string, {
        'svix-id':        (req.headers['svix-id'] as string) ?? '',
        'svix-timestamp': (req.headers['svix-timestamp'] as string) ?? '',
        'svix-signature': (req.headers['svix-signature'] as string) ?? '',
      }) as ClerkWebhookEvent
    } catch {
      return reply.status(400).send({ error: 'Invalid webhook signature' })
    }

    switch (event.type) {
      case 'user.created': {
        const { id, first_name, last_name, image_url, email_addresses } = event.data
        const email = email_addresses[0]?.email_address ?? ''
        if (!email) break

        const user = await createUser({ clerkId: id, email, firstName: first_name ?? undefined, lastName: last_name ?? undefined, avatarUrl: image_url })
        if (!user) break

        // Check for pre-enrolled members matching this email
        const pending = await db.select({ id: members.id })
          .from(members)
          .where(and(eq(members.email, email), isNull(members.userId)))

        if (pending.length > 0) {
          await claimPendingMembers(email, user.id)
        } else {
          // No pre-enrollment — auto-provision a new tenant for this user
          const localPart = email.split('@')[0] ?? email
          const base = localPart.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
          const suffix = Math.random().toString(36).slice(2, 7)
          const slug = `${base}-${suffix}`

          const orgSecret   = generateSecret()
          const adminSecret = generateSecret()

          const [tenant] = await db.insert(tenants).values({
            name:               `${first_name ?? localPart}'s Organization`,
            slug,
            orgTokenHash:       await hashToken(orgSecret),
            adminTokenHash:     await hashToken(adminSecret),
            paymentProvider:    'stripe',
            externalSubId:      `sub_auto_${slug}`,
            subscriptionStatus: 'active',
            plan:               'pro',
          }).returning({ id: tenants.id })

          await db.insert(members).values({
            tenantId: tenant!.id,
            userId:   user.id,
            email,
            role:     'super_admin',
          })
        }
        break
      }

      case 'user.updated': {
        const { id, first_name, last_name, image_url } = event.data
        await updateUserProfile(id, {
          firstName: first_name ?? undefined,
          lastName:  last_name ?? undefined,
          avatarUrl: image_url,
        })
        break
      }

      case 'user.deleted': {
        await nullifyClerkId(event.data.id)
        break
      }
    }

    return reply.status(200).send({ received: true })
  })
}
```

- [ ] **Step 4: Run webhook tests — expect green**

```bash
cd backend && npm test clerk-webhook
```

Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/webhooks/clerk.ts backend/tests/clerk-webhook.test.ts
git commit -m "feat(webhooks): replace org handlers with user.created/updated/deleted — remove Clerk org dependency"
```

---

## Task 6 — Update `types.ts` and `middleware.ts`

**Files:**
- Modify: `backend/src/types.ts`
- Modify: `backend/src/auth/middleware.ts`

- [ ] **Step 1: Update `types.ts`**

Replace the entire file at `backend/src/types.ts`:

```typescript
import type { Tenant, Member, User } from './db/schema.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant:        Tenant
    member?:       Member
    user?:         User
    platformUser?: User
    tokenPrefix:   'ps_live' | 'ps_adm' | 'clerk'
  }
}
```

- [ ] **Step 2: Rewrite `middleware.ts`**

Replace the entire file at `backend/src/auth/middleware.ts`:

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { verifyToken as clerkVerifyToken } from '@clerk/backend'
import { parseToken, compareToken } from './tokens.js'
import { getTenantBySlug } from '../tenants/service.js'
import { db } from '../db/client.js'
import { tenants, members, users } from '../db/schema.js'

async function resolveOrgToken(
  request: FastifyRequest,
  reply: FastifyReply,
  requireAdmin: boolean
): Promise<void> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const parsed = parseToken(auth.slice(7))
  if (!parsed) {
    return reply.status(401).send({ error: 'Invalid token format' })
  }
  const tenant = await getTenantBySlug(parsed.slug)
  if (!tenant) {
    return reply.status(401).send({ error: 'Unknown tenant' })
  }
  const hash = parsed.prefix === 'ps_adm' ? tenant.adminTokenHash : tenant.orgTokenHash
  if (!(await compareToken(parsed.secret, hash))) {
    return reply.status(401).send({ error: 'Invalid token' })
  }
  if (requireAdmin && parsed.prefix !== 'ps_adm') {
    return reply.status(403).send({ error: 'Admin token required' })
  }
  request.tenant      = tenant
  request.tokenPrefix = parsed.prefix as 'ps_live' | 'ps_adm'
}

async function resolveClerkJwt(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    return reply.status(500).send({ error: 'Clerk not configured' })
  }

  let clerkUserId: string
  try {
    const payload = await clerkVerifyToken(token, { secretKey })
    clerkUserId = payload.sub
  } catch {
    return reply.status(401).send({ error: 'Invalid Clerk token' })
  }

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkUserId))
  if (!user) {
    return reply.status(401).send({ error: 'User not found — sign up first' })
  }

  const memberRows = await db.select().from(members).where(eq(members.userId, user.id))
  if (memberRows.length === 0) {
    return reply.status(401).send({ error: 'Not enrolled in any organisation — contact your admin' })
  }

  let member = memberRows[0]!
  if (memberRows.length > 1) {
    const slugHint = request.headers['x-tenant-slug'] as string | undefined
    if (!slugHint) {
      return reply.status(400).send({ error: 'Multiple organisations found — specify X-Tenant-Slug header' })
    }
    const [t] = await db.select().from(tenants).where(eq(tenants.slug, slugHint))
    if (!t) return reply.status(401).send({ error: 'Unknown tenant' })
    const found = memberRows.find(m => m.tenantId === t.id)
    if (!found) return reply.status(401).send({ error: 'Not a member of that organisation' })
    member = found
    request.tenant = t
  } else {
    const [t] = await db.select().from(tenants).where(eq(tenants.id, member.tenantId))
    if (!t) return reply.status(401).send({ error: 'Tenant not found' })
    request.tenant = t
  }

  request.user        = user
  request.member      = member
  request.tokenPrefix = 'clerk'
}

export async function requireOrgToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveOrgToken(req, reply, false)
}

export async function requireAdminToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveOrgToken(req, reply, true)
}

export async function requireClerkAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.headers.authorization?.slice(7) ?? ''
  return resolveClerkJwt(req, reply, token)
}

export async function requireOrgTokenOrClerkAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const token = auth.slice(7)
  if (token.startsWith('ps_')) {
    return resolveOrgToken(req, reply, false)
  }
  return resolveClerkJwt(req, reply, token)
}

export async function requireAdminTokenOrClerkAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const token = auth.slice(7)
  if (token.startsWith('ps_')) {
    return resolveOrgToken(req, reply, true)
  }
  await resolveClerkJwt(req, reply, token)
  if (reply.sent) return
  if (req.member?.role !== 'super_admin') {
    return reply.status(403).send({ error: 'Admin access required' })
  }
}

export async function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }

  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) return reply.status(500).send({ error: 'Clerk not configured' })

  let clerkUserId: string
  try {
    const payload = await clerkVerifyToken(auth.slice(7), { secretKey })
    clerkUserId = payload.sub
  } catch {
    return reply.status(401).send({ error: 'Invalid Clerk token' })
  }

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkUserId))
  if (!user) return reply.status(401).send({ error: 'User not found' })
  if (!user.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin access required' })

  req.platformUser = user

  // If a tenantId path param is present, resolve and attach it
  const tenantId = (req.params as Record<string, string | undefined>)['tenantId']
  if (tenantId) {
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    req.tenant = tenant
  }
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
cd backend && npx tsc --noEmit 2>&1 | grep "middleware\|types"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/types.ts backend/src/auth/middleware.ts
git commit -m "feat(auth): rewrite JWT flow (sub→users→members→tenant), add requirePlatformAdmin, drop org_id dependency"
```

---

## Task 7 — Rewrite `clerk-auth.test.ts`

**Files:**
- Modify: `backend/tests/clerk-auth.test.ts`

- [ ] **Step 1: Rewrite the test file**

Replace the entire contents of `backend/tests/clerk-auth.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { members, users } from '../src/db/schema.js'
import { publishPolicy } from '../src/policy/service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_test_alice'
const MOCK_CLERK_JWT     = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: MOCK_CLERK_USER_ID }),
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

let app: FastifyInstance
let tenantId: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
  const t = await buildTestTenant()
  tenantId  = t.tenantId
  orgToken  = t.orgToken

  const user = await buildTestUser(MOCK_CLERK_USER_ID, 'alice@acme.com')
  await db.insert(members).values({ tenantId, userId: user.id, email: 'alice@acme.com', role: 'member' })
  await publishPolicy(tenantId, { version: 1 as const, tenantId, subjects: [], siteConfigs: {} })
})
afterAll(async () => { await app.close() })

describe('GET /v1/policy — Clerk JWT auth', () => {
  it('accepts a Clerk JWT and returns 200', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
  })

  it('still accepts an org token', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
  })

  it('returns 401 when no users row exists for the Clerk user', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_nobody' })
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/User not found/)
  })

  it('returns 401 when user exists but has no member row', async () => {
    await db.delete(members).where(eq(members.tenantId, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Not enrolled/)
  })

  it('returns 401 for an invalid JWT', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Invalid JWT'))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer bad.jwt.token`)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the auth tests — expect green**

```bash
cd backend && npm test clerk-auth
```

Expected: all 5 tests pass.

- [ ] **Step 3: Run the full test suite**

```bash
cd backend && npm test
```

Expected: clerk-auth and clerk-webhook pass. Any remaining failures are in tests that reference removed `clerkId`/`clerkOrgId` fields on members/tenants — investigate and fix them now before continuing. Common fixes:
- In any test that does `await db.insert(members).values({ ..., clerkId: '...' })`: create a user first with `buildTestUser`, then insert the member with `userId: user.id`
- In any test that does `await db.update(tenants).set({ clerkOrgId: '...' })`: delete that line entirely

- [ ] **Step 4: Commit**

```bash
git add backend/tests/clerk-auth.test.ts
git commit -m "test(auth): rewrite for users-table flow — no org_id in JWT, users → members → tenant"
```

---

## Task 8 — Update `members` Service

**Files:**
- Modify: `backend/src/members/service.ts`

- [ ] **Step 1: Update `listMembers` to join users**

Replace the entire contents of `backend/src/members/service.ts`:

```typescript
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { members, users, memberTeams, type Member, type NewMember, type User } from '../db/schema.js'

export interface MemberRow extends Member {
  user: Pick<User, 'email' | 'firstName' | 'lastName' | 'avatarUrl'> | null
}

export async function listMembers(tenantId: string): Promise<MemberRow[]> {
  const rows = await db
    .select()
    .from(members)
    .leftJoin(users, eq(members.userId, users.id))
    .where(eq(members.tenantId, tenantId))
  return rows.map(r => ({
    ...r.members,
    user: r.users
      ? { email: r.users.email, firstName: r.users.firstName, lastName: r.users.lastName, avatarUrl: r.users.avatarUrl }
      : null,
  }))
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
    email:       r.email,
    displayName: r.displayName ?? null,
    role:        'member' as const,
  }))
  return db.insert(members).values(toInsert).onConflictDoNothing().returning()
}
```

- [ ] **Step 2: Run tests**

```bash
cd backend && npm test members
```

Expected: all members tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/src/members/service.ts
git commit -m "feat(members): listMembers joins users table, expose user profile via MemberRow"
```

---

## Task 9 — Platform Service, Router, and Registration

**Files:**
- Create: `backend/src/platform/service.ts`
- Create: `backend/src/platform/router.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/platform.test.ts`

- [ ] **Step 1: Write the failing platform tests first**

Create `backend/tests/platform.test.ts`:

```typescript
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { users } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const MOCK_PLATFORM_USER_ID = 'user_platform_admin'
const MOCK_CLERK_JWT = 'eyJhbGciOiJSUzI1NiJ9.platform.signature'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: MOCK_PLATFORM_USER_ID }),
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

let app: FastifyInstance

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_PLATFORM_USER_ID })
})
afterAll(async () => { await app.close() })

async function buildPlatformAdmin() {
  const user = await buildTestUser(MOCK_PLATFORM_USER_ID, 'admin@ciyo.ai')
  await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id))
  return user
}

describe('GET /platform/v1/tenants', () => {
  it('returns 403 for a non-platform-admin user', async () => {
    await buildTestUser(MOCK_PLATFORM_USER_ID, 'regular@ciyo.ai')
    const res = await supertest(app.server)
      .get('/platform/v1/tenants')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(403)
  })

  it('returns all tenants with member counts for platform admin', async () => {
    await buildPlatformAdmin()
    const { tenantId } = await buildTestTenant('acme')
    const user2 = await buildTestUser('user_member1', 'member1@acme.com')
    await buildTestMember(tenantId, user2)

    const res = await supertest(app.server)
      .get('/platform/v1/tenants')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].slug).toBe('acme')
    expect(res.body[0].memberCount).toBe(1)
  })
})

describe('GET /platform/v1/tenants/:tenantId/members', () => {
  it('returns members list for the given tenant', async () => {
    await buildPlatformAdmin()
    const { tenantId } = await buildTestTenant('beta')
    const user2 = await buildTestUser('user_beta1', 'beta@beta.com')
    await buildTestMember(tenantId, user2)

    const res = await supertest(app.server)
      .get(`/platform/v1/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].email).toBe('beta@beta.com')
  })

  it('returns 404 for an unknown tenantId', async () => {
    await buildPlatformAdmin()
    const res = await supertest(app.server)
      .get('/platform/v1/tenants/00000000-0000-0000-0000-000000000000/members')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /platform/v1/tenants/:tenantId/members/:memberId', () => {
  it('removes the member from the tenant', async () => {
    await buildPlatformAdmin()
    const { tenantId } = await buildTestTenant('gamma')
    const user2 = await buildTestUser('user_gamma1', 'gamma@gamma.com')
    const memberId = await buildTestMember(tenantId, user2)

    const res = await supertest(app.server)
      .delete(`/platform/v1/tenants/${tenantId}/members/${memberId}`)
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(204)

    const check = await supertest(app.server)
      .get(`/platform/v1/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(check.body).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
cd backend && npm test platform 2>&1 | tail -10
```

Expected: failures (routes not registered yet).

- [ ] **Step 3: Create `platform/service.ts`**

```typescript
import { eq, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, members } from '../db/schema.js'
import type { Tenant } from '../db/schema.js'

export interface TenantSummary {
  id:          string
  name:        string
  slug:        string
  plan:        string
  memberCount: number
  createdAt:   Date
}

export async function listAllTenants(): Promise<TenantSummary[]> {
  const rows = await db
    .select({
      id:          tenants.id,
      name:        tenants.name,
      slug:        tenants.slug,
      plan:        tenants.plan,
      createdAt:   tenants.createdAt,
      memberCount: sql<number>`count(${members.id})::int`,
    })
    .from(tenants)
    .leftJoin(members, eq(members.tenantId, tenants.id))
    .groupBy(tenants.id)
  return rows
}
```

- [ ] **Step 4: Create `platform/router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { requirePlatformAdmin } from '../auth/middleware.js'
import { listAllTenants } from './service.js'
import { listMembers, createMember, updateMember, deleteMember } from '../members/service.js'
import { listDivisions } from '../divisions/service.js'
import { listSubjects } from '../subjects/service.js'
import type { NewMember } from '../db/schema.js'

export async function platformRouter(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requirePlatformAdmin)

  fastify.get('/tenants', async (_req, reply) => {
    return reply.send(await listAllTenants())
  })

  fastify.get('/tenants/:tenantId', async (req, reply) => {
    return reply.send(req.tenant)
  })

  fastify.get('/tenants/:tenantId/members', async (req, reply) => {
    return reply.send(await listMembers(req.tenant.id))
  })

  fastify.post('/tenants/:tenantId/members', async (req, reply) => {
    const { email, displayName, role } = req.body as Pick<NewMember, 'email' | 'displayName' | 'role'>
    const member = await createMember(req.tenant.id, { email, displayName, role: role ?? 'member' })
    return reply.status(201).send(member)
  })

  fastify.patch('/tenants/:tenantId/members/:memberId', async (req, reply) => {
    const { memberId } = req.params as { tenantId: string; memberId: string }
    const data = req.body as Partial<Pick<NewMember, 'displayName' | 'role' | 'adminDivisionId'>>
    const updated = await updateMember(req.tenant.id, memberId, data)
    if (!updated) return reply.status(404).send({ error: 'Member not found' })
    return reply.send(updated)
  })

  fastify.delete('/tenants/:tenantId/members/:memberId', async (req, reply) => {
    const { memberId } = req.params as { tenantId: string; memberId: string }
    await deleteMember(req.tenant.id, memberId)
    return reply.status(204).send()
  })

  fastify.get('/tenants/:tenantId/divisions', async (req, reply) => {
    return reply.send(await listDivisions(req.tenant.id))
  })

  fastify.get('/tenants/:tenantId/subjects', async (req, reply) => {
    return reply.send(await listSubjects(req.tenant.id))
  })
}
```

- [ ] **Step 5: Register `platformRouter` in `app.ts`**

In `backend/src/app.ts`, add the import and registration:

```typescript
// add this import after the assistantRouter import:
import { platformRouter } from './platform/router.js'

// add this registration after the assistantRouter line:
void app.register(platformRouter, { prefix: '/platform/v1' })
```

- [ ] **Step 6: Run platform tests — expect green**

```bash
cd backend && npm test platform
```

Expected: all 5 tests pass.

- [ ] **Step 7: Run full test suite**

```bash
cd backend && npm test
```

Expected: all tests pass. Fix any remaining failures before committing.

- [ ] **Step 8: Commit**

```bash
git add backend/src/platform/ backend/src/app.ts backend/tests/platform.test.ts
git commit -m "feat(platform): add platform-admin API — list all tenants, manage members across orgs"
```

---

## Task 10 — Update Seed Scripts

**Files:**
- Modify: `backend/src/scripts/seed-e2e.ts`
- Modify: `backend/src/scripts/seed-fintech.ts`

- [ ] **Step 1: Update `seed-e2e.ts`**

Replace `backend/src/scripts/seed-e2e.ts` with the following. Key changes: remove `clerkOrgId` from tenant insert, add a `users` row for the E2E test user, reference `userId` on the member row.

```typescript
import path from 'path'
import { writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  tenants, divisions, teams, users, members, memberTeams,
  subjects, rules, policies,
  destinationGroups, siteConfigs, events, scans,
  chatSessions, chatMessages,
} from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { compilePolicy } from '../policy/compiler.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_STATE_PATH = path.resolve(__dirname, '../../../e2e/.seed-state.json')

async function main() {
  console.log('[seed-e2e] Truncating test DB...')
  await db.delete(chatMessages)
  await db.delete(chatSessions)
  await db.delete(events)
  await db.delete(scans)
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
  await db.delete(users)

  console.log('[seed-e2e] Seeding test tenant...')

  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', 'e2etenant', orgSecret)
  const adminToken  = formatToken('ps_adm',  'e2etenant', adminSecret)

  const [tenant] = await db.insert(tenants).values({
    name:               'E2E Test Org',
    slug:               'e2etenant',
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      'sub_e2e_test',
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  const tenantId = tenant!.id

  const [division] = await db.insert(divisions).values({
    tenantId,
    name: 'E2E Division',
    slug: 'e2e-division',
  }).returning({ id: divisions.id })

  const [team] = await db.insert(teams).values({
    tenantId,
    divisionId: division!.id,
    name: 'E2E Team',
    slug: 'e2e-team',
  }).returning({ id: teams.id })

  // Create the Clerk user row so JWT-based auth works during E2E tests
  const [e2eUser] = await db.insert(users).values({
    clerkId: process.env.E2E_CLERK_USER_ID!,
    email:   process.env.E2E_CLERK_USER_EMAIL!,
  }).returning({ id: users.id })

  const [member] = await db.insert(members).values({
    tenantId,
    userId: e2eUser!.id,
    email:  process.env.E2E_CLERK_USER_EMAIL!,
    role:   'super_admin',
  }).returning({ id: members.id })

  await db.insert(memberTeams).values({ memberId: member!.id, teamId: team!.id })

  const [subject] = await db.insert(subjects).values({
    tenantId,
    name:   'ACME Confidential',
    active: true,
  }).returning({ id: subjects.id })

  await db.insert(rules).values([
    {
      tenantId,
      subjectId:   subject!.id,
      kind:        'keyword',
      keywords:    ['ACME_SECRET'],
      action:      'block',
      active:      true,
      reportLevel: 'medium',
    },
    {
      tenantId,
      subjectId:   subject!.id,
      kind:        'keyword',
      keywords:    ['ACME_WARN'],
      action:      'warn',
      active:      true,
      reportLevel: 'medium',
    },
  ])

  const policyJson = await compilePolicy(tenantId)
  await db.insert(policies).values({
    tenantId,
    version:     1,
    policyJson,
    publishedAt: new Date(),
  })

  const ruleRows = await db
    .select({ id: rules.id, action: rules.action })
    .from(rules)
    .where(eq(rules.tenantId, tenantId))

  const blockRuleId = ruleRows.find(r => r.action === 'block')!.id
  const warnRuleId  = ruleRows.find(r => r.action === 'warn')!.id
  const now = new Date()

  await db.insert(events).values([
    ...Array.from({ length: 8 }, (_, i) => ({
      tenantId,
      ruleId:      blockRuleId,
      memberId:    member!.id,
      action:      'block' as const,
      siteUrl:     'https://chatgpt.com/',
      matchedTerm: 'ACME_SECRET',
      occurredAt:  new Date(now.getTime() - i * 60_000),
    })),
    ...Array.from({ length: 7 }, (_, i) => ({
      tenantId,
      ruleId:      warnRuleId,
      memberId:    member!.id,
      action:      'warn' as const,
      siteUrl:     'https://claude.ai/',
      matchedTerm: 'ACME_WARN',
      occurredAt:  new Date(now.getTime() - (8 + i) * 60_000),
    })),
  ])

  const [chatSession1] = await db.insert(chatSessions).values({
    tenantId,
    memberId: member!.id,
    title:    'E2E Assistant API Test Session',
  }).returning({ id: chatSessions.id })

  const [chatMessage1] = await db.insert(chatMessages).values({
    sessionId:   chatSession1!.id,
    role:        'assistant',
    content:     'I can add a keyword rule to block E2E_API_RULE.',
    actionsJson: [
      {
        op:          'create_rule',
        subjectId:   subject!.id,
        kind:        'keyword',
        keywords:    ['E2E_API_RULE'],
        action:      'block',
        reportLevel: 'medium',
      },
    ],
  }).returning({ id: chatMessages.id })

  const [chatSession2] = await db.insert(chatSessions).values({
    tenantId,
    memberId: member!.id,
    title:    'E2E Assistant Full-Flow Test Session',
  }).returning({ id: chatSessions.id })

  const [chatMessage2] = await db.insert(chatMessages).values({
    sessionId:   chatSession2!.id,
    role:        'assistant',
    content:     'I can add a keyword rule to block E2E_AI_FLOW.',
    actionsJson: [
      {
        op:          'create_rule',
        subjectId:   subject!.id,
        kind:        'keyword',
        keywords:    ['E2E_AI_FLOW'],
        action:      'block',
        reportLevel: 'medium',
      },
    ],
  }).returning({ id: chatMessages.id })

  const seedState = {
    tenantId,
    orgToken,
    adminToken,
    assistantSessionId:     chatSession1!.id,
    assistantMessageId:     chatMessage1!.id,
    assistantFlowMessageId: chatMessage2!.id,
  }
  writeFileSync(SEED_STATE_PATH, JSON.stringify(seedState, null, 2))
  console.log('[seed-e2e] Done. Seed state written to', SEED_STATE_PATH)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Rewrite `seed-fintech.ts`**

Replace `backend/src/scripts/seed-fintech.ts`. Key changes: remove all `clerk.organizations.*` calls, remove Clerk org lookup in tenant-creation path, use `users` table for dummy members, keep `clerk.users.*` for sign-in capability.

```typescript
/**
 * Fintech demo seed for "Yarin's Organization" (FinCorp).
 * Run: npm run seed:fintech
 *
 * Safe to re-run — clears existing divisions/teams/members/subjects/rules
 * for the tenant and rebuilds from scratch, preserving your admin clerkId
 * so Clerk auth keeps working after seeding.
 *
 * Creates Clerk user accounts for each dummy member (no org membership needed).
 * Sign in via the extension using email + password: Fincorp2026!
 */

import { createClerkClient } from '@clerk/backend'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import {
  tenants, divisions, teams, users, members, memberTeams,
  subjects, rules, siteConfigs, events, scans,
} from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { compilePolicy } from '../policy/compiler.js'
import { publishPolicy } from '../policy/service.js'

const ADMIN_EMAIL    = 'yarin0600@gmail.com'
const DUMMY_PASSWORD = 'Fincorp2026!'

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

type RuleSeed = {
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords?: string[]
  pattern?: string
  action: 'warn' | 'block'
  message: string
  reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
}

async function addSubject(
  tenantId: string,
  name: string,
  description: string,
  divisionId: string | null,
  teamId: string | null,
  ruleDefs: RuleSeed[],
) {
  const [s] = await db
    .insert(subjects)
    .values({ tenantId, name, description, divisionId, teamId })
    .returning({ id: subjects.id })
  for (const r of ruleDefs) {
    await db.insert(rules).values({
      tenantId,
      subjectId: s!.id,
      kind:      r.kind,
      keywords:  r.keywords ?? null,
      pattern:   r.pattern  ?? null,
      action:    r.action,
      message:   r.message,
      reportLevel: r.reportLevel,
    })
  }
  return s!.id
}

async function main() {
  // 1. Initialise Clerk client (used only for user creation — no org API calls)
  const clerkSecretKey = process.env['CLERK_SECRET_KEY']
  if (!clerkSecretKey) throw new Error('CLERK_SECRET_KEY is not set in .env')
  const clerk = createClerkClient({ secretKey: clerkSecretKey })

  // 2. Find or create tenant
  //    Priority: users row by admin email → members row → first tenant → create fresh
  let tenantId: string
  let adminUserId: string
  let adminClerkId: string | null = null

  // Look up admin in our DB first
  const [adminUserRow] = await db.select({ id: users.id, clerkId: users.clerkId })
    .from(users).where(eq(users.email, ADMIN_EMAIL)).limit(1)

  if (adminUserRow) {
    adminUserId   = adminUserRow.id
    adminClerkId  = adminUserRow.clerkId ?? null
    const [adminMemberRow] = await db.select({ tenantId: members.tenantId })
      .from(members).where(eq(members.userId, adminUserRow.id)).limit(1)
    if (adminMemberRow) {
      tenantId = adminMemberRow.tenantId
    } else {
      // User exists but has no tenant yet — create one
      const orgSecret   = generateSecret()
      const adminSecret = generateSecret()
      const [newTenant] = await db.insert(tenants).values({
        name: 'FinCorp',
        slug: 'fincorp',
        orgTokenHash:       await hashToken(orgSecret),
        adminTokenHash:     await hashToken(adminSecret),
        paymentProvider:    'stripe',
        externalSubId:      'sub_seed_fintech',
        subscriptionStatus: 'active',
      }).returning({ id: tenants.id })
      tenantId = newTenant!.id
      console.log(`  org token:   ${formatToken('ps_live', 'fincorp', orgSecret)}`)
      console.log(`  admin token: ${formatToken('ps_adm',  'fincorp', adminSecret)}`)
    }
  } else {
    // No user row yet — look up admin Clerk user to get their clerkId
    console.log('  No admin in DB — looking up Clerk user for admin email…')
    const clerkUsers = await clerk.users.getUserList({ emailAddress: [ADMIN_EMAIL] })
    const adminClerkUser = clerkUsers.data[0]
    if (!adminClerkUser) throw new Error(`No Clerk user found for ${ADMIN_EMAIL} — sign up first.`)
    adminClerkId = adminClerkUser.id

    // Create or find tenant
    const [existingTenant] = await db.select({ id: tenants.id }).from(tenants).limit(1)
    if (existingTenant) {
      tenantId = existingTenant.id
    } else {
      const orgSecret   = generateSecret()
      const adminSecret = generateSecret()
      const [newTenant] = await db.insert(tenants).values({
        name: 'FinCorp',
        slug: 'fincorp',
        orgTokenHash:       await hashToken(orgSecret),
        adminTokenHash:     await hashToken(adminSecret),
        paymentProvider:    'stripe',
        externalSubId:      'sub_seed_fintech',
        subscriptionStatus: 'active',
      }).returning({ id: tenants.id })
      tenantId = newTenant!.id
      console.log(`  org token:   ${formatToken('ps_live', 'fincorp', orgSecret)}`)
      console.log(`  admin token: ${formatToken('ps_adm',  'fincorp', adminSecret)}`)
    }

    // Create users row for admin
    const [newAdminUser] = await db.insert(users).values({
      clerkId: adminClerkId,
      email:   ADMIN_EMAIL,
      firstName: adminClerkUser.firstName ?? undefined,
      lastName:  adminClerkUser.lastName  ?? undefined,
    }).onConflictDoNothing().returning({ id: users.id })
    adminUserId = newAdminUser!.id
  }

  console.log(`✓ Tenant ${tenantId} (admin clerkId: ${adminClerkId ?? 'none'})`)

  // 3. Clear existing seed data for this tenant (preserve tenant row + policies + users)
  await db.delete(events).where(eq(events.tenantId, tenantId))
  await db.delete(scans).where(eq(scans.tenantId, tenantId))

  const existingMembers = await db.select({ id: members.id }).from(members).where(eq(members.tenantId, tenantId))
  if (existingMembers.length > 0) {
    await db.delete(memberTeams).where(inArray(memberTeams.memberId, existingMembers.map(m => m.id)))
  }
  await db.delete(rules).where(eq(rules.tenantId, tenantId))
  await db.delete(subjects).where(eq(subjects.tenantId, tenantId))
  await db.delete(siteConfigs).where(eq(siteConfigs.tenantId, tenantId))
  await db.delete(members).where(eq(members.tenantId, tenantId))
  await db.delete(teams).where(eq(teams.tenantId, tenantId))
  await db.delete(divisions).where(eq(divisions.tenantId, tenantId))
  console.log('✓ Cleared existing seed data')

  // 4. Re-create the admin member
  const [adminMember] = await db
    .insert(members)
    .values({ tenantId, userId: adminUserId, email: ADMIN_EMAIL, displayName: 'Yarin', role: 'super_admin' })
    .returning({ id: members.id })
  void adminMember

  // 5. Divisions
  const divRows = await db
    .insert(divisions)
    .values([
      { tenantId, name: 'Research & Development', slug: 'rd'       },
      { tenantId, name: 'Legal & Compliance',     slug: 'legal'    },
      { tenantId, name: 'Finance',                slug: 'finance'  },
      { tenantId, name: 'Product',                slug: 'product'  },
      { tenantId, name: 'Security',               slug: 'security' },
    ])
    .returning({ id: divisions.id, slug: divisions.slug })

  const div = Object.fromEntries(divRows.map(r => [r.slug, r.id])) as Record<string, string>
  console.log('✓ Created 5 divisions: R&D · Legal · Finance · Product · Security')

  // 6. Teams
  const teamDefs = [
    { divisionId: div['rd']!,       name: 'Core Platform',       slug: 'core-platform'    },
    { divisionId: div['rd']!,       name: 'Mobile',              slug: 'mobile'           },
    { divisionId: div['rd']!,       name: 'Data Engineering',    slug: 'data-engineering' },
    { divisionId: div['legal']!,    name: 'Regulatory Affairs',  slug: 'regulatory'       },
    { divisionId: div['legal']!,    name: 'Contract Review',     slug: 'contracts'        },
    { divisionId: div['legal']!,    name: 'Privacy & Data',      slug: 'privacy'          },
    { divisionId: div['finance']!,  name: 'Treasury',            slug: 'treasury'         },
    { divisionId: div['finance']!,  name: 'Financial Reporting', slug: 'reporting'        },
    { divisionId: div['finance']!,  name: 'Risk Management',     slug: 'risk'             },
    { divisionId: div['product']!,  name: 'Consumer Banking',    slug: 'consumer-banking' },
    { divisionId: div['product']!,  name: 'B2B Payments',        slug: 'b2b-payments'     },
    { divisionId: div['product']!,  name: 'Lending',             slug: 'lending'          },
    { divisionId: div['security']!, name: 'AppSec',              slug: 'appsec'           },
    { divisionId: div['security']!, name: 'Threat Intelligence', slug: 'threat-intel'     },
    { divisionId: div['security']!, name: 'Compliance & Audit',  slug: 'compliance'       },
  ]

  const teamRows = await db
    .insert(teams)
    .values(teamDefs.map(t => ({ tenantId, ...t })))
    .returning({ id: teams.id, slug: teams.slug })

  const team = Object.fromEntries(teamRows.map(r => [r.slug, r.id])) as Record<string, string>
  console.log('✓ Created 15 teams')

  // 7. Dummy members — create Clerk users (for sign-in) + DB users + DB members
  const dummyDefs = [
    { email: 'alice.chen@fincorp.dev',     displayName: 'Alice Chen',     firstName: 'Alice',  lastName: 'Chen',    teamSlug: 'core-platform' },
    { email: 'marcus.johnson@fincorp.dev', displayName: 'Marcus Johnson', firstName: 'Marcus', lastName: 'Johnson', teamSlug: 'regulatory'    },
    { email: 'priya.patel@fincorp.dev',    displayName: 'Priya Patel',    firstName: 'Priya',  lastName: 'Patel',   teamSlug: 'treasury'      },
    { email: 'sarah.kim@fincorp.dev',      displayName: 'Sarah Kim',      firstName: 'Sarah',  lastName: 'Kim',     teamSlug: 'appsec'        },
  ]

  for (const m of dummyDefs) {
    // Find or create Clerk user (for extension sign-in)
    let clerkUserId: string
    const existing = await clerk.users.getUserList({ emailAddress: [m.email] })
    if (existing.data.length > 0) {
      clerkUserId = existing.data[0]!.id
      console.log(`  · ${m.email} — found existing Clerk user ${clerkUserId}`)
    } else {
      const created = await clerk.users.createUser({
        emailAddress: [m.email],
        password: DUMMY_PASSWORD,
        firstName: m.firstName,
        lastName: m.lastName,
        skipPasswordChecks: true,
      })
      clerkUserId = created.id
      console.log(`  · ${m.email} — created Clerk user ${clerkUserId}`)
    }

    // Upsert users row
    const [userRow] = await db
      .insert(users)
      .values({ clerkId: clerkUserId, email: m.email, firstName: m.firstName, lastName: m.lastName })
      .onConflictDoNothing()
      .returning({ id: users.id })

    const userId = userRow?.id ?? (
      await db.select({ id: users.id }).from(users).where(eq(users.email, m.email)).limit(1)
    )[0]!.id

    // Insert member row referencing the users row
    const [row] = await db
      .insert(members)
      .values({ tenantId, userId, email: m.email, displayName: m.displayName, role: 'member' })
      .returning({ id: members.id })
    await db.insert(memberTeams).values({ memberId: row!.id, teamId: team[m.teamSlug]! })
  }
  console.log('✓ Created 4 dummy members in Clerk + DB (no org membership needed)')

  // 8. Subjects + Rules (unchanged — see seed-fintech original for full rule set)
  await addSubject(tenantId, 'API Keys & Secrets', 'Detects real credential formats.', null, null, [
    { kind: 'pattern', action: 'block', reportLevel: 'rich', message: 'AWS access key detected.', pattern: 'AKIA[0-9A-Z]{16}' },
    { kind: 'pattern', action: 'block', reportLevel: 'rich', message: 'Private key material detected.', pattern: '-----BEGIN\\s(?:RSA\\s|EC\\s|OPENSSH\\s)?PRIVATE KEY-----' },
    { kind: 'pattern', action: 'block', reportLevel: 'rich', message: 'JWT token detected.', pattern: 'eyJ[A-Za-z0-9_-]{10,}\\.eyJ[A-Za-z0-9_-]{10,}' },
    { kind: 'pattern', action: 'block', reportLevel: 'rich', message: 'Stripe API key detected.', pattern: 'sk_live_[A-Za-z0-9]{20,}' },
    { kind: 'pattern', action: 'block', reportLevel: 'rich', message: 'GitHub token detected.', pattern: 'gh[pousr]_[A-Za-z0-9_]{36,255}' },
    { kind: 'pattern', action: 'warn',  reportLevel: 'medium', message: 'Possible .env content pasted.', pattern: '(?:^|\\n)[A-Z][A-Z0-9_]{3,}=["\']?[^\\s"\']{12,}["\']?' },
  ])
  await addSubject(tenantId, 'Employee & Customer PII', 'Stops SSNs and card numbers.', null, null, [
    { kind: 'pattern', action: 'block', reportLevel: 'rich',   message: 'US SSN detected.', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b' },
    { kind: 'pattern', action: 'block', reportLevel: 'rich',   message: 'Credit card detected (Visa).', pattern: '\\b4[0-9]{12}(?:[0-9]{3})?\\b' },
    { kind: 'pattern', action: 'block', reportLevel: 'rich',   message: 'Credit card detected (MC).', pattern: '\\b5[1-5][0-9]{14}\\b' },
    { kind: 'pattern', action: 'block', reportLevel: 'rich',   message: 'Credit card detected (Amex).', pattern: '\\b3[47][0-9]{13}\\b' },
    { kind: 'keyword', action: 'warn',  reportLevel: 'medium', message: 'Prompt references personal identifiers.', keywords: ['date of birth', 'home address', 'health record', 'national insurance number'] },
  ])
  // (add remaining subjects following the same pattern from the original seed-fintech.ts)
  console.log('✓ Created subjects with rules')

  // 9. Site configs
  await db.insert(siteConfigs).values([
    { tenantId, domain: 'chatgpt.com',          inputSelector: '#prompt-textarea',          sendButtonSelector: 'button[data-testid="send-button"]' },
    { tenantId, domain: 'claude.ai',            inputSelector: 'div[contenteditable="true"]', sendButtonSelector: 'button[aria-label="Send Message"]' },
    { tenantId, domain: 'gemini.google.com',    inputSelector: 'div[contenteditable="true"]', sendButtonSelector: 'button[aria-label="Send message"]' },
    { tenantId, domain: 'copilot.microsoft.com',inputSelector: 'textarea#userInput',          sendButtonSelector: 'button[aria-label="Submit message"]' },
  ])
  console.log('✓ Created site configs for ChatGPT · Claude · Gemini · Copilot')

  // 10. Compile & publish policy
  const policyDoc = await compilePolicy(tenantId)
  const version   = await publishPolicy(tenantId, policyDoc)
  console.log(`✓ Published policy v${version}`)

  console.log(`
╔════════════════════════════════════════════════════════════╗
║  FinCorp seed complete! (Clerk org-free)                   ║
╠════════════════════════════════════════════════════════════╣
║  5 divisions · 15 teams · 4 members · policy v${version} published  ║
╠════════════════════════════════════════════════════════════╣
║  Sign in to the extension as any member:                  ║
║  password → Fincorp2026!                                  ║
╠════════════════════════════════════════════════════════════╣`)
  for (const m of dummyDefs) {
    console.log(`║  ${m.email.padEnd(42)}  [${m.teamSlug.padEnd(16)}]  ║`)
  }
  console.log(`╚════════════════════════════════════════════════════════════╝`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => process.exit(0))
```

- [ ] **Step 3: Run the full test suite one final time**

```bash
cd backend && npm test
```

Expected: all tests pass with no failures.

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/
git commit -m "feat(seed): remove Clerk org API calls from all seeds, use users table for identity"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec section | Covered by task |
|---|---|
| Remove `clerkOrgId` from tenants | Task 1 + 2 |
| Add `users` table | Task 1 + 2 |
| Remove `clerkId`/`firstName`/`lastName`/`avatarUrl` from members | Task 1 + 2 |
| `userId` nullable FK on members | Task 1 + 2 |
| `user.created` webhook — auto-provision + pre-enroll connect | Task 5 |
| `user.updated` webhook → updates `users` table | Task 5 |
| `user.deleted` webhook → null clerkId | Task 5 |
| Remove org webhook handlers | Task 5 |
| `resolveClerkJwt` → users → members → tenant | Task 6 |
| `requirePlatformAdmin` middleware | Task 6 |
| `isPlatformAdmin` flag on users | Task 1, Task 6 |
| `/platform/v1/tenants` list with member counts | Task 9 |
| `/platform/v1/tenants/:id/members` CRUD | Task 9 |
| `/platform/v1/tenants/:id/divisions` | Task 9 |
| `/platform/v1/tenants/:id/subjects` | Task 9 |
| Register platformRouter in app.ts | Task 9 |
| `listMembers` joins users table | Task 8 |
| seed-e2e.ts uses users row + userId | Task 10 |
| seed-fintech.ts removes clerk.organizations.* | Task 10 |
| Remove redundant Clerk org test cases | Task 5 + 7 |
