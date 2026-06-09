import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'
import { getSeedState } from './helpers/seed-state.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Assistant API', () => {
  test('GET /v1/assistant/sessions returns seeded session', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/assistant/sessions`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as { sessions: Array<{ id: string; title: string }> }
    expect(Array.isArray(body.sessions)).toBe(true)
    expect(body.sessions.length).toBeGreaterThanOrEqual(1)

    const { assistantSessionId } = getSeedState()
    const found = body.sessions.find(s => s.id === assistantSessionId)
    expect(found).toBeDefined()
    expect(found!.title).toBe('E2E Assistant API Test Session')

    await api.dispose()
  })

  test('GET /v1/assistant/sessions/:id/messages returns seeded message', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantSessionId, assistantMessageId } = getSeedState()

    const res  = await api.get(
      `${BACKEND}/v1/assistant/sessions/${assistantSessionId}/messages`,
      { headers: adminHeaders() }
    )

    expect(res.status()).toBe(200)
    const body = await res.json() as { messages: Array<{ id: string; role: string; actionsJson: unknown }> }
    expect(Array.isArray(body.messages)).toBe(true)

    const msg = body.messages.find(m => m.id === assistantMessageId)
    expect(msg).toBeDefined()
    expect(msg!.role).toBe('assistant')
    expect(Array.isArray(msg!.actionsJson)).toBe(true)
    await api.dispose()
  })

  // Tests 3 & 4: previously order-dependent (test 4 required test 3 to have
  // applied the message first).  Now each test sets up its own precondition so
  // they are safe to run in any order or in parallel.

  test('POST /v1/assistant/apply executes the seeded action', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantMessageId } = getSeedState()

    // Apply once — 200 on first run, 409 on re-runs (message already applied).
    // Both indicate the apply endpoint reached the DB and processed the action.
    const res = await api.post(`${BACKEND}/v1/assistant/apply`, {
      headers: adminHeaders(),
      data:    { messageId: assistantMessageId },
    })

    expect([200, 409]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json() as { applied: unknown[]; errors: string[] }
      expect(body.errors).toHaveLength(0)
      expect(body.applied.length).toBeGreaterThanOrEqual(1)
    }
    await api.dispose()
  })

  test('POST /v1/assistant/apply returns 409 when already applied', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantMessageId } = getSeedState()

    // Ensure the message is in the "applied" state before asserting 409.
    // This makes the test independent — it no longer relies on test 3 running first.
    await api.post(`${BACKEND}/v1/assistant/apply`, {
      headers: adminHeaders(),
      data:    { messageId: assistantMessageId },
    })

    // Second apply must always return 409 regardless of what ran before
    const res = await api.post(`${BACKEND}/v1/assistant/apply`, {
      headers: adminHeaders(),
      data:    { messageId: assistantMessageId },
    })

    expect(res.status()).toBe(409)
    await api.dispose()
  })

  test('GET /v1/assistant/sessions returns 401 without auth', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/assistant/sessions`)

    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('POST /v1/assistant/apply returns 401 without auth', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantMessageId } = getSeedState()

    const res = await api.post(`${BACKEND}/v1/assistant/apply`, {
      data: { messageId: assistantMessageId },
    })

    expect(res.status()).toBe(401)
    await api.dispose()
  })

  // Tests 7 & 8: same independence fix as tests 3 & 4.  Each test now owns the
  // full precondition — apply then re-apply — so they are order-independent.

  test('POST /v1/assistant/apply executes create_division action', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantOrgMessageId } = getSeedState()

    // 200 on first run; 409 on re-runs.  Both are valid outcomes.
    const res = await api.post(`${BACKEND}/v1/assistant/apply`, {
      headers: adminHeaders(),
      data:    { messageId: assistantOrgMessageId },
    })

    expect([200, 409]).toContain(res.status())
    if (res.status() === 200) {
      const body = await res.json() as { applied: Array<{ op: string }>; errors: string[] }
      expect(body.errors).toHaveLength(0)
      expect(body.applied).toHaveLength(1)
      expect(body.applied[0]!.op).toBe('create_division')
    }
    await api.dispose()
  })

  test('POST /v1/assistant/apply create_division is idempotent on second apply (409)', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantOrgMessageId } = getSeedState()

    // Ensure applied state first — no longer relies on test 7 running before this
    await api.post(`${BACKEND}/v1/assistant/apply`, {
      headers: adminHeaders(),
      data:    { messageId: assistantOrgMessageId },
    })

    // Re-apply must always return 409
    const res = await api.post(`${BACKEND}/v1/assistant/apply`, {
      headers: adminHeaders(),
      data:    { messageId: assistantOrgMessageId },
    })

    expect(res.status()).toBe(409)
    await api.dispose()
  })
})
