import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { activateTenant, tenantIdBySubId } from '../src/billing/service.js'
import { updateSubscriptionStatus } from '../src/billing/service.js'
import { getTenantById } from '../src/tenants/service.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'

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

  it('is idempotent: returns empty tokens on duplicate externalSubId', async () => {
    const first = await activateTenant({
      name: 'Idempotent Corp',
      paymentProvider: 'stripe',
      externalSubId: 'sub_idem_001',
      plan: 'business',
      seatCount: 5,
    })
    expect(first.orgToken).not.toBe('')

    // Simulate webhook retry with same externalSubId
    const second = await activateTenant({
      name: 'Idempotent Corp',
      paymentProvider: 'stripe',
      externalSubId: 'sub_idem_001',
      plan: 'business',
      seatCount: 5,
    })
    // Should return the existing tenant without creating a duplicate
    expect(second.tenantId).toBe(first.tenantId)
    expect(second.orgToken).toBe('')    // empty sentinel — already sent on first activation
    expect(second.adminToken).toBe('')  // empty sentinel

    // Only one tenant row should exist
    const rows = await db.select().from(tenants).where(eq(tenants.externalSubId, 'sub_idem_001'))
    expect(rows).toHaveLength(1)
  })
})

describe('billing service functions', () => {
  it('sets past_due status via updateSubscriptionStatus', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ externalSubId: 'sub_fail_001' }).where(eq(tenants.id, tenantId))
    const id = await tenantIdBySubId('sub_fail_001')
    expect(id).toBe(tenantId)
    await updateSubscriptionStatus(tenantId, 'past_due')
    const tenant = await getTenantById(tenantId)
    expect(tenant?.subscriptionStatus).toBe('past_due')
  })

  it('sets cancelled status via updateSubscriptionStatus', async () => {
    const { tenantId } = await buildTestTenant()
    await updateSubscriptionStatus(tenantId, 'cancelled')
    const tenant = await getTenantById(tenantId)
    expect(tenant?.subscriptionStatus).toBe('cancelled')
  })
})
