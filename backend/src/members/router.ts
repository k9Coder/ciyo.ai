import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import {
  listMembers, createMember, updateMember, deleteMember,
  assignTeam, removeTeam, importMembers,
} from './service.js'

export async function membersRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/members', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return listMembers(req.tenant.id)
  })

  fastify.post('/members', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const body = req.body as { email: string; displayName?: string; role?: 'member' | 'division_admin' | 'super_admin' }
    const member = await createMember(req.tenant.id, {
      email: body.email,
      displayName: body.displayName,
      role: body.role ?? 'member',
    })
    return reply.status(201).send(member)
  })

  fastify.post('/members/import', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const body = req.body as { rows: Array<{ email: string; displayName?: string }> }
    const imported = await importMembers(req.tenant.id, body.rows ?? [])
    return reply.status(201).send(imported)
  })

  fastify.patch('/members/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ displayName: string; role: string; adminDivisionId: string; failMode: 'open' | 'closed' | null }>
    if (body.failMode !== undefined && body.failMode !== null && body.failMode !== 'open' && body.failMode !== 'closed') {
      return reply.status(400).send({ error: 'failMode must be "open", "closed", or null' })
    }
    const updated = await updateMember(req.tenant.id, id, body as any)
    if (!updated) return reply.status(404).send({ error: 'Member not found' })
    return updated
  })

  fastify.delete('/members/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await deleteMember(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })

  fastify.post('/members/:id/teams', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const { teamId } = req.body as { teamId: string }
    await assignTeam(id, teamId, req.tenant.id)
    return reply.status(204).send()
  })

  fastify.post('/members/:id/teams/:teamId', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id, teamId } = req.params as { id: string; teamId: string }
    await assignTeam(id, teamId, req.tenant.id)
    return reply.status(204).send()
  })

  fastify.delete('/members/:id/teams/:teamId', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id, teamId } = req.params as { id: string; teamId: string }
    await removeTeam(id, teamId, req.tenant.id)
    return reply.status(204).send()
  })
}
