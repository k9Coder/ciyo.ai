import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { updateTenantName, rotateOrgToken, rotateAdminToken, updateTenantFailMode } from './service.js'

export async function tenantsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { id, name, plan, subscriptionStatus, onboardingWizardCompleted, failMode } = req.tenant
    return { id, name, plan, subscriptionStatus, onboardingWizardCompleted, failMode }
  })

  fastify.patch('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const body = req.body as { name?: string; failMode?: string }

    if (body.failMode !== undefined) {
      if (body.failMode !== 'open' && body.failMode !== 'closed') {
        return reply.status(400).send({ error: 'failMode must be "open" or "closed"' })
      }
      const tenant = await updateTenantFailMode(req.tenant.id, body.failMode)
      const { id, name, plan, subscriptionStatus, onboardingWizardCompleted, failMode } = tenant
      return { id, name, plan, subscriptionStatus, onboardingWizardCompleted, failMode }
    }

    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    const tenant = await updateTenantName(req.tenant.id, body.name.trim())
    const { id, name: n, plan, subscriptionStatus, onboardingWizardCompleted, failMode } = tenant
    return { id, name: n, plan, subscriptionStatus, onboardingWizardCompleted, failMode }
  })

  fastify.post('/tenant/rotate-org-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const token = await rotateOrgToken(req.tenant.id)
    return { token }
  })

  fastify.post('/tenant/rotate-admin-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const token = await rotateAdminToken(req.tenant.id)
    return { token }
  })
}
