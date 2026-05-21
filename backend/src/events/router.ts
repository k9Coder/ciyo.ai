import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { ingestEvent } from './service.js'

export async function eventsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/events', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const body = req.body as {
      ruleId: string
      action: 'warn' | 'block'
      siteUrl: string
      matchedTerm?: string
    }

    if (!body.ruleId || !body.action || !body.siteUrl) {
      return reply.status(400).send({ error: 'ruleId, action, and siteUrl are required' })
    }

    const memberId = req.member?.id ?? null
    const event = await ingestEvent(req.tenant.id, body.ruleId, memberId, {
      action:      body.action,
      siteUrl:     body.siteUrl,
      matchedTerm: body.matchedTerm,
    })

    if (!event) return reply.status(204).send()
    return reply.status(201).send({ id: event.id })
  })
}
