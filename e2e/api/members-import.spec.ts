import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Members import API', () => {
  test('POST /v1/members/import creates members in bulk and returns them', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/members/import`, {
      headers: adminHeaders(),
      data: {
        rows: [
          { email: 'import-a@e2e.test', displayName: 'Import A' },
          { email: 'import-b@e2e.test', displayName: 'Import B' },
        ],
      },
    })

    expect(res.status()).toBe(201)
    const body = await res.json() as Array<{ email: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.some(m => m.email === 'import-a@e2e.test')).toBe(true)
    expect(body.some(m => m.email === 'import-b@e2e.test')).toBe(true)

    // Cleanup
    const listRes = await api.get(`${BACKEND}/v1/members`, { headers: adminHeaders() })
    const all     = await listRes.json() as Array<{ id: string; email: string }>
    for (const m of all.filter(m => m.email.endsWith('@e2e.test'))) {
      await api.delete(`${BACKEND}/v1/members/${m.id}`, { headers: adminHeaders() })
    }
    await api.dispose()
  })

  test('POST /v1/members/import with empty rows returns empty array', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/members/import`, {
      headers: adminHeaders(),
      data: { rows: [] },
    })

    expect(res.status()).toBe(201)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body).toHaveLength(0)
    await api.dispose()
  })

  test('POST /v1/members/import is idempotent for duplicate emails', async () => {
    const api = await playwrightRequest.newContext()
    const row = { email: 'import-dup@e2e.test' }

    const res1 = await api.post(`${BACKEND}/v1/members/import`, {
      headers: adminHeaders(),
      data: { rows: [row] },
    })
    expect(res1.status()).toBe(201)

    // Second import with same email must not throw
    const res2 = await api.post(`${BACKEND}/v1/members/import`, {
      headers: adminHeaders(),
      data: { rows: [row] },
    })
    expect(res2.status()).toBe(201)

    // Cleanup
    const listRes = await api.get(`${BACKEND}/v1/members`, { headers: adminHeaders() })
    const all     = await listRes.json() as Array<{ id: string; email: string }>
    for (const m of all.filter(m => m.email.endsWith('@e2e.test'))) {
      await api.delete(`${BACKEND}/v1/members/${m.id}`, { headers: adminHeaders() })
    }
    await api.dispose()
  })

  test('POST /v1/members/import returns 401 without a token', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/members/import`, {
      data: { rows: [{ email: 'noauth@e2e.test' }] },
    })

    expect(res.status()).toBe(401)
    await api.dispose()
  })
})
