import { test, expect, request as playwrightRequest } from '@playwright/test'
import { adminHeaders } from './helpers/admin-headers.js'
import { getSeedState } from './helpers/seed-state.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

function freeAdminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getSeedState().freeAdminToken}` }
}

test.describe('Billing API', () => {
  test('GET /v1/billing/status returns business plan for main tenant', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/billing/status`, { headers: adminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as {
      plan: string; subscriptionStatus: string; seatLimit: number
      monthlyScans: number; scanLimit: number; scanBlocked: boolean
      features: { assistantEnabled: boolean; advancedAnalytics: boolean }
    }
    expect(body.plan).toBe('business')
    expect(body.subscriptionStatus).toBe('active')
    expect(body.seatLimit).toBe(-1)
    expect(body.scanLimit).toBe(-1)
    expect(body.scanBlocked).toBe(false)
    expect(body.features.assistantEnabled).toBe(true)
    expect(body.features.advancedAnalytics).toBe(true)
    await api.dispose()
  })

  test('GET /v1/billing/status returns free plan with scan limit reached', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/billing/status`, { headers: freeAdminHeaders() })

    expect(res.status()).toBe(200)
    const body = await res.json() as {
      plan: string; monthlyScans: number; scanLimit: number; scanBlocked: boolean
      seatCount: number; seatLimit: number
      features: { assistantEnabled: boolean; advancedAnalytics: boolean }
    }
    expect(body.plan).toBe('free')
    expect(body.scanLimit).toBe(500)
    expect(body.monthlyScans).toBe(500)
    expect(body.scanBlocked).toBe(true)
    expect(body.seatCount).toBe(3)
    expect(body.seatLimit).toBe(3)
    expect(body.features.assistantEnabled).toBe(false)
    expect(body.features.advancedAnalytics).toBe(false)
    await api.dispose()
  })

  test('GET /v1/billing/status returns 401 without auth', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/billing/status`)
    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('POST /v1/scans returns 402 when free plan scan limit reached', async () => {
    const api = await playwrightRequest.newContext()
    const orgHeaders = { Authorization: `Bearer ${getSeedState().freeOrgToken}` }
    const res = await api.post(`${BACKEND}/v1/scans`, { headers: orgHeaders })
    expect(res.status()).toBe(402)
    const body = await res.json() as { blocked: boolean }
    expect(body.blocked).toBe(true)
    await api.dispose()
  })

  test('POST /v1/scans succeeds for business plan tenant', async () => {
    const api = await playwrightRequest.newContext()
    const orgHeaders = { Authorization: `Bearer ${getSeedState().orgToken}` }
    const res = await api.post(`${BACKEND}/v1/scans`, { headers: orgHeaders })
    expect(res.status()).toBe(200)
    const body = await res.json() as { ok: boolean; remaining: number }
    expect(body.ok).toBe(true)
    expect(body.remaining).toBe(-1)
    await api.dispose()
  })

  test('POST /v1/assistant/chat returns 402 on free plan', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.post(`${BACKEND}/v1/assistant/chat`, {
      headers: freeAdminHeaders(),
      data:    { message: 'hello' },
    })
    expect(res.status()).toBe(402)
    await api.dispose()
  })

  test('POST /v1/billing/free-signup creates a new tenant', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/billing/free-signup`, {
      data: { name: 'E2E Free Test', email: `e2efree-${Date.now()}@example.com` },
    })
    expect(res.status()).toBe(201)
    const body = await res.json() as { orgToken: string; adminToken: string }
    expect(body.orgToken).toMatch(/^ps_live_/)
    expect(body.adminToken).toMatch(/^ps_adm_/)
    await api.dispose()
  })

  test('POST /v1/billing/stripe/checkout returns 404 (Stripe disabled)', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/billing/stripe/checkout`, {
      data: { plan: 'starter', seatCount: 1, tenantName: 'Test', email: 'test@test.com' },
    })
    expect(res.status()).toBe(404)
    await api.dispose()
  })

  test('POST /v1/billing/paypal/checkout returns approval URL for starter plan', async () => {
    // Skip if PayPal sandbox credentials are not configured
    if (!process.env['PAYPAL_CLIENT_ID']) {
      test.skip()
      return
    }
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/billing/paypal/checkout`, {
      data: { plan: 'starter', seatCount: 1, tenantName: 'E2E PayPal Test', email: 'e2e@ciyo.ai' },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as { url: string }
    expect(body.url).toMatch(/^https:\/\/www\.sandbox\.paypal\.com|^https:\/\/www\.paypal\.com/)
    await api.dispose()
  })
})
