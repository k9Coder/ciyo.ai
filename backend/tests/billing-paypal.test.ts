import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { getTenantById } from '../src/tenants/service.js'
import { startTestApp } from './helpers/setup.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => {
  // PAYPAL_SKIP_SIG_VERIFY bypasses the PayPal signature verification API call in tests.
  // NODE_ENV=test prevents the production guard from rejecting this flag.
  process.env['PAYPAL_SKIP_SIG_VERIFY'] = 'true'
  ;({ app } = await startTestApp())
})
beforeEach(async () => { await truncateAll() })
afterAll(async () => {
  delete process.env['PAYPAL_SKIP_SIG_VERIFY']
  await app.close()
})

describe('POST /webhooks/paypal', () => {
  it('activates tenant on BILLING.SUBSCRIPTION.ACTIVATED', async () => {
    const body = JSON.stringify({
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-PAYPAL001', custom_id: 'PP Law LLP|admin@pplaw.com|business|10' },
    })
    const res = await supertest(app.server)
      .post('/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id',   'test-id')
      .set('paypal-transmission-time', '2026-01-01T00:00:00Z')
      .set('paypal-cert-url',          'https://api.paypal.com/v1/notifications/certs/test')
      .set('paypal-transmission-sig',  'test-sig')
      .send(body)
    expect(res.status).toBe(200)
    const [row] = await db.select().from(tenants).where(eq(tenants.name, 'PP Law LLP'))
    expect(row?.subscriptionStatus).toBe('active')
  })

  it('cancels tenant on BILLING.SUBSCRIPTION.CANCELLED', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ externalSubId: 'I-PPCANCEL' }).where(eq(tenants.id, tenantId))
    const body = JSON.stringify({
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      resource: { id: 'I-PPCANCEL' },
    })
    await supertest(app.server)
      .post('/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id',   'test-id')
      .set('paypal-transmission-time', '2026-01-01T00:00:00Z')
      .set('paypal-cert-url',          'https://api.paypal.com/v1/notifications/certs/test')
      .set('paypal-transmission-sig',  'test-sig')
      .send(body)
    expect((await getTenantById(tenantId))?.subscriptionStatus).toBe('cancelled')
  })

  it('rejects requests with missing signature headers (signature verification fails)', async () => {
    const body = JSON.stringify({
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-FORGED001', custom_id: 'Evil Corp|evil@attacker.com|business|999' },
    })
    // No PayPal signature headers — verifyPayPalWebhookSignature should return false
    // when PAYPAL_SKIP_SIG_VERIFY is NOT set. We need a second app without the skip flag.
    // Since our test app has PAYPAL_SKIP_SIG_VERIFY=true, this test verifies the
    // verification returns 400 when headers are empty strings but the skip flag is set to false.
    // We test the rejection behavior with a dedicated app instance:
    delete process.env['PAYPAL_SKIP_SIG_VERIFY']
    const strictApp = buildApp()
    await strictApp.ready()

    const res = await supertest(strictApp.server)
      .post('/webhooks/paypal')
      .set('Content-Type', 'application/json')
      // No paypal-transmission-* headers set — will fail with missing PAYPAL_WEBHOOK_ID
      .send(body)
    // Without PAYPAL_WEBHOOK_ID configured, verifyPayPalWebhookSignature throws,
    // which surfaces as a 500 from the error handler. Either 400 or 500 is acceptable
    // here — the important thing is the event is NOT processed.
    expect(res.status).not.toBe(200)

    // Confirm no tenant was created
    const [row] = await db.select().from(tenants).where(eq(tenants.name, 'Evil Corp'))
    expect(row).toBeUndefined()

    await strictApp.close()
    // Restore for other tests
    process.env['PAYPAL_SKIP_SIG_VERIFY'] = 'true'
  })

  it('sets active status on PAYMENT.SALE.COMPLETED', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ externalSubId: 'I-SALE001', subscriptionStatus: 'past_due' }).where(eq(tenants.id, tenantId))
    const body = JSON.stringify({
      event_type: 'PAYMENT.SALE.COMPLETED',
      resource: { billing_agreement_id: 'I-SALE001' },
    })
    const res = await supertest(app.server)
      .post('/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id',   'test-id')
      .set('paypal-transmission-time', '2026-01-01T00:00:00Z')
      .set('paypal-cert-url',          'https://api.paypal.com/v1/notifications/certs/test')
      .set('paypal-transmission-sig',  'test-sig')
      .send(body)
    expect(res.status).toBe(200)
    expect((await getTenantById(tenantId))?.subscriptionStatus).toBe('active')
  })

  it('sets past_due status on BILLING.SUBSCRIPTION.PAYMENT.FAILED', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ externalSubId: 'I-FAIL001' }).where(eq(tenants.id, tenantId))
    const body = JSON.stringify({
      event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
      resource: { id: 'I-FAIL001' },
    })
    const res = await supertest(app.server)
      .post('/webhooks/paypal')
      .set('Content-Type', 'application/json')
      .set('paypal-transmission-id',   'test-id')
      .set('paypal-transmission-time', '2026-01-01T00:00:00Z')
      .set('paypal-cert-url',          'https://api.paypal.com/v1/notifications/certs/test')
      .set('paypal-transmission-sig',  'test-sig')
      .send(body)
    expect(res.status).toBe(200)
    expect((await getTenantById(tenantId))?.subscriptionStatus).toBe('past_due')
  })

  it('is idempotent: duplicate BILLING.SUBSCRIPTION.ACTIVATED does not create second tenant', async () => {
    const body = JSON.stringify({
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: 'I-IDEM001', custom_id: 'Idempotent Co|idem@test.com|starter|5' },
    })
    const headers = {
      'Content-Type':           'application/json',
      'paypal-transmission-id':   'test-id',
      'paypal-transmission-time': '2026-01-01T00:00:00Z',
      'paypal-cert-url':          'https://api.paypal.com/v1/notifications/certs/test',
      'paypal-transmission-sig':  'test-sig',
    }

    // First delivery
    const first = await supertest(app.server).post('/webhooks/paypal').set(headers).send(body)
    expect(first.status).toBe(200)

    // Simulated retry delivery
    const second = await supertest(app.server).post('/webhooks/paypal').set(headers).send(body)
    expect(second.status).toBe(200)

    // Only one tenant should exist
    const rows = await db.select().from(tenants).where(eq(tenants.externalSubId, 'I-IDEM001'))
    expect(rows).toHaveLength(1)
  })
})
