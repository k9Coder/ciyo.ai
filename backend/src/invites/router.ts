import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin, requireClerkAuth } from '../auth/middleware.js'
import { createInvite, getInvitePreview, acceptInvite } from './service.js'

const BASE_URL = process.env.ADMIN_BASE_URL ?? 'http://localhost:5173'

export async function invitesRouter(fastify: FastifyInstance): Promise<void> {
  // Admin creates an invite link
  fastify.post('/invites', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    if (!req.member) return reply.status(403).send({ error: 'Clerk auth required to create invites' })
    const body = req.body as { email?: string; role?: string }
    const role = (body.role ?? 'member') as 'member' | 'division_admin' | 'super_admin'
    const { token, expiresAt } = await createInvite(req.tenant.id, req.member.id, {
      email: body.email?.trim() || undefined,
      role,
    })
    return reply.status(201).send({
      token,
      url:       `${BASE_URL}/invite/${token}`,
      expiresAt: expiresAt.toISOString(),
    })
  })

  // Public — returns invite preview for the landing page (no auth required)
  fastify.get('/invites/:token', async (req, reply) => {
    const { token } = req.params as { token: string }
    const preview = await getInvitePreview(token)
    if (!preview) return reply.status(404).send({ error: 'Invite not found' })
    return preview
  })

  // Authenticated user accepts an invite
  fastify.post('/invites/:token/accept', { preHandler: requireClerkAuth }, async (req, reply) => {
    const { token } = req.params as { token: string }
    if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
    const result = await acceptInvite(token, req.user.id)
    if ('error' in result) return reply.status(result.statusCode ?? 400).send({ error: result.error })
    return reply.status(200).send(result.member)
  })
}
