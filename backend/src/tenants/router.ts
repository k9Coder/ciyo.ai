import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { updateTenantName, rotateOrgToken, rotateAdminToken } from './service.js'

export async function tenantsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.patch('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    const tenant = await updateTenantName(req.tenant.id, name.trim())
    const { id, name: n, slug, plan, subscriptionStatus } = tenant
    return { id, name: n, slug, plan, subscriptionStatus }
  })

  fastify.post('/tenant/rotate-org-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const token = await rotateOrgToken(req.tenant.id, req.tenant.slug)
    return { token }
  })

  fastify.post('/tenant/rotate-admin-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const token = await rotateAdminToken(req.tenant.id, req.tenant.slug)
    return { token }
  })
}
