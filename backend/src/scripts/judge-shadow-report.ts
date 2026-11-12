// Judge v2 shadow report: how the shadow model compares with the primary (regex/keyword) decision on real
// traffic. Reads judge_shadow_checks only (no prompt content exists anywhere to read).
//
//   pnpm report:judge-shadow [--tenant <uuid>]
//
// Agreement is per check: "primary acted" = any rule in the check was blocked or warned by the primary;
// the secondary side is the strongest judge v2 verdict in the check (block > warn > ok > other, where other =
// pending/skipped/error). Latency percentiles use nearest rank over checks that were actually judged.
import { pathToFileURL } from 'url'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { judgeShadowChecks } from '../db/schema.js'

type Side = 'block' | 'warn' | 'ok' | 'other'

export interface JudgeShadowReport {
  checks: number
  verdictMix: Record<string, number>
  agreement: { primaryActed: Record<Side, number>; primaryQuiet: Record<Side, number> }
  rates: { pending: number; skipped: number; error: number }
  latency: Record<string, { n: number; p50: number; p95: number }>
  modelVersions: Record<string, number>
}

const RANK: Record<string, number> = { block: 3, warn: 2, ok: 1 }

function percentile(sorted: number[], q: number): number {
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!
}

export async function judgeShadowReport(opts: { tenantId?: string }): Promise<JudgeShadowReport> {
  const rows = opts.tenantId
    ? await db.select().from(judgeShadowChecks).where(eq(judgeShadowChecks.tenantId, opts.tenantId))
    : await db.select().from(judgeShadowChecks)

  const byCheck = new Map<string, typeof rows>()
  for (const r of rows) byCheck.set(r.checkId, [...(byCheck.get(r.checkId) ?? []), r])

  const judged = rows.filter((r) => r.ruleKind === 'judge_prompt')
  const verdictMix: Record<string, number> = {}
  for (const r of judged) verdictMix[r.secondaryVerdict] = (verdictMix[r.secondaryVerdict] ?? 0) + 1
  const rate = (v: string) => (judged.length ? Math.round(((verdictMix[v] ?? 0) / judged.length) * 1000) / 1000 : 0)

  const empty = (): Record<Side, number> => ({ block: 0, warn: 0, ok: 0, other: 0 })
  const agreement = { primaryActed: empty(), primaryQuiet: empty() }
  const latencies: Record<string, number[]> = {}
  const modelVersions: Record<string, number> = {}
  for (const checkRows of byCheck.values()) {
    const acted = checkRows.some((r) => r.primaryAction === 'block' || r.primaryAction === 'warn')
    const jp = checkRows.filter((r) => r.ruleKind === 'judge_prompt')
    const best = jp.reduce<string>((b, r) => ((RANK[r.secondaryVerdict] ?? 0) > (RANK[b] ?? 0) ? r.secondaryVerdict : b), 'other')
    const side: Side = best in RANK ? (best as Side) : 'other'
    agreement[acted ? 'primaryActed' : 'primaryQuiet'][side]++
    const first = checkRows[0]!
    modelVersions[first.modelVersion] = (modelVersions[first.modelVersion] ?? 0) + 1
    if (jp.some((r) => r.secondaryVerdict !== 'skipped')) {
      (latencies[first.surface] ??= []).push(Math.max(...checkRows.map((r) => r.latencyMs)))
    }
  }

  const latency: JudgeShadowReport['latency'] = {}
  for (const [surface, values] of Object.entries(latencies)) {
    const sorted = [...values].sort((a, b) => a - b)
    latency[surface] = { n: sorted.length, p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95) }
  }

  return { checks: byCheck.size, verdictMix, agreement, rates: { pending: rate('pending'), skipped: rate('skipped'), error: rate('error') },
           latency, modelVersions }
}

export function formatJudgeShadowReport(r: JudgeShadowReport): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`
  const row = (label: string, s: Record<Side, number>) =>
    `  ${label.padEnd(15)} ${String(s.block).padStart(7)} ${String(s.warn).padStart(7)} ${String(s.ok).padStart(7)} ${String(s.other).padStart(7)}`
  return [
    `Checks: ${r.checks}`,
    `Judge v2 verdicts (rule rows): ${Object.entries(r.verdictMix).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
    '',
    'Agreement (per check)      v2 block v2 warn   v2 ok   other',
    row('primary acted', r.agreement.primaryActed),
    row('primary quiet', r.agreement.primaryQuiet),
    '',
    `Pending ${pct(r.rates.pending)}  Skipped ${pct(r.rates.skipped)}  Error ${pct(r.rates.error)}`,
    ...Object.entries(r.latency).map(([s, l]) => `Latency ${s}: n=${l.n} p50 ${l.p50} ms, p95 ${l.p95} ms`),
    `Model versions: ${Object.entries(r.modelVersions).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`,
  ].join('\n')
}

async function main(): Promise<void> {
  const i = process.argv.indexOf('--tenant')
  const tenantId = i >= 0 ? process.argv[i + 1] : undefined
  console.log(formatJudgeShadowReport(await judgeShadowReport({ tenantId })))
  process.exit(0)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
