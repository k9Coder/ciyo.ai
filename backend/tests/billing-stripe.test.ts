import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { activateTenant } from '../src/billing/service.js'
import { getTenantBySlug } from '../src/tenants/service.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

beforeEach(async () => { await truncateAll() })

describe('activateTenant', () => {
  it('creates tenant row and returns plaintext tokens', async () => {
    const result = await activateTenant({
      name: 'Acme Law LLP',
      slug: 'acmelaw',
      paymentProvider: 'stripe',
      externalSubId: 'sub_test_001',
    })
    expect(result.orgToken).toMatch(/^ps_live_acmelaw_[A-Za-z0-9_-]{32}$/)
    expect(result.adminToken).toMatch(/^ps_adm_acmelaw_[A-Za-z0-9_-]{32}$/)
  })

  it('persists hashed tokens (not plaintext) in the database', async () => {
    await activateTenant({ name: 'A', slug: 'alaw', paymentProvider: 'stripe', externalSubId: 'sub_1' })
    const tenant = await getTenantBySlug('alaw')
    expect(tenant?.subscriptionStatus).toBe('active')
    expect(tenant?.orgTokenHash).not.toMatch(/^ps_live/)
  })

  it('throws if slug already exists', async () => {
    await activateTenant({ name: 'A', slug: 'dup', paymentProvider: 'stripe', externalSubId: 'sub_1' })
    await expect(
      activateTenant({ name: 'B', slug: 'dup', paymentProvider: 'stripe', externalSubId: 'sub_2' })
    ).rejects.toThrow()
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
          metadata: { tenantName: 'Acme Law LLP', tenantSlug: 'acme2law' },
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
    expect(await getTenantBySlug('acme2law')).not.toBeNull()
  })

  it('sets past_due on invoice.payment_failed', async () => {
    const { tenantId } = await buildTestTenant('invoicefirm')
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
    expect((await getTenantBySlug('invoicefirm'))?.subscriptionStatus).toBe('past_due')
  })
})
