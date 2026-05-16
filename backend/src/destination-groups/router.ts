import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listDestinationGroups, createDestinationGroup, updateDestinationGroup, deleteDestinationGroup } from './service.js'

export async function destinationGroupsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/destination-groups', { preHandler: requireAdminToken }, async (req) => {
    return listDestinationGroups(req.tenant.id)
  })

  fastify.post('/destination-groups', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as { name: string; domains: string[]; divisionId?: string; teamId?: string }
    return reply.status(201).send(await createDestinationGroup(req.tenant.id, body))
  })

  fastify.patch('/destination-groups/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; domains: string[]; divisionId: string; teamId: string }>
    const updated = await updateDestinationGroup(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Destination group not found' })
    return updated
  })

  fastify.delete('/destination-groups/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteDestinationGroup(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
