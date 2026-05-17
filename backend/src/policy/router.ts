import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth, requireAdminToken } from '../auth/middleware.js'
import { getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback } from './service.js'
import { compilePolicy, type PolicyDoc } from './compiler.js'
import { resolveMemberPolicy } from './resolver.js'

export async function policyRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/policy/version', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const version = await getVersionOnly(req.tenant.id)
    if (version === null) return reply.status(404).send({ error: 'No policy published' })
    return { version }
  })

  fastify.get('/policy', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const tenant = req.tenant

    if (tenant.subscriptionStatus === 'cancelled') {
      return reply.status(402).send({ error: 'subscription_cancelled' })
    }
    if (tenant.subscriptionStatus === 'past_due') {
      const expired = tenant.gracePeriodEndsAt && tenant.gracePeriodEndsAt < new Date()
      if (expired) return reply.status(402).send({ error: 'subscription_expired' })
    }

    const row = await getLatestPolicy(tenant.id)
    if (!row) return reply.status(404).send({ error: 'No policy published' })

    const snapshot = row.policyJson as PolicyDoc
    const policy = req.member
      ? await resolveMemberPolicy(tenant.id, req.member.id, snapshot)
      : snapshot

    const response: Record<string, unknown> = {
      version:    row.version,
      policy,
      tenantName: tenant.name,
      plan:       tenant.plan,
      expiresAt:  tenant.gracePeriodEndsAt?.toISOString() ?? null,
    }
    if (tenant.subscriptionStatus === 'past_due') response['warning'] = 'subscription_expiring'
    return response
  })

  fastify.post('/policy/publish', { preHandler: requireAdminToken }, async (req) => {
    const policy = await compilePolicy(req.tenant.id)
    const version = await publishPolicy(req.tenant.id, policy)
    return { version }
  })

  fastify.get('/policy/history', { preHandler: requireAdminToken }, async (req) => {
    return getHistory(req.tenant.id)
  })

  fastify.post('/policy/rollback/:version', { preHandler: requireAdminToken }, async (req, reply) => {
    const { version } = req.params as { version: string }
    const newVersion = await rollback(req.tenant.id, parseInt(version, 10))
    return { version: newVersion }
  })
}
