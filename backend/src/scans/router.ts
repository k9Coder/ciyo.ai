import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { recordScan } from './service.js'

export async function scansRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/scans', { preHandler: requireOrgTokenOrClerkAuth, bodyLimit: 4 * 1024 }, async (req, reply) => {
    const memberId = req.member?.id ?? null
    const result   = await recordScan(req.tenant.id, memberId)

    if (result.blocked) {
      return reply.status(402).send({
        error:     'scan_limit_reached',
        blocked:   true,
        remaining: 0,
      })
    }

    return reply.status(200).send({ ok: true, remaining: result.remaining })
  })
}
