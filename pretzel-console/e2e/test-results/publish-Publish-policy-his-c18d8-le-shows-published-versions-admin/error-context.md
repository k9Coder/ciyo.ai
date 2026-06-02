# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: publish.spec.ts >> Publish >> policy history table shows published versions
- Location: e2e\publish.spec.ts:26:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/v\d+/).first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText(/v\d+/).first()

```

```yaml
- complementary:
  - link "Pretzel logo Pretzel by ciyo.ai":
    - /url: /dashboard
    - img "Pretzel logo"
    - text: Pretzel by ciyo.ai
  - text: Organization Test's Organization
  - navigation:
    - link "▦ Dashboard":
      - /url: /dashboard
    - link "⊡ Policies":
      - /url: /subjects
    - link "⊞ Teams":
      - /url: /org
    - link "◎ Members":
      - /url: /members
    - link "≡ Audit Log":
      - /url: /audit
    - link "AI Assistant":
      - /url: /assistant
      - img
      - text: AI Assistant
    - link "⚙ Settings":
      - /url: /settings
  - button "Open user menu":
    - img "test user's logo"
  - text: test user Admin
- button "☀"
- heading "Publish" [level=1]
- heading "Current published policy" [level=2]
- status "Loading":
  - img
- button "Publish now"
- heading "Published versions" [level=2]
- status "Loading":
  - img
- text: Pretzel© 2026 · DLP for the AI era
- link "ciyo.ai":
  - /url: https://ciyo.ai
```

# Test source

```ts
  1  | import { test, expect, request as playwrightRequest } from '@playwright/test'
  2  | import { adminHeaders } from './helpers/admin-headers.js'
  3  | 
  4  | const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
  5  | 
  6  | test.describe('Publish', () => {
  7  |   test('publish succeeds and version increments', async ({ page }) => {
  8  |     await page.goto('/publish')
  9  | 
  10 |     // Read current version label before publishing
  11 |     const versionText    = await page.getByText(/version/i).first().textContent()
  12 |     const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)
  13 | 
  14 |     const publishDone = page.waitForResponse(r => r.url().includes('/v1/policy/publish'))
  15 |     await page.getByRole('button', { name: /publish/i }).click()
  16 |     await publishDone
  17 | 
  18 |     // Wait for the UI to reflect the new version
  19 |     await expect(async () => {
  20 |       const updatedText = await page.getByText(/version/i).first().textContent() ?? ''
  21 |       const newVersion  = parseInt(updatedText.match(/\d+/)?.[0] ?? '0', 10)
  22 |       expect(newVersion).toBeGreaterThan(currentVersion)
  23 |     }).toPass({ timeout: 10_000 })
  24 |   })
  25 | 
  26 |   test('policy history table shows published versions', async ({ page }) => {
  27 |     await page.goto('/publish')
  28 | 
  29 |     // The seeded tenant always has v1 in history
  30 |     await expect(page.getByText('Published versions')).toBeVisible()
> 31 |     await expect(page.getByText(/v\d+/).first()).toBeVisible()
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  32 |     await expect(page.getByRole('button', { name: 'Rollback to this' }).first()).toBeVisible()
  33 |   })
  34 | 
  35 |   test('rollback to a previous version increments the version number', async ({ page }) => {
  36 |     // Ensure there are at least 2 versions: publish once via API to create v2 (seed has v1)
  37 |     const api = await playwrightRequest.newContext()
  38 |     await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })
  39 |     await api.dispose()
  40 | 
  41 |     await page.goto('/publish')
  42 | 
  43 |     // Read current version before rollback
  44 |     const versionText    = await page.getByText(/version \d+/i).first().textContent()
  45 |     const currentVersion = parseInt(versionText?.match(/\d+/)?.[0] ?? '0', 10)
  46 | 
  47 |     // Rollback to the earliest version shown (last row)
  48 |     await page.getByRole('button', { name: 'Rollback to this' }).last().click()
  49 |     // ConfirmModal appears — wait for the rollback API response
  50 |     const rollbackDone = page.waitForResponse(
  51 |       r => r.url().includes('/v1/policy/rollback') && r.request().method() === 'POST'
  52 |     )
  53 |     await page.getByRole('button', { name: 'Delete' }).click()
  54 |     await rollbackDone
  55 | 
  56 |     // Wait for the UI to update (invalidateQueries triggers a background refetch)
  57 |     await expect(async () => {
  58 |       const updatedText = await page.getByText(/version \d+/i).first().textContent() ?? ''
  59 |       const newVersion  = parseInt(updatedText.match(/\d+/)?.[0] ?? '0', 10)
  60 |       expect(newVersion).toBeGreaterThan(currentVersion)
  61 |     }).toPass({ timeout: 10_000 })
  62 |   })
  63 | })
  64 | 
```