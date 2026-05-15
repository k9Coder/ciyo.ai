import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listTeams, createTeam, updateTeam, deleteTeam } from './service.js'

export async function teamsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/divisions/:divisionId/teams', { preHandler: requireAdminToken }, async (req) => {
    const { divisionId } = req.params as { divisionId: string }
    return listTeams(req.tenant.id, divisionId)
  })

  fastify.post('/divisions/:divisionId/teams', { preHandler: requireAdminToken }, async (req, reply) => {
    const { divisionId } = req.params as { divisionId: string }
    const body = req.body as { name: string; slug: string }
    return reply.status(201).send(await createTeam(req.tenant.id, divisionId, body))
  })

  fastify.patch('/teams/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; slug: string }>
    const updated = await updateTeam(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Team not found' })
    return updated
  })

  fastify.delete('/teams/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteTeam(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
