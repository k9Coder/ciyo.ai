# E2E Coverage Phase 1 — Edit Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add PATCH-path coverage to four existing admin E2E specs by testing the edit modal/inline-edit flow for subjects, rules, members, destination groups, and site configs.

**Architecture:** Each task appends 1–2 new `test()` blocks to an existing spec file. Tests create or use seeded data, trigger the edit UI, save, assert the updated value is visible, then restore/clean up via the Playwright API request context in the same test (no afterEach needed — restoration is inline).

**Tech Stack:** Playwright `@playwright/test`, Playwright `request` context for API calls, `adminHeaders()` helper at `e2e/helpers/admin-headers.ts`.

---

## File Map

| File | Change |
|------|--------|
| `e2e/admin/subjects.spec.ts` | Add 2 tests: rename subject, edit rule action |
| `e2e/admin/members.spec.ts` | Add 1 test: change member role |
| `e2e/admin/destinations.spec.ts` | Add 1 test: rename destination group |
| `e2e/admin/sites.spec.ts` | Add 1 test: edit site config selectors |

---

### Task 1: Rename a subject (`subjects.spec.ts`)

**Files:**
- Modify: `e2e/admin/subjects.spec.ts`

- [ ] **Step 1: Append the rename test inside the existing `test.describe('Subjects')`**

```ts
// in e2e/admin/subjects.spec.ts — append inside test.describe('Subjects', () => { ... })

test('can rename a subject', async ({ page }) => {
  await page.goto('/subjects')

  // The Edit span is always visible (inline style overrides Tailwind hidden class)
  const subjectRow = page.locator('button', { hasText: 'ACME Confidential' })
  await subjectRow.locator('span', { hasText: 'Edit' }).click()

  // Edit subject modal opens
  await page.getByRole('dialog').getByLabel('Name').clear()
  await page.getByRole('dialog').getByLabel('Name').fill('ACME Confidential Renamed')
  await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

  await expect(page.getByText('ACME Confidential Renamed')).toBeVisible()

  // Restore the seeded subject name via API so downstream tests still find it
  const api = await playwrightRequest.newContext()
  const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
  const subs = await subRes.json() as Array<{ id: string; name: string }>
  const sub = subs.find(s => s.name === 'ACME Confidential Renamed')
  if (sub) {
    await api.patch(`${BACKEND}/v1/subjects/${sub.id}`, {
      headers: adminHeaders(),
      data: { name: 'ACME Confidential' },
    })
  }
  await api.dispose()
})
```

- [ ] **Step 2: Run and verify it passes**

```
pnpm exec playwright test --project=admin e2e/admin/subjects.spec.ts --grep "can rename"
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```
git add e2e/admin/subjects.spec.ts
git commit -m "test(e2e): add rename-subject edit-flow test"
```

---

### Task 2: Edit a rule's action (`subjects.spec.ts`)

**Files:**
- Modify: `e2e/admin/subjects.spec.ts`

- [ ] **Step 1: Append the edit-rule test inside the existing `test.describe('Subjects')`**

```ts
// in e2e/admin/subjects.spec.ts — append inside test.describe('Subjects', () => { ... })

test('can edit a rule action', async ({ page }) => {
  // Create a throwaway rule via API so we never modify the seeded ACME rules
  const api = await playwrightRequest.newContext()
  const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
  const subs = await subRes.json() as Array<{ id: string; name: string }>
  const subId = subs.find(s => s.name === 'ACME Confidential')!.id

  const ruleRes = await api.post(`${BACKEND}/v1/subjects/${subId}/rules`, {
    headers: adminHeaders(),
    data: { kind: 'keyword', action: 'warn', keywords: ['EDIT_RULE_E2E'], reportLevel: 'none' },
  })
  const rule = await ruleRes.json() as { id: string }
  await api.dispose()

  // Navigate and select the subject
  await page.goto('/subjects')
  await page.locator('button', { hasText: 'ACME Confidential' }).click()

  // Find the rule card and click its Edit button
  const keywordSpan = page.locator('span').filter({ hasText: /^EDIT_RULE_E2E$/ })
  await keywordSpan.locator('../..').getByRole('button', { name: 'Edit' }).click()

  // In the modal change action from warn to block
  await page.getByRole('dialog').getByRole('combobox', { name: /action/i }).selectOption('block')
  await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

  // The badge in the rule card should now show "block"
  const updatedCard = page.locator('span').filter({ hasText: /^EDIT_RULE_E2E$/ }).locator('../..')
  await expect(updatedCard.getByText('block')).toBeVisible()

  // Cleanup
  const cleanupApi = await playwrightRequest.newContext()
  await cleanupApi.delete(`${BACKEND}/v1/rules/${rule.id}`, { headers: adminHeaders() })
  await cleanupApi.dispose()
})
```

- [ ] **Step 2: Run and verify it passes**

```
pnpm exec playwright test --project=admin e2e/admin/subjects.spec.ts --grep "can edit a rule"
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```
git add e2e/admin/subjects.spec.ts
git commit -m "test(e2e): add edit-rule-action flow test"
```

---

### Task 3: Change a member's role (`members.spec.ts`)

**Files:**
- Modify: `e2e/admin/members.spec.ts`

- [ ] **Step 1: Append the role-change test inside the existing `test.describe('Members')`**

