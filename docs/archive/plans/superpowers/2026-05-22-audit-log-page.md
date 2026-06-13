# Audit Log Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a paginated Audit Log page showing every detection event across the organisation, with action filtering and cursor-based pagination.

**Architecture:** The `events` table in PostgreSQL stores every detection (ruleId, memberId, action, siteUrl, matchedTerm, occurredAt). Currently only `GET /v1/analytics/incidents` exposes events — it's capped at 20 rows, has no pagination, and no filtering. This plan adds a dedicated `GET /v1/audit-log` endpoint with cursor-based pagination (`before` timestamp) and optional `action` filter. The frontend uses `useInfiniteQuery` with a "Load more" button.

**Tech Stack:** Drizzle ORM + PostgreSQL (backend), React 18 + @tanstack/react-query v5 `useInfiniteQuery` (admin), Vitest + Supertest (backend tests)

---

### Task 1: Backend — audit log service

**Files:**
- Create: `backend/src/audit-log/service.ts`
- Test: `backend/tests/audit-log.test.ts` (partially — write & run this test first to drive the implementation)

- [ ] **Step 1: Write the failing test in `backend/tests/audit-log.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { subjects, rules, events } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let adminToken: string
let ruleId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  adminToken = t.adminToken

  const [subj] = await db.insert(subjects)
    .values({ tenantId, name: 'API Keys', active: true })
    .returning({ id: subjects.id })

  const [rule] = await db.insert(rules)
    .values({ tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['key'], action: 'block', reportLevel: 'medium' })
    .returning({ id: rules.id })
  ruleId = rule!.id
})
afterAll(async () => { await app.close() })

describe('GET /v1/audit-log', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/audit-log')
    expect(res.status).toBe(401)
  })

  it('returns empty entries for a new tenant', async () => {
    const res = await supertest(app.server)
      .get('/v1/audit-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toEqual([])
    expect(res.body.nextBefore).toBeNull()
  })

  it('returns entries with correct shape', async () => {
    await db.insert(events).values({ tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com', matchedTerm: 'secret' })
    const res = await supertest(app.server)
      .get('/v1/audit-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    const e = res.body.entries[0]
    expect(e).toMatchObject({
      subjectName: 'API Keys',
      ruleKind: 'keyword',
      action: 'block',
      siteUrl: 'https://chatgpt.com',
      matchedTerm: 'secret',
      memberEmail: null,
    })
    expect(typeof e.occurredAt).toBe('string')
  })

  it('paginates: limit=2 returns nextBefore when more exist', async () => {
    const vals = Array.from({ length: 3 }, (_, i) => ({
      tenantId, ruleId, action: 'warn' as const, siteUrl: `https://site${i}.com`,
    }))
    await db.insert(events).values(vals)
    const res = await supertest(app.server)
      .get('/v1/audit-log?limit=2')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(2)
    expect(res.body.nextBefore).not.toBeNull()
  })

  it('filters by action=warn', async () => {
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://a.com' },
      { tenantId, ruleId, action: 'warn',  siteUrl: 'https://b.com' },
    ])
    const res = await supertest(app.server)
      .get('/v1/audit-log?action=warn')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    expect(res.body.entries[0].action).toBe('warn')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx vitest run tests/audit-log.test.ts
```

Expected: all tests fail with 404 or similar (route does not exist yet).

- [ ] **Step 3: Create `backend/src/audit-log/service.ts`**

```ts
import { and, desc, eq, lt } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, members, rules, subjects } from '../db/schema.js'

export interface AuditLogEntry {
  id:          string
  memberEmail: string | null
  subjectName: string
  ruleKind:    string
  action:      'warn' | 'block'
  siteUrl:     string
  matchedTerm: string | null
  occurredAt:  string
}

export interface AuditLogPage {
  entries:    AuditLogEntry[]
  nextBefore: string | null
}

