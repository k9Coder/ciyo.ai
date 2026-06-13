# Live Dashboard (Sub-project B) — Design

**Date:** 2026-05-21
**Status:** Approved
**Blocked by:** Sub-project A (analytics pipeline) — must ship first
**Blocks:** Nothing

## Summary

Replace all mock data in `DashboardPage.tsx` with real queries. Adds a `scans` table + `POST /v1/scans` endpoint so the extension can count every prompt submission (giving real "Prompts Scanned" and "Active Users"). Adds five read-only analytics endpoints the admin panel queries per widget. A time range selector (7d / 30d / 90d) on the dashboard controls the stats cards and most widgets; the activity chart always shows the last 7 days at daily granularity.

---

## 1. DB — New `scans` Table

```
scans
  id         uuid PK defaultRandom
  tenantId   uuid FK → tenants.id
  memberId   uuid FK → members.id  NULLABLE
  occurredAt timestamp with time zone defaultNow
```

Index: `(tenantId, occurredAt)` — mirrors the events table index pattern.

Migration: `ALTER TABLE` not needed for existing tables. Just `CREATE TABLE scans` + index.

---

## 2. Extension — Scan Dispatch

After every detection (regardless of findings or reportLevel), fire-and-forget `POST /v1/scans`.

**New file:** `src/scans/dispatch.ts`
- Same auth pattern as `src/events/dispatch.ts` (check `clerkSessionToken`, then `managed.orgToken`, then `local.orgToken`)
- No request body — tenant and member are resolved server-side from the JWT
- Swallows errors silently

**Modify:** `src/background/service-worker.ts`
- Add `void dispatchScan()` after `void dispatchEvents(result, hostname)` in the DETECT case — no arguments needed since no body is sent

---

## 3. Backend — `POST /v1/scans`

Auth: `requireOrgTokenOrClerkAuth`

No request body. Resolves `tenantId` from `req.tenant.id`, `memberId` from `req.member?.id ?? null`. Inserts one row into `scans`. Always returns `204`.

**New files:**
- `backend/src/scans/service.ts` — `recordScan(tenantId, memberId)`
- `backend/src/scans/router.ts` — `POST /scans`
- Register in `backend/src/app.ts`

---

## 4. Backend — Analytics Read Endpoints

All five endpoints:
- Auth: `requireAdminTokenOrClerkAdmin`
- Live in `backend/src/analytics/service.ts` + `backend/src/analytics/router.ts`
- Registered at `/v1` prefix in `app.ts`

### `GET /v1/analytics/summary?days=30`

Query param `days`: `7 | 30 | 90`, default `30`.

Response:
```json
{
  "scansTotal":      48291,
  "blocked":         1042,
  "warned":          312,
  "activeUsers":     87,
  "totalMembers":    102,
  "activeRulesCount": 21
}
```

- `scansTotal` — `COUNT(*)` from `scans` WHERE `tenantId = ?` AND `occurredAt >= now() - days`
- `blocked` — `COUNT(*)` from `events` WHERE `tenantId = ?` AND `action = 'block'` AND `occurredAt >= now() - days`
- `warned` — same for `action = 'warn'`
- `activeUsers` — `COUNT(DISTINCT memberId)` from `scans` WHERE `tenantId = ?` AND `memberId IS NOT NULL` AND `occurredAt >= now() - days`
- `totalMembers` — `COUNT(*)` from `members` WHERE `tenantId = ?`
- `activeRulesCount` — `COUNT(*)` from `rules` WHERE `tenantId = ?` AND `active = true`

### `GET /v1/analytics/daily`

No query params. Always last 7 days, one entry per day.

Response:
```json
[
  { "day": "Mon", "date": "2026-05-15", "blocked": 22, "warned": 14, "scanned": 180 },
  { "day": "Tue", "date": "2026-05-16", "blocked": 32, "warned": 18, "scanned": 210 }
]
```

Implementation: generate an array of the last 7 calendar dates in the service layer, then query events + scans grouped by `DATE(occurredAt)`, left-join the results so days with zero activity still appear.

### `GET /v1/analytics/incidents`

No query params. Returns the 20 most recent events, newest first.

Response:
```json
[
  {
    "id":          "uuid",
    "memberEmail": "j.smith@acme.com",
    "subjectName": "API Keys",
    "ruleKind":    "keyword",
    "action":      "block",
    "siteUrl":     "https://chat.openai.com",
    "occurredAt":  "2026-05-21T14:00:00Z"
  }
]
```

