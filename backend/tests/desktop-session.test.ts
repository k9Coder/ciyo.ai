import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { deviceTokens } from '../src/db/schema.js'
import { generateSecret, formatDeviceToken, hashToken } from '../src/auth/tokens.js'
import type { FastifyInstance } from 'fastify'

vi.mock('@clerk/backend', () => ({ verifyToken: vi.fn() }))

async function seedDeviceToken(tenantId: string, memberId: string, client: 'desktop' | 'extension' = 'desktop') {
  const secret = generateSecret()
  const [row] = await db.insert(deviceTokens).values({
    tenantId,
    memberId,
    client,
    tokenHash: await hashToken(secret),
    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
  }).returning({ id: deviceTokens.id })
  return { id: row!.id, token: formatDeviceToken(row!.id, secret) }
}

describe('desktop session + sign-out', () => {
  let app: FastifyInstance
  let tenantId: string
  let memberId: string
  let adminToken: string

  beforeAll(async () => { ({ app } = await startTestApp()) })
  beforeEach(async () => {
    await truncateAll()
    const t = await buildTestTenant()
    tenantId = t.tenantId
    adminToken = t.adminToken
    const user = await buildTestUser('clerk_session_test', 'session@example.com')
    memberId = await buildTestMember(tenantId, user)
  })
  afterAll(async () => { await app.close() })

  it('GET /auth/desktop/session returns who is signed in and when the token expires', async () => {
    const { token } = await seedDeviceToken(tenantId, memberId)
    const res = await supertest(app.server).get('/auth/desktop/session').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('session@example.com')
    expect(typeof res.body.tenantName).toBe('string')
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now() + 80 * 24 * 60 * 60 * 1000)
  })

  it('GET /auth/desktop/session rejects a missing or non-device token', async () => {
    expect((await supertest(app.server).get('/auth/desktop/session')).status).toBe(401)
    const res = await supertest(app.server).get('/auth/desktop/session').set('Authorization', 'Bearer not-a-device-token')
    expect(res.status).toBe(401)
  })

  it('POST /auth/desktop/sign-out revokes the token and stamps signedOutAt', async () => {
    const { id, token } = await seedDeviceToken(tenantId, memberId)
    const res = await supertest(app.server).post('/auth/desktop/sign-out').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(204)

    const [row] = await db.select().from(deviceTokens).where(eq(deviceTokens.id, id))
    expect(row!.revokedAt).not.toBeNull()
    expect(row!.signedOutAt).not.toBeNull()

    // The token is dead server-side now, not just forgotten locally.
    const after = await supertest(app.server).get('/v1/policy').set('Authorization', `Bearer ${token}`)
    expect(after.status).toBe(401)
    expect(after.body.error).toContain('revoked')
  })

  it('sign-out only affects the calling device token', async () => {
    const a = await seedDeviceToken(tenantId, memberId)
    const b = await seedDeviceToken(tenantId, memberId)
    await supertest(app.server).post('/auth/desktop/sign-out').set('Authorization', `Bearer ${a.token}`)
    const [rowB] = await db.select().from(deviceTokens).where(eq(deviceTokens.id, b.id))
    expect(rowB!.revokedAt).toBeNull()
    expect(rowB!.signedOutAt).toBeNull()
  })

  it('GET /v1/members reports the desktop last sign-in and last sign-out per member', async () => {
    const other = await buildTestUser('clerk_never_desktop', 'never@example.com')
    const neverMemberId = await buildTestMember(tenantId, other)

    const first = await seedDeviceToken(tenantId, memberId)
    await supertest(app.server).post('/auth/desktop/sign-out').set('Authorization', `Bearer ${first.token}`)
    await seedDeviceToken(tenantId, memberId)              // signed in again afterwards
    await seedDeviceToken(tenantId, memberId, 'extension') // must not count as desktop

    const res = await supertest(app.server).get('/v1/members').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    const signedIn = res.body.find((m: { id: string }) => m.id === memberId)
    const never = res.body.find((m: { id: string }) => m.id === neverMemberId)

    expect(signedIn.desktopLastSignInAt).not.toBeNull()
    expect(signedIn.desktopLastSignOutAt).not.toBeNull()
    expect(new Date(signedIn.desktopLastSignInAt).getTime())
      .toBeGreaterThanOrEqual(new Date(signedIn.desktopLastSignOutAt).getTime())
    expect(never.desktopLastSignInAt).toBeNull()
    expect(never.desktopLastSignOutAt).toBeNull()
  })
})