export async function getAuditLog(
  tenantId: string,
  opts: { limit: number; before?: Date; action?: 'warn' | 'block' }
): Promise<AuditLogPage> {
  const conditions = [eq(events.tenantId, tenantId)]
  if (opts.before) conditions.push(lt(events.occurredAt, opts.before))
  if (opts.action) conditions.push(eq(events.action, opts.action))

  // Fetch one extra row to detect whether another page exists.
  const rows = await db
    .select({
      id:          events.id,
      memberEmail: members.email,
      subjectName: subjects.name,
      ruleKind:    rules.kind,
      action:      events.action,
      siteUrl:     events.siteUrl,
      matchedTerm: events.matchedTerm,
      occurredAt:  events.occurredAt,
    })
    .from(events)
    .leftJoin(members,   eq(events.memberId,  members.id))
    .innerJoin(rules,    eq(events.ruleId,    rules.id))
    .innerJoin(subjects, eq(rules.subjectId,  subjects.id))
    .where(and(...conditions))
    .orderBy(desc(events.occurredAt))
    .limit(opts.limit + 1)

  const hasMore = rows.length > opts.limit
  const page    = rows.slice(0, opts.limit)

  return {
    entries: page.map(r => ({
      id:          r.id,
      memberEmail: r.memberEmail ?? null,
      subjectName: r.subjectName,
      ruleKind:    r.ruleKind,
      action:      r.action,
      siteUrl:     r.siteUrl,
      matchedTerm: r.matchedTerm ?? null,
      occurredAt:  r.occurredAt.toISOString(),
    })),
    nextBefore: hasMore ? page[page.length - 1]!.occurredAt.toISOString() : null,
  }
}
```

- [ ] **Step 4: Run the service-level tests (they'll still fail — router not registered yet)**

```bash
cd backend && npx vitest run tests/audit-log.test.ts
```

Expected: same failures (404). Continue to Task 2.

---

### Task 2: Backend — audit log router and registration

**Files:**
- Create: `backend/src/audit-log/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create `backend/src/audit-log/router.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { getAuditLog } from './service.js'

const MAX_LIMIT = 100
const DEFAULT_LIMIT = 50

export async function auditLogRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/audit-log', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const q = req.query as Record<string, string>

    const rawLimit = parseInt(q['limit'] ?? String(DEFAULT_LIMIT), 10)
    const limit    = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT)

    const before = q['before'] ? new Date(q['before']) : undefined
    if (before && isNaN(before.getTime())) {
      return reply.status(400).send({ error: 'Invalid before date' })
    }

    const action = q['action'] as 'warn' | 'block' | undefined
    if (action && action !== 'warn' && action !== 'block') {
      return reply.status(400).send({ error: 'action must be warn or block' })
    }

    return getAuditLog(req.tenant.id, { limit, before, action })
  })
}
```

- [ ] **Step 2: Register the router in `backend/src/app.ts`**

Add the import (with the other router imports near the top):
```ts
import { auditLogRouter } from './audit-log/router.js'
```

Add the registration (inside `buildApp()`, alongside the other `app.register` calls):
```ts
void app.register(auditLogRouter, { prefix: '/v1' })
```

- [ ] **Step 3: Run the tests to verify they pass**

```bash
cd backend && npx vitest run tests/audit-log.test.ts
```

Expected: all 5 tests pass.

- [ ] **Step 4: Run the full test suite to check for regressions**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/audit-log/service.ts backend/src/audit-log/router.ts backend/src/app.ts backend/tests/audit-log.test.ts
git commit -m "feat(api): add GET /v1/audit-log with pagination and action filter"
```

---

### Task 3: Frontend — types, API client, hook

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`
- Create: `admin/src/hooks/useAuditLog.ts`

- [ ] **Step 1: Add `AuditLogEntry` and `AuditLogPage` to `admin/src/types.ts`**

Append at the end of the file:
```ts
export interface AuditLogEntry {
  id:          string
  memberEmail: string | null
  subjectName: string
  ruleKind:    string
  action:      'warn' | 'block'
  siteUrl:     string
  matchedTerm: string | null
  occurredAt:  string
}

export interface AuditLogPage {
  entries:    AuditLogEntry[]
  nextBefore: string | null
}
```

- [ ] **Step 2: Add `api.auditLog` to `admin/src/api.ts`**

Add the import of `AuditLogPage` to the import block at the top:
```ts
import type {
  Subject, Rule, Division, Team, Member,
  DestinationGroup, SiteConfig, PolicyInfo, PolicyHistoryEntry, TenantInfo,
  AnalyticsSummary, AnalyticsDailyEntry, AnalyticsIncident,
  AnalyticsTopSiteEntry, AnalyticsBySubjectEntry,
  AuditLogPage,
} from './types'
```

Add `auditLog` to the `api` object (after `analytics`):
```ts
  auditLog: {
    list: (opts?: { limit?: number; before?: string; action?: 'warn' | 'block' }) => {
      const params = new URLSearchParams()
      if (opts?.limit)  params.set('limit',  String(opts.limit))
      if (opts?.before) params.set('before', opts.before)
      if (opts?.action) params.set('action', opts.action)
      const qs = params.toString()
      return request<AuditLogPage>('GET', `/v1/audit-log${qs ? `?${qs}` : ''}`)
    },
  },
```

