import type { Tenant, Member } from './db/schema.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant:      Tenant
    member?:     Member
    tokenPrefix: 'ps_live' | 'ps_adm' | 'clerk'
  }
}
