import type { Tenant } from './db/schema.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant
    tokenPrefix: 'ps_live' | 'ps_adm'
  }
}
