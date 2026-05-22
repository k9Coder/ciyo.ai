import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { getAuditLog } from './service.js'

const MAX_LIMIT     = 100
const DEFAULT_LIMIT = 50

export async function auditLogRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/audit-log', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const q = req.query as Record<string, string>

    const rawLimit = parseInt(q['limit'] ?? String(DEFAULT_LIMIT), 10)
    const limit    = isNaN(rawLimit) || rawLimit < 1 ? DEFAULT_LIMIT : Math.min(rawLimit, MAX_LIMIT)

    const before = q['before'] ? new Date(q['before']) : undefined
    if (before && isNaN(before.getTime())) {
      return reply.status(400).send({ error: 'Invalid before date' })
    }

    const action = q['action'] as 'warn' | 'block' | undefined
    if (action && action !== 'warn' && action !== 'block') {
      return reply.status(400).send({ error: 'action must be warn or block' })
    }

    return getAuditLog(req.tenant.id, { limit, before, action })
  })
}
