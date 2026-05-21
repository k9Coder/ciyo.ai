# Live Dashboard (Sub-project B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all mock data in DashboardPage with real queries — adding a `scans` table for prompt-level counting, five analytics read endpoints, and a time-range selector.

**Architecture:** New `scans` table counts every detection (fire-and-forget from extension). Five `GET /v1/analytics/*` endpoints aggregate scans + events with direct SQL queries. Admin panel uses React Query hooks, one per widget, feeding a rewritten DashboardPage that has a `7d / 30d / 90d` selector controlling stats and most widgets; the activity chart is always last 7 days.

**Tech Stack:** Drizzle ORM, PostgreSQL, Fastify, Vitest + Supertest (backend), React + React Query (admin), TypeScript, Chrome Extension MV3

---

## File Map

**Create:**
- `backend/src/scans/service.ts` — `recordScan(tenantId, memberId)`
- `backend/src/scans/router.ts` — `POST /scans`
- `backend/src/analytics/service.ts` — five query functions
- `backend/src/analytics/router.ts` — five GET endpoints
- `backend/drizzle/0005_scans.sql` — migration
- `backend/tests/scans.test.ts`
- `backend/tests/analytics.test.ts`
- `src/scans/dispatch.ts` — fire-and-forget POST /v1/scans
- `admin/src/hooks/useAnalytics.ts` — five React Query hooks

**Modify:**
- `backend/src/db/schema.ts` — add `scans` table
- `backend/drizzle/meta/_journal.json` — add migration entry
- `backend/tests/helpers/db.ts` — add scans to truncateAll
- `backend/src/app.ts` — register scansRouter + analyticsRouter
- `src/background/service-worker.ts` — call dispatchScan() after DETECT
- `admin/src/types.ts` — add five analytics response types
- `admin/src/api.ts` — add `api.analytics.*`
- `admin/src/pages/DashboardPage.tsx` — replace all mocks

---

## Task 1: DB Schema — scans table

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0005_scans.sql`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/tests/helpers/db.ts`

- [ ] **Step 1: Add scans table to schema.ts**

In `backend/src/db/schema.ts`, after the `events` table and before the Types section, add:

```ts
// ── Scans (prompt-level count) ────────────────────────────────────────────────
export const scans = pgTable('scans', {
  id:         uuid('id').primaryKey().defaultRandom(),
  tenantId:   uuid('tenant_id').notNull().references(() => tenants.id),
  memberId:   uuid('member_id').references(() => members.id),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantTimeIdx: index().on(t.tenantId, t.occurredAt),
}))
```

At the bottom of the Types section, add:

