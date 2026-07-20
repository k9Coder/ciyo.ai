# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: members.spec.ts >> Members >> can generate an invite link for a specific email
- Location: e2e\members.spec.ts:7:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /copy link/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /copy link/i })

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
- heading "Members" [level=1]
- button "+ Invite Member"
- text: Email (optional — leave blank for open link)
- textbox "Email (optional — leave blank for open link)":
  - /placeholder: alice@lawfirm.com
  - text: e2e-invited@example.com
- text: Role
- combobox "Role":
  - option "Member" [selected]
  - option "Division Admin"
  - option "Super Admin"
- button "Generate link"
- button "Cancel"
- status "Loading":
  - img
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
  6  | test.describe('Members', () => {
  7  |   test('can generate an invite link for a specific email', async ({ page }) => {
  8  |     await page.goto('/members')
  9  | 
  10 |     await page.getByRole('button', { name: /invite member/i }).click()
  11 | 
  12 |     await page.getByPlaceholder(/alice@/i).fill('e2e-invited@example.com')
  13 |     await page.locator('form').getByRole('button', { name: /generate link/i }).click()
  14 | 
  15 |     // URL input with the invite link appears
> 16 |     await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible({ timeout: 5_000 })
     |                                                                    ^ Error: expect(locator).toBeVisible() failed
  17 |     const urlInput = page.locator('input[readonly]')
  18 |     await expect(urlInput).toHaveValue(/\/invite\/[a-f0-9]{64}/)
  19 |     // No member row yet — invite must be accepted first
  20 |   })
  21 | 
  22 |   test('can generate an open invite link with no email', async ({ page }) => {
  23 |     await page.goto('/members')
  24 |     await page.getByRole('button', { name: /invite member/i }).click()
  25 | 
  26 |     // Leave email blank — open link (anyone with it can join)
  27 |     await page.locator('form').getByRole('button', { name: /generate link/i }).click()
  28 | 
  29 |     await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible({ timeout: 5_000 })
  30 |     const urlInput = page.locator('input[readonly]')
  31 |     await expect(urlInput).toHaveValue(/\/invite\/[a-f0-9]{64}/)
  32 |   })
  33 | 
  34 |   test('can change a member role', async ({ page }) => {
  35 |     // Create a throwaway member so we never modify the seeded super_admin
  36 |     const api = await playwrightRequest.newContext()
  37 |     const createRes = await api.post(`${BACKEND}/v1/members`, {
  38 |       headers: adminHeaders(),
  39 |       data: { email: 'e2e-role-edit@example.com', role: 'member' },
  40 |     })
  41 |     const member = await createRes.json() as { id: string }
  42 |     await api.dispose()
  43 | 
  44 |     await page.goto('/members')
  45 | 
  46 |     const memberRow = page.locator('tr', { hasText: 'e2e-role-edit@example.com' })
  47 |     await memberRow.getByRole('button', { name: 'Edit role' }).click()
  48 | 
  49 |     await memberRow.getByRole('combobox').selectOption('division_admin')
  50 |     await memberRow.getByRole('button', { name: 'Save' }).click()
  51 | 
  52 |     await expect(memberRow.getByText('Division Admin')).toBeVisible()
  53 | 
  54 |     // Cleanup
  55 |     const cleanupApi = await playwrightRequest.newContext()
  56 |     await cleanupApi.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
  57 |     await cleanupApi.dispose()
  58 |   })
  59 | })
  60 | 
```