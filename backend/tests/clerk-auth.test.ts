import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { members } from '../src/db/schema.js'
import { publishPolicy } from '../src/policy/service.js'
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
let tenantId: string
let orgToken: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
  const t = await buildTestTenant()
  tenantId  = t.tenantId
  orgToken  = t.orgToken

  const user = await buildTestUser(MOCK_CLERK_USER_ID, 'alice@acme.com')
  await db.insert(members).values({ tenantId, userId: user.id, email: 'alice@acme.com', role: 'member' })
  await publishPolicy(tenantId, { version: 1 as const, tenantId, subjects: [], siteConfigs: {} })
})
afterAll(async () => { await app.close() })

describe('GET /v1/policy — Clerk JWT auth', () => {
  it('accepts a Clerk JWT and returns 200', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
  })

  it('still accepts an org token', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
  })

  it('returns 401 when no users row exists for the Clerk user', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_nobody' })
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/User not found/)
  })

  it('returns 401 when user exists but has no member row', async () => {
    await db.delete(members).where(eq(members.tenantId, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Not enrolled/)
  })

  it('returns 401 for an invalid JWT', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Invalid JWT'))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer bad.jwt.token`)
    expect(res.status).toBe(401)
  })
})
