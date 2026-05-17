import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
// mockVerifyToken is the mocked stand-in for @clerk/backend's verifyToken
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { tenants, members } from '../src/db/schema.js'
import { publishPolicy } from '../src/policy/service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_test_alice'
const MOCK_CLERK_ORG_ID  = 'org_test_acme'
const MOCK_CLERK_JWT     = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: 'user_test_alice', org_id: 'org_test_acme' }),
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

let app: FastifyInstance
let tenantId: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID, org_id: MOCK_CLERK_ORG_ID })
  const t = await buildTestTenant()
  tenantId = t.tenantId
  orgToken = t.orgToken
  await db.update(tenants).set({ clerkOrgId: MOCK_CLERK_ORG_ID }).where(eq(tenants.id, tenantId))
  await db.insert(members).values({
    tenantId,
    email: 'alice@acme.com',
    clerkId: MOCK_CLERK_USER_ID,
    role: 'member',
  })
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

  it('still accepts an org token (backward compat)', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
  })

  it('returns 401 for unknown Clerk org', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_unknown', org_id: 'org_unknown_xyz' })
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(401)
  })

  it('returns 401 for invalid JWT', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Invalid JWT'))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer bad.jwt.token`)
    expect(res.status).toBe(401)
  })
})
