import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, type Tenant } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'

export async function getTenantById(id: string): Promise<Tenant | null> {
  const rows = await db.select().from(tenants).where(eq(tenants.id, id))
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

export async function updateTenantName(tenantId: string, name: string): Promise<Tenant> {
  const [row] = await db
    .update(tenants)
    .set({ name })
    .where(eq(tenants.id, tenantId))
    .returning()
  return row!
}

export async function rotateOrgToken(tenantId: string): Promise<string> {
  const secret = generateSecret()
  await db.update(tenants).set({ orgTokenHash: await hashToken(secret) }).where(eq(tenants.id, tenantId))
  return formatToken('ps_live', tenantId, secret)
}

export async function rotateAdminToken(tenantId: string): Promise<string> {
  const secret = generateSecret()
  await db.update(tenants).set({ adminTokenHash: await hashToken(secret) }).where(eq(tenants.id, tenantId))
  return formatToken('ps_adm', tenantId, secret)
}

export async function updateTenantFailMode(tenantId: string, failMode: 'open' | 'closed'): Promise<Tenant> {
  const [row] = await db
    .update(tenants)
    .set({ failMode })
    .where(eq(tenants.id, tenantId))
    .returning()
  return row!
}
