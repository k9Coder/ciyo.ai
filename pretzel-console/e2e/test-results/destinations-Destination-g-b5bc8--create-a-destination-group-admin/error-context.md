# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: destinations.spec.ts >> Destination groups >> can create a destination group
- Location: e2e\destinations.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('E2E External Email')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('E2E External Email')

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
- heading "Destination Groups" [level=1]
- button "+ New group"
- status "Loading":
  - img
- dialog:
  - heading "New destination group" [level=2]
  - text: Name
  - textbox "Name": E2E External Email
  - text: Domains (one per line)
  - textbox "Domains (one per line)":
    - /placeholder: "chatgpt.com\nclaude.ai\ngemini.google.com"
    - text: gmail.com, yahoo.com
  - button "Cancel"
  - button "Save"
- text: Pretzel© 2026 · DLP for the AI era
- link "mykka.ai":
  - /url: https://mykka.ai
- text: Failed to fetch
```

# Test source

```ts
  1  | import { test, expect, request as playwrightRequest } from '@playwright/test'
  2  | import { adminHeaders } from './helpers/admin-headers.js'
  3  | 
  4  | const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
  5  | 
  6  | test.describe('Destination groups', () => {
  7  |   let createdGroupId: string | undefined
  8  | 
  9  |   test.afterEach(async () => {
  10 |     if (!createdGroupId) return
  11 |     const api = await playwrightRequest.newContext()
  12 |     await api.delete(`${BACKEND}/v1/destination-groups/${createdGroupId}`, { headers: adminHeaders() })
  13 |     await api.dispose()
  14 |     createdGroupId = undefined
  15 |   })
  16 | 
  17 |   test('can create a destination group', async ({ page }) => {
  18 |     await page.goto('/destinations')
  19 | 
  20 |     await page.getByRole('button', { name: /new group|add group|\+/i }).click()
  21 | 
  22 |     await page.getByLabel(/name/i).fill('E2E External Email')
  23 |     await page.getByLabel(/domains/i).fill('gmail.com, yahoo.com')
  24 |     await page.getByRole('button', { name: /create|save/i }).click()
  25 | 
> 26 |     await expect(page.getByText('E2E External Email')).toBeVisible()
     |                                                        ^ Error: expect(locator).toBeVisible() failed
  27 | 
  28 |     const api  = await playwrightRequest.newContext()
  29 |     const res   = await api.get(`${BACKEND}/v1/destination-groups`, { headers: adminHeaders() })
  30 |     const body  = await res.json() as Array<{ id: string; name: string }>
  31 |     createdGroupId = body.find(g => g.name === 'E2E External Email')?.id
  32 |     await api.dispose()
  33 |   })
  34 | 
  35 |   test('can rename a destination group', async ({ page }) => {
  36 |     // Create a group, rename it, clean up — all within this test
  37 |     const api = await playwrightRequest.newContext()
  38 |     const createRes = await api.post(`${BACKEND}/v1/destination-groups`, {
  39 |       headers: adminHeaders(),
  40 |       data: { name: 'E2E Edit Group', domains: ['edit-test.com'] },
  41 |     })
  42 |     const group = await createRes.json() as { id: string }
  43 |     await api.dispose()
  44 | 
  45 |     await page.goto('/destinations')
  46 |     await page.getByText('E2E Edit Group').waitFor()
  47 | 
  48 |     // Edit button is a plain <button> in each group card
  49 |     await page.getByRole('button', { name: 'Edit' }).first().click()
  50 | 
  51 |     await page.getByRole('dialog').getByLabel('Name').clear()
  52 |     await page.getByRole('dialog').getByLabel('Name').fill('E2E Edit Group Renamed')
  53 |     await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()
  54 | 
  55 |     await expect(page.getByText('E2E Edit Group Renamed')).toBeVisible()
  56 | 
  57 |     // Cleanup
  58 |     const cleanupApi = await playwrightRequest.newContext()
  59 |     await cleanupApi.delete(`${BACKEND}/v1/destination-groups/${group.id}`, { headers: adminHeaders() })
  60 |     await cleanupApi.dispose()
  61 |   })
  62 | })
  63 | 
```