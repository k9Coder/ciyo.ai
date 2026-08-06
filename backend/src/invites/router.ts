import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin, requireClerkAuth } from '../auth/middleware.js'
import { createInvite, getInvitePreview, acceptInvite } from './service.js'
import { divisionExists } from '../divisions/service.js'
import { env } from '../env.js'

const BASE_URL = env.ADMIN_BASE_URL ?? 'http://localhost:5173'

const ALLOWED_ROLES = ['member', 'division_admin', 'super_admin'] as const
type InviteRole = (typeof ALLOWED_ROLES)[number]

function isAllowedRole(role: string): role is InviteRole {
  return (ALLOWED_ROLES as readonly string[]).includes(role)
}

// Real tokens are always 64 lowercase hex chars (generateToken() in
// service.ts: randomBytes(32).toString('hex')). Anything else can never
// match a real invite — including values Postgres can't even represent in
// a text column, like an embedded null byte, which crashes the query with
// an uncaught 500 instead of a graceful "not found" if it reaches the DB.
const TOKEN_SHAPE = /^[a-f0-9]{64}$/

export async function invitesRouter(fastify: FastifyInstance): Promise<void> {
  // Admin creates an invite link
  fastify.post('/invites', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    if (!req.member) return reply.status(403).send({ error: 'Clerk auth required to create invites' })
    const body = req.body as { email?: string; role?: string; divisionId?: string }
    const role = body.role ?? 'member'
    if (!isAllowedRole(role)) return reply.status(400).send({ error: 'Invalid role' })
    if (role === 'super_admin' && req.member.role !== 'super_admin') {
      return reply.status(403).send({ error: 'Only a super admin can create super admin invites' })
    }
    if (role === 'division_admin') {
      if (!body.divisionId) {
        return reply.status(400).send({ error: 'divisionId is required when role is division_admin' })
      }
      if (!(await divisionExists(req.tenant.id, body.divisionId))) {
        return reply.status(404).send({ error: 'Division not found' })
      }
    }
    const { token, expiresAt } = await createInvite(req.tenant.id, req.member.id, {
      email: body.email?.trim() || undefined,
      role,
      divisionId: role === 'division_admin' ? body.divisionId : undefined,
    })
    return reply.status(201).send({
      token,
      url:       `${BASE_URL}/invite/${token}`,
      expiresAt: expiresAt.toISOString(),
    })
  })

  // Public — returns invite preview for the landing page (no auth required).
  // Tight per-IP limit: unauthenticated + enumerable, so throttle brute force.
  fastify.get('/invites/:token', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req) => {
    const { token } = req.params as { token: string }
    if (!TOKEN_SHAPE.test(token)) {
      return { tenantName: '', role: '', expiresAt: '', valid: false }
    }
    const preview = await getInvitePreview(token)
    // Never expose the restricted email to an unauthenticated caller (targeted-phishing
    // vector), and collapse missing/used/expired into one uniform body so the endpoint
    // does not oracle whether a given token exists. The accept flow re-checks the email
    // server-side, so nothing downstream depends on it being echoed here.
    if (!preview || !preview.valid) {
      return { tenantName: '', role: '', expiresAt: '', valid: false }
    }
    return {
      tenantName: preview.tenantName,
      role:       preview.role,
      expiresAt:  preview.expiresAt,
      valid:      true,
    }
  })

  // Authenticated user accepts an invite
  fastify.post('/invites/:token/accept', {
    preHandler: requireClerkAuth,
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { token } = req.params as { token: string }
    if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
    if (!TOKEN_SHAPE.test(token)) return reply.status(400).send({ error: 'Invite not found' })
    const result = await acceptInvite(token, req.user.id)
    if ('error' in result) return reply.status(result.statusCode ?? 400).send({ error: result.error })
    return reply.status(200).send(result.member)
  })
}
