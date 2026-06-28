import type { FastifyInstance, FastifyRequest } from 'fastify'
import { listDestinationGroups } from '../destination-groups/service.js'

function tid(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw Object.assign(new Error('missing X-Tenant-ID'), { statusCode: 400 })
  return id
}

export async function destinationGroupsInternalRouter(app: FastifyInstance) {
  app.get('/', async req => listDestinationGroups(tid(req)))
}