- [ ] **Step 3: Create `admin/src/hooks/useAuditLog.ts`**

```ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useAuditLog(action?: 'warn' | 'block') {
  return useInfiniteQuery({
    queryKey:        ['audit-log', action],
    queryFn:         ({ pageParam }) =>
      api.auditLog.list({ limit: 50, before: pageParam as string | undefined, action }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: last => last.nextBefore ?? undefined,
  })
}
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/types.ts admin/src/api.ts admin/src/hooks/useAuditLog.ts
git commit -m "feat(admin): add AuditLogEntry type, api.auditLog, and useAuditLog hook"
```

---

### Task 4: Frontend — AuditLogPage and route

**Files:**
- Create: `admin/src/pages/AuditLogPage.tsx`
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Create `admin/src/pages/AuditLogPage.tsx`**

```tsx
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { useAuditLog } from '../hooks/useAuditLog'

type ActionFilter = 'all' | 'warn' | 'block'

const ACTION_FILTER_LABELS: Record<ActionFilter, string> = {
  all:   'All',
  warn:  'Warned',
  block: 'Blocked',
}

export function AuditLogPage() {
  const [filter, setFilter] = useState<ActionFilter>('all')
  const {
    data, isLoading, isFetchingNextPage,
    hasNextPage, fetchNextPage,
  } = useAuditLog(filter === 'all' ? undefined : filter)

  const entries = data?.pages.flatMap(p => p.entries) ?? []

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: active ? 600 : 400,
    border: active ? '1px solid var(--brand-primary)' : '1px solid var(--border)',
    background: active ? 'var(--brand-dim, rgba(0,212,255,0.08))' : 'transparent',
    color: active ? 'var(--brand-primary)' : 'var(--text-muted)',
    cursor: 'pointer',
  })

  return (
    <div style={{ padding: '16px 24px' }}>
      <PageHeader title="Audit Log" />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {(['all', 'warn', 'block'] as ActionFilter[]).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={pillStyle(filter === f)}>
            {ACTION_FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {isLoading && (
          <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Loading…</p>
        )}
        {!isLoading && entries.length === 0 && (
          <p style={{ padding: 24, color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            No events recorded yet.
          </p>
        )}
        {entries.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Time', 'Member', 'Subject', 'Action', 'Site', 'Matched'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    color: 'var(--text-muted)', fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 11, whiteSpace: 'nowrap' }}>
                    {new Date(e.occurredAt).toLocaleString()}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)' }}>
                    {e.memberEmail ?? <span style={{ color: 'var(--text-muted)' }}>anonymous</span>}
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {e.subjectName}
                  </td>
                  <td style={{ padding: '10px 16px' }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase',
                      background: e.action === 'block' ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                      color:      e.action === 'block' ? 'var(--status-danger)' : 'var(--status-warn)',
                    }}>
                      {e.action}
                    </span>
                  </td>
                  <td style={{ padding: '10px 16px', color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(() => { try { return new URL(e.siteUrl).hostname } catch { return e.siteUrl } })()}
                  </td>
                  <td style={{ padding: '10px 16px', fontFamily: 'monospace', fontSize: 11, color: 'var(--text-muted)' }}>
                    {e.matchedTerm ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {hasNextPage && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
            <button
              onClick={() => void fetchNextPage()}
              disabled={isFetchingNextPage}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                padding: '6px 16px', fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)',
              }}
            >
              {isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add route to `admin/src/App.tsx`**

Add import with the other page imports:
```tsx
import { AuditLogPage } from './pages/AuditLogPage'
```

Add route inside the authenticated block (after `/members`):
```tsx
<Route path="/audit" element={<AuditLogPage />} />
```

- [ ] **Step 3: Start admin dev server and verify**

```bash
cd admin && npm run dev
```

Navigate to `http://localhost:5173/audit`. Verify:
1. Sidebar "Audit Log" link is active
2. "All / Warned / Blocked" filter pills work
3. Table renders events (or "No events recorded yet" if empty)
4. If more than 50 events exist, "Load more" button appears and loads the next page

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/AuditLogPage.tsx admin/src/App.tsx
git commit -m "feat(admin): add AuditLogPage with action filter and pagination"
```
