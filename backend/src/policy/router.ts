import type { FastifyInstance } from 'fastify'
import {
  requireOrgTokenOrClerkAuth,
  requireAdminTokenOrClerkAdmin,
  requireActiveSubscription,
} from '../auth/middleware.js'
import { getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback } from './service.js'
import { compilePolicy, type PolicyDoc } from './compiler.js'
import { resolveMemberPolicy } from './resolver.js'

export async function policyRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/policy/version', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const version = await getVersionOnly(req.tenant.id)
    if (version === null) return reply.status(404).send({ error: 'No policy published' })
    return { version }
  })

  fastify.get(
    '/policy',
    { preHandler: [requireOrgTokenOrClerkAuth, requireActiveSubscription] },
    async (req, reply) => {
      const row = await getLatestPolicy(req.tenant.id)
      if (!row) return reply.status(404).send({ error: 'No policy published' })

      const snapshot = row.policyJson as PolicyDoc
      const policy   = req.member
        ? await resolveMemberPolicy(req.tenant.id, req.member.id, snapshot)
        : snapshot

      const response: Record<string, unknown> = {
        version:    row.version,
        policy,
        tenantName: req.tenant.name,
        plan:       req.tenant.plan,
        expiresAt:  req.tenant.gracePeriodEndsAt?.toISOString() ?? null,
      }
      if (req.tenant.subscriptionStatus === 'past_due') response['warning'] = 'subscription_expiring'
      return response
    }
  )

  fastify.post('/policy/publish', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const policy  = await compilePolicy(req.tenant.id)
    const version = await publishPolicy(req.tenant.id, policy)
    return { version }
  })

  fastify.get('/policy/history', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return getHistory(req.tenant.id)
  })

  fastify.post('/policy/rollback/:version', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { version } = req.params as { version: string }
    const newVersion  = await rollback(req.tenant.id, parseInt(version, 10))
    return { version: newVersion }
  })

  fastify.get('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { id, name, slug, plan, subscriptionStatus } = req.tenant
    return { id, name, slug, plan, subscriptionStatus }
  })
}
