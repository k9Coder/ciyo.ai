import type { FastifyInstance, FastifyRequest } from 'fastify'
import { getRuleById, listRules, listAllActiveRules, createRule, updateRule, deleteRule } from '../rules/service.js'
import type { NewRule } from '../db/schema.js'

function tid(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw Object.assign(new Error('missing X-Tenant-ID'), { statusCode: 400 })
  return id
}

export async function rulesInternalRouter(app: FastifyInstance) {
  app.get<{ Querystring: { activeOnly?: string; subjectId?: string } }>('/', async req => {
    const tenantId = tid(req)
    if (req.query.subjectId) return listRules(tenantId, req.query.subjectId)
    return listAllActiveRules(tenantId)
  })

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const rule = await getRuleById(tid(req), req.params.id)
    if (!rule) return reply.code(404).send({ error: 'rule not found' })
    return rule
  })

  app.post<{ Body: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'reportLevel'> & { subjectId: string } }>('/', async (req, reply) => {
    const { subjectId, ...payload } = req.body
    const rule = await createRule(tid(req), subjectId, payload)
    return reply.code(201).send(rule)
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateRule>[2] }>('/:id', async req => {
    await updateRule(tid(req), req.params.id, req.body)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteRule(tid(req), req.params.id)
    return reply.code(204).send()
  })
}
