import type { FastifyInstance } from 'fastify'
import { requireOrgToken } from './middleware.js'
import { getMemberByEmail, createMember } from '../members/service.js'

export async function joinRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/auth/join', { preHandler: requireOrgToken }, async (req, reply) => {
    const { email } = req.body as { email: string }
    if (!email || !email.includes('@')) {
      return reply.status(400).send({ error: 'Valid email required' })
    }
    const existing = await getMemberByEmail(req.tenant.id, email)
    if (existing) return reply.status(200).send(existing)
    const member = await createMember(req.tenant.id, { email, role: 'member' })
    return reply.status(201).send(member)
  })
}
