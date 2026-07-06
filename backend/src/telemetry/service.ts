import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { enforcementSignals, scans, members } from '../db/schema.js'

export type EnforcementReason = 'decision_timeout' | 'bridge_error' | 'adapter_miss'
export const ENFORCEMENT_REASONS: EnforcementReason[] = ['decision_timeout', 'bridge_error', 'adapter_miss']

export async function recordEnforcementSignal(
  tenantId: string,
  memberId: string | null,
  data: { hostname: string; reason: EnforcementReason; extVersion?: string | null },
): Promise<void> {
  await db.insert(enforcementSignals).values({
    tenantId,
    memberId,
    hostname:   data.hostname,
    reason:     data.reason,
    extVersion: data.extVersion ?? null,
  })
}

export interface DegradedHost {
  hostname: string
  reason: EnforcementReason
  count: number
}

/** Degraded-enforcement signals grouped by host+reason within the window. */
export async function recentDegraded(tenantId: string, windowMinutes = 60): Promise<DegradedHost[]> {
  const since = new Date(Date.now() - windowMinutes * 60_000)
  const rows = await db
    .select({
      hostname: enforcementSignals.hostname,
      reason:   enforcementSignals.reason,
      count:    sql<number>`count(*)::int`,
    })
    .from(enforcementSignals)
    .where(and(eq(enforcementSignals.tenantId, tenantId), gte(enforcementSignals.occurredAt, since)))
    .groupBy(enforcementSignals.hostname, enforcementSignals.reason)
  return rows.map(r => ({ hostname: r.hostname, reason: r.reason as EnforcementReason, count: r.count }))
}

/**
 * Silent-failure heuristic: an adapter that quietly stopped firing emits no
 * signals at all — it just stops producing scans. Flag when the tenant has
 * members but recorded zero scans in the recent window despite a non-trivial
 * trailing baseline.
 */
export async function silentFailureSuspected(tenantId: string): Promise<boolean> {
  const now = Date.now()
  const recentSince   = new Date(now - 60 * 60_000)        // last hour
  const baselineSince = new Date(now - 7 * 24 * 60 * 60_000) // last 7 days

  const [{ n: memberCount } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(members)
    .where(eq(members.tenantId, tenantId))
  if (memberCount === 0) return false

  const [{ n: recentScans } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, recentSince)))
  if (recentScans > 0) return false

  const [{ n: baselineScans } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, baselineSince)))

  // Baseline of ~1 scan/hour over 7d ≈ 168; require clearly-active history before alarming.
  const avgPerHour = baselineScans / (7 * 24)
  return avgPerHour >= 1
}