```ts
export type Scan    = typeof scans.$inferSelect
export type NewScan = typeof scans.$inferInsert
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: Create SQL migration file**

Create `backend/drizzle/0005_scans.sql`:

```sql
CREATE TABLE "scans" (
  "id"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"   uuid NOT NULL REFERENCES "tenants"("id"),
  "member_id"   uuid REFERENCES "members"("id"),
  "occurred_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON "scans"("tenant_id", "occurred_at");
```

- [ ] **Step 4: Add migration entry to journal**

In `backend/drizzle/meta/_journal.json`, add after the `0004_analytics_pipeline` entry:

```json
    {
      "idx": 5,
      "version": "6",
      "when": 1748908800000,
      "tag": "0005_scans",
      "breakpoints": true
    }
```

- [ ] **Step 5: Apply migration directly**

```bash
cd backend && node --env-file=.env -e "
import postgres from 'postgres'
const sql = postgres(process.env.DATABASE_URL)
await sql\`CREATE TABLE \"scans\" (
  \"id\"          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  \"tenant_id\"   uuid NOT NULL REFERENCES \"tenants\"(\"id\"),
  \"member_id\"   uuid REFERENCES \"members\"(\"id\"),
  \"occurred_at\" timestamptz NOT NULL DEFAULT now()
)\`
await sql\`CREATE INDEX ON \"scans\"(\"tenant_id\", \"occurred_at\")\`
console.log('Done')
await sql.end()
" --input-type=module
```

Expected: `Done`

- [ ] **Step 6: Update truncateAll in test helpers**

Replace `backend/tests/helpers/db.ts` entirely:

```ts
import { db } from '../../src/db/client.js'
import { tenants, policies, divisions, teams, members, memberTeams, subjects, rules, destinationGroups, siteConfigs, events, scans } from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'

export async function truncateAll(): Promise<void> {
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

- [ ] **Step 7: Run all backend tests to confirm nothing broke**

```bash
cd backend && npx vitest run 2>&1 | tail -6
```

Expected: all existing tests pass.

- [ ] **Step 8: Commit**

```bash
cd ..
git add backend/src/db/schema.ts backend/drizzle/0005_scans.sql backend/drizzle/meta/_journal.json backend/tests/helpers/db.ts
git commit -m "feat(db): add scans table for prompt-level counting"
```

---

## Task 2: Backend scans service + router (TDD)

**Files:**
- Create: `backend/tests/scans.test.ts`
- Create: `backend/src/scans/service.ts`
- Create: `backend/src/scans/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Write failing tests**

Create `backend/tests/scans.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { scans } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  orgToken = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/scans', () => {
  it('records a scan and returns 204', async () => {
    const res = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send()
    expect(res.status).toBe(204)
    const rows = await db.select().from(scans)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tenantId).toBe(tenantId)
    expect(rows[0]!.memberId).toBeNull()
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/scans').send()
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && npx vitest run tests/scans.test.ts 2>&1 | tail -5
```

Expected: FAIL — route not found (404).

- [ ] **Step 3: Create scans service**

Create `backend/src/scans/service.ts`:

```ts
import { db } from '../db/client.js'
import { scans } from '../db/schema.js'

export async function recordScan(tenantId: string, memberId: string | null): Promise<void> {
  await db.insert(scans).values({ tenantId, memberId })
}
```

- [ ] **Step 4: Create scans router**

Create `backend/src/scans/router.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { recordScan } from './service.js'

export async function scansRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/scans', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const memberId = req.member?.id ?? null
    await recordScan(req.tenant.id, memberId)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 5: Register in app.ts**

In `backend/src/app.ts`, add the import after the `eventsRouter` import:

```ts
import { scansRouter } from './scans/router.js'
```

And register after `eventsRouter`:

```ts
void app.register(scansRouter, { prefix: '/v1' })
```

- [ ] **Step 6: Run tests — confirm they pass**

```bash
cd backend && npx vitest run tests/scans.test.ts 2>&1 | tail -5
```

Expected: 2/2 PASS.

- [ ] **Step 7: Commit**

```bash
cd ..
git add backend/src/scans/service.ts backend/src/scans/router.ts backend/src/app.ts backend/tests/scans.test.ts
git commit -m "feat(scans): POST /v1/scans records prompt scan count"
```

---

## Task 3: Extension — scan dispatch

**Files:**
- Create: `src/scans/dispatch.ts`
- Modify: `src/background/service-worker.ts`

- [ ] **Step 1: Create scan dispatch module**

Create `src/scans/dispatch.ts`:

```ts
import { API_BASE } from "@/shared/constants";

async function getAuthToken(): Promise<string | null> {
  const clerkResult = await chrome.storage.local.get("clerkSessionToken") as Record<string, unknown>;
  if (typeof clerkResult["clerkSessionToken"] === "string") return clerkResult["clerkSessionToken"];
  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>;
  if (typeof managed["orgToken"] === "string") return managed["orgToken"];
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null;
}

export async function dispatchScan(): Promise<void> {
  const token = await getAuthToken();
  if (!token) return;
  fetch(`${API_BASE}/v1/scans`, {
    method:  "POST",
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => {}); // fire-and-forget
}
```

- [ ] **Step 2: Wire into service-worker.ts**

In `src/background/service-worker.ts`, add import at the top:

```ts
import { dispatchScan } from "@/scans/dispatch";
```

Replace the DETECT case:

```ts
case "DETECT": {
  const { text, hostname, pasteDetected } = message.payload;
  const policy = await loadPolicy();
  const result = await detectPrompt(text, policy, hostname, pasteDetected ?? false);
  void dispatchEvents(result, hostname);
  void dispatchScan();
  return result;
}
```

- [ ] **Step 3: Typecheck extension**

```bash
cd "c:/Users/yarin/Documents/code/prompt-saviour" && npx tsc --noEmit 2>&1 | grep -v "theme.test.ts" | tail -5
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add src/scans/dispatch.ts src/background/service-worker.ts
git commit -m "feat(extension): fire-and-forget scan ping on every detection"
```

---

## Task 4: Backend analytics service — summary + daily (TDD)

**Files:**
- Create: `backend/tests/analytics.test.ts`
- Create: `backend/src/analytics/service.ts`

- [ ] **Step 1: Write failing tests for summary + daily**

Create `backend/tests/analytics.test.ts`:

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant, buildTestMember } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { scans, events, subjects, rules } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { getAnalyticsSummary, getAnalyticsDaily } from '../src/analytics/service.js'

let app: FastifyInstance
let tenantId: string
let adminToken: string
let memberId: string
let ruleId: string
let subjectId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  adminToken = t.adminToken
  memberId = await buildTestMember(tenantId)

  const [subj] = await db.insert(subjects)
    .values({ tenantId, name: 'API Keys', active: true })
    .returning({ id: subjects.id })
  subjectId = subj!.id

  const [rule] = await db.insert(rules)
    .values({ tenantId, subjectId, kind: 'keyword', keywords: ['key'], action: 'block', reportLevel: 'medium' })
    .returning({ id: rules.id })
  ruleId = rule!.id
})
afterAll(async () => { await app.close() })

describe('getAnalyticsSummary', () => {
  it('returns zeroes when no data', async () => {
    const result = await getAnalyticsSummary(tenantId, 30)
    expect(result.scansTotal).toBe(0)
    expect(result.blocked).toBe(0)
    expect(result.warned).toBe(0)
    expect(result.activeUsers).toBe(0)
    expect(result.totalMembers).toBe(1)    // from buildTestMember
    expect(result.activeRulesCount).toBe(1) // from beforeEach
  })

  it('counts scans, events, and active users', async () => {
    await db.insert(scans).values([
      { tenantId, memberId },
      { tenantId, memberId },
      { tenantId, memberId: null },
    ])
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' },
      { tenantId, ruleId, action: 'warn',  siteUrl: 'https://claude.ai' },
    ])
    const result = await getAnalyticsSummary(tenantId, 30)
    expect(result.scansTotal).toBe(3)
    expect(result.blocked).toBe(1)
    expect(result.warned).toBe(1)
    expect(result.activeUsers).toBe(1) // 2 scans but same memberId
  })
})

describe('getAnalyticsDaily', () => {
  it('always returns 7 entries', async () => {
    const result = await getAnalyticsDaily(tenantId)
    expect(result).toHaveLength(7)
    expect(result[0]).toHaveProperty('day')
    expect(result[0]).toHaveProperty('date')
    expect(result[0]).toHaveProperty('blocked')
    expect(result[0]).toHaveProperty('warned')
    expect(result[0]).toHaveProperty('scanned')
  })

  it('counts today\'s events in the last bucket', async () => {
    await db.insert(events).values({ tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' })
    await db.insert(scans).values({ tenantId, memberId })
    const result = await getAnalyticsDaily(tenantId)
    const today = result[6]!
    expect(today.blocked).toBe(1)
    expect(today.scanned).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
cd backend && npx vitest run tests/analytics.test.ts 2>&1 | tail -5
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create analytics service with summary + daily**

Create `backend/src/analytics/service.ts`:

```ts
import { and, eq, gte, isNotNull, sql, desc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, scans, members, rules, subjects } from '../db/schema.js'

function since(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

export async function getAnalyticsSummary(tenantId: string, days: number) {
  const cutoff = since(days)

  const [scansTotal] = await db
    .select({ v: sql<number>`count(*)` })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, cutoff)))

  const [blocked] = await db
    .select({ v: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.action, 'block'), gte(events.occurredAt, cutoff)))

  const [warned] = await db
    .select({ v: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), eq(events.action, 'warn'), gte(events.occurredAt, cutoff)))

  const [activeUsers] = await db
    .select({ v: sql<number>`count(distinct ${scans.memberId})` })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), isNotNull(scans.memberId), gte(scans.occurredAt, cutoff)))

  const [totalMembers] = await db
    .select({ v: sql<number>`count(*)` })
    .from(members)
    .where(eq(members.tenantId, tenantId))

  const [activeRulesCount] = await db
    .select({ v: sql<number>`count(*)` })
    .from(rules)
    .where(and(eq(rules.tenantId, tenantId), eq(rules.active, true)))

  return {
    scansTotal:       Number(scansTotal!.v),
    blocked:          Number(blocked!.v),
    warned:           Number(warned!.v),
    activeUsers:      Number(activeUsers!.v),
    totalMembers:     Number(totalMembers!.v),
    activeRulesCount: Number(activeRulesCount!.v),
  }
}

