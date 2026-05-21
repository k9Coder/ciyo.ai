import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { listSiteConfigs, createSiteConfig, updateSiteConfig, deleteSiteConfig } from './service.js'

export async function siteConfigsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/site-configs', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return listSiteConfigs(req.tenant.id)
  })

  fastify.post('/site-configs', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { domain, inputSelector, sendButtonSelector } = req.body as {
      domain: string; inputSelector: string; sendButtonSelector: string
    }
    const row = await createSiteConfig(req.tenant.id, { domain, inputSelector, sendButtonSelector })
    return reply.status(201).send(row)
  })

  fastify.patch('/site-configs/:domain', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { domain } = req.params as { domain: string }
    const data = req.body as Partial<{ inputSelector: string; sendButtonSelector: string }>
    const row = await updateSiteConfig(req.tenant.id, domain, data)
    if (!row) return reply.status(404).send({ error: 'Site config not found' })
    return row
  })

  fastify.delete('/site-configs/:domain', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { domain } = req.params as { domain: string }
    await deleteSiteConfig(req.tenant.id, domain)
    return reply.status(204).send()
  })
}
