# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: org.spec.ts >> Org — divisions and teams >> selecting a division and team shows member column
- Location: e2e\org.spec.ts:57:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByText('E2E Division')

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
      - heading "Org Structure" [level=1] [ref=e58]
      - generic [ref=e60]:
        - generic [ref=e61]:
          - generic [ref=e62]: Divisions
          - paragraph [ref=e65]: No divisions
          - button "Add Divisions" [ref=e67] [cursor=pointer]: + Add
        - generic [ref=e68]:
          - generic [ref=e69]: Teams
          - paragraph [ref=e72]: No teams
        - generic [ref=e73]:
          - generic [ref=e74]: Members
          - paragraph [ref=e77]: No members
    - generic [ref=e78]:
      - generic [ref=e79]:
        - text: Pretzel
        - generic [ref=e80]: © 2026 · DLP for the AI era
      - link "ciyo.ai" [ref=e81] [cursor=pointer]:
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
  11 |     await expect(page.getByText('E2E Division')).toBeVisible()
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
> 60 |     await page.getByText('E2E Division').click()
     |                                          ^ Error: locator.click: Test timeout of 30000ms exceeded.
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