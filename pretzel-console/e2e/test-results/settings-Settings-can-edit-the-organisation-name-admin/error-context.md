# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.spec.ts >> Settings >> can edit the organisation name
- Location: e2e\settings.spec.ts:16:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Edit' })

```

# Page snapshot

```yaml
- generic [ref=e3]:
  - complementary [ref=e4]:
    - link "Pretzel logo Pretzel by mykka.ai" [ref=e5] [cursor=pointer]:
      - /url: /dashboard
      - img "Pretzel logo" [ref=e6]
      - generic [ref=e12]:
        - generic [ref=e13]: Pretzel
        - generic [ref=e14]: by mykka.ai
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
      - heading "Settings" [level=1] [ref=e58]
      - generic [ref=e59]:
        - heading "Organisation" [level=2] [ref=e60]
        - paragraph [ref=e61]: Could not load tenant info.
      - generic [ref=e62]:
        - heading "API Tokens" [level=2] [ref=e63]
        - paragraph [ref=e64]: Rotating a token immediately invalidates the current one. Copy the new token when shown — it will not be displayed again.
        - generic [ref=e66]:
          - generic [ref=e67]:
            - generic [ref=e68]: Org Token
            - generic [ref=e69]: Deployed to member devices via MDM or manual config
          - button "Rotate" [ref=e70] [cursor=pointer]
        - generic [ref=e72]:
          - generic [ref=e73]:
            - generic [ref=e74]: Admin Token
            - generic [ref=e75]: Used by this admin dashboard and CI/CD integrations
          - button "Rotate" [ref=e76] [cursor=pointer]
    - generic [ref=e77]:
      - generic [ref=e78]:
        - text: Pretzel
        - generic [ref=e79]: © 2026 · DLP for the AI era
      - link "mykka.ai" [ref=e80] [cursor=pointer]:
        - /url: https://mykka.ai
```

# Test source

```ts
  1  | import { test, expect, request as playwrightRequest } from '@playwright/test'
  2  | import { adminHeaders } from './helpers/admin-headers.js'
  3  | 
  4  | const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
  5  | 
  6  | test.describe('Settings', () => {
  7  |   test('page loads and shows tenant name', async ({ page }) => {
  8  |     await page.goto('/settings')
  9  | 
  10 |     await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible()
  11 |     await expect(page.getByText('E2E Test Org')).toBeVisible()
  12 |     await expect(page.getByText('Organisation')).toBeVisible()
  13 |     await expect(page.getByText('API Tokens')).toBeVisible()
  14 |   })
  15 | 
  16 |   test('can edit the organisation name', async ({ page }) => {
  17 |     await page.goto('/settings')
  18 | 
> 19 |     await page.getByRole('button', { name: 'Edit' }).click()
     |                                                      ^ Error: locator.click: Test timeout of 30000ms exceeded.
  20 | 
  21 |     // The edit form renders a single text input with autoFocus
  22 |     const nameInput = page.locator('input').first()
  23 |     await nameInput.clear()
  24 |     await nameInput.fill('E2E Test Org Renamed')
  25 |     await page.getByRole('button', { name: 'Save' }).click()
  26 | 
  27 |     await expect(page.getByText('E2E Test Org Renamed')).toBeVisible()
  28 | 
  29 |     // Restore the original name via API
  30 |     const api = await playwrightRequest.newContext()
  31 |     await api.patch(`${BACKEND}/v1/tenant`, {
  32 |       headers: adminHeaders(),
  33 |       data: { name: 'E2E Test Org' },
  34 |     })
  35 |     await api.dispose()
  36 |   })
  37 | 
  38 |   test('rotate org token button triggers a confirm dialog', async ({ page }) => {
  39 |     await page.goto('/settings')
  40 | 
  41 |     let dialogMessage = ''
  42 |     page.on('dialog', async dialog => {
  43 |       dialogMessage = dialog.message()
  44 |       await dialog.dismiss() // Cancel — do NOT actually rotate
  45 |     })
  46 | 
  47 |     // The page has two "Rotate" buttons (org token, admin token) — click the first
  48 |     await page.getByRole('button', { name: 'Rotate' }).first().click()
  49 | 
  50 |     expect(dialogMessage).toMatch(/rotate|org token/i)
  51 |   })
  52 | 
  53 |   test('rotate admin token button triggers a confirm dialog', async ({ page }) => {
  54 |     await page.goto('/settings')
  55 | 
  56 |     let dialogMessage = ''
  57 |     page.on('dialog', async dialog => {
  58 |       dialogMessage = dialog.message()
  59 |       await dialog.dismiss()
  60 |     })
  61 | 
  62 |     await page.getByRole('button', { name: 'Rotate' }).nth(1).click()
  63 | 
  64 |     expect(dialogMessage).toMatch(/rotate|admin token/i)
  65 |   })
  66 | })
  67 | 
```