export async function getAnalyticsDaily(tenantId: string) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const buckets: { date: string; day: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - i)
    buckets.push({ date: d.toISOString().slice(0, 10), day: DAY_NAMES[d.getUTCDay()]! })
  }
  const cutoff = new Date(buckets[0]!.date + 'T00:00:00Z')

  const eventsRows = await db
    .select({ occurredAt: events.occurredAt, action: events.action })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))

  const scansRows = await db
    .select({ occurredAt: scans.occurredAt })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, cutoff)))

  return buckets.map(({ date, day }) => ({
    day,
    date,
    blocked: eventsRows.filter(r => r.occurredAt.toISOString().slice(0, 10) === date && r.action === 'block').length,
    warned:  eventsRows.filter(r => r.occurredAt.toISOString().slice(0, 10) === date && r.action === 'warn').length,
    scanned: scansRows.filter(r => r.occurredAt.toISOString().slice(0, 10) === date).length,
  }))
}
```

- [ ] **Step 4: Run summary + daily tests — confirm they pass**

```bash
cd backend && npx vitest run tests/analytics.test.ts 2>&1 | tail -5
```

Expected: 4/4 PASS (only the summary + daily describe blocks run; incidents/top-sites/by-subject tests don't exist yet).

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/src/analytics/service.ts backend/tests/analytics.test.ts
git commit -m "feat(analytics): summary + daily service functions (TDD)"
```

