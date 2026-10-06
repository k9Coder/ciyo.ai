import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { shadowVerdicts } from '../src/db/schema.js'
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

const VALID_ITEM = { ruleId: '11111111-1111-1111-1111-111111111111', kind: 'keyword', verdict: 'match', confidence: 1, enforced: false, timestamp: '2026-10-07T00:00:00.000Z' }

describe('POST /v1/telemetry/shadow-verdict', () => {
  it('accepts a batch and stores it scoped to the tenant', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([VALID_ITEM])
    expect(res.status).toBe(204)

    const rows = await db.select().from(shadowVerdicts).where(eq(shadowVerdicts.tenantId, tenantId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.ruleId).toBe('11111111-1111-1111-1111-111111111111')
    expect(rows[0]!.kind).toBe('keyword')
    expect(rows[0]!.verdict).toBe('match')
    expect(Number(rows[0]!.confidence)).toBe(1)
  })

  it('rejects an unauthenticated request', async () => {
    const res = await supertest(app.server).post('/v1/telemetry/shadow-verdict').send([VALID_ITEM])
    expect(res.status).toBe(401)
  })

  it('rejects a malformed ruleId with 400, not a 500 from the database', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([{ ...VALID_ITEM, ruleId: 'not-a-uuid' }])
    expect(res.status).toBe(400)
  })

  it('rejects an item with an invalid kind', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([{ ...VALID_ITEM, kind: 'judge_prompt' }])
    expect(res.status).toBe(400)
  })

  it('rejects an item with an invalid verdict', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([{ ...VALID_ITEM, verdict: 'maybe' }])
    expect(res.status).toBe(400)
  })

  it('rejects an unparseable timestamp', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([{ ...VALID_ITEM, timestamp: 'not-a-date' }])
    expect(res.status).toBe(400)
  })

  it('rejects a batch larger than the cap', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send(Array.from({ length: 201 }, () => VALID_ITEM))
    expect(res.status).toBe(400)
  })

  it('accepts an empty array as a no-op', async () => {
    const res = await supertest(app.server)
      .post('/v1/telemetry/shadow-verdict')
      .set('Authorization', `Bearer ${orgToken}`)
      .send([])
    expect(res.status).toBe(204)
  })
})
