import type { FastifyInstance } from 'fastify'
import { max, eq } from 'drizzle-orm'
import {
  requireOrgTokenOrClerkAuth,
  requireAdminTokenOrClerkAdmin,
  requireActiveSubscription,
} from '../auth/middleware.js'
import { db } from '../db/client.js'
import { policies } from '../db/schema.js'
import { getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback } from './service.js'
import { compilePolicy, type PolicyDoc } from './compiler.js'
import { resolveMemberPolicy } from './resolver.js'
import { policyBus, policyUpdatedEvent } from '../events/policy-bus.js'

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

  fastify.get(
    '/policy/last-updates',
    { preHandler: [requireOrgTokenOrClerkAuth, requireActiveSubscription] },
    async (req) => {
      const [row] = await db
        .select({ publishedAt: max(policies.publishedAt) })
        .from(policies)
        .where(eq(policies.tenantId, req.tenant.id))
      return { ts: row?.publishedAt?.getTime() ?? 0 }
    }
  )

  fastify.get('/events', async (req, reply) => {
    // Auth: token from ?token= query param (EventSource cannot send custom headers)
    const { token } = req.query as { token?: string }
    if (!token) return reply.status(401).send({ error: 'Missing token' })

    // Validate by passing as Bearer header to existing middleware
    const fakeReq = Object.assign(Object.create(req), {
      headers: { ...req.headers, authorization: `Bearer ${token}` },
    })
    let authError = false
    const fakeReply = {
      status: () => ({ send: () => { authError = true } }),
      sent: false,
    }
    await requireOrgTokenOrClerkAuth(fakeReq as any, fakeReply as any)
    if (authError || !(fakeReq as any).tenant) return reply.status(401).send({ error: 'Unauthorized' })

    const tenant = (fakeReq as any).tenant
    if (tenant.subscriptionStatus === 'cancelled') {
      return reply.status(402).send({ error: 'subscription_cancelled' })
    }

    const res = reply.raw
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    })

    const send     = () => { if (!req.raw.destroyed) res.write('data: policy_updated\n\n') }
    const keepAlive = setInterval(() => { if (!req.raw.destroyed) res.write(': keep-alive\n\n') }, 25_000)

    policyBus.on(policyUpdatedEvent(tenant.id), send)
    req.raw.on('close', () => {
      policyBus.off(policyUpdatedEvent(tenant.id), send)
      clearInterval(keepAlive)
    })

    return new Promise(() => {}) // hold the connection open
  })

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