---

## Task 5: Backend analytics service — incidents + top-sites + by-subject

**Files:**
- Modify: `backend/src/analytics/service.ts`
- Modify: `backend/tests/analytics.test.ts`

- [ ] **Step 1: Add failing tests for incidents + top-sites + by-subject**

Append to the bottom of `backend/tests/analytics.test.ts`:

```ts
import { getAnalyticsIncidents, getAnalyticsTopSites, getAnalyticsBySubject } from '../src/analytics/service.js'

describe('getAnalyticsIncidents', () => {
  it('returns empty array when no events', async () => {
    const result = await getAnalyticsIncidents(tenantId)
    expect(result).toHaveLength(0)
  })

  it('returns event with subject name and null email for anonymous event', async () => {
    await db.insert(events).values({ tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' })
    const result = await getAnalyticsIncidents(tenantId)
    expect(result).toHaveLength(1)
    expect(result[0]!.memberEmail).toBeNull()
    expect(result[0]!.subjectName).toBe('API Keys')
    expect(result[0]!.ruleKind).toBe('keyword')
    expect(result[0]!.action).toBe('block')
  })

  it('limits to 20 most recent', async () => {
    const vals = Array.from({ length: 25 }, (_, i) => ({
      tenantId, ruleId, action: 'warn' as const, siteUrl: `https://site${i}.com`,
    }))
    await db.insert(events).values(vals)
    const result = await getAnalyticsIncidents(tenantId)
    expect(result).toHaveLength(20)
  })
})

describe('getAnalyticsTopSites', () => {
  it('returns top domains by event count', async () => {
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com/chat/1' },
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com/chat/2' },
      { tenantId, ruleId, action: 'warn',  siteUrl: 'https://claude.ai/chat' },
    ])
    const result = await getAnalyticsTopSites(tenantId, 30)
    expect(result[0]!.domain).toBe('chatgpt.com')
    expect(result[0]!.count).toBe(2)
    expect(result[1]!.domain).toBe('claude.ai')
    expect(result[1]!.count).toBe(1)
  })

  it('returns empty array when no events', async () => {
    const result = await getAnalyticsTopSites(tenantId, 30)
    expect(result).toHaveLength(0)
  })
})

