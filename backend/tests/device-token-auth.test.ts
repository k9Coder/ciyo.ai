import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { deviceTokens } from '../src/db/schema.js'
import { generateSecret, formatDeviceToken, hashToken } from '../src/auth/tokens.js'
import type { FastifyInstance } from 'fastify'

vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }))

async function seedDeviceToken(opts: {
  tenantId: string
  memberId: string
  expiresAt?: Date
  revokedAt?: Date | null
}): Promise<string> {
  const secret = generateSecret()
  const [row] = await db.insert(deviceTokens).values({
    tenantId:  opts.tenantId,
    memberId:  opts.memberId,
    tokenHash: await hashToken(secret),
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    revokedAt: opts.revokedAt ?? null,
  }).returning({ id: deviceTokens.id })
  return formatDeviceToken(row!.id, secret)
}

describe('GET /v1/policy with a pd_ device token', () => {
  let app: FastifyInstance
  let tenantId: string
  let memberId: string

  beforeAll(async () => { ({ app } = await startTestApp()) })
  beforeEach(async () => {
    await truncateAll()
    const t = await buildTestTenant()
    tenantId = t.tenantId
    const user = await buildTestUser('clerk_device_test', 'device@example.com')
    memberId = await buildTestMember(tenantId, user)
  })
  afterAll(async () => { await app.close() })

  it('authenticates with a valid, unexpired, unrevoked device token', async () => {
    const token = await seedDeviceToken({ tenantId, memberId })
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${token}`)
    // No policy has been published for this tenant — 404 proves auth succeeded
    // and the request reached the route handler (a 401 would prove otherwise).
    expect(res.status).toBe(404)
  })

  it('rejects an expired device token with 401', async () => {
    const token = await seedDeviceToken({ tenantId, memberId, expiresAt: new Date(Date.now() - 1000) })
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('expired')
  })

  it('rejects a revoked device token with 401', async () => {
    const token = await seedDeviceToken({ tenantId, memberId, revokedAt: new Date() })
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toContain('revoked')
  })

  it('rejects a well-formed but unknown device token with 401', async () => {
    const bogus = formatDeviceToken('99999999-9999-9999-9999-999999999999', generateSecret())
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${bogus}`)
    expect(res.status).toBe(401)
  })

  it('rejects a malformed pd_ token with 401', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', 'Bearer pd_garbage')
    expect(res.status).toBe(401)
  })
})
