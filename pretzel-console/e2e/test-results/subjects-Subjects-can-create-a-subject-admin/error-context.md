# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: subjects.spec.ts >> Subjects >> can create a subject
- Location: e2e\subjects.spec.ts:17:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('E2E Test Subject')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByText('E2E Test Subject')

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
- heading "Subjects & Rules" [level=1]
- button "+ New subject"
- text: Subjects
- button "+ New"
- status "Loading":
  - img
- paragraph: Select a subject
- paragraph: Choose a subject on the left to view and manage its rules.
- dialog:
  - heading "New subject" [level=2]
  - text: Name
  - textbox "Name":
    - /placeholder: e.g. Litigation Docs
    - text: E2E Test Subject
  - text: Description (optional)
  - textbox "Description (optional)"
  - button "Cancel"
  - button "Save"
- text: Pretzel© 2026 · DLP for the AI era
- link "mykka.ai":
  - /url: https://mykka.ai
- text: Failed to fetch
```

# Test source

```ts
  1   | import { test, expect, request as playwrightRequest } from '@playwright/test'
  2   | import { adminHeaders } from './helpers/admin-headers.js'
  3   | 
  4   | const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
  5   | 
  6   | test.describe('Subjects', () => {
  7   |   let createdSubjectId: string | undefined
  8   | 
  9   |   test.afterEach(async () => {
  10  |     if (!createdSubjectId) return
  11  |     const api = await playwrightRequest.newContext()
  12  |     await api.delete(`${BACKEND}/v1/subjects/${createdSubjectId}`, { headers: adminHeaders() })
  13  |     await api.dispose()
  14  |     createdSubjectId = undefined
  15  |   })
  16  | 
  17  |   test('can create a subject', async ({ page }) => {
  18  |     await page.goto('/subjects')
  19  | 
  20  |     await page.getByRole('button', { name: /new subject|add subject/i }).click()
  21  | 
  22  |     await page.getByLabel(/name/i).fill('E2E Test Subject')
  23  |     await page.getByRole('button', { name: /create|save/i }).click()
  24  | 
  25  |     // Subject appears in the list
> 26  |     await expect(page.getByText('E2E Test Subject')).toBeVisible()
      |                                                      ^ Error: expect(locator).toBeVisible() failed
  27  | 
  28  |     // Capture the ID for cleanup
  29  |     const api  = await playwrightRequest.newContext()
  30  |     const res   = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
  31  |     const body  = await res.json() as Array<{ id: string; name: string }>
  32  |     createdSubjectId = body.find(s => s.name === 'E2E Test Subject')?.id
  33  |     await api.dispose()
  34  |   })
  35  | 
  36  |   test('empty subject name is blocked by form validation', async ({ page }) => {
  37  |     await page.goto('/subjects')
  38  |     await page.getByRole('button', { name: /new subject|add subject/i }).click()
  39  | 
  40  |     // Leave name empty, attempt to save
  41  |     await page.getByRole('button', { name: /create|save/i }).click()
  42  | 
  43  |     // Modal stays open — no new subject created
  44  |     await expect(page.getByRole('dialog')).toBeVisible()
  45  |   })
  46  | 
  47  |   test('can add a keyword block rule to a subject', async ({ page }) => {
  48  |     await page.goto('/subjects')
  49  | 
  50  |     // Select the seeded subject
  51  |     await page.getByText('ACME Confidential').click()
  52  | 
  53  |     await page.getByRole('button', { name: /add rule/i }).click()
  54  | 
  55  |     await page.getByLabel(/keywords/i).fill('TEST_KEYWORD_E2E')
  56  |     await page.getByRole('combobox', { name: /action/i }).selectOption('block')
  57  |     await page.getByRole('button', { name: /create|save/i }).click()
  58  | 
  59  |     await expect(page.getByText('TEST_KEYWORD_E2E')).toBeVisible()
  60  | 
  61  |     // Cleanup the rule via API
  62  |     const api    = await playwrightRequest.newContext()
  63  |     const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
  64  |     const subs   = await subRes.json() as Array<{ id: string; name: string }>
  65  |     const subId  = subs.find(s => s.name === 'ACME Confidential')!.id
  66  |     const ruleRes = await api.get(`${BACKEND}/v1/subjects/${subId}/rules`, { headers: adminHeaders() })
  67  |     const rules   = await ruleRes.json() as Array<{ id: string; keywords: string[] }>
  68  |     const created = rules.find(r => r.keywords?.includes('TEST_KEYWORD_E2E'))
  69  |     if (created) await api.delete(`${BACKEND}/v1/rules/${created.id}`, { headers: adminHeaders() })
  70  |     await api.dispose()
  71  |   })
  72  | 
  73  |   test('can rename a subject', async ({ page }) => {
  74  |     await page.goto('/subjects')
  75  | 
  76  |     const subjectRow = page.locator('button', { hasText: 'ACME Confidential' })
  77  |     await subjectRow.locator('span', { hasText: 'Edit' }).click()
  78  | 
  79  |     await page.getByRole('dialog').getByLabel('Name').clear()
  80  |     await page.getByRole('dialog').getByLabel('Name').fill('ACME Confidential Renamed')
  81  |     await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()
  82  | 
  83  |     await expect(page.getByText('ACME Confidential Renamed')).toBeVisible()
  84  | 
  85  |     // Restore original name so downstream tests still find it
  86  |     const api = await playwrightRequest.newContext()
  87  |     const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
  88  |     const subs = await subRes.json() as Array<{ id: string; name: string }>
  89  |     const sub = subs.find(s => s.name === 'ACME Confidential Renamed')
  90  |     if (sub) {
  91  |       await api.patch(`${BACKEND}/v1/subjects/${sub.id}`, {
  92  |         headers: adminHeaders(),
  93  |         data: { name: 'ACME Confidential' },
  94  |       })
  95  |     }
  96  |     await api.dispose()
  97  |   })
  98  | 
  99  |   test('can edit a rule action', async ({ page }) => {
  100 |     // Create a throwaway rule so we never modify the seeded ACME rules permanently
  101 |     const api = await playwrightRequest.newContext()
  102 |     const subRes = await api.get(`${BACKEND}/v1/subjects`, { headers: adminHeaders() })
  103 |     const subs = await subRes.json() as Array<{ id: string; name: string }>
  104 |     const subId = subs.find(s => s.name === 'ACME Confidential')!.id
  105 | 
  106 |     const ruleRes = await api.post(`${BACKEND}/v1/subjects/${subId}/rules`, {
  107 |       headers: adminHeaders(),
  108 |       data: { kind: 'keyword', action: 'warn', keywords: ['EDIT_RULE_E2E'], reportLevel: 'none' },
  109 |     })
  110 |     const rule = await ruleRes.json() as { id: string }
  111 |     await api.dispose()
  112 | 
  113 |     await page.goto('/subjects')
  114 |     await page.locator('button', { hasText: 'ACME Confidential' }).click()
  115 | 
  116 |     // Walk up 2 levels from the keyword span to the card div, then click Edit
  117 |     const keywordSpan = page.locator('span').filter({ hasText: /^EDIT_RULE_E2E$/ })
  118 |     await keywordSpan.locator('../..').getByRole('button', { name: 'Edit' }).click()
  119 | 
  120 |     // Change action to block
  121 |     await page.getByRole('dialog').getByRole('combobox', { name: /action/i }).selectOption('block')
  122 |     await page.getByRole('dialog').getByRole('button', { name: /save/i }).click()
  123 | 
  124 |     // Badge in the rule card updates to "block"
  125 |     const updatedCard = page.locator('span').filter({ hasText: /^EDIT_RULE_E2E$/ }).locator('../..')
  126 |     await expect(updatedCard.getByText('block')).toBeVisible()
```