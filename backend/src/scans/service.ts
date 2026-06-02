import { and, eq, gte, count } from 'drizzle-orm'
import { db } from '../db/client.js'
import { scans, tenants } from '../db/schema.js'
import { isOverScanLimit, getScanLimit, type Plan } from '../billing/limits.js'

export async function countMonthlyScans(tenantId: string): Promise<number> {
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const [row] = await db
    .select({ n: count() })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, start)))
  return row?.n ?? 0
}

export async function recordScan(
  tenantId: string,
  memberId: string | null
): Promise<{ blocked: boolean; remaining: number }> {
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))

  if (!tenant) return { blocked: false, remaining: -1 }

  const plan  = tenant.plan as Plan
  const limit = getScanLimit(plan)

  if (limit !== -1) {
    const monthly = await countMonthlyScans(tenantId)
    if (isOverScanLimit(plan, monthly)) {
      return { blocked: true, remaining: 0 }
    }
    await db.insert(scans).values({ tenantId, memberId })
    return { blocked: false, remaining: Math.max(0, limit - monthly - 1) }
  }

  await db.insert(scans).values({ tenantId, memberId })
  return { blocked: false, remaining: -1 }
}
