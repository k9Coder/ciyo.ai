import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { createInvite, acceptInvite, getInvitePreview } from '../src/invites/service.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { invites, members, tenants, divisions } from '../src/db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_test_super_admin'
const MOCK_CLERK_JWT     = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: 'user_test_super_admin' }),
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
}))

beforeEach(async () => { await truncateAll() })

describe('createInvite', () => {
  it('creates an invite and returns token + expiry', async () => {
    const { tenantId } = await buildTestTenant()
    const { token, expiresAt } = await createInvite(tenantId, null, { role: 'member' })
    expect(token).toHaveLength(64) // 32 bytes hex
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('persists divisionId on the invite row for a division_admin invite', async () => {
    const { tenantId } = await buildTestTenant()
    const [division] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning({ id: divisions.id })
    const { token } = await createInvite(tenantId, null, { role: 'division_admin', divisionId: division!.id })

    const [row] = await db.select({ divisionId: invites.divisionId }).from(invites).where(eq(invites.token, token))
    expect(row?.divisionId).toBe(division!.id)
  })
})

describe('acceptInvite', () => {
  // Regression: a division_admin invite used to create a member with
  // adminDivisionId always null — there was no way to carry the division
  // through from invite creation to accept-time member insert.
  it('carries the invite divisionId onto the created member for a division_admin invite', async () => {
    const { tenantId } = await buildTestTenant()
    const [division] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning({ id: divisions.id })
    const { token } = await createInvite(tenantId, null, { role: 'division_admin', divisionId: division!.id })
    const user = await buildTestUser('clerk_invite_division', 'division-admin@example.com')

    const result = await acceptInvite(token, user.id)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.member.role).toBe('division_admin')
      expect(result.member.adminDivisionId).toBe(division!.id)
    }
  })

  it('creates a member on first use', async () => {
    const { tenantId } = await buildTestTenant()
    const { token } = await createInvite(tenantId, null, { role: 'member' })
    const user = await buildTestUser('clerk_invite_001', 'invitee@example.com')

    const result = await acceptInvite(token, user.id)
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.member.email).toBe('invitee@example.com')
      expect(result.member.tenantId).toBe(tenantId)
    }

    // Invite should now be marked used
    const [inv] = await db.select({ usedAt: invites.usedAt }).from(invites).where(eq(invites.token, token))
    expect(inv?.usedAt).not.toBeNull()
  })

  it('returns error if invite is already used', async () => {
    const { tenantId } = await buildTestTenant()
    const { token } = await createInvite(tenantId, null, { role: 'member' })
    const user = await buildTestUser('clerk_invite_002', 'invitee2@example.com')

    // First accept
    await acceptInvite(token, user.id)

    // Second accept by same user — should return 409
    const result = await acceptInvite(token, user.id)
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('already used')
      expect(result.statusCode).toBe(409)
    }
  })

  it('TOCTOU protection: concurrent accepts are idempotent — only one member is created', async () => {
    const { tenantId } = await buildTestTenant()
    const { token } = await createInvite(tenantId, null, { role: 'member' })
    const user1 = await buildTestUser('clerk_invite_toctou', 'toctou@example.com')

    // Simulate two concurrent accept calls
    const [result1, result2] = await Promise.all([
      acceptInvite(token, user1.id),
      acceptInvite(token, user1.id),
    ])

    // One should succeed, one should return 409
    const successes  = [result1, result2].filter(r => !('error' in r))
    const failures   = [result1, result2].filter(r => 'error' in r)

    // Could be 2 successes if one is "already a member" path, but only 1 member row created
    const memberRows = await db.select().from(members)
      .where(and(eq(members.tenantId, tenantId), eq(members.email, 'toctou@example.com')))
    expect(memberRows).toHaveLength(1)

    // Invite should be marked used exactly once
    const [inv] = await db.select({ usedAt: invites.usedAt }).from(invites).where(eq(invites.token, token))
    expect(inv?.usedAt).not.toBeNull()
  })

  it('returns 409 for duplicate concurrent accept from different users with same email', async () => {
    // This specifically tests the atomic UPDATE guard
    const { tenantId } = await buildTestTenant()
    const { token } = await createInvite(tenantId, null, { role: 'member' })

    // Mark the invite as already used manually (simulates a race winner)
    await db.update(invites).set({ usedAt: new Date() }).where(eq(invites.token, token))

    // Another request arrives too late
    const user = await buildTestUser('clerk_invite_late', 'late@example.com')
    const result = await acceptInvite(token, user.id)
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.error).toContain('already used')
      expect(result.statusCode).toBe(409)
    }
  })

  it('accept succeeds when tenant is under the seat limit', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ plan: 'free' }).where(eq(tenants.id, tenantId))
    // Seed 2 existing members — free plan caps at 3 seats, so a 3rd should still fit
    const seatA = await buildTestUser('clerk_seat_a', 'seat-a@example.com')
    await db.insert(members).values({ tenantId, userId: seatA.id, email: seatA.email, role: 'member' })
    const seatB = await buildTestUser('clerk_seat_b', 'seat-b@example.com')
    await db.insert(members).values({ tenantId, userId: seatB.id, email: seatB.email, role: 'member' })

    const { token } = await createInvite(tenantId, null, { role: 'member' })
    const user = await buildTestUser('clerk_seat_c', 'seat-c@example.com')
    const result = await acceptInvite(token, user.id)

    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.member.tenantId).toBe(tenantId)
    }
  })

  it('returns 402 at the seat cap and does NOT burn the invite — same token succeeds after a seat frees up', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ plan: 'free' }).where(eq(tenants.id, tenantId))

    // Seed 3 existing members — free plan caps at 3 seats
    const seatMembers: string[] = []
    for (const suffix of ['a', 'b', 'c']) {
      const u = await buildTestUser(`clerk_cap_${suffix}`, `cap-${suffix}@example.com`)
      const [m] = await db.insert(members).values({ tenantId, userId: u.id, email: u.email, role: 'member' }).returning()
      seatMembers.push(m!.id)
    }

    const { token } = await createInvite(tenantId, null, { role: 'member' })
    const newUser = await buildTestUser('clerk_cap_new', 'cap-new@example.com')

    const result = await acceptInvite(token, newUser.id)
    expect('error' in result).toBe(true)
    if ('error' in result) {
      expect(result.statusCode).toBe(402)
      expect(result.error).toContain('Seat limit reached')
      expect(result.error).toContain('free')
    }

    // The invite must NOT be burned by the rejected accept
    const [inv] = await db.select({ usedAt: invites.usedAt }).from(invites).where(eq(invites.token, token))
    expect(inv?.usedAt).toBeNull()

    // Free up a seat, then the SAME token should succeed
    await db.delete(members).where(eq(members.id, seatMembers[0]!))
    const retry = await acceptInvite(token, newUser.id)
    expect('error' in retry).toBe(false)
    if (!('error' in retry)) {
      expect(retry.member.tenantId).toBe(tenantId)
      expect(retry.member.userId).toBe(newUser.id)
    }
  })

  it('already-a-member path returns existing membership without applying the seat check', async () => {
    const { tenantId } = await buildTestTenant()
    await db.update(tenants).set({ plan: 'free' }).where(eq(tenants.id, tenantId))

    // Fill the tenant to the seat cap (3 on free plan)
    let existingUser: Awaited<ReturnType<typeof buildTestUser>> | undefined
    for (const suffix of ['a', 'b', 'c']) {
      const u = await buildTestUser(`clerk_existing_${suffix}`, `existing-${suffix}@example.com`)
      await db.insert(members).values({ tenantId, userId: u.id, email: u.email, role: 'member' })
      if (suffix === 'a') existingUser = u
    }

    // One of the existing members accepts an invite for the same tenant — should
    // hit the "already a member" early-return path, not the seat check.
    const { token } = await createInvite(tenantId, null, { role: 'member' })
    const result = await acceptInvite(token, existingUser!.id)

    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.member.tenantId).toBe(tenantId)
      expect(result.member.userId).toBe(existingUser.id)
    }
  })
})

