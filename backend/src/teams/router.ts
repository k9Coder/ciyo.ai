import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { listTeams, createTeam, updateTeam, deleteTeam } from './service.js'
import { membersClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'

export async function teamsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/divisions/:divisionId/teams', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { divisionId } = req.params as { divisionId: string }
    return listTeams(req.tenant.id, divisionId)
  })

  fastify.post('/divisions/:divisionId/teams', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { divisionId } = req.params as { divisionId: string }
    const body = req.body as { name: string; slug: string }
    return reply.status(201).send(await createTeam(req.tenant.id, divisionId, body))
  })

  fastify.patch('/teams/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; slug: string }>
    const updated = await updateTeam(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Team not found' })
    return updated
  })

  fastify.delete('/teams/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await deleteTeam(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })

  fastify.get('/teams/:teamId/members', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const { teamId } = req.params as { teamId: string }
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id
    return (await membersClient.get(`/by-team/${teamId}`)).data
  })
}
