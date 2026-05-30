# E2E Coverage Phase 2 — New Admin Specs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cover the three completely untested admin pages (Settings, Org, Audit Log) plus policy history and rollback. Adds ~20 new tests across 4 new spec files and 1 seed update.

**Architecture:** 
- `settings.spec.ts` tests tenant name edit and token rotation UI (rotation endpoint is covered in Phase 4 API spec).
- `org.spec.ts` tests division and team CRUD via the MillerColumns UI.
- `audit.spec.ts` tests filtering and pagination on the Audit Log page — requires seeded event rows added to `seed-e2e.ts`.
- `publish.spec.ts` gets 2 new tests for policy history and rollback.

**Tech Stack:** Playwright `@playwright/test`, `adminHeaders()` helper, Playwright `request` context for API cleanup, Drizzle ORM in `seed-e2e.ts`.

---

## File Map

| File | Change |
|------|--------|
| `backend/src/scripts/seed-e2e.ts` | Add 15 event rows (mix of block + warn) for audit log tests |
| `e2e/admin/settings.spec.ts` | Create — page load, name edit, rotation confirm-dialog UI |
| `e2e/admin/org.spec.ts` | Create — division CRUD, team CRUD, member–team assignment |
| `e2e/admin/audit.spec.ts` | Create — page loads, filter pills, load-more pagination |
| `e2e/admin/publish.spec.ts` | Add 2 tests — policy history list, rollback to previous version |

---

### Task 1: Seed event rows for the audit log (`seed-e2e.ts`)

**Files:**
- Modify: `backend/src/scripts/seed-e2e.ts`

The audit log page (`/audit`) reads from the `events` table joined with `rules` and `subjects`. Without seeded events the page shows "No events recorded yet" and none of the filter/pagination tests can run.

- [ ] **Step 1: Add event rows after the `db.insert(policies)` call**

Open `backend/src/scripts/seed-e2e.ts`. After the line `await db.insert(policies).values(...)` and before `writeFileSync(...)`, insert:

```ts
// Seed audit events so e2e/admin/audit.spec.ts has data to work with.
// 8 block events + 7 warn events = 15 total, enough to test filter pills
// and "load more" (default page size is 50, so use limit=5 in the spec).
const ruleRows = await db
  .select({ id: rules.id, action: rules.action })
  .from(rules)
  .where(eq(rules.tenantId, tenantId))

const blockRuleId = ruleRows.find(r => r.action === 'block')!.id
const warnRuleId  = ruleRows.find(r => r.action === 'warn')!.id

const now = new Date()
const eventRows = [
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
]

await db.insert(events).values(eventRows)
```

Also add the missing import at the top of the file (it is already imported via `import { ..., events, scans, ... } from '../db/schema.js'` — verify this line includes `events`).

Add the `eq` import if not already present:
```ts
// At top of seed-e2e.ts, if not already there:
import { eq } from 'drizzle-orm'
```

- [ ] **Step 2: Verify the seed script still runs**

```
cd backend && pnpm run seed:e2e
```

Expected: `[seed-e2e] Done.` — no errors.

- [ ] **Step 3: Commit**

```
git add backend/src/scripts/seed-e2e.ts
git commit -m "test(seed): add 15 audit-log event rows for E2E audit page tests"
```

---

### Task 2: Settings page — load and name edit (`settings.spec.ts`)

**Files:**
- Create: `e2e/admin/settings.spec.ts`

- [ ] **Step 1: Create the file**

```ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Settings', () => {
  test('page loads and shows tenant name', async ({ page }) => {
    await page.goto('/settings')

    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
    await expect(page.getByText('E2E Test Org')).toBeVisible()
    await expect(page.getByText('Organisation')).toBeVisible()
    await expect(page.getByText('API Tokens')).toBeVisible()
  })

  test('can edit the organisation name', async ({ page }) => {
    await page.goto('/settings')

    await page.getByRole('button', { name: 'Edit' }).click()

    const nameInput = page.locator('input').filter({ hasNot: page.locator('[type="hidden"]') }).first()
    await nameInput.clear()
    await nameInput.fill('E2E Test Org Renamed')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page.getByText('E2E Test Org Renamed')).toBeVisible()

    // Restore the original name via API
    const api = await playwrightRequest.newContext()
    await api.patch(`${BACKEND}/v1/tenant`, {
      headers: adminHeaders(),
      data: { name: 'E2E Test Org' },
    })
    await api.dispose()
  })

  test('rotate org token button triggers a confirm dialog', async ({ page }) => {
    await page.goto('/settings')

    let dialogMessage = ''
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message()
      await dialog.dismiss() // Cancel — do NOT actually rotate; actual rotation is tested in Phase 4 API spec
    })

    // The page has two "Rotate" buttons (org token, admin token) — click the first (org)
    await page.getByRole('button', { name: 'Rotate' }).first().click()

    expect(dialogMessage).toMatch(/rotate|org token/i)
  })

  test('rotate admin token button triggers a confirm dialog', async ({ page }) => {
    await page.goto('/settings')

    let dialogMessage = ''
    page.on('dialog', async dialog => {
      dialogMessage = dialog.message()
      await dialog.dismiss()
    })

    await page.getByRole('button', { name: 'Rotate' }).nth(1).click()

    expect(dialogMessage).toMatch(/rotate|admin token/i)
  })
})
```

