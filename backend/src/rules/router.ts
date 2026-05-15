import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listRules, createRule, updateRule, deleteRule } from './service.js'

export async function rulesRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/subjects/:subjectId/rules', { preHandler: requireAdminToken }, async (req) => {
    const { subjectId } = req.params as { subjectId: string }
    return listRules(req.tenant.id, subjectId)
  })

  fastify.post('/subjects/:subjectId/rules', { preHandler: requireAdminToken }, async (req, reply) => {
    const { subjectId } = req.params as { subjectId: string }
    const body = req.body as {
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords?: string[]
      pattern?: string
      destinations?: string[]
      action: 'warn' | 'block'
      message?: string
    }
    return reply.status(201).send(await createRule(req.tenant.id, subjectId, body))
  })

  fastify.patch('/rules/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords: string[]
      pattern: string
      destinations: string[]
      action: 'warn' | 'block'
      message: string
      active: boolean
    }>
    const updated = await updateRule(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Rule not found' })
    return updated
  })

  fastify.delete('/rules/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteRule(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
