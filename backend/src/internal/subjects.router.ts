import type { FastifyInstance, FastifyRequest } from 'fastify'
import { listSubjects, createSubject, updateSubject, deleteSubject } from '../subjects/service.js'
import type { NewSubject } from '../db/schema.js'

function tid(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw Object.assign(new Error('missing X-Tenant-ID'), { statusCode: 400 })
  return id
}

export async function subjectsInternalRouter(app: FastifyInstance) {
  app.get('/', async req => listSubjects(tid(req)))

  app.post<{ Body: Pick<NewSubject, 'name' | 'description' | 'divisionId' | 'teamId'> }>('/', async (req, reply) => {
    const subject = await createSubject(tid(req), req.body)
    return reply.code(201).send(subject)
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateSubject>[2] }>('/:id', async req => {
    await updateSubject(tid(req), req.params.id, req.body)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteSubject(tid(req), req.params.id)
    return reply.code(204).send()
  })
}
