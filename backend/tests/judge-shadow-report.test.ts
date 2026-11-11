import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { judgeShadowChecks } from '../src/db/schema.js'
import { judgeShadowReport, formatJudgeShadowReport } from '../src/scripts/judge-shadow-report.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantA: string
let tenantB: string

beforeAll(async () => { ({ app } = await startTestApp()) })
afterAll(async () => { await app.close() })

const JP = '11111111-1111-4111-8111-111111111111'
const KW = '33333333-3333-4333-8333-333333333333'
let n = 0
const check = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`

function row(tenantId: string, checkId: string, o: Partial<typeof judgeShadowChecks.$inferInsert> = {}): typeof judgeShadowChecks.$inferInsert {
  return { tenantId, checkId, surface: 'extension', ruleId: JP, ruleKind: 'judge_prompt', primaryAction: 'none', secondaryVerdict: 'ok',
    fastScore: '0.1', secondScore: null, spanStart: null, spanEnd: null, messageChars: 10, windows: 0, latencyMs: 100,
    modelVersion: 'fast_v7+so_v7', occurredAt: new Date('2026-11-11T00:00:00Z'), ...o }
}

beforeEach(async () => {
  await truncateAll()
  tenantA = (await buildTestTenant()).tenantId
  tenantB = (await buildTestTenant()).tenantId
  const c1 = check(), c2 = check(), c3 = check(), c4 = check(), c5 = check()
  await db.insert(judgeShadowChecks).values([
    // c1: primary blocked (keyword), secondary blocked → agree
    row(tenantA, c1, { secondaryVerdict: 'block', latencyMs: 1000 }),
    row(tenantA, c1, { ruleId: KW, ruleKind: 'keyword', primaryAction: 'block', secondaryVerdict: 'not_applicable', fastScore: null }),
    // c2: primary nothing, secondary warn
    row(tenantA, c2, { secondaryVerdict: 'warn', latencyMs: 2000 }),
    // c3: primary nothing, secondary ok
    row(tenantA, c3, { secondaryVerdict: 'ok', latencyMs: 300, surface: 'desktop' }),
    // c4: skipped (model not ready) — no latency contribution
    row(tenantA, c4, { secondaryVerdict: 'skipped', latencyMs: 0 }),
    // c5: other tenant, pending
    row(tenantB, c5, { secondaryVerdict: 'pending', latencyMs: 60000, modelVersion: 'fast_v8+so_v8' }),
  ])
})

describe('judgeShadowReport', () => {
  it('summarises checks, verdict mix, agreement, failure rates, latency and versions', async () => {
    const r = await judgeShadowReport({})
    expect(r.checks).toBe(5)
    expect(r.verdictMix).toEqual({ block: 1, warn: 1, ok: 1, skipped: 1, pending: 1 })
    expect(r.agreement).toEqual({
      primaryActed: { block: 1, warn: 0, ok: 0, other: 0 },
      primaryQuiet: { block: 0, warn: 1, ok: 1, other: 2 },
    })
    expect(r.rates).toEqual({ pending: 0.2, skipped: 0.2, error: 0 })
    expect(r.latency.extension).toEqual({ n: 3, p50: 2000, p95: 60000 })
    expect(r.latency.desktop).toEqual({ n: 1, p50: 300, p95: 300 })
    expect(r.modelVersions).toEqual({ 'fast_v7+so_v7': 4, 'fast_v8+so_v8': 1 })
  })

  it('filters by tenant', async () => {
    const r = await judgeShadowReport({ tenantId: tenantB })
    expect(r.checks).toBe(1)
    expect(r.verdictMix).toEqual({ pending: 1 })
  })

  it('formats a readable text report', async () => {
    const text = formatJudgeShadowReport(await judgeShadowReport({}))
    expect(text).toContain('Checks: 5')
    expect(text).toContain('Agreement')
    expect(text).toContain('p95')
  })
})
