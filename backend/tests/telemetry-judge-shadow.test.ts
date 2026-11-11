import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { judgeShadowChecks, events, shadowVerdicts } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let orgToken: string
let tenantId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  orgToken = t.orgToken
  tenantId = t.tenantId
})
afterAll(async () => { await app.close() })

const ROW = {
  checkId: '22222222-2222-4222-8222-222222222222',
  surface: 'extension',
  ruleId: '11111111-1111-1111-1111-111111111111',
  ruleKind: 'judge_prompt',
  primaryAction: 'none',
  secondaryVerdict: 'warn',
  fastScore: 0.61,
  secondScore: 0.74,
  spanStart: 10,
  spanEnd: 24,
  messageChars: 412,
  windows: 1,
  latencyMs: 1830,
  modelVersion: 'fast_v7+so_v7',
  occurredAt: '2026-11-11T10:00:00.000Z',
}

const post = (body: unknown) =>
  supertest(app.server).post('/v1/telemetry/judge-shadow').set('Authorization', `Bearer ${orgToken}`).send(body as object)

describe('POST /v1/telemetry/judge-shadow', () => {
  it('stores a valid batch scoped to the tenant', async () => {
    const res = await post([ROW, { ...ROW, ruleId: '33333333-3333-4333-8333-333333333333', ruleKind: 'pattern',
      primaryAction: 'block', secondaryVerdict: 'not_applicable', fastScore: null, secondScore: null, spanStart: null, spanEnd: null, windows: 0 }])
    expect(res.status).toBe(204)
    const rows = await db.select().from(judgeShadowChecks).where(eq(judgeShadowChecks.tenantId, tenantId))
    expect(rows).toHaveLength(2)
    const jp = rows.find((r) => r.ruleKind === 'judge_prompt')!
    expect(jp).toMatchObject({ checkId: ROW.checkId, surface: 'extension', primaryAction: 'none', secondaryVerdict: 'warn',
      spanStart: 10, spanEnd: 24, messageChars: 412, windows: 1, latencyMs: 1830, modelVersion: 'fast_v7+so_v7' })
    expect(Number(jp.fastScore)).toBeCloseTo(0.61, 3)
    expect(Number(jp.secondScore)).toBeCloseTo(0.74, 3)
  })

  it('never writes to events or shadow_verdicts', async () => {
    await post([ROW])
    expect(await db.select().from(events)).toHaveLength(0)
    expect(await db.select().from(shadowVerdicts)).toHaveLength(0)
  })

  it('accepts an empty batch with 204', async () => {
    expect((await post([])).status).toBe(204)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await supertest(app.server).post('/v1/telemetry/judge-shadow').send([ROW])
    expect(res.status).toBe(401)
  })

  const bad: [string, Record<string, unknown>][] = [
    ['an unknown key (no room for prompt text)', { ...ROW, text: 'my password is hunter2' }],
    ['a non-UUID checkId', { ...ROW, checkId: 'abc' }],
    ['a non-UUID ruleId', { ...ROW, ruleId: 'abc' }],
    ['a bad surface', { ...ROW, surface: 'web' }],
    ['a bad ruleKind', { ...ROW, ruleKind: 'entropy' }],
    ['a bad primaryAction', { ...ROW, primaryAction: 'allow' }],
    ['a bad secondaryVerdict', { ...ROW, secondaryVerdict: 'maybe' }],
    ['a score above 1', { ...ROW, fastScore: 1.2 }],
    ['a negative score', { ...ROW, secondScore: -0.1 }],
    ['a string score', { ...ROW, fastScore: '0.5' }],
    ['a negative int', { ...ROW, latencyMs: -1 }],
    ['a non-integer', { ...ROW, messageChars: 3.5 }],
    ['NaN', { ...ROW, windows: Number.NaN }],
    ['spanEnd before spanStart', { ...ROW, spanStart: 30, spanEnd: 10 }],
    ['only one span end present', { ...ROW, spanEnd: null }],
    ['a modelVersion with spaces', { ...ROW, modelVersion: 'fast v7' }],
    ['a modelVersion carrying text', { ...ROW, modelVersion: 'x'.repeat(40) }],
    ['a bad timestamp', { ...ROW, occurredAt: 'yesterday' }],
    ['a missing field', (({ windows: _w, ...rest }) => rest)(ROW)],
  ]
  for (const [what, row] of bad) {
    it(`rejects ${what} with 400 and stores nothing`, async () => {
      const res = await post([ROW, row])
      expect(res.status).toBe(400)
      expect(await db.select().from(judgeShadowChecks)).toHaveLength(0)
    })
  }

  it('rejects a non-array body and a batch over 100 rows', async () => {
    expect((await post(ROW)).status).toBe(400)
    expect((await post(Array.from({ length: 101 }, () => ROW))).status).toBe(400)
  })
})