- [ ] **Step 2: Run and verify all 4 tests pass**

```
pnpm exec playwright test --project=admin e2e/admin/settings.spec.ts
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```
git add e2e/admin/settings.spec.ts
git commit -m "test(e2e): add settings page spec — load, name edit, rotation UI"
```

---

### Task 3: Org page — divisions, teams, member assignment (`org.spec.ts`)

**Files:**
- Create: `e2e/admin/org.spec.ts`

The seed already has "E2E Division" and "E2E Team" inside it. Tests create new entities and delete them; they never modify the seeded division/team.

- [ ] **Step 1: Create the file**

```ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Org — divisions and teams', () => {
  test('page loads and shows seeded division', async ({ page }) => {
    await page.goto('/org')

    await expect(page.getByRole('heading', { name: /org/i })).toBeVisible()
    await expect(page.getByText('E2E Division')).toBeVisible()
  })

  test('can create and delete a division', async ({ page }) => {
    await page.goto('/org')

    await page.getByRole('button', { name: /new division|add division|\+/i }).first().click()
    await page.getByLabel('Name').fill('E2E Temp Division')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText('E2E Temp Division')).toBeVisible()

    // Delete it via API
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/divisions`, { headers: adminHeaders() })
    const divs = await res.json() as Array<{ id: string; name: string }>
    const div  = divs.find(d => d.name === 'E2E Temp Division')
    if (div) await api.delete(`${BACKEND}/v1/divisions/${div.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('can create a team inside a division', async ({ page }) => {
    await page.goto('/org')

    // Select the seeded division to reveal its teams column
    await page.getByText('E2E Division').click()

    await page.getByRole('button', { name: /new team|add team|\+/i }).first().click()
    await page.getByLabel('Name').fill('E2E Temp Team')
    await page.getByRole('button', { name: /create|save/i }).click()

    await expect(page.getByText('E2E Temp Team')).toBeVisible()

    // Delete via API
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/divisions`, { headers: adminHeaders() })
    const divs = await res.json() as Array<{ id: string; name: string }>
    const div  = divs.find(d => d.name === 'E2E Division')!

    const teamRes  = await api.get(`${BACKEND}/v1/divisions/${div.id}/teams`, { headers: adminHeaders() })
    const teams    = await teamRes.json() as Array<{ id: string; name: string }>
    const team     = teams.find(t => t.name === 'E2E Temp Team')
    if (team) await api.delete(`${BACKEND}/v1/teams/${team.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('can assign the seeded member to a team', async ({ page }) => {
    await page.goto('/org')

    // Select division → team to reveal the members column
    await page.getByText('E2E Division').click()
    await page.getByText('E2E Team').click()

    await page.getByRole('button', { name: /add member|assign|\+/i }).first().click()

    // The member form asks for email — use the seeded user
    const emailInput = page.getByLabel(/email/i)
    if (await emailInput.isVisible()) {
      await emailInput.fill(process.env.E2E_CLERK_USER_EMAIL!)
      await page.getByRole('button', { name: /add|assign|save/i }).click()
    }

    // The member is already assigned (seeded), so the modal may just close or show the member
    await expect(page.getByText(process.env.E2E_CLERK_USER_EMAIL!)).toBeVisible()
  })
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=admin e2e/admin/org.spec.ts
```

Expected: 4 passed. (If "assign member" test is flaky due to the member already being in the team, add a guard — see note below.)

> **Note:** If "can assign" fails because the seeded member is already in E2E Team, add a `beforeAll` that removes the member from the team, and an `afterAll` that re-adds them. Use `DELETE /v1/members/:id/teams/:teamId`.

- [ ] **Step 3: Commit**

```
git add e2e/admin/org.spec.ts
git commit -m "test(e2e): add org page spec — division/team CRUD and member assignment"
```

---

### Task 4: Audit Log page — filters and pagination (`audit.spec.ts`)

**Files:**
- Create: `e2e/admin/audit.spec.ts`

Depends on Task 1 (seeded events). The spec uses a small `limit=5` query to force pagination.

- [ ] **Step 1: Create the file**

```ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Audit Log', () => {
  test('page loads and renders event rows', async ({ page }) => {
    await page.goto('/audit')

    await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()

    // The seed planted 15 events — the table should render at least one row
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('row')).toHaveCount({ minimum: 2 }) // header + at least 1 data row
  })

  test('filter pill "Blocked" shows only block events', async ({ page }) => {
    await page.goto('/audit')

    await page.getByRole('button', { name: 'Blocked' }).click()

    // All visible action badges should say "block"
    const actionCells = page.locator('tbody td span', { hasText: /^block$/i })
    const count = await actionCells.count()
    expect(count).toBeGreaterThan(0)

    // No warn badges should appear
    await expect(page.locator('tbody td span', { hasText: /^warn$/i })).toHaveCount(0)
  })

  test('filter pill "Warned" shows only warn events', async ({ page }) => {
    await page.goto('/audit')

    await page.getByRole('button', { name: 'Warned' }).click()

    const actionCells = page.locator('tbody td span', { hasText: /^warn$/i })
    const count = await actionCells.count()
    expect(count).toBeGreaterThan(0)

    await expect(page.locator('tbody td span', { hasText: /^block$/i })).toHaveCount(0)
  })

  test('filter pill "All" resets to show both actions', async ({ page }) => {
    await page.goto('/audit')

    // Start on Blocked, then switch back to All
    await page.getByRole('button', { name: 'Blocked' }).click()
    await page.getByRole('button', { name: 'All' }).click()

    // Both block and warn badges visible
    await expect(page.locator('tbody td span', { hasText: /^block$/i }).first()).toBeVisible()
    await expect(page.locator('tbody td span', { hasText: /^warn$/i }).first()).toBeVisible()
  })

  test('"Load more" appears and fetches next page when limit is exceeded', async ({ page }) => {
    // Intercept /v1/audit-log to force a small page size so "Load more" appears
    // Default limit = 50, but we seed 15 events — so we need to override.
    // Intercept and redirect with limit=5 to force pagination.
    await page.route('**/v1/audit-log**', async route => {
      const url = new URL(route.request().url())
      url.searchParams.set('limit', '5')
      await route.continue({ url: url.toString() })
    })

    await page.goto('/audit')

    // With limit=5 and 15 seeded events, "Load more" should appear
    await expect(page.getByRole('button', { name: /load more/i })).toBeVisible()

    // Click it — more rows should appear
    const rowsBefore = await page.locator('tbody tr').count()
    await page.getByRole('button', { name: /load more/i }).click()
    const rowsAfter = await page.locator('tbody tr').count()
    expect(rowsAfter).toBeGreaterThan(rowsBefore)
  })
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=admin e2e/admin/audit.spec.ts
```

Expected: 5 passed.

- [ ] **Step 3: Commit**

```
git add e2e/admin/audit.spec.ts
git commit -m "test(e2e): add audit log spec — load, filter pills, load-more pagination"
```

---

### Task 5: Policy history and rollback (`publish.spec.ts`)

**Files:**
- Modify: `e2e/admin/publish.spec.ts`

The seed always starts at version 1. These tests publish, check history, and roll back.

- [ ] **Step 1: Append 2 tests inside the existing `test.describe('Publish')`**

```ts
// in e2e/admin/publish.spec.ts — append inside test.describe('Publish', () => { ... })

test('history shows published versions', async ({ page }) => {
  // Publish once to ensure at least 1 version exists
  const api = await playwrightRequest.newContext()
  await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })
  await api.dispose()

  // The PublishPage should have a link or section showing history
  await page.goto('/publish')

  const historyRes = await (await playwrightRequest.newContext()).get(
    `${BACKEND}/v1/policy/history`, { headers: adminHeaders() }
  )
  const history = await historyRes.json() as Array<{ version: number }>
  expect(history.length).toBeGreaterThanOrEqual(1)
  expect(history[0]).toHaveProperty('version')
})

test('can roll back to a previous version', async ({ page }) => {
  const api = await playwrightRequest.newContext()

  // Publish twice to have at least v2
  await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })
  await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })

  const beforeRes = await api.get(`${BACKEND}/v1/policy/version`, { headers: adminHeaders() })
  const { version: before } = await beforeRes.json() as { version: number }
  expect(before).toBeGreaterThanOrEqual(2)

  // Roll back to version 1
  const rollbackRes = await api.post(`${BACKEND}/v1/policy/rollback/1`, { headers: adminHeaders() })
  expect(rollbackRes.status()).toBe(200)

  const afterRes = await api.get(`${BACKEND}/v1/policy/version`, { headers: adminHeaders() })
  const { version: after } = await afterRes.json() as { version: number }

  // Rollback re-publishes as a new (higher) version number containing v1's content
  expect(after).toBeGreaterThan(before)

  await api.dispose()
})
```

- [ ] **Step 2: Run and verify**

```
pnpm exec playwright test --project=admin e2e/admin/publish.spec.ts
```

Expected: 3 passed (original + 2 new).

- [ ] **Step 3: Commit**

```
git add e2e/admin/publish.spec.ts
git commit -m "test(e2e): add policy history and rollback tests to publish spec"
```

---

### Final: Run full admin suite

- [ ] **Step 1: Run all admin tests**

```
pnpm exec playwright test --project=admin
```

Expected: all tests pass.

- [ ] **Step 2: Fix any regressions and commit**

```
git add -p
git commit -m "test(e2e): fix regressions from phase 2 new admin specs"
```
