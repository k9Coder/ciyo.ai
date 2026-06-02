# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: audit.spec.ts >> Audit Log >> filter pill Warned shows only warn events
- Location: e2e\audit.spec.ts:26:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('tbody td:nth-child(4) span').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('tbody td:nth-child(4) span').first()

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
- heading "Audit Log" [level=1]
- button "All"
- button "Warned"
- button "Blocked"
- status "Loading":
  - img
- text: Pretzel© 2026 · DLP for the AI era
- link "ciyo.ai":
  - /url: https://ciyo.ai
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Audit Log', () => {
  4  |   test('page loads and renders event rows', async ({ page }) => {
  5  |     await page.goto('/audit')
  6  | 
  7  |     await expect(page.getByRole('heading', { name: /audit log/i })).toBeVisible()
  8  | 
  9  |     const rows = page.locator('tbody tr')
  10 |     await expect(rows.first()).toBeVisible()
  11 |     expect(await rows.count()).toBeGreaterThan(1)
  12 |   })
  13 | 
  14 |   test('filter pill Blocked shows only block events', async ({ page }) => {
  15 |     await page.goto('/audit')
  16 | 
  17 |     await page.getByRole('button', { name: 'Blocked' }).click()
  18 | 
  19 |     const actionCells = page.locator('tbody td:nth-child(4) span')
  20 |     await expect(actionCells.first()).toBeVisible()
  21 |     const texts = await actionCells.allTextContents()
  22 |     expect(texts.length).toBeGreaterThan(0)
  23 |     expect(texts.every(t => t === 'block')).toBe(true)
  24 |   })
  25 | 
  26 |   test('filter pill Warned shows only warn events', async ({ page }) => {
  27 |     await page.goto('/audit')
  28 | 
  29 |     await page.getByRole('button', { name: 'Warned' }).click()
  30 | 
  31 |     const actionCells = page.locator('tbody td:nth-child(4) span')
> 32 |     await expect(actionCells.first()).toBeVisible()
     |                                       ^ Error: expect(locator).toBeVisible() failed
  33 |     const texts = await actionCells.allTextContents()
  34 |     expect(texts.length).toBeGreaterThan(0)
  35 |     expect(texts.every(t => t === 'warn')).toBe(true)
  36 |   })
  37 | 
  38 |   test('filter pill All resets to show both actions', async ({ page }) => {
  39 |     await page.goto('/audit')
  40 | 
  41 |     await page.getByRole('button', { name: 'Blocked' }).click()
  42 |     await page.getByRole('button', { name: 'All' }).click()
  43 | 
  44 |     const actionCells = page.locator('tbody td:nth-child(4) span')
  45 |     await expect(actionCells.first()).toBeVisible()
  46 |     const texts = await actionCells.allTextContents()
  47 |     expect(texts).toContain('block')
  48 |     expect(texts).toContain('warn')
  49 |   })
  50 | 
  51 |   test('Load more button fetches the next page', async ({ page }) => {
  52 |     // Force limit=5 so the 15 seeded events span multiple pages
  53 |     await page.route('**/v1/audit-log**', async route => {
  54 |       const url = new URL(route.request().url())
  55 |       url.searchParams.set('limit', '5')
  56 |       await route.continue({ url: url.toString() })
  57 |     })
  58 | 
  59 |     await page.goto('/audit')
  60 | 
  61 |     await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible()
  62 |     const rowsBefore = await page.locator('tbody tr').count()
  63 |     expect(rowsBefore).toBe(5)
  64 | 
  65 |     await page.getByRole('button', { name: 'Load more' }).click()
  66 | 
  67 |     await expect(page.locator('tbody tr')).toHaveCount(rowsBefore + 5, { timeout: 5000 })
  68 |   })
  69 | })
  70 | 
```