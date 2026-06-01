import type { FastifyInstance } from 'fastify'
import { requirePlatformAdmin } from '../auth/middleware.js'
import { listAllTenants } from './service.js'
import { listMembers, createMember, updateMember, deleteMember } from '../members/service.js'
import { listDivisions } from '../divisions/service.js'
import { listSubjects } from '../subjects/service.js'
import type { NewMember } from '../db/schema.js'

export async function platformRouter(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', requirePlatformAdmin)

  fastify.get('/tenants', async (_req, reply) => {
    return reply.send(await listAllTenants())
  })

  fastify.get('/tenants/:tenantId', async (req, reply) => {
    return reply.send(req.tenant)
  })

  fastify.get('/tenants/:tenantId/members', async (req, reply) => {
    return reply.send(await listMembers(req.tenant.id))
  })

  fastify.post('/tenants/:tenantId/members', async (req, reply) => {
    const { email, displayName, role } = req.body as Pick<NewMember, 'email' | 'displayName' | 'role'>
    const member = await createMember(req.tenant.id, { email, displayName, role: role ?? 'member' })
    return reply.status(201).send(member)
  })

  fastify.patch('/tenants/:tenantId/members/:memberId', async (req, reply) => {
    const { memberId } = req.params as { tenantId: string; memberId: string }
    const data = req.body as Partial<Pick<NewMember, 'displayName' | 'role' | 'adminDivisionId'>>
    const updated = await updateMember(req.tenant.id, memberId, data)
    if (!updated) return reply.status(404).send({ error: 'Member not found' })
    return reply.send(updated)
  })

  fastify.delete('/tenants/:tenantId/members/:memberId', async (req, reply) => {
    const { memberId } = req.params as { tenantId: string; memberId: string }
    await deleteMember(req.tenant.id, memberId)
    return reply.status(204).send()
  })

  fastify.get('/tenants/:tenantId/divisions', async (req, reply) => {
    return reply.send(await listDivisions(req.tenant.id))
  })

  fastify.get('/tenants/:tenantId/subjects', async (req, reply) => {
    return reply.send(await listSubjects(req.tenant.id))
  })
}
