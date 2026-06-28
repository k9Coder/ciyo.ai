import type { FastifyInstance } from 'fastify'
import { getTenantById, updateSubscriptionStatus } from '../tenants/service.js'

export async function tenantsInternalRouter(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const tenant = await getTenantById(req.params.id)
    if (!tenant) return reply.code(404).send({ error: 'tenant not found' })
    return tenant
  })

  app.patch<{ Params: { id: string }; Body: { status: 'active' | 'past_due' | 'cancelled' } }>(
    '/:id/subscription',
    async req => {
      await updateSubscriptionStatus(req.params.id, req.body.status)
      return { ok: true }
    }
  )
}
