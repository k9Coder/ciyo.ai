import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_test_alice'
const MOCK_CLERK_JWT     = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: 'user_test_alice' }),
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

let app: FastifyInstance

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
})
afterAll(async () => { await app.close() })

describe('GET /v1/me/memberships', () => {
  it('returns 401 without a token', async () => {
    const res = await supertest(app.server).get('/v1/me/memberships')
    expect(res.status).toBe(401)
  })

  it('returns a single membership with tenantId, tenantName and role', async () => {
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'alice@acme.com')
    const { tenantId } = await buildTestTenant('acme')
    await buildTestMember(tenantId, user)

    const res = await supertest(app.server)
      .get('/v1/me/memberships')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body.memberships).toHaveLength(1)
    expect(res.body.memberships[0]).toMatchObject({
      tenantId,
      tenantName: 'Test Firm acme',
      role: 'member',
    })
  })

  it('returns two memberships for a user in two tenants', async () => {
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'alice@acme.com')
    const { tenantId: tenantA } = await buildTestTenant('acme')
    const { tenantId: tenantB } = await buildTestTenant('beta')
    await buildTestMember(tenantA, user)
    await buildTestMember(tenantB, user)

    const res = await supertest(app.server)
      .get('/v1/me/memberships')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body.memberships).toHaveLength(2)
    const tenantIds = res.body.memberships.map((m: { tenantId: string }) => m.tenantId)
    expect(tenantIds).toEqual(expect.arrayContaining([tenantA, tenantB]))
  })

  it('returns an empty array for a user with no memberships', async () => {
    await buildTestUser(MOCK_CLERK_USER_ID, 'alice@acme.com')

    const res = await supertest(app.server)
      .get('/v1/me/memberships')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body.memberships).toEqual([])
  })

  it('returns 401 when no users row exists for the Clerk user', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_nobody' })
    const res = await supertest(app.server)
      .get('/v1/me/memberships')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/User not found/)
  })
})
