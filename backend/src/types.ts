import type { Tenant, Member, User } from './db/schema.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant:        Tenant
    member?:       Member
    user?:         User
    platformUser?: User
    tokenPrefix:   'ps_live' | 'ps_adm' | 'clerk'
  }
}
