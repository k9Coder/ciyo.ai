import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from '../helpers/admin-headers.js'
import { orgHeaders } from '../helpers/org-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

test.describe('Policy API', () => {
  test('GET /v1/policy/version returns current version', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/policy/version`, { headers: orgHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as { version: number }
    expect(typeof body.version).toBe('number')
    expect(body.version).toBeGreaterThanOrEqual(1)
    await api.dispose()
  })

  test('GET /v1/policy returns the full policy document', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/policy`, { headers: orgHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body['version']).toBe('number')
    expect(typeof body['tenantName']).toBe('string')
    expect(body['policy']).toBeDefined()
    await api.dispose()
  })

  test('GET /v1/policy returns 401 without a token', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/policy`)

    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('GET /v1/policy/history returns an array of published versions', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/policy/history`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as Array<{ version: number; publishedAt: string }>
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThanOrEqual(1)
    expect(typeof body[0]!.version).toBe('number')
    await api.dispose()
  })

  test('POST /v1/policy/rollback/:version creates a new higher version', async () => {
    // Publish a fresh version to ensure there are at least 2 versions
    const api = await playwrightRequest.newContext()
    await api.post(`${BACKEND}/v1/policy/publish`, { headers: adminHeaders() })

    const histRes   = await api.get(`${BACKEND}/v1/policy/history`, { headers: adminHeaders() })
    const history   = await histRes.json() as Array<{ version: number }>
    const maxBefore = Math.max(...history.map(h => h.version))

    // Rollback to version 1
    const rbRes = await api.post(`${BACKEND}/v1/policy/rollback/1`, { headers: adminHeaders() })
    expect(rbRes.status()).toBe(200)
    const rbBody = await rbRes.json() as { version: number }
    expect(rbBody.version).toBeGreaterThan(maxBefore)
    await api.dispose()
  })

  test('POST /v1/policy/rollback with invalid version returns error', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/policy/rollback/99999`, { headers: adminHeaders() })

    // Version not found → service throws, Fastify returns 500
    expect(res.status()).toBeGreaterThanOrEqual(400)
    await api.dispose()
  })
})