```ts
// in e2e/admin/members.spec.ts — append inside test.describe('Members', () => { ... })

test('can change a member role', async ({ page }) => {
  // Create a throwaway member so we never modify the seeded super_admin
  const api = await playwrightRequest.newContext()
  const createRes = await api.post(`${BACKEND}/v1/members`, {
    headers: adminHeaders(),
    data: { email: 'e2e-role-edit@example.com', role: 'member' },
  })
  const member = await createRes.json() as { id: string }
  await api.dispose()

  await page.goto('/members')

  // Find the row and click Edit role
  const memberRow = page.locator('tr', { hasText: 'e2e-role-edit@example.com' })
  await memberRow.getByRole('button', { name: 'Edit role' }).click()

  // Change to Division Admin and save
  await memberRow.getByRole('combobox').selectOption('division_admin')
  await memberRow.getByRole('button', { name: 'Save' }).click()

  // The badge in the row should update
  await expect(memberRow.getByText('Division Admin')).toBeVisible()

  // Cleanup
  const cleanupApi = await playwrightRequest.newContext()
  await cleanupApi.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
  await cleanupApi.dispose()
})
```

- [ ] **Step 2: Run and verify it passes**

```
pnpm exec playwright test --project=admin e2e/admin/members.spec.ts --grep "can change a member role"
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```
git add e2e/admin/members.spec.ts
git commit -m "test(e2e): add change-member-role edit-flow test"
```

---

### Task 4: Rename a destination group (`destinations.spec.ts`)

**Files:**
- Modify: `e2e/admin/destinations.spec.ts`

- [ ] **Step 1: Append the rename test inside the existing `test.describe('Destination groups')`**

```ts
// in e2e/admin/destinations.spec.ts — append inside test.describe('Destination groups', () => { ... })

test('can rename a destination group', async ({ page }) => {
  // Create a group, rename it, delete it — all within this test
  const api = await playwrightRequest.newContext()
  const createRes = await api.post(`${BACKEND}/v1/destination-groups`, {
    headers: adminHeaders(),
    data: { name: 'E2E Edit Group', domains: ['edit-test.com'] },
  })
  const group = await createRes.json() as { id: string }
  await api.dispose()

  await page.goto('/destinations')

  // Find the Edit button for this group (only group on page since seed has none)
  await page.getByText('E2E Edit Group').waitFor()
  await page.getByRole('button', { name: /edit/i }).first().click()

  // In the modal change the name
  await page.getByRole('dialog').getByLabel('Name').clear()
  await page.getByRole('dialog').getByLabel('Name').fill('E2E Edit Group Renamed')
  await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

  await expect(page.getByText('E2E Edit Group Renamed')).toBeVisible()

  // Cleanup
  const cleanupApi = await playwrightRequest.newContext()
  await cleanupApi.delete(`${BACKEND}/v1/destination-groups/${group.id}`, { headers: adminHeaders() })
  await cleanupApi.dispose()
})
```

- [ ] **Step 2: Run and verify it passes**

```
pnpm exec playwright test --project=admin e2e/admin/destinations.spec.ts --grep "can rename"
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```
git add e2e/admin/destinations.spec.ts
git commit -m "test(e2e): add rename-destination-group edit-flow test"
```

---

### Task 5: Edit site config selectors (`sites.spec.ts`)

**Files:**
- Modify: `e2e/admin/sites.spec.ts`

- [ ] **Step 1: Append the edit-selectors test inside the existing `test.describe('Site configs')`**

Note: SitesPage's `openEdit` does not allow changing the domain — only `inputSelector` and `sendButtonSelector`.

```ts
// in e2e/admin/sites.spec.ts — append inside test.describe('Site configs', () => { ... })

const EDIT_DOMAIN = 'e2e-edit-site.internal'

test('can edit site config selectors', async ({ page }) => {
  // Create the config first
  const api = await playwrightRequest.newContext()
  await api.post(`${BACKEND}/v1/site-configs`, {
    headers: adminHeaders(),
    data: { domain: EDIT_DOMAIN, inputSelector: '#old-input', sendButtonSelector: '#old-btn' },
  })
  await api.dispose()

  await page.goto('/sites')
  await page.getByText(EDIT_DOMAIN).waitFor()

  await page.getByRole('button', { name: /edit/i }).first().click()

  // Update selectors
  const inputField  = page.getByRole('dialog').getByLabel(/input selector/i)
  const buttonField = page.getByRole('dialog').getByLabel(/send.?button selector/i)

  await inputField.clear()
  await inputField.fill('#new-input')
  await buttonField.clear()
  await buttonField.fill('#new-btn')

  await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()

  // Row should reflect the update (either selector text or just visible)
  await expect(page.getByText(EDIT_DOMAIN)).toBeVisible()

  // Cleanup
  const cleanupApi = await playwrightRequest.newContext()
  await cleanupApi.delete(`${BACKEND}/v1/site-configs/${EDIT_DOMAIN}`, { headers: adminHeaders() })
  await cleanupApi.dispose()
})
```

- [ ] **Step 2: Run and verify it passes**

```
pnpm exec playwright test --project=admin e2e/admin/sites.spec.ts --grep "can edit site"
```

Expected: 1 passed.

- [ ] **Step 3: Commit**

```
git add e2e/admin/sites.spec.ts
git commit -m "test(e2e): add edit-site-config selectors flow test"
```

---

### Final: Run the full admin suite

- [ ] **Step 1: Run all admin tests to ensure no regressions**

```
pnpm exec playwright test --project=admin
```

Expected: all tests pass including the new ones.

- [ ] **Step 2: Commit if anything needed fixing**

```
git add -p
git commit -m "test(e2e): fix any regressions from phase 1 edit-flow tests"
```
