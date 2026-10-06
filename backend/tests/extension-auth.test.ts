import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { createHash, randomBytes } from 'node:crypto'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_test_extension'
const MOCK_CLERK_JWT     = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'
const REDIRECT = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/callback'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: 'user_test_extension' }),
}))

vi.mock('@clerk/backend', () => ({ verifyToken: mockVerifyToken }))

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

// Only the zero-membership regression is covered here — the PKCE/redirect_uri
// mechanics are identical to desktop-auth (backend/tests/desktop-auth.test.ts),
// which already covers those in depth.
describe('POST /auth/extension/authorize/complete', () => {
  let app: FastifyInstance

  beforeAll(async () => { ({ app } = await startTestApp()) })
  beforeEach(async () => {
    mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
    await truncateAll()
  })
  afterAll(async () => { await app.close() })

  it('succeeds for an admin-added (enrolled) Clerk caller', async () => {
    const { tenantId } = await buildTestTenant()
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'extension@example.com')
    await buildTestMember(tenantId, user)

    const { challenge } = pkcePair()
    const res = await supertest(app.server)
      .post('/auth/extension/authorize/complete')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ state: 'st1', code_challenge: challenge, redirect_uri: REDIRECT })
    expect(res.status).toBe(200)
  })

  // Regression: proves extension sign-in is admin-add-only now that the
  // webhook no longer auto-provisions a personal org on every signup (see
  // backend/src/webhooks/clerk.ts) — requireClerkAuth already rejects a
  // zero-membership caller here, no new gating code needed in extension-auth.
  it('rejects a Clerk caller with zero memberships (not admin-added anywhere)', async () => {
    await buildTestUser(MOCK_CLERK_USER_ID, 'unenrolled@example.com')

    const { challenge } = pkcePair()
    const res = await supertest(app.server)
      .post('/auth/extension/authorize/complete')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
      .send({ state: 'st1', code_challenge: challenge, redirect_uri: REDIRECT })
    expect(res.status).toBe(401)
    expect(res.body.error).toMatch(/Not enrolled in any organisation/)

    const tenantRows = await db.select().from(tenants)
    expect(tenantRows).toHaveLength(0)
  })
})
