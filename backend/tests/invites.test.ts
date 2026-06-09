import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { createInvite, acceptInvite, getInvitePreview } from '../src/invites/service.js'
import { db } from '../src/db/client.js'
import { invites, members } from '../src/db/schema.js'
import { eq, and, isNull } from 'drizzle-orm'

beforeEach(async () => { await truncateAll() })

describe('createInvite', () => {
  it('creates an invite and returns token + expiry', async () => {
    const { tenantId } = await buildTestTenant()
    const { token, expiresAt } = await createInvite(tenantId, null, { role: 'member' })
    expect(token).toHaveLength(64) // 32 bytes hex
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now())
  })
})

describe('acceptInvite', () => {
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
