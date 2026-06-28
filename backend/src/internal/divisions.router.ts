import type { FastifyInstance, FastifyRequest } from 'fastify'
import { listDivisions, createDivision, deleteDivision } from '../divisions/service.js'
import type { NewDivision } from '../db/schema.js'

function tid(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw Object.assign(new Error('missing X-Tenant-ID'), { statusCode: 400 })
  return id
}

export async function divisionsInternalRouter(app: FastifyInstance) {
  app.get('/', async req => listDivisions(tid(req)))

  app.post<{ Body: Pick<NewDivision, 'name' | 'slug'> }>('/', async (req, reply) => {
    const division = await createDivision(tid(req), req.body)
    return reply.code(201).send(division)
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteDivision(tid(req), req.params.id)
    return reply.code(204).send()
  })
}
