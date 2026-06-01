import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { users } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const MOCK_PLATFORM_USER_ID = 'user_platform_admin'
const MOCK_CLERK_JWT = 'eyJhbGciOiJSUzI1NiJ9.platform.signature'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: 'user_platform_admin' }),
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

let app: FastifyInstance

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_PLATFORM_USER_ID })
})
afterAll(async () => { await app.close() })

async function buildPlatformAdmin() {
  const user = await buildTestUser(MOCK_PLATFORM_USER_ID, 'admin@ciyo.ai')
  await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, user.id))
  return user
}

describe('GET /platform/v1/tenants', () => {
  it('returns 403 for a non-platform-admin user', async () => {
    await buildTestUser(MOCK_PLATFORM_USER_ID, 'regular@ciyo.ai')
    const res = await supertest(app.server)
      .get('/platform/v1/tenants')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(403)
  })

  it('returns all tenants with member counts for platform admin', async () => {
    await buildPlatformAdmin()
    const { tenantId } = await buildTestTenant('acme')
    const user2 = await buildTestUser('user_member1', 'member1@acme.com')
    await buildTestMember(tenantId, user2)

    const res = await supertest(app.server)
      .get('/platform/v1/tenants')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.body)).toBe(true)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].slug).toBe('acme')
    expect(res.body[0].memberCount).toBe(1)
  })
})

describe('GET /platform/v1/tenants/:tenantId/members', () => {
  it('returns members list for the given tenant', async () => {
    await buildPlatformAdmin()
    const { tenantId } = await buildTestTenant('beta')
    const user2 = await buildTestUser('user_beta1', 'beta@beta.com')
    await buildTestMember(tenantId, user2)

    const res = await supertest(app.server)
      .get(`/platform/v1/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].email).toBe('beta@beta.com')
  })

  it('returns 404 for an unknown tenantId', async () => {
    await buildPlatformAdmin()
    const res = await supertest(app.server)
      .get('/platform/v1/tenants/00000000-0000-0000-0000-000000000000/members')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(404)
  })
})

describe('DELETE /platform/v1/tenants/:tenantId/members/:memberId', () => {
  it('removes the member from the tenant', async () => {
    await buildPlatformAdmin()
    const { tenantId } = await buildTestTenant('gamma')
    const user2 = await buildTestUser('user_gamma1', 'gamma@gamma.com')
    const memberId = await buildTestMember(tenantId, user2)

    const res = await supertest(app.server)
      .delete(`/platform/v1/tenants/${tenantId}/members/${memberId}`)
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(204)

    const check = await supertest(app.server)
      .get(`/platform/v1/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(check.body).toHaveLength(0)
  })
})
