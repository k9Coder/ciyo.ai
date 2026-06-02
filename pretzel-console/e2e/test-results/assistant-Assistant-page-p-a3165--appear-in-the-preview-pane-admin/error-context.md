# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: assistant.spec.ts >> Assistant page >> proposed actions appear in the preview pane
- Location: e2e\assistant.spec.ts:91:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByPlaceholder(/ask me to create/i)

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
      - generic [ref=e57]: ✦
      - generic [ref=e58]: Business plan required
      - generic [ref=e59]: The AI Assistant is available on the Business plan. Upgrade to unlock intelligent policy suggestions and bulk apply.
      - link "View plans →" [ref=e60] [cursor=pointer]:
        - /url: https://ciyo.ai/pricing
    - generic [ref=e61]:
      - generic [ref=e62]:
        - text: Pretzel
        - generic [ref=e63]: © 2026 · DLP for the AI era
      - link "ciyo.ai" [ref=e64] [cursor=pointer]:
        - /url: https://ciyo.ai
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test'
  2   | 
  3   | const MOCK_SESSION_ID = '11111111-1111-1111-1111-111111111111'
  4   | const MOCK_MESSAGE_ID = '22222222-2222-2222-2222-222222222222'
  5   | 
  6   | const CHAT_PLACEHOLDER = /ask me to create/i
  7   | 
  8   | // Intercepts all /v1/assistant/* API calls so the test runs without a real LLM.
  9   | async function mockAssistantApi(page: Page) {
  10  |   await page.route('**/v1/assistant/sessions', route => {
  11  |     route.fulfill({
  12  |       status: 200,
  13  |       contentType: 'application/json',
  14  |       body: JSON.stringify({ sessions: [{ id: MOCK_SESSION_ID, title: 'Test session', tenantId: 't1', memberId: null, createdAt: new Date().toISOString() }] }),
  15  |     })
  16  |   })
  17  | 
  18  |   await page.route('**/v1/assistant/chat', route => {
  19  |     route.fulfill({
  20  |       status: 200,
  21  |       contentType: 'application/json',
  22  |       body: JSON.stringify({
  23  |         sessionId: MOCK_SESSION_ID,
  24  |         messageId: MOCK_MESSAGE_ID,
  25  |         reply:     'I can create a rule to block prompts containing "API_KEY".',
  26  |         actions:   [{ op: 'create_rule', subjectId: 's1', kind: 'keyword', keywords: ['API_KEY'], action: 'block' }],
  27  |       }),
  28  |     })
  29  |   })
  30  | 
  31  |   await page.route(`**/v1/assistant/sessions/${MOCK_SESSION_ID}/messages`, route => {
  32  |     route.fulfill({
  33  |       status: 200,
  34  |       contentType: 'application/json',
  35  |       body: JSON.stringify({
  36  |         messages: [
  37  |           { id: '33333333-3333-3333-3333-333333333333', sessionId: MOCK_SESSION_ID, role: 'user',      content: 'Block prompts with API keys', actionsJson: null, appliedAt: null, createdAt: new Date().toISOString() },
  38  |           { id: MOCK_MESSAGE_ID,                        sessionId: MOCK_SESSION_ID, role: 'assistant', content: 'I can create a rule to block prompts containing "API_KEY".', actionsJson: [{ op: 'create_rule', subjectId: 's1', kind: 'keyword', keywords: ['API_KEY'], action: 'block' }], appliedAt: null, createdAt: new Date().toISOString() },
  39  |         ],
  40  |       }),
  41  |     })
  42  |   })
  43  | 
  44  |   await page.route('**/v1/assistant/apply', route => {
  45  |     route.fulfill({
  46  |       status: 200,
  47  |       contentType: 'application/json',
  48  |       body: JSON.stringify({ applied: [{ op: 'create_rule' }], errors: [] }),
  49  |     })
  50  |   })
  51  | }
  52  | 
  53  | test.describe('Assistant page', () => {
  54  |   test('loads with empty state — chat pane visible', async ({ page }) => {
  55  |     await page.route('**/v1/assistant/sessions', route => route.fulfill({
  56  |       status: 200, contentType: 'application/json',
  57  |       body: JSON.stringify({ sessions: [] }),
  58  |     }))
  59  | 
  60  |     await page.goto('/assistant')
  61  | 
  62  |     await expect(page.getByText('How can I help you today?')).toBeVisible()
  63  |     await expect(page.getByPlaceholder(CHAT_PLACEHOLDER)).toBeVisible()
  64  |     await expect(page.getByRole('button', { name: /send/i })).toBeVisible()
  65  |   })
  66  | 
  67  |   test('send button is disabled when input is empty', async ({ page }) => {
  68  |     await page.route('**/v1/assistant/sessions', route => route.fulfill({
  69  |       status: 200, contentType: 'application/json',
  70  |       body: JSON.stringify({ sessions: [] }),
  71  |     }))
  72  | 
  73  |     await page.goto('/assistant')
  74  | 
  75  |     const sendBtn = page.getByRole('button', { name: /send/i })
  76  |     await expect(sendBtn).toBeDisabled()
  77  |     await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('hello')
  78  |     await expect(sendBtn).not.toBeDisabled()
  79  |   })
  80  | 
  81  |   test('sends a message and shows the assistant reply', async ({ page }) => {
  82  |     await mockAssistantApi(page)
  83  |     await page.goto('/assistant')
  84  | 
  85  |     await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
  86  |     await page.getByRole('button', { name: /send/i }).click()
  87  | 
  88  |     await expect(page.getByText(/I can create a rule to block/i)).toBeVisible()
  89  |   })
  90  | 
  91  |   test('proposed actions appear in the preview pane', async ({ page }) => {
  92  |     await mockAssistantApi(page)
  93  |     await page.goto('/assistant')
  94  | 
> 95  |     await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
      |                                                   ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  96  |     await page.getByRole('button', { name: /send/i }).click()
  97  | 
  98  |     await expect(page.getByText(/CREATE RULE/i)).toBeVisible()
  99  |     await expect(page.getByText('["API_KEY"]')).toBeVisible()
  100 |     await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible()
  101 |     await expect(page.getByRole('button', { name: /discard/i })).toBeVisible()
  102 |   })
  103 | 
  104 |   test('discard clears the preview pane', async ({ page }) => {
  105 |     await mockAssistantApi(page)
  106 |     await page.goto('/assistant')
  107 | 
  108 |     await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
  109 |     await page.getByRole('button', { name: /send/i }).click()
  110 | 
  111 |     await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible()
  112 |     await page.getByRole('button', { name: /discard/i }).click()
  113 | 
  114 |     await expect(page.getByRole('button', { name: /apply changes/i })).not.toBeVisible()
  115 |     await expect(page.getByRole('button', { name: /discard/i })).not.toBeVisible()
  116 |     await expect(page.getByPlaceholder(CHAT_PLACEHOLDER)).toBeVisible()
  117 |   })
  118 | 
  119 |   test('clicking Apply calls the apply endpoint', async ({ page }) => {
  120 |     const applyRequests: string[] = []
  121 |     await mockAssistantApi(page)
  122 |     await page.route('**/v1/assistant/apply', async route => {
  123 |       const body = route.request().postDataJSON() as { messageId: string }
  124 |       applyRequests.push(body.messageId)
  125 |       await route.fulfill({
  126 |         status: 200, contentType: 'application/json',
  127 |         body: JSON.stringify({ applied: [{ op: 'create_rule' }], errors: [] }),
  128 |       })
  129 |     })
  130 | 
  131 |     await page.goto('/assistant')
  132 | 
  133 |     await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
  134 |     await page.getByRole('button', { name: /send/i }).click()
  135 | 
  136 |     await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible()
  137 |     await page.getByRole('button', { name: /apply changes/i }).click()
  138 | 
  139 |     expect(applyRequests).toContain(MOCK_MESSAGE_ID)
  140 |   })
  141 | 
  142 |   test('session tabs show existing sessions', async ({ page }) => {
  143 |     await mockAssistantApi(page)
  144 |     await page.goto('/assistant')
  145 | 
  146 |     await expect(page.getByTitle('Test session')).toBeVisible()
  147 |     await expect(page.getByRole('button', { name: /\+ new/i })).toBeVisible()
  148 |   })
  149 | })
  150 | 
```