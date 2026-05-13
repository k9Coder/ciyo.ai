import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listMatters, createMatter, updateMatter, deleteMatter } from './service.js'

export async function mattersRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/matters', { preHandler: requireAdminToken }, async (req) => {
    return listMatters(req.tenant.id)
  })

  fastify.post('/matters', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as {
      clientName: string
      matterName?: string
      matterNumber?: string
      opposingParties?: string[]
    }
    return reply.status(201).send(await createMatter(req.tenant.id, body))
  })

  fastify.patch('/matters/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ clientName: string; matterName: string; matterNumber: string; active: boolean }>
    const updated = await updateMatter(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Matter not found' })
    return updated
  })

  fastify.delete('/matters/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteMatter(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
