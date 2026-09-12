import type { FastifyInstance } from 'fastify'
import { requireClerkAuth } from '../auth/middleware.js'
import { createExtensionAuthCode, exchangeExtensionAuthCode, isExtensionRedirectUri, isValidCodeChallenge, EXTENSION_CLIENT_ID } from './service.js'
import { env } from '../env.js'

export async function extensionAuthRouter(fastify: FastifyInstance): Promise<void> {
  // Step 1: pretzel-extension opens this via chrome.identity.launchWebAuthFlow
  // (src/auth/deviceAuth.ts).
  fastify.get('/authorize', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const q = req.query as Record<string, string | undefined>

    if (q.client_id !== EXTENSION_CLIENT_ID) {
      return reply.status(400).send({ error: 'Unknown client_id' })
    }
    if (q.response_type !== 'code') {
      return reply.status(400).send({ error: 'response_type must be code' })
    }
    if (q.code_challenge_method !== 'S256') {
      return reply.status(400).send({ error: 'code_challenge_method must be S256' })
    }
    if (!q.redirect_uri || !isExtensionRedirectUri(q.redirect_uri)) {
      return reply.status(400).send({ error: 'redirect_uri must be a chromiumapp.org URL' })
    }
    if (!q.state || !q.code_challenge) {
      return reply.status(400).send({ error: 'Missing state or code_challenge' })
    }
    if (!isValidCodeChallenge(q.code_challenge)) {
      return reply.status(400).send({ error: 'code_challenge must be a base64url-encoded S256 challenge' })
    }

    const target = new URL('/extension-login', env.PRETZEL_CONSOLE_URL)
    target.searchParams.set('state', q.state)
    target.searchParams.set('code_challenge', q.code_challenge)
    target.searchParams.set('redirect_uri', q.redirect_uri)
    return reply.redirect(target.toString())
  })

  // Step 2: pretzel-console calls this once the user is signed in with Clerk.
  fastify.post('/authorize/complete', {
    preHandler: requireClerkAuth,
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    if (!req.member) return reply.status(403).send({ error: 'Clerk auth required' })
    const body = req.body as { state?: string; code_challenge?: string; redirect_uri?: string }
    if (!body.state || !body.code_challenge || !body.redirect_uri) {
      return reply.status(400).send({ error: 'Missing state, code_challenge, or redirect_uri' })
    }
    if (!isValidCodeChallenge(body.code_challenge)) {
      return reply.status(400).send({ error: 'code_challenge must be a base64url-encoded S256 challenge' })
    }
    if (!isExtensionRedirectUri(body.redirect_uri)) {
      return reply.status(400).send({ error: 'redirect_uri must be a chromiumapp.org URL' })
    }

    const { code } = await createExtensionAuthCode({
      memberId:      req.member.id,
      tenantId:      req.tenant.id,
      codeChallenge: body.code_challenge,
      redirectUri:   body.redirect_uri,
    })

    const redirectUrl = new URL(body.redirect_uri)
    redirectUrl.searchParams.set('code', code)
    redirectUrl.searchParams.set('state', body.state)
    return reply.send({ redirectUrl: redirectUrl.toString() })
  })

  // Step 3: pretzel-extension's launchWebAuthFlow call resolves with
  // ?code=&state=, exchanges it here.
  fastify.post('/token', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = req.body as { code?: string; code_verifier?: string; redirect_uri?: string }
    if (!body.code || !body.code_verifier || !body.redirect_uri) {
      return reply.status(400).send({ error: 'Missing code, code_verifier, or redirect_uri' })
    }

    const result = await exchangeExtensionAuthCode({
      code:         body.code,
      codeVerifier: body.code_verifier,
      redirectUri:  body.redirect_uri,
    })
    if ('error' in result) return reply.status(400).send({ error: result.error })
    return reply.send(result)
  })
}
