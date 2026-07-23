import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { createHash, randomBytes } from 'node:crypto'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { env } from '../src/env.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_test_desktop'
const MOCK_CLERK_JWT     = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'
const REDIRECT = 'http://127.0.0.1:54321/callback'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: 'user_test_desktop' }),
}))

vi.mock('@clerk/backend', () => ({ verifyToken: mockVerifyToken }))

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

describe('desktop auth flow', () => {
  let app: FastifyInstance
  let tenantId: string

  beforeAll(async () => { ({ app } = await startTestApp()) })
  beforeEach(async () => {
    mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
    await truncateAll()
    const t = await buildTestTenant()
    tenantId = t.tenantId
    const user = await buildTestUser(MOCK_CLERK_USER_ID, 'desktop@example.com')
    await buildTestMember(tenantId, user)
  })
  afterAll(async () => { await app.close() })

  describe('GET /auth/desktop/authorize', () => {
    it('redirects to PRETZEL_CONSOLE_URL/desktop-login carrying the query params', async () => {
      const { challenge } = pkcePair()
      const res = await supertest(app.server)
        .get('/auth/desktop/authorize')
        .query({
          response_type: 'code',
          redirect_uri: REDIRECT,
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: 'st1',
        })
      expect(res.status).toBe(302)
      const location = new URL(res.headers.location, env.PRETZEL_CONSOLE_URL)
      expect(location.origin + location.pathname).toBe(`${env.PRETZEL_CONSOLE_URL}/desktop-login`)
      expect(location.searchParams.get('state')).toBe('st1')
      expect(location.searchParams.get('code_challenge')).toBe(challenge)
      expect(location.searchParams.get('redirect_uri')).toBe(REDIRECT)
    })

    it('rejects a non-loopback redirect_uri with 400', async () => {
      const { challenge } = pkcePair()
      const res = await supertest(app.server)
        .get('/auth/desktop/authorize')
        .query({
          response_type: 'code',
          redirect_uri: 'https://evil.example.com/callback',
          code_challenge: challenge,
          code_challenge_method: 'S256',
          state: 'st1',
        })
      expect(res.status).toBe(400)
    })

    it('rejects code_challenge_method other than S256 with 400', async () => {
      const res = await supertest(app.server)
        .get('/auth/desktop/authorize')
        .query({
          response_type: 'code',
          redirect_uri: REDIRECT,
          code_challenge: 'x',
          code_challenge_method: 'plain',
          state: 'st1',
        })
      expect(res.status).toBe(400)
    })
  })

  describe('full PKCE round trip', () => {
    it('authorize/complete then token exchange yields a working device token', async () => {
      const { verifier, challenge } = pkcePair()

      const completeRes = await supertest(app.server)
        .post('/auth/desktop/authorize/complete')
        .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
        .send({ state: 'st1', code_challenge: challenge, redirect_uri: REDIRECT })
      expect(completeRes.status).toBe(200)
      const redirectUrl = new URL(completeRes.body.redirectUrl)
      expect(redirectUrl.origin + redirectUrl.pathname).toBe(REDIRECT)
      const code = redirectUrl.searchParams.get('code')
      expect(code).toBeTruthy()
      expect(redirectUrl.searchParams.get('state')).toBe('st1')

      const tokenRes = await supertest(app.server)
        .post('/auth/desktop/token')
        .send({ code, code_verifier: verifier, redirect_uri: REDIRECT })
      expect(tokenRes.status).toBe(200)
      expect(tokenRes.body.tenantId).toBe(tenantId)
      expect(tokenRes.body.token).toMatch(/^pd_/)

      // The minted token actually authenticates against a real route.
      const policyRes = await supertest(app.server)
        .get('/v1/policy')
        .set('Authorization', `Bearer ${tokenRes.body.token}`)
      expect(policyRes.status).toBe(404) // no policy published — proves auth succeeded
    })

    it('authorize/complete requires Clerk auth', async () => {
      // No Authorization header — requireClerkAuth passes an empty token through to
      // clerkVerifyToken, which the real Clerk SDK rejects. Simulate that rejection
      // since the mock otherwise resolves unconditionally regardless of input.
      mockVerifyToken.mockRejectedValueOnce(new Error('Invalid token'))
      const { challenge } = pkcePair()
      const res = await supertest(app.server)
        .post('/auth/desktop/authorize/complete')
        .send({ state: 'st1', code_challenge: challenge, redirect_uri: REDIRECT })
      expect(res.status).toBe(401)
    })

    it('token exchange rejects a code that was already redeemed', async () => {
      const { verifier, challenge } = pkcePair()
      const completeRes = await supertest(app.server)
        .post('/auth/desktop/authorize/complete')
        .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
        .send({ state: 'st1', code_challenge: challenge, redirect_uri: REDIRECT })
      const code = new URL(completeRes.body.redirectUrl).searchParams.get('code')

      const first = await supertest(app.server)
        .post('/auth/desktop/token')
        .send({ code, code_verifier: verifier, redirect_uri: REDIRECT })
      expect(first.status).toBe(200)

      const second = await supertest(app.server)
        .post('/auth/desktop/token')
        .send({ code, code_verifier: verifier, redirect_uri: REDIRECT })
      expect(second.status).toBe(400)
    })
  })
})
