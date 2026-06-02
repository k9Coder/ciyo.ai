import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Analytics API', () => {
  test('GET /v1/analytics/summary returns expected shape', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/analytics/summary`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body['scansTotal']).toBe('number')
    expect(typeof body['blocked']).toBe('number')
    expect(typeof body['warned']).toBe('number')
    await api.dispose()
  })

  test('GET /v1/analytics/daily returns array', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/analytics/daily`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    await api.dispose()
  })

  test('GET /v1/analytics/incidents returns array', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/analytics/incidents`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    await api.dispose()
  })

  test('GET /v1/analytics/top-sites returns array', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/analytics/top-sites`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    await api.dispose()
  })

  test('GET /v1/analytics/by-subject returns array', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/analytics/by-subject`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
    await api.dispose()
  })

  test('analytics endpoints reject requests without a token', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/analytics/summary`)

    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('GET /v1/analytics/summary accepts days=7 param', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/analytics/summary?days=7`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body['scansTotal']).toBe('number')
    await api.dispose()
  })
})