- `memberEmail`: LEFT JOIN `events → members`. Null when `memberId` is null (minimal-level events) — frontend shows "Anonymous".
- `subjectName`: JOIN `events → rules → subjects`.
- `ruleKind`: from `rules.kind`.

### `GET /v1/analytics/top-sites?days=30`

Query param `days`: `7 | 30 | 90`, default `30`.

Response:
```json
[
  { "domain": "chatgpt.com", "count": 412 },
  { "domain": "claude.ai",   "count": 280 }
]
```

- Fetch `GROUP BY siteUrl`, `COUNT(*)` from `events` in the time window.
- In service code, normalise each `siteUrl` to hostname with `new URL(siteUrl).hostname`, re-aggregate counts, then take top 5 by count DESC.
- This avoids SQL string manipulation and keeps the query simple.

### `GET /v1/analytics/by-subject?days=30`

Query param `days`: `7 | 30 | 90`, default `30`.

Response:
```json
[
  { "subjectName": "API Keys", "count": 498, "pct": 48 },
  { "subjectName": "PII",      "count": 280, "pct": 27 }
]
```

- JOIN `events → rules → subjects`, GROUP BY `subjects.name`, `COUNT(*)`.
- Percentages computed in service code: `Math.round(count / total * 100)`.
- Returns at most 5 subjects ordered by count DESC.

---

## 5. Admin Frontend

### New files
- `admin/src/hooks/useAnalytics.ts` — five React Query hooks

### Modified files
- `admin/src/types.ts` — add analytics response types
- `admin/src/api.ts` — add `api.analytics.*` methods
- `admin/src/pages/DashboardPage.tsx` — replace all mocks, add time range selector

### Hooks

```ts
useAnalyticsSummary(days: 7 | 30 | 90)   // staleTime: 60s
useAnalyticsDaily()                        // staleTime: 60s
useAnalyticsIncidents()                    // staleTime: 30s
useAnalyticsTopSites(days: 7 | 30 | 90)   // staleTime: 60s
useAnalyticsBySubject(days: 7 | 30 | 90)  // staleTime: 60s
```

All hooks use the existing `api.analytics.*` methods and follow the same React Query pattern as `useRules`, `useSubjects`, etc.

### DashboardPage changes

- Add `days` state: `const [days, setDays] = useState<7 | 30 | 90>(30)`
- Time range selector at top-right: three pill buttons `7d / 30d / 90d`, updates `days`
- Delete all six `MOCK_*` constants
- Each widget replaced with hook data:
  - **Stats row** — `useAnalyticsSummary(days)` → scansTotal, blocked, warned, activeUsers/totalMembers, activeRulesCount
  - **Activity chart** — `useAnalyticsDaily()` (always 7 days, ignores `days` selector)
  - **Recent incidents** — `useAnalyticsIncidents()` — `memberEmail ?? 'Anonymous'`
  - **Threat breakdown** — `useAnalyticsBySubject(days)`
  - **Top sites** — `useAnalyticsTopSites(days)`
  - **Policy Health** — `activeRulesCount` from summary + `totalMembers` from summary + `api.policy.get()` for last publish time (existing call)
- **Loading state**: each widget shows a simple skeleton (grey placeholder rows/bars) while `isLoading`
- **Empty state** on incidents table: "No incidents recorded — set a report level above None on any rule to start collecting data"
- Chart title stays "Threat Activity — Last 7 Days" regardless of time range selector

---

## 6. Testing

**Backend (integration):**
- `backend/tests/scans.test.ts` — POST /v1/scans inserts row, 401 without auth
- `backend/tests/analytics.test.ts` — one test per endpoint; seed known events/scans, assert correct aggregates

**Extension:**
- `tests/unit/scans/dispatch.test.ts` — mock fetch + chrome.storage; assert POST fires after detection and is skipped when no token

**Admin:**
- No new component tests needed — hooks are thin wrappers; DashboardPage rendering is covered by existing Vitest + RTL setup if tests exist, otherwise manual verification

---

## Out of Scope

- Pagination on incidents (LIMIT 20 is sufficient for MVP)
- Date range picker (only 7d/30d/90d presets)
- Export / download of analytics data
- Per-member drill-down
- Retention policy or event purging
