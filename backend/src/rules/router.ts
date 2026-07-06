import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { listRules, createRule, updateRule, deleteRule } from './service.js'

export async function rulesRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/subjects/:subjectId/rules', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { subjectId } = req.params as { subjectId: string }
    return listRules(req.tenant.id, subjectId)
  })

  fastify.post('/subjects/:subjectId/rules', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { subjectId } = req.params as { subjectId: string }
    const body = req.body as {
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords?: string[]
      pattern?: string
      destinations?: string[]
      destinationGroupIds?: string[]
      action: 'warn' | 'block'
      message?: string
      reportLevel?: 'none' | 'minimal' | 'medium' | 'rich'
    }
    // Rule-kind plan gating is enforced in the service layer (createRule) so the
    // assistant/internal apply path is covered too. Service throws a 402-tagged error.
    return reply.status(201).send(await createRule(req.tenant.id, subjectId, body))
  })

  fastify.patch('/rules/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords: string[]
      pattern: string
      destinations: string[]
      destinationGroupIds: string[]
      action: 'warn' | 'block'
      message: string
      active: boolean
      reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
    }>
    const updated = await updateRule(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Rule not found' })
    return updated
  })

  fastify.delete('/rules/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await deleteRule(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
