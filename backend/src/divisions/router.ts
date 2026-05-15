import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listDivisions, createDivision, updateDivision, deleteDivision } from './service.js'

export async function divisionsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/divisions', { preHandler: requireAdminToken }, async (req) => {
    return listDivisions(req.tenant.id)
  })

  fastify.post('/divisions', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { name: string; slug: string }
    return reply.status(201).send(await createDivision(req.tenant.id, body))
  })

  fastify.patch('/divisions/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; slug: string }>
    const updated = await updateDivision(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Division not found' })
    return updated
  })

  fastify.delete('/divisions/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteDivision(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
