import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, type Tenant } from '../db/schema.js'

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const rows = await db.select().from(tenants).where(eq(tenants.slug, slug))
  return rows[0] ?? null
}

export async function updateSubscriptionStatus(
  tenantId: string,
  status: 'active' | 'past_due' | 'cancelled'
): Promise<void> {
  const updates: Partial<typeof tenants.$inferInsert> = { subscriptionStatus: status }

  if (status === 'past_due') {
    const [tenant] = await db
      .select({ days: tenants.gracePeriodDays })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
    if (tenant) {
      const end = new Date()
      end.setDate(end.getDate() + tenant.days)
      updates.gracePeriodEndsAt = end
    }
  } else {
    updates.gracePeriodEndsAt = null
  }

  await db.update(tenants).set(updates).where(eq(tenants.id, tenantId))
}
