import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { ingestEvent } from './service.js'

const MAX_SITE_URL = 2048
const MAX_MATCHED_TERM = 256
const MAX_RULE_ID = 200

export async function eventsRouter(fastify: FastifyInstance): Promise<void> {
  // Bodies come from every browser holding an org token — cap size to bound storage
  // growth and reject oversized payloads before they hit the DB.
  fastify.post('/events', {
    preHandler: requireOrgTokenOrClerkAuth,
    bodyLimit: 16 * 1024,
  }, async (req, reply) => {
    const body = req.body as {
      ruleId: string
      action: 'warn' | 'block'
      siteUrl: string
      matchedTerm?: string
    }

    if (!body.ruleId || !body.action || !body.siteUrl) {
      return reply.status(400).send({ error: 'ruleId, action, and siteUrl are required' })
    }
    if (typeof body.ruleId !== 'string' || body.ruleId.length > MAX_RULE_ID) {
      return reply.status(400).send({ error: 'invalid ruleId' })
    }
    if (body.action !== 'warn' && body.action !== 'block') {
      return reply.status(400).send({ error: "action must be 'warn' or 'block'" })
    }
    if (typeof body.siteUrl !== 'string' || body.siteUrl.length > MAX_SITE_URL) {
      return reply.status(400).send({ error: 'invalid siteUrl' })
    }

    const memberId = req.member?.id ?? null
    const event = await ingestEvent(req.tenant.id, body.ruleId, memberId, {
      action:      body.action,
      siteUrl:     body.siteUrl,
      // Truncate rather than reject so a long match still records the event.
      matchedTerm: typeof body.matchedTerm === 'string'
        ? body.matchedTerm.slice(0, MAX_MATCHED_TERM)
        : undefined,
    })

    if (!event) return reply.status(204).send()
    return reply.status(201).send({ id: event.id })
  })
}
