import type { FastifyInstance } from 'fastify'
import { requirePlatformAdmin } from '../auth/middleware.js'
import { listAllTenants } from './service.js'
import { membersClient, divisionsClient, subjectsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
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
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id
    return reply.send((await membersClient.get('/')).data)
  })

  fastify.post('/tenants/:tenantId/members', async (req, reply) => {
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id
    const { email, displayName, role } = req.body as Pick<NewMember, 'email' | 'displayName' | 'role'>
    const member = (await membersClient.post('/', { email, displayName, role: role ?? 'member' })).data
    return reply.status(201).send(member)
  })

  fastify.patch('/tenants/:tenantId/members/:memberId', async (req, reply) => {
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id
    const { memberId } = req.params as { tenantId: string; memberId: string }
    const data = req.body as Partial<Pick<NewMember, 'displayName' | 'role' | 'adminDivisionId'>>
    const updated = (await membersClient.patch(`/${memberId}`, data)).data
    if (!updated) return reply.status(404).send({ error: 'Member not found' })
    return reply.send(updated)
  })

  fastify.delete('/tenants/:tenantId/members/:memberId', async (req, reply) => {
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id
    const { memberId } = req.params as { tenantId: string; memberId: string }
    await membersClient.delete(`/${memberId}`)
    return reply.status(204).send()
  })

  fastify.get('/tenants/:tenantId/divisions', async (req, reply) => {
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id
    return reply.send((await divisionsClient.get('/')).data)
  })

  fastify.get('/tenants/:tenantId/subjects', async (req, reply) => {
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id
    return reply.send((await subjectsClient.get('/')).data)
  })
}
