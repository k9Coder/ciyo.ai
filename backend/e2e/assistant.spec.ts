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

  test('POST /v1/assistant/apply executes the seeded action', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantMessageId } = getSeedState()

    const res  = await api.post(`${BACKEND}/v1/assistant/apply`, {
      headers: adminHeaders(),
      data:    { messageId: assistantMessageId },
    })

    expect(res.status()).toBe(200)
    const body = await res.json() as { applied: unknown[]; errors: string[] }
    expect(body.errors).toHaveLength(0)
    expect(body.applied.length).toBeGreaterThanOrEqual(1)
    await api.dispose()
  })

  test('POST /v1/assistant/apply returns 409 when already applied', async () => {
    const api = await playwrightRequest.newContext()
    const { assistantMessageId } = getSeedState()

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
})
