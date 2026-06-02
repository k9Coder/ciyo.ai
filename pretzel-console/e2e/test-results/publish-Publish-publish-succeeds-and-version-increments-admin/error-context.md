# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: publish.spec.ts >> Publish >> publish succeeds and version increments
- Location: e2e\publish.spec.ts:7:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForResponse: Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - link "Pretzel logo Pretzel by ciyo.ai" [ref=e5] [cursor=pointer]:
      - /url: /dashboard
      - img "Pretzel logo" [ref=e6]
      - generic [ref=e12]:
        - generic [ref=e13]: Pretzel
        - generic [ref=e14]: by ciyo.ai
    - generic [ref=e15]:
      - generic [ref=e16]: Organization
      - generic [ref=e17]: Test's Organization
    - navigation [ref=e18]:
      - link "▦ Dashboard" [ref=e20] [cursor=pointer]:
        - /url: /dashboard
        - generic [ref=e21]: ▦
        - text: Dashboard
      - link "⊡ Policies" [ref=e23] [cursor=pointer]:
        - /url: /subjects
        - generic [ref=e24]: ⊡
        - text: Policies
      - link "⊞ Teams" [ref=e26] [cursor=pointer]:
        - /url: /org
        - generic [ref=e27]: ⊞
        - text: Teams
      - link "◎ Members" [ref=e29] [cursor=pointer]:
        - /url: /members
        - generic [ref=e30]: ◎
        - text: Members
      - link "≡ Audit Log" [ref=e32] [cursor=pointer]:
        - /url: /audit
        - generic [ref=e33]: ≡
        - text: Audit Log
      - link "AI Assistant" [ref=e36] [cursor=pointer]:
        - /url: /assistant
        - img [ref=e37]
        - text: AI Assistant
      - link "⚙ Settings" [ref=e40] [cursor=pointer]:
        - /url: /settings
        - generic [ref=e41]: ⚙
        - text: Settings
    - generic [ref=e42]:
      - button "Open user menu" [ref=e44] [cursor=pointer]:
        - img "test user's logo" [ref=e47]
      - generic [ref=e49]:
        - generic [ref=e50]: test user
        - generic [ref=e51]: Admin
  - generic [ref=e52]:
    - button "☀" [ref=e54] [cursor=pointer]
    - generic [ref=e56]:
      - heading "Publish" [level=1] [ref=e58]
      - generic [ref=e60]:
        - generic [ref=e61]:
          - heading "Current published policy" [level=2] [ref=e62]
          - paragraph [ref=e63]: No policy published yet
        - button "Publish now" [ref=e64] [cursor=pointer]
      - generic [ref=e65]:
        - heading "Published versions" [level=2] [ref=e67]
        - generic [ref=e68]:
          - paragraph [ref=e69]: No versions yet
          - paragraph [ref=e70]: Publish your first policy to see history here.
    - generic [ref=e71]:
      - generic [ref=e72]:
        - text: Pretzel
        - generic [ref=e73]: © 2026 · DLP for the AI era
      - link "ciyo.ai" [ref=e74] [cursor=pointer]:
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
> 14 |     const publishDone = page.waitForResponse(r => r.url().includes('/v1/policy/publish'))
     |                              ^ Error: page.waitForResponse: Test timeout of 30000ms exceeded.
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
  31 |     await expect(page.getByText(/v\d+/).first()).toBeVisible()
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