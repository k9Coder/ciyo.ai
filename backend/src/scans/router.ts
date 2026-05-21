import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { recordScan } from './service.js'

export async function scansRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/scans', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const memberId = req.member?.id ?? null
    await recordScan(req.tenant.id, memberId)
    return reply.status(204).send()
  })
}
