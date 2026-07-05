import { test, expect, type Page } from '@playwright/test'

const MOCK_SESSION_ID = '11111111-1111-1111-1111-111111111111'
const MOCK_MESSAGE_ID = '22222222-2222-2222-2222-222222222222'

const CHAT_PLACEHOLDER = /ask me to create/i

// Stubs billing/status so PlanGate lets assistantEnabled pages through.
async function mockBillingEnabled(page: Page) {
  await page.route('**/v1/billing/status', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan: 'business',
        subscriptionStatus: 'active',
        trialEndsAt: null,
        seatCount: 1,
        seatLimit: -1,
        monthlyScans: 0,
        scanLimit: -1,
        scanBlocked: false,
        paymentProvider: 'stripe',
        features: { assistantEnabled: true, advancedAnalytics: true },
        assistantLimits: { promptsPerDay: -1, promptsUsedToday: 0, maximumTokens: -1 },
      }),
    })
  })
}

// Intercepts all /v1/assistant/* API calls so the test runs without a real LLM.
async function mockAssistantApi(page: Page) {
  await mockBillingEnabled(page)
  await page.route('**/v1/assistant/sessions', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sessions: [{ id: MOCK_SESSION_ID, title: 'Test session', tenantId: 't1', memberId: null, createdAt: new Date().toISOString() }] }),
    })
  })

  await page.route('**/v1/assistant/chat', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: MOCK_SESSION_ID,
        messageId: MOCK_MESSAGE_ID,
        reply:     'I can create a rule to block prompts containing "API_KEY".',
        actions:   [{ op: 'create_rule', subjectId: 's1', kind: 'keyword', keywords: ['API_KEY'], action: 'block' }],
      }),
    })
  })

  await page.route(`**/v1/assistant/sessions/${MOCK_SESSION_ID}/messages`, route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        messages: [
          { id: '33333333-3333-3333-3333-333333333333', sessionId: MOCK_SESSION_ID, role: 'user',      content: 'Block prompts with API keys', actionsJson: null, appliedAt: null, createdAt: new Date().toISOString() },
          { id: MOCK_MESSAGE_ID,                        sessionId: MOCK_SESSION_ID, role: 'assistant', content: 'I can create a rule to block prompts containing "API_KEY".', actionsJson: [{ op: 'create_rule', subjectId: 's1', kind: 'keyword', keywords: ['API_KEY'], action: 'block' }], appliedAt: null, createdAt: new Date().toISOString() },
        ],
      }),
    })
  })

  await page.route('**/v1/assistant/apply', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ applied: [{ op: 'create_rule' }], errors: [] }),
    })
  })
}

test.describe('Assistant page', () => {
  test('loads with empty state — chat pane visible', async ({ page }) => {
    await mockBillingEnabled(page)
    await page.route('**/v1/assistant/sessions', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ sessions: [] }),
    }))

    await page.goto('/assistant')

    await expect(page.getByText('How can I help you today?')).toBeVisible()
    await expect(page.getByPlaceholder(CHAT_PLACEHOLDER)).toBeVisible()
    await expect(page.getByRole('button', { name: /send/i })).toBeVisible()
  })

  test('send button is disabled when input is empty', async ({ page }) => {
    await mockBillingEnabled(page)
    await page.route('**/v1/assistant/sessions', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ sessions: [] }),
    }))

    await page.goto('/assistant')

    const sendBtn = page.getByRole('button', { name: /send/i })
    await expect(sendBtn).toBeDisabled()
    await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('hello')
    await expect(sendBtn).not.toBeDisabled()
  })

  test('sends a message and shows the assistant reply', async ({ page }) => {
    await mockAssistantApi(page)
    await page.goto('/assistant')

    await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
    await page.getByRole('button', { name: /send/i }).click()

    await expect(page.getByText(/I can create a rule to block/i)).toBeVisible()
  })

  test('proposed actions appear in the preview pane', async ({ page }) => {
    await mockAssistantApi(page)
    await page.goto('/assistant')

    await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
    await page.getByRole('button', { name: /send/i }).click()

    await expect(page.getByText(/CREATE RULE/i)).toBeVisible()
    await expect(page.getByText('["API_KEY"]')).toBeVisible()
    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /discard/i })).toBeVisible()
  })

  test('discard clears the preview pane', async ({ page }) => {
    await mockAssistantApi(page)
    await page.goto('/assistant')

    await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
    await page.getByRole('button', { name: /send/i }).click()

    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible()
    await page.getByRole('button', { name: /discard/i }).click()

    await expect(page.getByRole('button', { name: /apply changes/i })).not.toBeVisible()
    await expect(page.getByRole('button', { name: /discard/i })).not.toBeVisible()
    await expect(page.getByPlaceholder(CHAT_PLACEHOLDER)).toBeVisible()
  })

  test('clicking Apply calls the apply endpoint', async ({ page }) => {
    const applyRequests: string[] = []
    await mockAssistantApi(page)
    await page.route('**/v1/assistant/apply', async route => {
      const body = route.request().postDataJSON() as { messageId: string }
      applyRequests.push(body.messageId)
      await route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ applied: [{ op: 'create_rule' }], errors: [] }),
      })
    })

    await page.goto('/assistant')

    await page.getByPlaceholder(CHAT_PLACEHOLDER).fill('Block prompts with API keys')
    await page.getByRole('button', { name: /send/i }).click()

    await expect(page.getByRole('button', { name: /apply changes/i })).toBeVisible()
    await page.getByRole('button', { name: /apply changes/i }).click()

    expect(applyRequests).toContain(MOCK_MESSAGE_ID)
  })

  test('session tabs show existing sessions', async ({ page }) => {
    await mockAssistantApi(page)
    await page.goto('/assistant')

    await expect(page.getByTitle('Test session')).toBeVisible()
    await expect(page.getByRole('button', { name: /\+ new/i })).toBeVisible()
  })
})
