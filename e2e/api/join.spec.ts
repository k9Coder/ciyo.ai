import { test, expect, request as playwrightRequest } from '@playwright/test'
import { orgHeaders } from '../helpers/org-headers.js'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Auth join API', () => {
  test('POST /v1/auth/join creates a new member and returns 201', async () => {
    const email = 'join-new@e2e.test'
    const api   = await playwrightRequest.newContext()

    const res  = await api.post(`${BACKEND}/v1/auth/join`, {
      headers: orgHeaders(),
      data:    { email },
    })
    expect(res.status()).toBe(201)
    const body = await res.json() as { id: string; email: string }
    expect(body.email).toBe(email)

    // Cleanup
    const listRes = await api.get(`${BACKEND}/v1/members`, { headers: adminHeaders() })
    const all     = await listRes.json() as Array<{ id: string; email: string }>
    const member  = all.find(m => m.email === email)
    if (member) await api.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('POST /v1/auth/join for an existing member returns 200', async () => {
    // The seeded member email is the E2E_CLERK_USER_EMAIL — use a known existing member
    const email = 'join-existing@e2e.test'
    const api   = await playwrightRequest.newContext()

    // First join creates the member (201)
    await api.post(`${BACKEND}/v1/auth/join`, { headers: orgHeaders(), data: { email } })

    // Second join is idempotent (200)
    const res = await api.post(`${BACKEND}/v1/auth/join`, {
      headers: orgHeaders(),
      data:    { email },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as { email: string }
    expect(body.email).toBe(email)

    // Cleanup
    const listRes = await api.get(`${BACKEND}/v1/members`, { headers: adminHeaders() })
    const all     = await listRes.json() as Array<{ id: string; email: string }>
    const member  = all.find(m => m.email === email)
    if (member) await api.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
    await api.dispose()
  })

  test('POST /v1/auth/join with invalid email returns 400', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/auth/join`, {
      headers: orgHeaders(),
      data:    { email: 'not-an-email' },
    })

    expect(res.status()).toBe(400)
    await api.dispose()
  })

  test('POST /v1/auth/join without a token returns 401', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/auth/join`, {
      data: { email: 'noauth@e2e.test' },
    })

    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('POST /v1/auth/join with admin token is accepted (requireOrgToken allows both)', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/auth/join`, {
      headers: adminHeaders(),
      data:    { email: 'admintoken-join@e2e.test' },
    })

    // requireOrgToken validates the token hash against either org or admin hash,
    // so ps_adm tokens are also accepted on this endpoint
    expect([200, 201]).toContain(res.status())

    // Cleanup
    const listRes = await api.get(`${BACKEND}/v1/members`, { headers: adminHeaders() })
    const all     = await listRes.json() as Array<{ id: string; email: string }>
    const member  = all.find(m => m.email === 'admintoken-join@e2e.test')
    if (member) await api.delete(`${BACKEND}/v1/members/${member.id}`, { headers: adminHeaders() })
    await api.dispose()
  })
})
