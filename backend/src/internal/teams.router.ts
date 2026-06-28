import type { FastifyInstance, FastifyRequest } from 'fastify'
import { listTeams, createTeam, updateTeam, deleteTeam, getTeamById } from '../teams/service.js'
import { membersClient } from '../http/internal-client.js'
import type { NewTeam } from '../db/schema.js'

function tid(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw Object.assign(new Error('missing X-Tenant-ID'), { statusCode: 400 })
  return id
}

export async function teamsInternalRouter(app: FastifyInstance) {
  app.get<{ Querystring: { divisionId?: string } }>('/', async req => {
    return listTeams(tid(req), req.query.divisionId ?? '')
  })

  app.post<{ Body: Pick<NewTeam, 'name' | 'slug'> & { divisionId: string } }>('/', async (req, reply) => {
    const { divisionId, ...payload } = req.body
    const team = await createTeam(tid(req), divisionId, payload)
    return reply.code(201).send(team)
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateTeam>[2] }>('/:id', async req => {
    await updateTeam(tid(req), req.params.id, req.body)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteTeam(tid(req), req.params.id)
    return reply.code(204).send()
  })

  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const team = await getTeamById(tid(req), req.params.id)
    if (!team) return reply.code(404).send({ error: 'team not found' })
    return team
  })

  app.get<{ Params: { id: string } }>('/:id/members', async req =>
    (await membersClient.get(`/by-team/${req.params.id}`)).data
  )
}
