import { and, eq, gte, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { enforcementSignals, scans, members, shadowVerdicts, judgeShadowChecks } from '../db/schema.js'

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

export type ShadowVerdictKind = 'keyword' | 'pattern' | 'entropy' | 'score'
export const SHADOW_VERDICT_KINDS: ShadowVerdictKind[] = ['keyword', 'pattern', 'entropy', 'score']
export type ShadowVerdictOutcome = 'match' | 'no_match'
export const SHADOW_VERDICT_OUTCOMES: ShadowVerdictOutcome[] = ['match', 'no_match']

export interface ShadowVerdictInput {
  ruleId: string
  kind: ShadowVerdictKind
  verdict: ShadowVerdictOutcome
  confidence: number
  timestamp: string
}

export async function recordShadowVerdicts(tenantId: string, items: ShadowVerdictInput[]): Promise<void> {
  if (items.length === 0) return
  await db.insert(shadowVerdicts).values(items.map((item) => ({
    tenantId,
    ruleId:     item.ruleId,
    kind:       item.kind,
    verdict:    item.verdict,
    confidence: String(item.confidence),
    occurredAt: new Date(item.timestamp),
  })))
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

// ── Judge v2 shadow checks ────────────────────────────────────────────────────

export const JUDGE_SHADOW_SURFACES = ['extension', 'desktop'] as const
export const JUDGE_SHADOW_RULE_KINDS = ['keyword', 'pattern', 'judge_prompt'] as const
export const JUDGE_SHADOW_PRIMARY_ACTIONS = ['block', 'warn', 'log', 'none'] as const
export const JUDGE_SHADOW_SECONDARY_VERDICTS = ['block', 'warn', 'ok', 'pending', 'skipped', 'error', 'not_applicable'] as const

/** Mirrors JudgeShadowRow in @mykka/judge-v2. The router whitelists exactly these keys. */
export interface JudgeShadowRowInput {
  checkId: string
  surface: typeof JUDGE_SHADOW_SURFACES[number]
  ruleId: string
  ruleKind: typeof JUDGE_SHADOW_RULE_KINDS[number]
  primaryAction: typeof JUDGE_SHADOW_PRIMARY_ACTIONS[number]
  secondaryVerdict: typeof JUDGE_SHADOW_SECONDARY_VERDICTS[number]
  fastScore: number | null
  secondScore: number | null
  spanStart: number | null
  spanEnd: number | null
  messageChars: number
  windows: number
  latencyMs: number
  modelVersion: string
  occurredAt: string
}

export async function recordJudgeShadowChecks(tenantId: string, memberId: string | null, rows: JudgeShadowRowInput[]): Promise<void> {
  if (rows.length === 0) return
  await db.insert(judgeShadowChecks).values(rows.map((r) => ({
    tenantId,
    memberId,
    checkId:          r.checkId,
    surface:          r.surface,
    ruleId:           r.ruleId,
    ruleKind:         r.ruleKind,
    primaryAction:    r.primaryAction,
    secondaryVerdict: r.secondaryVerdict,
    fastScore:        r.fastScore === null ? null : r.fastScore.toFixed(3),
    secondScore:      r.secondScore === null ? null : r.secondScore.toFixed(3),
    spanStart:        r.spanStart,
    spanEnd:          r.spanEnd,
    messageChars:     r.messageChars,
    windows:          r.windows,
    latencyMs:        r.latencyMs,
    modelVersion:     r.modelVersion,
    occurredAt:       new Date(r.occurredAt),
  })))
}
