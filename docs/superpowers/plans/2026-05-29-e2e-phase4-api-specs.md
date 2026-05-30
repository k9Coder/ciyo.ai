# E2E Coverage Phase 4 — Pure API Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover all remaining backend routes that have no UI path with pure API-level Playwright tests. No browser pages or UI interaction — only `request.newContext()` calls with bearer tokens from the seeded state.

**Architecture:** 
- A shared `e2e/helpers/org-headers.ts` provides the `orgHeaders()` helper (mirrors the existing `adminHeaders()` but uses `orgToken`).
- All specs live in `e2e/api/` and use `test.use({ storageState: undefined })` to prevent inheriting admin Clerk cookies.
- The `playwright.config.ts` `admin` project's `testMatch` already scopes to `e2e/admin/**` so the new `e2e/api/**` specs need their own project entry.

**Tech Stack:** Playwright `request.newContext()`, `adminHeaders()` + `orgHeaders()` helpers, seeded `adminToken` + `orgToken` from `getSeedState()`.

---

## File Map

| File | Change |
|------|--------|
| `playwright.config.ts` | Add `api` project targeting `e2e/api/**/*.spec.ts` |
| `e2e/helpers/org-headers.ts` | Create — mirrors adminHeaders but uses orgToken |
| `e2e/api/analytics.spec.ts` | Create — all 5 analytics endpoints |
| `e2e/api/policy.spec.ts` | Create — GET policy, version, history, rollback, unauthenticated |
| `e2e/api/members-import.spec.ts` | Create — batch member import and validation |
| `e2e/api/join.spec.ts` | Create — auth join with valid/invalid token, idempotency |

---

### Task 1: Add `api` Playwright project

**Files:**
- Modify: `playwright.config.ts`

The existing `admin` project matches `e2e/admin/**/*.spec.ts`. The `api` specs have no browser UI and no Clerk auth, so they use a minimal config.

- [ ] **Step 1: Add the project entry**

Open `playwright.config.ts`. In the `projects` array, append:

```ts
{
  name: 'api',
  use: { ...devices['Desktop Chrome'] },
  testMatch: 'e2e/api/**/*.spec.ts',
},
```

The full `projects` array should now have 4 entries: `admin-setup`, `admin`, `extension`, `api`.

- [ ] **Step 2: Verify config is valid**

```
pnpm exec playwright test --list --project=api
```

Expected: no errors, empty test list (no api specs yet).

- [ ] **Step 3: Commit**

```
git add playwright.config.ts
git commit -m "test(e2e): add api Playwright project for pure-API specs"
```

---

### Task 2: `orgHeaders()` helper

**Files:**
- Create: `e2e/helpers/org-headers.ts`

- [ ] **Step 1: Create the file**

