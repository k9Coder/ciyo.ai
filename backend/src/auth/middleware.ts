import type { FastifyRequest, FastifyReply } from 'fastify'
import { parseToken, compareToken } from './tokens.js'
import { getTenantBySlug } from '../tenants/service.js'

async function resolveToken(
  request: FastifyRequest,
  reply: FastifyReply,
  requireAdmin: boolean
): Promise<void> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const parsed = parseToken(auth.slice(7))
  if (!parsed) {
    return reply.status(401).send({ error: 'Invalid token format' })
  }
  const tenant = await getTenantBySlug(parsed.slug)
  if (!tenant) {
    return reply.status(401).send({ error: 'Unknown tenant' })
  }
  const hash = parsed.prefix === 'ps_adm' ? tenant.adminTokenHash : tenant.orgTokenHash
  if (!(await compareToken(parsed.secret, hash))) {
    return reply.status(401).send({ error: 'Invalid token' })
  }
  if (requireAdmin && parsed.prefix !== 'ps_adm') {
    return reply.status(403).send({ error: 'Admin token required' })
  }
  request.tenant = tenant
  request.tokenPrefix = parsed.prefix
}

export async function requireOrgToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveToken(req, reply, false)
}

export async function requireAdminToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveToken(req, reply, true)
}
