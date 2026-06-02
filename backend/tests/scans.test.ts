import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { scans } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  orgToken = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/scans', () => {
  it('records a scan and returns 200 with remaining count', async () => {
    const res = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.remaining).toBe('number')
    const rows = await db.select().from(scans)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.tenantId).toBe(tenantId)
    expect(rows[0]!.memberId).toBeNull()
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/scans').send()
    expect(res.status).toBe(401)
  })
})
