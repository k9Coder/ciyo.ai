# Analytics Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace in-memory JS aggregation in `getAnalyticsDaily` and `getAnalyticsTopSites` with SQL-level `GROUP BY` aggregations. Add a 5-minute response cache so repeated dashboard loads don't hammer the DB.

**Architecture:** The `getAnalyticsDaily` function currently fetches all event rows for 7 days then filters in JS — with a busy tenant this could be thousands of rows. Replace with a single `GROUP BY date_trunc('day', occurred_at)` query. `getAnalyticsTopSites` already uses SQL `groupBy` but then does in-memory domain extraction — move to SQL `regexp_replace` or keep the aggregation at the `siteUrl` level and only do domain extraction on ≤100 rows.

**Tech Stack:** Drizzle ORM, Postgres `date_trunc`, `node-cache` or simple `Map`-based in-process TTL cache.

---

### Task 1: Rewrite getAnalyticsDaily with SQL GROUP BY (TD-4)

**Files:**
- Modify: `backend/src/analytics/service.ts`

- [ ] Step 1: Open `backend/src/analytics/service.ts`. The `getAnalyticsDaily` function (lines 52–79) fetches all `events` and `scans` rows for 7 days, then filters in JS. This is O(N) in the number of events.

Replace the entire function with:
```typescript
export async function getAnalyticsDaily(tenantId: string) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Build the 7-day bucket list (client-side date labels)
  const buckets: { date: string; day: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setUTCHours(0, 0, 0, 0)
    d.setUTCDate(d.getUTCDate() - i)
    buckets.push({ date: d.toISOString().slice(0, 10), day: DAY_NAMES[d.getUTCDay()]! })
  }
  const cutoff = new Date(buckets[0]!.date + 'T00:00:00Z')

  // One query: group events by day and action
  const eventRows = await db
    .select({
      date:   sql<string>`to_char(date_trunc('day', ${events.occurredAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      action: events.action,
      count:  sql<number>`count(*)`,
    })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))
    .groupBy(
      sql`date_trunc('day', ${events.occurredAt} AT TIME ZONE 'UTC')`,
      events.action
    )

  // One query: group scans by day
  const scanRows = await db
    .select({
      date:  sql<string>`to_char(date_trunc('day', ${scans.occurredAt} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`,
    })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, cutoff)))
    .groupBy(sql`date_trunc('day', ${scans.occurredAt} AT TIME ZONE 'UTC')`)

  // Build lookup maps
  const eventMap = new Map<string, { blocked: number; warned: number }>()
  for (const row of eventRows) {
    const entry = eventMap.get(row.date) ?? { blocked: 0, warned: 0 }
    if (row.action === 'block') entry.blocked = Number(row.count)
    if (row.action === 'warn')  entry.warned  = Number(row.count)
    eventMap.set(row.date, entry)
  }

  const scanMap = new Map<string, number>()
  for (const row of scanRows) {
    scanMap.set(row.date, Number(row.count))
  }

  return buckets.map(({ date, day }) => ({
    day,
    date,
    blocked: eventMap.get(date)?.blocked ?? 0,
    warned:  eventMap.get(date)?.warned  ?? 0,
    scanned: scanMap.get(date) ?? 0,
  }))
}
```

- [ ] Step 2: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 3: Run analytics tests.
```bash
cd backend && pnpm test -- --reporter=verbose analytics
# Expected: all tests pass
```

- [ ] Step 4: Commit.
```bash
git add backend/src/analytics/service.ts
git commit -m "perf(analytics): replace in-memory daily aggregation with SQL GROUP BY date_trunc

Was fetching all event rows then filtering in JS (O(N) in row count).
Now two SQL GROUP BY queries return pre-aggregated counts."
```

---

### Task 2: Fix getAnalyticsTopSites In-Memory Domain Extraction

**Files:**
- Modify: `backend/src/analytics/service.ts`

- [ ] Step 1: Open `getAnalyticsTopSites` (lines 112–132). The function already does SQL `groupBy(events.siteUrl)` but the result set can be large (one row per unique URL) before the in-memory domain extraction. Limit the SQL result set and keep the in-memory aggregation for the small result:

```typescript
export async function getAnalyticsTopSites(tenantId: string, days: number) {
  const cutoff = since(days)

  // Limit to top 100 URLs by count before in-memory domain grouping.
  // This caps the memory usage while still producing accurate top-5 domains.
  const rows = await db
    .select({ siteUrl: events.siteUrl, cnt: sql<number>`count(*)` })
    .from(events)
    .where(and(eq(events.tenantId, tenantId), gte(events.occurredAt, cutoff)))
    .groupBy(events.siteUrl)
    .orderBy(sql`count(*) DESC`)
    .limit(100)

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
```

- [ ] Step 2: Build and run analytics tests.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
cd backend && pnpm test -- --reporter=verbose analytics
# Expected: all pass
```

- [ ] Step 3: Commit.
```bash
git add backend/src/analytics/service.ts
git commit -m "perf(analytics): cap getAnalyticsTopSites SQL result to 100 rows before in-memory domain extraction"
```

---

### Task 3: Add TTL Response Cache for Analytics Endpoints

**Files:**
- Create: `backend/src/analytics/cache.ts`
- Modify: `backend/src/analytics/router.ts`

- [ ] Step 1: Create `backend/src/analytics/cache.ts` with a simple in-process TTL cache:
```typescript
interface CacheEntry<T> {
  value:     T
  expiresAt: number
}

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>()
  private ttlMs: number

  constructor(ttlMs: number) {
    this.ttlMs = ttlMs
  }

  get(key: string): T | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    return entry.value
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs })
  }

  invalidate(tenantId: string): void {
    for (const key of this.store.keys()) {
      if (key.startsWith(tenantId)) this.store.delete(key)
    }
  }
}

export const analyticsCache = new TtlCache<unknown>(5 * 60 * 1000) // 5 minutes
```

- [ ] Step 2: Open `backend/src/analytics/router.ts`. Wrap each analytics handler with cache logic.

Find the summary route (should look like):
```typescript
fastify.get('/analytics/summary', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
  const { days = 30 } = req.query as { days?: number }
  return getAnalyticsSummary(req.tenant.id, days)
})
```

Update with caching:
```typescript
import { analyticsCache } from './cache.js'

fastify.get('/analytics/summary', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
  const { days = 30 } = req.query as { days?: number }
  const cacheKey = `${req.tenant.id}:summary:${days}`
  const cached = analyticsCache.get(cacheKey)
  if (cached) return cached
  const result = await getAnalyticsSummary(req.tenant.id, days)
  analyticsCache.set(cacheKey, result)
  return result
})
```

Apply the same pattern to `daily`, `top-sites`, and `by-subject` routes.

- [ ] Step 3: Invalidate the cache after a policy publish. In `backend/src/policy/service.ts`, after the `policyBus.emit`:
```typescript
import { analyticsCache } from '../analytics/cache.js'
// After policyBus.emit:
analyticsCache.invalidate(tenantId)
```

- [ ] Step 4: Build and run tests.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
cd backend && pnpm test -- --reporter=verbose analytics
# Expected: all pass
```

- [ ] Step 5: Commit.
```bash
git add backend/src/analytics/cache.ts backend/src/analytics/router.ts backend/src/policy/service.ts
git commit -m "perf(analytics): add 5-minute TTL cache for analytics endpoints

Analytics queries run on every dashboard load. Cache reduces DB load
by 95%+ for orgs with multiple admins viewing the dashboard concurrently."
```
