import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { listRules, createRule, updateRule, deleteRule } from './service.js'
import { isRuleKindAllowed, type Plan } from '../billing/limits.js'

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
      isOverridable?: boolean
      reportLevel?: 'none' | 'minimal' | 'medium' | 'rich'
    }
    const plan = req.tenant.plan as Plan
    if (!isRuleKindAllowed(plan, body.kind)) {
      return reply.status(402).send({
        error: `Rule kind '${body.kind}' is not available on the ${plan} plan. Upgrade to unlock pattern, entropy, and score rules.`,
      })
    }
    if (body.action === 'warn' && !body.message?.trim()) {
      return reply.status(400).send({ error: 'Warning rules require a user-facing message' })
    }
    try {
      return reply.status(201).send(await createRule(req.tenant.id, subjectId, body))
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Invalid rule' })
    }
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
      isOverridable: boolean
      active: boolean
      reportLevel: 'none' | 'minimal' | 'medium' | 'rich'
    }>
    if (body.action === 'warn' && !body.message?.trim()) {
      return reply.status(400).send({ error: 'Warning rules require a user-facing message' })
    }
    let updated
    try {
      updated = await updateRule(req.tenant.id, id, body)
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : 'Invalid rule' })
    }
    if (!updated) return reply.status(404).send({ error: 'Rule not found' })
    return updated
  })

  fastify.delete('/rules/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await deleteRule(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
