import { and, eq, gte, lt, count } from 'drizzle-orm'
import { db } from '../db/client.js'
import { scans, enforcementSignals } from '../db/schema.js'
import { isOverScanLimit, getScanLimit, type Plan } from '../billing/limits.js'
import { tenantsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import { logger } from '../logger/index.js'

// Retention window for behavioral telemetry (scans + enforcement_signals). Per
// GDPR Art. 5(1)(e) (storage limitation), this metadata is purged once it is no
// longer necessary. Pilot policy: 90 days.
export const PILOT_RETENTION_DAYS = 90

/**
 * Delete telemetry rows older than PILOT_RETENTION_DAYS across both the `scans`
 * and `enforcement_signals` tables. Returns per-table deletion counts. Safe to
 * run repeatedly (idempotent) — scheduled on boot and every 24h.
 */
export async function purgeExpired(): Promise<{ scans: number; enforcementSignals: number }> {
  const cutoff = new Date(Date.now() - PILOT_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const deletedScans = await db.delete(scans)
    .where(lt(scans.occurredAt, cutoff))
    .returning({ id: scans.id })
  const deletedSignals = await db.delete(enforcementSignals)
    .where(lt(enforcementSignals.occurredAt, cutoff))
    .returning({ id: enforcementSignals.id })

  return { scans: deletedScans.length, enforcementSignals: deletedSignals.length }
}

/**
 * Erase a member's personal link from retained telemetry by nulling memberId on
 * their `scans` and `enforcement_signals` rows. Called from the member-deletion
 * path so behavioral data survives for aggregate/billing purposes but no longer
 * identifies the erased individual. Returns per-table update counts.
 */
export async function anonymizeMember(memberId: string): Promise<{ scans: number; enforcementSignals: number }> {
  const updatedScans = await db.update(scans)
    .set({ memberId: null })
    .where(eq(scans.memberId, memberId))
    .returning({ id: scans.id })
  const updatedSignals = await db.update(enforcementSignals)
    .set({ memberId: null })
    .where(eq(enforcementSignals.memberId, memberId))
    .returning({ id: enforcementSignals.id })

  return { scans: updatedScans.length, enforcementSignals: updatedSignals.length }
}

let retentionTimer: NodeJS.Timeout | null = null

/**
 * Run the retention purge once immediately, then every 24h. The interval is
 * `.unref()`'d so it never blocks process shutdown. Idempotent: repeated calls
 * do not stack timers.
 */
export function scheduleRetentionPurge(): void {
  if (retentionTimer) return

  const runOnce = async (): Promise<void> => {
    try {
      const counts = await purgeExpired()
      logger.info('retention purge complete', {
        retentionDays: PILOT_RETENTION_DAYS,
        scansDeleted: counts.scans,
        enforcementSignalsDeleted: counts.enforcementSignals,
      })
    } catch (err) {
      logger.error('retention purge failed', { error: (err as Error).message })
    }
  }

  void runOnce()
  retentionTimer = setInterval(() => { void runOnce() }, 24 * 60 * 60 * 1000)
  retentionTimer.unref()
}

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
