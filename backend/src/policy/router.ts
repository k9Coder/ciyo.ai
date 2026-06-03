import type { FastifyInstance } from 'fastify'
import { max, eq } from 'drizzle-orm'
import {
  resolveClerkJwt,
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
    const { token } = req.query as { token?: string }
    if (!token) return reply.status(401).send({ error: 'Missing token query param' })

    await resolveClerkJwt(req, reply, token)
    if (reply.sent) return  // 401 already written by the helper

    reply.hijack()
    const res = reply.raw

    res.writeHead(200, {
      'Content-Type':                     'text/event-stream',
      'Cache-Control':                    'no-cache',
      'Connection':                       'keep-alive',
      'X-Accel-Buffering':                'no',
      'Access-Control-Allow-Origin':      req.headers.origin ?? '*',
      'Access-Control-Allow-Credentials': 'true',
    })
    res.write(': connected\n\n')

    const send      = () => { if (!req.raw.destroyed) res.write('data: {}\n\n') }
    const event     = policyUpdatedEvent(req.member!.tenantId)
    const heartbeat = setInterval(() => { if (!req.raw.destroyed) res.write(': ping\n\n') }, 25_000)

    policyBus.on(event, send)
    req.raw.on('close', () => {
      policyBus.off(event, send)
      clearInterval(heartbeat)
    })
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
