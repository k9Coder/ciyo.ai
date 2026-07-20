# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: settings.spec.ts >> Settings >> page loads and shows tenant name
- Location: e2e\settings.spec.ts:7:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('E2E Test Org')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('E2E Test Org')

```

```yaml
- complementary:
  - link "Pretzel logo Pretzel by mykka.ai":
    - /url: /dashboard
    - img "Pretzel logo"
    - text: Pretzel by mykka.ai
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
- heading "Settings" [level=1]
- heading "Organisation" [level=2]
- status "Loading":
  - img
- heading "API Tokens" [level=2]
- paragraph: Rotating a token immediately invalidates the current one. Copy the new token when shown — it will not be displayed again.
- text: Org Token Deployed to member devices via MDM or manual config
- button "Rotate"
- text: Admin Token Used by this admin dashboard and CI/CD integrations
- button "Rotate"
- text: Pretzel© 2026 · DLP for the AI era
- link "mykka.ai":
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
> 11 |     await expect(page.getByText('E2E Test Org')).toBeVisible()
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  12 |     await expect(page.getByText('Organisation')).toBeVisible()
  13 |     await expect(page.getByText('API Tokens')).toBeVisible()
  14 |   })
  15 | 
  16 |   test('can edit the organisation name', async ({ page }) => {
  17 |     await page.goto('/settings')
  18 | 
  19 |     await page.getByRole('button', { name: 'Edit' }).click()
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