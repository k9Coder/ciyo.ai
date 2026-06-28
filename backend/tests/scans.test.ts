import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { scans, tenants, members } from '../src/db/schema.js'
import { startTestApp } from './helpers/setup.js'
import type { FastifyInstance } from 'fastify'

// vi.hoisted runs before module-level constants are initialized,
// so MOCK_CLERK_USER_ID is defined here instead of at module level
const { mockVerifyToken, MOCK_CLERK_USER_ID } = vi.hoisted(() => ({
  mockVerifyToken:     vi.fn().mockResolvedValue({ sub: 'user_test_scan_member' }),
  MOCK_CLERK_USER_ID:  'user_test_scan_member',
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

const MOCK_CLERK_JWT = 'eyJhbGciOiJSUzI1NiJ9.scan.mock'

let app: FastifyInstance
let tenantId: string
let orgToken: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
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

  it('business plan tenant returns remaining: -1 (unlimited)', async () => {
    // buildTestTenant creates a 'business' plan tenant, which has unlimited scans
    const res = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.remaining).toBe(-1)
  })

  it('returns 402 with scan_limit_reached when free plan limit is reached', async () => {
    // Downgrade tenant to free plan (limit: 500 scans/month)
    await db.update(tenants).set({ plan: 'free' }).where(eq(tenants.id, tenantId))

    // Insert 500 scan rows to hit the limit (occurredAt defaults to now = this month)
    const scanRows = Array.from({ length: 500 }, () => ({ tenantId, memberId: null }))
    // Insert in batches to avoid query size limits
    for (let i = 0; i < scanRows.length; i += 100) {
      await db.insert(scans).values(scanRows.slice(i, i + 100))
    }

    const res = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send()

    expect(res.status).toBe(402)
    expect(res.body.error).toBe('scan_limit_reached')
    expect(res.body.blocked).toBe(true)
    expect(res.body.remaining).toBe(0)
  })

  it('remaining count decrements correctly on free plan', async () => {
    // Downgrade to free plan (limit: 500)
    await db.update(tenants).set({ plan: 'free' }).where(eq(tenants.id, tenantId))

    // Use 498 of the 500 allowance
    const scanRows = Array.from({ length: 498 }, () => ({ tenantId, memberId: null }))
    for (let i = 0; i < scanRows.length; i += 100) {
      await db.insert(scans).values(scanRows.slice(i, i + 100))
    }

    // First scan: should have remaining = 1 (498 used, this scan makes 499, 1 left)
    const res1 = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send()
    expect(res1.status).toBe(200)
    expect(res1.body.remaining).toBe(1)

    // Second scan: should have remaining = 0 (499 used, this scan makes 500, 0 left)
    const res2 = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send()
    expect(res2.status).toBe(200)
    expect(res2.body.remaining).toBe(0)

    // Third scan: limit is now reached, should return 402
    const res3 = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${orgToken}`)
      .send()
    expect(res3.status).toBe(402)
    expect(res3.body.error).toBe('scan_limit_reached')
  })

  it('sets memberId correctly when a Clerk-authenticated member makes the request', async () => {
    // Create a Clerk user + member row for this tenant
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'member@scantest.com')
    const [memberRow] = await db.insert(members).values({
      tenantId,
      userId: user.id,
      email: 'member@scantest.com',
      role: 'member',
    }).returning({ id: members.id })
    const memberId = memberRow!.id

    const res = await supertest(app.server)
      .post('/v1/scans')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send()

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    // Verify the scan row has the correct memberId set
    const rows = await db.select().from(scans)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.memberId).toBe(memberId)
    expect(rows[0]!.tenantId).toBe(tenantId)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/scans').send()
    expect(res.status).toBe(401)
  })
})
