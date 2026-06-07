import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { activateTenant } from '../src/billing/service.js'
import { getTenantById } from '../src/tenants/service.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

beforeEach(async () => { await truncateAll() })

describe('activateTenant', () => {
  it('creates tenant row and returns plaintext tokens', async () => {
    const result = await activateTenant({
      name: 'Acme Law LLP',
      paymentProvider: 'stripe',
      externalSubId: 'sub_test_001',
      plan: 'business',
      seatCount: 10,
    })
    const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    expect(result.orgToken).toMatch(new RegExp(`^ps_live_${UUID_RE}_[A-Za-z0-9_-]{32}$`))
    expect(result.adminToken).toMatch(new RegExp(`^ps_adm_${UUID_RE}_[A-Za-z0-9_-]{32}$`))
  })

  it('persists hashed tokens (not plaintext) in the database', async () => {
    const result = await activateTenant({
      name: 'A',
      paymentProvider: 'stripe',
      externalSubId: 'sub_1',
      plan: 'starter',
      seatCount: 1,
    })
    const tenant = await getTenantById(result.tenantId)
    expect(tenant?.subscriptionStatus).toBe('active')
    expect(tenant?.orgTokenHash).not.toMatch(/^ps_live/)
  })
})

let webhookApp: FastifyInstance

describe('POST /webhooks/stripe', () => {
  beforeAll(async () => {
    process.env['STRIPE_SKIP_SIG_VERIFY'] = 'true'
    webhookApp = buildApp()
    await webhookApp.ready()
  })
  afterAll(async () => {
    delete process.env['STRIPE_SKIP_SIG_VERIFY']
    await webhookApp.close()
  })
  beforeEach(async () => { await truncateAll() })

  it('activates tenant on checkout.session.completed', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer_email: 'admin@acme.com',
          metadata: { tenantName: 'Acme Law LLP', plan: 'business', seatCount: '10' },
          subscription: 'sub_stripe_001',
        },
      },
    }
    const res = await supertest(webhookApp.server)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test')
      .send(JSON.stringify(event))
    expect(res.status).toBe(200)
    const [row] = await db.select().from(tenants).where(eq(tenants.name, 'Acme Law LLP'))
    expect(row).not.toBeUndefined()
  })

  it('sets past_due on invoice.payment_failed', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ externalSubId: 'sub_fail_001' }).where(eq(tenants.id, tenantId))
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_fail_001' } },
    }
    await supertest(webhookApp.server)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test')
      .send(JSON.stringify(event))
    const tenant = await getTenantById(tenantId)
    expect(tenant?.subscriptionStatus).toBe('past_due')
  })
})
