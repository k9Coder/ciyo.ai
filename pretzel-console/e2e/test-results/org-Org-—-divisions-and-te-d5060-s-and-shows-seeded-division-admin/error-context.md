# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: org.spec.ts >> Org — divisions and teams >> page loads and shows seeded division
- Location: e2e\org.spec.ts:7:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('E2E Division')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('E2E Division')

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
- heading "Org Structure" [level=1]
- text: Divisions
- status "Loading":
  - img
- button "Add Divisions": + Add
- text: Teams
- paragraph: No teams
- text: Members
- paragraph: No members
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
  6  | test.describe('Org — divisions and teams', () => {
  7  |   test('page loads and shows seeded division', async ({ page }) => {
  8  |     await page.goto('/org')
  9  | 
  10 |     await expect(page.getByRole('heading', { name: /org/i })).toBeVisible()
> 11 |     await expect(page.getByText('E2E Division')).toBeVisible()
     |                                                  ^ Error: expect(locator).toBeVisible() failed
  12 |   })
  13 | 
  14 |   test('can create and delete a division', async ({ page }) => {
  15 |     await page.goto('/org')
  16 | 
  17 |     await page.getByRole('button', { name: /new division|add division/i }).click()
  18 |     await page.getByLabel('Name').fill('E2E Temp Division')
  19 |     await page.getByRole('button', { name: /create|save/i }).click()
  20 | 
  21 |     await expect(page.getByText('E2E Temp Division')).toBeVisible()
  22 | 
  23 |     // Cleanup via API
  24 |     const api = await playwrightRequest.newContext()
  25 |     const res  = await api.get(`${BACKEND}/v1/divisions`, { headers: adminHeaders() })
  26 |     const divs = await res.json() as Array<{ id: string; name: string }>
  27 |     const div  = divs.find(d => d.name === 'E2E Temp Division')
  28 |     if (div) await api.delete(`${BACKEND}/v1/divisions/${div.id}`, { headers: adminHeaders() })
  29 |     await api.dispose()
  30 |   })
  31 | 
  32 |   test('can create a team inside a division', async ({ page }) => {
  33 |     await page.goto('/org')
  34 | 
  35 |     // Select the seeded division to reveal its teams column
  36 |     await page.getByText('E2E Division').click()
  37 | 
  38 |     await page.getByRole('button', { name: /new team|add team/i }).click()
  39 |     await page.getByLabel('Name').fill('E2E Temp Team')
  40 |     await page.getByRole('button', { name: /create|save/i }).click()
  41 | 
  42 |     await expect(page.getByText('E2E Temp Team')).toBeVisible()
  43 | 
  44 |     // Cleanup via API
  45 |     const api = await playwrightRequest.newContext()
  46 |     const divRes = await api.get(`${BACKEND}/v1/divisions`, { headers: adminHeaders() })
  47 |     const divs   = await divRes.json() as Array<{ id: string; name: string }>
  48 |     const div    = divs.find(d => d.name === 'E2E Division')!
  49 | 
  50 |     const teamRes = await api.get(`${BACKEND}/v1/divisions/${div.id}/teams`, { headers: adminHeaders() })
  51 |     const teams   = await teamRes.json() as Array<{ id: string; name: string }>
  52 |     const team    = teams.find(t => t.name === 'E2E Temp Team')
  53 |     if (team) await api.delete(`${BACKEND}/v1/teams/${team.id}`, { headers: adminHeaders() })
  54 |     await api.dispose()
  55 |   })
  56 | 
  57 |   test('selecting a division and team shows member column', async ({ page }) => {
  58 |     await page.goto('/org')
  59 | 
  60 |     await page.getByText('E2E Division').click()
  61 |     await expect(page.getByText('E2E Team')).toBeVisible()
  62 | 
  63 |     await page.getByText('E2E Team').click()
  64 | 
  65 |     // After selecting the team, the third column (members) should appear
  66 |     await expect(page.getByText(/member|no member/i).first()).toBeVisible()
  67 |   })
  68 | })
  69 | 
```