describe('getInvitePreview', () => {
  it('returns valid preview for unused, non-expired invite', async () => {
    const { tenantId } = await buildTestTenant()
    const { token } = await createInvite(tenantId, null, { email: 'preview@example.com', role: 'super_admin' })
    const preview = await getInvitePreview(token)
    expect(preview).not.toBeNull()
    expect(preview!.valid).toBe(true)
    expect(preview!.role).toBe('super_admin')
    expect(preview!.email).toBe('preview@example.com')
  })

  it('returns valid=false for used invite', async () => {
    const { tenantId } = await buildTestTenant()
    const { token } = await createInvite(tenantId, null, {})
    // Mark used
    await db.update(invites).set({ usedAt: new Date() }).where(eq(invites.token, token))
    const preview = await getInvitePreview(token)
    expect(preview!.valid).toBe(false)
  })
})

describe('POST /v1/invites', () => {
  let app: FastifyInstance
  let tenantId: string
  let adminToken: string

  beforeAll(async () => { ({ app } = await startTestApp()) })
  beforeEach(async () => {
    mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
    const t = await buildTestTenant()
    tenantId   = t.tenantId
    adminToken = t.adminToken
  })
  afterAll(async () => { await app.close() })

  it('S3: preview never leaks the restricted email and hides token existence', async () => {
    const { token } = await createInvite(tenantId, null, { email: 'secret@example.com', role: 'member' })

    const ok = await supertest(app.server).get(`/v1/invites/${token}`)
    expect(ok.status).toBe(200)
    expect(ok.body.valid).toBe(true)
    expect(ok.body.tenantName).toBeTruthy()
    expect(ok.body.email).toBeUndefined()

    const missing = await supertest(app.server).get('/v1/invites/does-not-exist')
    expect(missing.status).toBe(200)
    expect(missing.body).toEqual({ tenantName: '', role: '', expiresAt: '', valid: false })
  })

  it('rejects an unknown role with 400', async () => {
    // requireAdminTokenOrClerkAdmin only lets a Clerk caller reach the route handler
    // if they are already super_admin (req.member?.role !== 'super_admin' -> 403 at
    // the middleware level), so role validation is exercised via a super_admin caller.
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'super@example.com')
    await db.insert(members).values({ tenantId, userId: user.id, email: user.email, role: 'super_admin' })

    const res = await supertest(app.server)
      .post('/v1/invites')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ role: 'bogus' })
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('Invalid role')
  })

  it('allows a super_admin Clerk caller to create a super_admin invite', async () => {
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'super@example.com')
    await db.insert(members).values({ tenantId, userId: user.id, email: user.email, role: 'super_admin' })

    const res = await supertest(app.server)
      .post('/v1/invites')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ role: 'super_admin' })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
  })

  it('rejects any invite creation from a ps_adm token caller (req.member unset)', async () => {
    // requireAdminTokenOrClerkAdmin lets ps_adm tokens through, but the route itself
    // requires req.member (only set for Clerk callers) for ALL invite creation.
    const res = await supertest(app.server)
      .post('/v1/invites')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'member' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('Clerk auth required')
  })

  it('rejects a non-super_admin Clerk caller before the route body runs', async () => {
    // requireAdminTokenOrClerkAdmin itself 403s Clerk callers whose req.member.role
    // isn't super_admin, so a division_admin never reaches the route's role checks.
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'division@example.com')
    await db.insert(members).values({ tenantId, userId: user.id, email: user.email, role: 'division_admin' })

    const res = await supertest(app.server)
      .post('/v1/invites')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ role: 'super_admin' })
    expect(res.status).toBe(403)
    expect(res.body.error).toContain('Admin access required')
  })

  it('rejects a division_admin invite with no divisionId', async () => {
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'super@example.com')
    await db.insert(members).values({ tenantId, userId: user.id, email: user.email, role: 'super_admin' })

    const res = await supertest(app.server)
      .post('/v1/invites')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ role: 'division_admin' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('divisionId is required')
  })

  it('rejects a division_admin invite whose divisionId belongs to a different tenant', async () => {
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'super@example.com')
    await db.insert(members).values({ tenantId, userId: user.id, email: user.email, role: 'super_admin' })

    const otherTenant = await buildTestTenant('other')
    const [foreignDivision] = await db.insert(divisions)
      .values({ tenantId: otherTenant.tenantId, name: 'Foreign', slug: 'foreign' })
      .returning({ id: divisions.id })

    const res = await supertest(app.server)
      .post('/v1/invites')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ role: 'division_admin', divisionId: foreignDivision!.id })
    expect(res.status).toBe(404)
    expect(res.body.error).toBe('Division not found')
  })

  it('creates a division_admin invite with a valid divisionId', async () => {
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'super@example.com')
    await db.insert(members).values({ tenantId, userId: user.id, email: user.email, role: 'super_admin' })
    const [division] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning({ id: divisions.id })

    const res = await supertest(app.server)
      .post('/v1/invites')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ role: 'division_admin', divisionId: division!.id })
    expect(res.status).toBe(201)
    expect(res.body.token).toBeDefined()
  })
})
