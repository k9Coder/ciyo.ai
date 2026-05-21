import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { listSubjects, createSubject, updateSubject, deleteSubject } from './service.js'

export async function subjectsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/subjects', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return listSubjects(req.tenant.id)
  })

  fastify.post('/subjects', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const body = req.body as { name: string; description?: string; divisionId?: string; teamId?: string }
    return reply.status(201).send(await createSubject(req.tenant.id, body))
  })

  fastify.patch('/subjects/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; description: string; active: boolean; divisionId: string; teamId: string }>
    const updated = await updateSubject(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Subject not found' })
    return updated
  })

  fastify.delete('/subjects/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await deleteSubject(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