describe('getAnalyticsBySubject', () => {
  it('returns events grouped by subject with percentages', async () => {
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' },
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' },
    ])
    const result = await getAnalyticsBySubject(tenantId, 30)
    expect(result[0]!.subjectName).toBe('API Keys')
    expect(result[0]!.count).toBe(2)
    expect(result[0]!.pct).toBe(100)
  })

  it('returns empty array when no events', async () => {
    const result = await getAnalyticsBySubject(tenantId, 30)
    expect(result).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run tests — confirm new tests fail**

```bash
cd backend && npx vitest run tests/analytics.test.ts 2>&1 | tail -5
```

Expected: the three new describe blocks fail with "not a function".

- [ ] **Step 3: Add incidents + top-sites + by-subject to service**

Append to the bottom of `backend/src/analytics/service.ts`:

```ts
export async function getAnalyticsIncidents(tenantId: string) {
  const rows = await db
    .select({
      id:          events.id,
      memberEmail: members.email,
      subjectName: subjects.name,
      ruleKind:    rules.kind,
      action:      events.action,
      siteUrl:     events.siteUrl,
      occurredAt:  events.occurredAt,
    })
    .from(events)
    .leftJoin(members,  eq(events.memberId, members.id))
    .innerJoin(rules,   eq(events.ruleId, rules.id))
    .innerJoin(subjects, eq(rules.subjectId, subjects.id))
    .where(eq(events.tenantId, tenantId))
    .orderBy(desc(events.occurredAt))
    .limit(20)

  return rows.map(r => ({
    id:          r.id,
    memberEmail: r.memberEmail ?? null,
    subjectName: r.subjectName,
    ruleKind:    r.ruleKind,
    action:      r.action,
    siteUrl:     r.siteUrl,
    occurredAt:  r.occurredAt.toISOString(),
  }))
}

export async function getAnalyticsTopSites(tenantId: string, days: number) {
  const cutoff = since(days)
  const rows = await db
    .select({ siteUrl: events.siteUrl, cnt: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))
    .groupBy(events.siteUrl)

  const byDomain = new Map<string, number>()
  for (const row of rows) {
    try {
      const domain = new URL(row.siteUrl).hostname
      byDomain.set(domain, (byDomain.get(domain) ?? 0) + Number(row.cnt))
    } catch { /* skip malformed URLs */ }
  }

  return [...byDomain.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([domain, count]) => ({ domain, count }))
}

export async function getAnalyticsBySubject(tenantId: string, days: number) {
  const cutoff = since(days)
  const rows = await db
    .select({ subjectName: subjects.name, cnt: sql<number>`count(*)` })
    .from(events)
    .innerJoin(rules,    eq(events.ruleId, rules.id))
    .innerJoin(subjects, eq(rules.subjectId, subjects.id))
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))
    .groupBy(subjects.name)

  const sorted = [...rows].sort((a, b) => Number(b.cnt) - Number(a.cnt)).slice(0, 5)
  const total = sorted.reduce((s, r) => s + Number(r.cnt), 0)

  return sorted.map(r => ({
    subjectName: r.subjectName,
    count:       Number(r.cnt),
    pct:         total > 0 ? Math.round(Number(r.cnt) / total * 100) : 0,
  }))
}
```

- [ ] **Step 4: Run all analytics tests — confirm they pass**

```bash
cd backend && npx vitest run tests/analytics.test.ts 2>&1 | tail -5
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd ..
git add backend/src/analytics/service.ts backend/tests/analytics.test.ts
git commit -m "feat(analytics): incidents, top-sites, by-subject service functions"
```

---

## Task 6: Backend analytics router

**Files:**
- Create: `backend/src/analytics/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create analytics router**

Create `backend/src/analytics/router.ts`:

```ts
import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import {
  getAnalyticsSummary,
  getAnalyticsDaily,
  getAnalyticsIncidents,
  getAnalyticsTopSites,
  getAnalyticsBySubject,
} from './service.js'

function parseDays(raw: string | undefined): 7 | 30 | 90 {
  const n = Number(raw ?? '30')
  return ([7, 30, 90] as const).includes(n as 7 | 30 | 90) ? (n as 7 | 30 | 90) : 30
}

export async function analyticsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/analytics/summary', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { days } = req.query as { days?: string }
    return getAnalyticsSummary(req.tenant.id, parseDays(days))
  })

  fastify.get('/analytics/daily', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return getAnalyticsDaily(req.tenant.id)
  })

  fastify.get('/analytics/incidents', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return getAnalyticsIncidents(req.tenant.id)
  })

  fastify.get('/analytics/top-sites', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { days } = req.query as { days?: string }
    return getAnalyticsTopSites(req.tenant.id, parseDays(days))
  })

  fastify.get('/analytics/by-subject', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { days } = req.query as { days?: string }
    return getAnalyticsBySubject(req.tenant.id, parseDays(days))
  })
}
```

- [ ] **Step 2: Register in app.ts**

In `backend/src/app.ts`, add import after `scansRouter`:

```ts
import { analyticsRouter } from './analytics/router.js'
```

Register after `scansRouter`:

```ts
void app.register(analyticsRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Run all backend tests**

```bash
cd backend && npx vitest run 2>&1 | tail -6
```

Expected: all tests pass (including the new analytics and scans tests).

- [ ] **Step 4: Commit**

```bash
cd ..
git add backend/src/analytics/router.ts backend/src/app.ts
git commit -m "feat(analytics): register five analytics GET endpoints"
```

---

## Task 7: Admin types + API + hooks

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`
- Create: `admin/src/hooks/useAnalytics.ts`

- [ ] **Step 1: Add analytics types to types.ts**

Append to the bottom of `admin/src/types.ts`:

```ts
export interface AnalyticsSummary {
  scansTotal:       number
  blocked:          number
  warned:           number
  activeUsers:      number
  totalMembers:     number
  activeRulesCount: number
}

export interface AnalyticsDailyEntry {
  day:     string
  date:    string
  blocked: number
  warned:  number
  scanned: number
}

export interface AnalyticsIncident {
  id:          string
  memberEmail: string | null
  subjectName: string
  ruleKind:    string
  action:      'warn' | 'block'
  siteUrl:     string
  occurredAt:  string
}

export interface AnalyticsTopSiteEntry {
  domain: string
  count:  number
}

export interface AnalyticsBySubjectEntry {
  subjectName: string
  count:       number
  pct:         number
}
```

- [ ] **Step 2: Add api.analytics to api.ts**

In `admin/src/api.ts`, add the import at the top alongside the existing type imports:

```ts
import type {
  Subject, Rule, Division, Team, Member,
  DestinationGroup, SiteConfig, PolicyInfo, PolicyHistoryEntry, TenantInfo,
  AnalyticsSummary, AnalyticsDailyEntry, AnalyticsIncident,
  AnalyticsTopSiteEntry, AnalyticsBySubjectEntry,
} from './types'
```

Add the `analytics` block inside the `api` object (after `tenant`):

```ts
  analytics: {
    summary:   (days: 7 | 30 | 90) =>
      request<AnalyticsSummary>('GET', `/v1/analytics/summary?days=${days}`),
    daily: () =>
      request<AnalyticsDailyEntry[]>('GET', '/v1/analytics/daily'),
    incidents: () =>
      request<AnalyticsIncident[]>('GET', '/v1/analytics/incidents'),
    topSites: (days: 7 | 30 | 90) =>
      request<AnalyticsTopSiteEntry[]>('GET', `/v1/analytics/top-sites?days=${days}`),
    bySubject: (days: 7 | 30 | 90) =>
      request<AnalyticsBySubjectEntry[]>('GET', `/v1/analytics/by-subject?days=${days}`),
  },
```

- [ ] **Step 3: Create useAnalytics.ts**

Create `admin/src/hooks/useAnalytics.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useAnalyticsSummary(days: 7 | 30 | 90) {
  return useQuery({
    queryKey:  ['analytics', 'summary', days],
    queryFn:   () => api.analytics.summary(days),
    staleTime: 60_000,
  })
}

export function useAnalyticsDaily() {
  return useQuery({
    queryKey:  ['analytics', 'daily'],
    queryFn:   api.analytics.daily,
    staleTime: 60_000,
  })
}

export function useAnalyticsIncidents() {
  return useQuery({
    queryKey:  ['analytics', 'incidents'],
    queryFn:   api.analytics.incidents,
    staleTime: 30_000,
  })
}

export function useAnalyticsTopSites(days: 7 | 30 | 90) {
  return useQuery({
    queryKey:  ['analytics', 'top-sites', days],
    queryFn:   () => api.analytics.topSites(days),
    staleTime: 60_000,
  })
}

export function useAnalyticsBySubject(days: 7 | 30 | 90) {
  return useQuery({
    queryKey:  ['analytics', 'by-subject', days],
    queryFn:   () => api.analytics.bySubject(days),
    staleTime: 60_000,
  })
}
```

- [ ] **Step 4: Run admin tests + typecheck**

```bash
cd admin && npx vitest run 2>&1 | tail -5 && npx tsc --noEmit 2>&1 | grep -v "AppLayout" | tail -3
```

Expected: all tests pass, 0 type errors (AppLayout exempt).

- [ ] **Step 5: Commit**

```bash
cd ..
git add admin/src/types.ts admin/src/api.ts admin/src/hooks/useAnalytics.ts
git commit -m "feat(admin): analytics types, API methods, and React Query hooks"
```

---

## Task 8: DashboardPage — replace mocks with real data

**Files:**
- Modify: `admin/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Replace DashboardPage.tsx entirely**

Replace the entire contents of `admin/src/pages/DashboardPage.tsx` with:

```tsx
import { useState } from 'react'
import { useOrganization } from '@clerk/react'
import { useQuery } from '@tanstack/react-query'
import {
  useAnalyticsSummary, useAnalyticsDaily, useAnalyticsIncidents,
  useAnalyticsTopSites, useAnalyticsBySubject,
} from '../hooks/useAnalytics'
import { api } from '../api'

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function StatusBadge({ status }: { status: string }) {
  const isBlocked = status === 'block'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
      background: isBlocked ? 'rgba(224,48,80,0.12)' : 'rgba(204,136,0,0.12)',
      color: isBlocked ? 'var(--status-danger)' : 'var(--status-warn)',
    }}>
      {isBlocked ? 'BLOCKED' : 'WARNED'}
    </span>
  )
}

export function DashboardPage() {
  const { organization } = useOrganization()
  const [days, setDays] = useState<7 | 30 | 90>(30)

  const { data: summary, isLoading: summaryLoading } = useAnalyticsSummary(days)
  const { data: daily = [] }                          = useAnalyticsDaily()
  const { data: incidents = [], isLoading: incidentsLoading } = useAnalyticsIncidents()
  const { data: topSites = [] }                       = useAnalyticsTopSites(days)
  const { data: bySubject = [] }                      = useAnalyticsBySubject(days)
  const { data: policyInfo }                          = useQuery({
    queryKey: ['policy'], queryFn: api.policy.get, staleTime: 60_000,
  })

  const maxChart = Math.max(...daily.map(d => d.blocked + d.warned), 10)
  const dash = (v: number | undefined) => summaryLoading ? '—' : (v ?? 0).toLocaleString()

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 14, minHeight: '100%' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: 'var(--text-primary)' }}>Dashboard</h1>
          <p style={{ margin: '3px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>
            Last {days} days · {organization?.name ?? 'All teams'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([7, 30, 90] as const).map(d => (
            <button key={d} onClick={() => setDays(d)} style={{
              padding: '4px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
              background: days === d ? 'var(--brand-primary)' : 'var(--bg-surface-raised)',
              color: days === d ? '#fff' : 'var(--text-muted)',
            }}>{d}d</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Prompts Scanned',  value: dash(summary?.scansTotal),    sub: `${dash(summary?.activeUsers)} active users`,       subColor: 'var(--brand-primary)' },
          { label: 'Threats Blocked',  value: dash(summary?.blocked),        sub: `+ ${dash(summary?.warned)} warned`,                 subColor: 'var(--status-danger)', valColor: 'var(--status-danger)' },
          { label: 'Active Users',     value: dash(summary?.activeUsers),    sub: `of ${dash(summary?.totalMembers)} members`,          subColor: 'var(--brand-primary)' },
          { label: 'Active Rules',     value: dash(summary?.activeRulesCount), sub: 'rules enforced',                                  subColor: 'var(--text-muted)', valColor: 'var(--brand-primary)' },
        ].map(({ label, value, sub, subColor, valColor }) => (
          <div key={label} style={{ background: 'var(--bg-surface)', borderRadius: 10, padding: 16, border: '1px solid var(--border)' }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
            <div style={{ color: valColor ?? 'var(--text-primary)', fontSize: 26, fontWeight: 700, margin: '6px 0 4px', lineHeight: 1 }}>{value}</div>
            <div style={{ color: subColor, fontSize: 10 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Activity chart — always last 7 days */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>Threat Activity — Last 7 Days</span>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['var(--status-danger)', 'Blocked'], ['var(--status-warn)', 'Warned']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'flex-end', gap: 8, height: 120 }}>
          {(daily.length ? daily : Array.from({ length: 7 }, (_, i) => ({ day: '', date: '', blocked: 0, warned: 0, scanned: 0 }))).map(({ day, blocked, warned }, i) => {
            const blockedH = Math.round((blocked / maxChart) * 80)
            const warnedH  = Math.round((warned  / maxChart) * 80)
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                <div style={{ width: '50%', display: 'flex', flexDirection: 'column', gap: 1, alignItems: 'center' }}>
                  <div style={{ width: '100%', height: warnedH,  background: 'var(--status-warn)',   borderRadius: '2px 2px 0 0' }}/>
                  <div style={{ width: '100%', height: blockedH, background: 'var(--status-danger)', borderRadius: '0 0 2px 2px' }}/>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 6 }}>{day}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, flex: 1 }}>

        {/* Incidents table */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>Recent Incidents</span>
          </div>
          <div style={{ padding: '6px 16px', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8, background: 'var(--bg-surface-raised)', borderBottom: '1px solid var(--border)' }}>
            {['User', 'Subject', 'Status', 'When'].map(h => (
              <span key={h} style={{ color: 'var(--text-muted)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</span>
            ))}
          </div>
          {incidentsLoading ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
          ) : incidents.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No incidents recorded — set a report level above None on any rule to start collecting data
            </div>
          ) : (
            incidents.map((row, i) => (
              <div key={row.id} style={{ padding: '9px 16px', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8, alignItems: 'center', borderBottom: i < incidents.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{row.memberEmail ?? 'Anonymous'}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{row.subjectName}</span>
                <StatusBadge status={row.action} />
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{timeAgo(row.occurredAt)}</span>
              </div>
            ))
          )}
        </div>

        {/* Right widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Threat breakdown */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>Threat Breakdown</span>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bySubject.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>No data yet</span>
              ) : bySubject.map(({ subjectName, pct }, i) => {
                const colors = ['var(--status-danger)', 'var(--status-warn)', 'var(--brand-primary)', 'var(--text-muted)', 'var(--border)']
                return (
                  <div key={subjectName}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{subjectName}</span>
                      <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--bg-surface-raised)', borderRadius: 3 }}>
                      <div style={{ width: `${pct}%`, height: '100%', background: colors[i % colors.length], borderRadius: 3 }}/>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Top sites + Policy health */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Top Sites</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topSites.length === 0 ? (
                  <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>No data yet</span>
                ) : topSites.map(({ domain, count }, i) => {
                  const colors = ['var(--brand-primary)', 'var(--text-muted)', 'var(--border)', 'var(--status-warn)', 'var(--status-safe)']
                  return (
                    <div key={domain} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: colors[i % colors.length] }}/>
                        <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{domain}</span>
                      </div>
                      <span style={{ color: 'var(--text-primary)', fontSize: 10, fontWeight: 600 }}>{count.toLocaleString()}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Policy Health</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { label: 'Members',      val: dash(summary?.totalMembers),     color: 'var(--brand-primary)' },
                  { label: 'Active rules', val: dash(summary?.activeRulesCount), color: 'var(--brand-primary)' },
                  { label: 'Policy',       val: policyInfo ? `v${policyInfo.version}` : '—', color: 'var(--status-safe)' },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{label}</span>
                    <span style={{ background: color === 'var(--status-safe)' ? 'transparent' : 'rgba(0,212,255,0.12)', color, fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run admin tests + typecheck**

```bash
cd admin && npx vitest run 2>&1 | tail -5 && npx tsc --noEmit 2>&1 | grep -v "AppLayout" | tail -3
```

Expected: all tests pass, 0 type errors (AppLayout exempt).

- [ ] **Step 3: Commit**

```bash
cd ..
git add admin/src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): replace all mock data with real analytics queries"
```

---

## Task 9: Full verification

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
cd "c:/Users/yarin/Documents/code/prompt-saviour" && npx tsc --noEmit 2>&1 | grep -v "theme.test.ts" | tail -3
cd backend && npx tsc --noEmit 2>&1 | tail -3
cd ../admin && npx tsc --noEmit 2>&1 | grep -v "AppLayout" | tail -3
```

Expected: 0 errors each.
