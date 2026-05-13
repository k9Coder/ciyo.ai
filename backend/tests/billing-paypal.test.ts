import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { getTenantBySlug } from '../src/tenants/service.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => {
  process.env['PAYPAL_SKIP_SIG_VERIFY'] = 'true'
  app = buildApp()
  await app.ready()
})
beforeEach(async () => { await truncateAll() })
afterAll(async () => {
  delete process.env['PAYPAL_SKIP_SIG_VERIFY']
  await app.close()
})

describe('POST /webhooks/paypal', () => {
  it('activates tenant on BILLING.SUBSCRIPTION.ACTIVATED', async () => {
    const res = await supertest(app.server)
      .post('/webhooks/paypal')
      .send({
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: { id: 'I-PAYPAL001', custom_id: 'pplaw|PP Law LLP|admin@pplaw.com' },
      })
    expect(res.status).toBe(200)
    expect((await getTenantBySlug('pplaw'))?.subscriptionStatus).toBe('active')
  })

  it('cancels tenant on BILLING.SUBSCRIPTION.CANCELLED', async () => {
    const { tenantId } = await buildTestTenant('ppfirm')
    await db.update(tenants).set({ externalSubId: 'I-PPCANCEL' }).where(eq(tenants.id, tenantId))
    await supertest(app.server).post('/webhooks/paypal').send({
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      resource: { id: 'I-PPCANCEL' },
    })
    expect((await getTenantBySlug('ppfirm'))?.subscriptionStatus).toBe('cancelled')
  })
})