```ts
import { getSeedState } from './seed-state.js'

export function orgHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().orgToken}` }
}
```

- [ ] **Step 2: Verify it compiles (TypeScript will pick it up on next test run — no separate step needed)**

- [ ] **Step 3: Commit**

```
git add e2e/helpers/org-headers.ts
git commit -m "test(e2e): add orgHeaders helper for org-token API calls"
```

---

### Task 3: Analytics API spec

**Files:**
- Create: `e2e/api/analytics.spec.ts`

All 5 analytics endpoints: `summary`, `daily`, `incidents`, `top-sites`, `by-subject`. Tests assert HTTP 200 and the response shape. Values may be zero since the seeded events are deleted by `globalTeardown` (or present if Phase 2's seed events exist).

- [ ] **Step 1: Create the file**

```ts
import { test, expect, request } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BASE = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Analytics API', () => {
  let api: Awaited<ReturnType<typeof request.newContext>>

  test.beforeAll(async () => { api = await request.newContext() })
  test.afterAll(async ()  => { await api.dispose() })

  test('GET /v1/analytics/summary returns expected shape', async () => {
    const res  = await api.get(`${BASE}/v1/analytics/summary`, { headers: adminHeaders() })
    expect(res.status()).toBe(200)

    const body = await res.json() as Record<string, number>
    expect(typeof body.scansTotal).toBe('number')
    expect(typeof body.blocked).toBe('number')
    expect(typeof body.warned).toBe('number')
    expect(typeof body.activeUsers).toBe('number')
    expect(typeof body.totalMembers).toBe('number')
    expect(typeof body.activeRulesCount).toBe('number')
  })

  test('GET /v1/analytics/summary?days=7 accepts days param', async () => {
    const res = await api.get(`${BASE}/v1/analytics/summary?days=7`, { headers: adminHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, number>
    expect(typeof body.blocked).toBe('number')
  })

  test('GET /v1/analytics/daily returns array of { date, count }', async () => {
    const res  = await api.get(`${BASE}/v1/analytics/daily`, { headers: adminHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  test('GET /v1/analytics/incidents returns array', async () => {
    const res  = await api.get(`${BASE}/v1/analytics/incidents`, { headers: adminHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  test('GET /v1/analytics/top-sites returns array', async () => {
    const res  = await api.get(`${BASE}/v1/analytics/top-sites`, { headers: adminHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  test('GET /v1/analytics/by-subject returns array', async () => {
    const res  = await api.get(`${BASE}/v1/analytics/by-subject`, { headers: adminHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
  })

  test('unauthenticated request returns 401', async () => {
    const res = await api.get(`${BASE}/v1/analytics/summary`)
    expect(res.status()).toBe(401)
  })
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=api e2e/api/analytics.spec.ts
```

Expected: 7 passed.

- [ ] **Step 3: Commit**

```
git add e2e/api/analytics.spec.ts
git commit -m "test(e2e): add analytics API spec — all 5 endpoints + unauth guard"
```

---

### Task 4: Policy API spec

**Files:**
- Create: `e2e/api/policy.spec.ts`

Covers `GET /policy`, `GET /policy/version`, `GET /policy/history`, `POST /policy/rollback/:version`, and unauthenticated access.

- [ ] **Step 1: Create the file**

```ts
import { test, expect, request } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'
import { orgHeaders } from '../helpers/org-headers.js'

const BASE = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Policy API', () => {
  let api: Awaited<ReturnType<typeof request.newContext>>

  test.beforeAll(async () => { api = await request.newContext() })
  test.afterAll(async ()  => { await api.dispose() })

  test('GET /v1/policy/version returns current version', async () => {
    const res  = await api.get(`${BASE}/v1/policy/version`, { headers: orgHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as { version: number }
    expect(typeof body.version).toBe('number')
    expect(body.version).toBeGreaterThanOrEqual(1)
  })

  test('GET /v1/policy returns full policy document', async () => {
    const res  = await api.get(`${BASE}/v1/policy`, { headers: orgHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toHaveProperty('version')
    expect(body).toHaveProperty('policy')
    expect(body).toHaveProperty('tenantName', 'E2E Test Org')
  })

  test('GET /v1/policy without token returns 401', async () => {
    const res = await api.get(`${BASE}/v1/policy`)
    expect(res.status()).toBe(401)
  })

  test('GET /v1/policy/history returns array of published versions', async () => {
    const res  = await api.get(`${BASE}/v1/policy/history`, { headers: adminHeaders() })
    expect(res.status()).toBe(200)
    const body = await res.json() as Array<{ version: number; publishedAt: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
    expect(typeof body[0]!.version).toBe('number')
    expect(typeof body[0]!.publishedAt).toBe('string')
  })

  test('POST /v1/policy/rollback/:version creates a new version with old content', async () => {
    // Publish twice to ensure there is a v1 and v2 to roll back from
    await api.post(`${BASE}/v1/policy/publish`, { headers: adminHeaders() })
    await api.post(`${BASE}/v1/policy/publish`, { headers: adminHeaders() })

    const beforeRes = await api.get(`${BASE}/v1/policy/version`, { headers: orgHeaders() })
    const { version: before } = await beforeRes.json() as { version: number }

    // Roll back to version 1
    const rollRes = await api.post(`${BASE}/v1/policy/rollback/1`, { headers: adminHeaders() })
    expect(rollRes.status()).toBe(200)
    const { version: rolled } = await rollRes.json() as { version: number }

    // The new version is higher than before (rollback publishes a new snapshot)
    expect(rolled).toBeGreaterThan(before)

    // The current version endpoint reflects the new value
    const afterRes = await api.get(`${BASE}/v1/policy/version`, { headers: orgHeaders() })
    const { version: after } = await afterRes.json() as { version: number }
    expect(after).toBe(rolled)
  })

  test('POST /v1/policy/rollback with non-existent version returns 404', async () => {
    const res = await api.post(`${BASE}/v1/policy/rollback/99999`, { headers: adminHeaders() })
    expect(res.status()).toBe(404)
  })
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=api e2e/api/policy.spec.ts
```

Expected: 6 passed.

- [ ] **Step 3: Commit**

```
git add e2e/api/policy.spec.ts
git commit -m "test(e2e): add policy API spec — version, policy doc, history, rollback"
```

---

### Task 5: Members import API spec

**Files:**
- Create: `e2e/api/members-import.spec.ts`

The import endpoint is `POST /v1/members/import` and expects `{ rows: Array<{ email: string; displayName?: string }> }` — JSON, not CSV.

- [ ] **Step 1: Create the file**

```ts
import { test, expect, request } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BASE = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Members import API', () => {
  let api: Awaited<ReturnType<typeof request.newContext>>
  const importedEmails: string[] = []

  test.beforeAll(async () => { api = await request.newContext() })

  test.afterAll(async () => {
    // Cleanup all members created during this describe block
    if (importedEmails.length === 0) { await api.dispose(); return }

    const res     = await api.get(`${BASE}/v1/members`, { headers: adminHeaders() })
    const members = await res.json() as Array<{ id: string; email: string }>

    for (const email of importedEmails) {
      const m = members.find(x => x.email === email)
      if (m) await api.delete(`${BASE}/v1/members/${m.id}`, { headers: adminHeaders() })
    }
    await api.dispose()
  })

  test('POST /v1/members/import creates all supplied rows', async () => {
    const rows = [
      { email: 'import-e2e-1@example.com', displayName: 'Import One' },
      { email: 'import-e2e-2@example.com', displayName: 'Import Two' },
    ]
    importedEmails.push(...rows.map(r => r.email))

    const res  = await api.post(`${BASE}/v1/members/import`, {
      headers: adminHeaders(),
      data:    { rows },
    })
    expect(res.status()).toBe(201)

    const body = await res.json() as Array<{ email: string }>
    const emails = body.map(m => m.email)
    expect(emails).toContain('import-e2e-1@example.com')
    expect(emails).toContain('import-e2e-2@example.com')
  })

  test('POST /v1/members/import with empty rows returns 201 with empty array', async () => {
    const res  = await api.post(`${BASE}/v1/members/import`, {
      headers: adminHeaders(),
      data:    { rows: [] },
    })
    expect(res.status()).toBe(201)
    const body = await res.json() as unknown[]
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(0)
  })

  test('POST /v1/members/import with duplicate email returns 201 without duplicate', async () => {
    const email = 'import-e2e-1@example.com' // already imported in the first test
    const res   = await api.post(`${BASE}/v1/members/import`, {
      headers: adminHeaders(),
      data:    { rows: [{ email }] },
    })
    // The endpoint should either skip duplicates (201) or return a conflict (409)
    // Accept either — the key assertion is the member list has exactly one entry for this email
    expect([200, 201, 409]).toContain(res.status())

    const listRes = await api.get(`${BASE}/v1/members`, { headers: adminHeaders() })
    const members = await listRes.json() as Array<{ email: string }>
    const count   = members.filter(m => m.email === email).length
    expect(count).toBe(1)
  })

  test('unauthenticated import returns 401', async () => {
    const res = await api.post(`${BASE}/v1/members/import`, {
      data: { rows: [{ email: 'no-auth@example.com' }] },
    })
    expect(res.status()).toBe(401)
  })
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=api e2e/api/members-import.spec.ts
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```
git add e2e/api/members-import.spec.ts
git commit -m "test(e2e): add members-import API spec — batch create, empty, duplicate, unauth"
```

---

### Task 6: Auth join API spec

**Files:**
- Create: `e2e/api/join.spec.ts`

`POST /v1/auth/join` is the extension join-code flow. It uses the org token (not admin token) and accepts `{ email }`. It creates the member if new, or returns the existing member if already in the org.

- [ ] **Step 1: Create the file**

```ts
import { test, expect, request } from '@playwright/test'
import { orgHeaders } from '../helpers/org-headers.js'
import { adminHeaders } from '../helpers/admin-headers.js'

const BASE = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
const JOIN_EMAIL = 'join-e2e-test@example.com'

test.describe('Auth join API', () => {
  let api:      Awaited<ReturnType<typeof request.newContext>>
  let memberId: string | undefined

  test.beforeAll(async () => { api = await request.newContext() })

  test.afterAll(async () => {
    if (memberId) {
      await api.delete(`${BASE}/v1/members/${memberId}`, { headers: adminHeaders() })
    }
    await api.dispose()
  })

  test('POST /v1/auth/join creates a new member and returns 201', async () => {
    const res  = await api.post(`${BASE}/v1/auth/join`, {
      headers: orgHeaders(),
      data:    { email: JOIN_EMAIL },
    })
    expect(res.status()).toBe(201)

    const body = await res.json() as { id: string; email: string; role: string }
    expect(body.email).toBe(JOIN_EMAIL)
    expect(body.role).toBe('member')
    memberId = body.id
  })

  test('POST /v1/auth/join with same email returns 200 (idempotent)', async () => {
    const res  = await api.post(`${BASE}/v1/auth/join`, {
      headers: orgHeaders(),
      data:    { email: JOIN_EMAIL }, // same email as previous test
    })
    expect(res.status()).toBe(200)

    const body = await res.json() as { id: string; email: string }
    expect(body.email).toBe(JOIN_EMAIL)
    expect(body.id).toBe(memberId) // same member, not a new one
  })

  test('POST /v1/auth/join with invalid email returns 400', async () => {
    const res = await api.post(`${BASE}/v1/auth/join`, {
      headers: orgHeaders(),
      data:    { email: 'not-an-email' },
    })
    expect(res.status()).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/email/i)
  })

  test('POST /v1/auth/join without org token returns 401', async () => {
    const res = await api.post(`${BASE}/v1/auth/join`, {
      data: { email: 'notoken@example.com' },
    })
    expect(res.status()).toBe(401)
  })

  test('POST /v1/auth/join with admin token (wrong token type) returns 401', async () => {
    // The join endpoint requires org token, not admin token
    const res = await api.post(`${BASE}/v1/auth/join`, {
      headers: adminHeaders(),
      data:    { email: 'wrongtoken@example.com' },
    })
    expect(res.status()).toBe(401)
  })
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=api e2e/api/join.spec.ts
```

Expected: 5 passed.

- [ ] **Step 3: Commit**

```
git add e2e/api/join.spec.ts e2e/helpers/org-headers.ts
git commit -m "test(e2e): add auth-join API spec — create, idempotent, invalid email, unauth"
```

---

### Final: Run full API suite + package script

- [ ] **Step 1: Run all API tests**

```
pnpm exec playwright test --project=api
```

Expected: all tests pass.

- [ ] **Step 2: Add convenience script to root `package.json`**

In `package.json` (root), add alongside the existing `test:e2e:admin` and `test:e2e:extension` scripts:

```json
"test:e2e:api": "playwright test --config playwright.config.ts --project=api"
```

- [ ] **Step 3: Commit**

```
git add package.json
git commit -m "test(e2e): add test:e2e:api convenience script"
```

- [ ] **Step 4: Run the complete E2E suite to confirm all projects pass together**

```
pnpm test:e2e
```

Expected: all projects (admin-setup, admin, extension, api) pass.
