import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { getTenantById, updateSubscriptionStatus } from '../src/tenants/service.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'

beforeEach(async () => { await truncateAll() })

describe('getTenantById', () => {
  it('returns tenant for known id', async () => {
    const { tenantId } = await buildTestTenant()
    const tenant = await getTenantById(tenantId)
    expect(tenant?.id).toBe(tenantId)
  })

  it('returns null for unknown id', async () => {
    expect(await getTenantById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe('updateSubscriptionStatus', () => {
  it('sets past_due and computes grace period end from tenant gracePeriodDays', async () => {
    const { tenantId } = await buildTestTenant()
    await updateSubscriptionStatus(tenantId, 'past_due')
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    expect(row!.subscriptionStatus).toBe('past_due')
    expect(row!.gracePeriodEndsAt).not.toBeNull()
    const diffMs = row!.gracePeriodEndsAt!.getTime() - Date.now()
    expect(diffMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
    expect(diffMs).toBeLessThan(8 * 24 * 60 * 60 * 1000)
  })

  it('clears grace period end on reactivation', async () => {
    const { tenantId } = await buildTestTenant()
    await updateSubscriptionStatus(tenantId, 'past_due')
    await updateSubscriptionStatus(tenantId, 'active')
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    expect(row!.subscriptionStatus).toBe('active')
    expect(row!.gracePeriodEndsAt).toBeNull()
  })
})
