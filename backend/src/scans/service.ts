import { and, eq, gte, count } from 'drizzle-orm'
import { db } from '../db/client.js'
import { scans } from '../db/schema.js'
import { isOverScanLimit, getScanLimit, type Plan } from '../billing/limits.js'
import { tenantsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'

// TODO(infrastructure): The `scans` table has no retention/purge mechanism.
// Rows accumulate indefinitely — old rows are ignored for billing purposes but
// are never deleted. This means:
//   1. The table grows without bound (storage cost).
//   2. Deleted members' scan rows remain with a dangling memberId FK (schema allows
//      nullable memberId so no FK error, but personal data persists after erasure).
//   3. Per GDPR Art. 5(1)(e) (storage limitation), scan metadata constitutes
//      behavioral personal data and must be purged when it is no longer necessary.
//
// Required: a scheduled infrastructure job that purges `scans` rows older than
// the tenant's configured retention window (default: 90 days).
// On member deletion, either cascade-delete or anonymize (set memberId = null)
// that member's scan rows so personal data is actually removed on erasure requests.

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
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const tenant = await tenantsClient.get<{ plan: string }>(`/${tenantId}`)
    .then(r => r.data)
    .catch(e => { if ((e as Error).message.startsWith('[404]')) return null; throw e })

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
