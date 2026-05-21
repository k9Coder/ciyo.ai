import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { verifyToken as clerkVerifyToken } from '@clerk/backend'
import { parseToken, compareToken } from './tokens.js'
import { getTenantBySlug } from '../tenants/service.js'
import { db } from '../db/client.js'
import { tenants, members } from '../db/schema.js'

async function resolveOrgToken(
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
  request.tokenPrefix = parsed.prefix as 'ps_live' | 'ps_adm'
}

async function resolveClerkJwt(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    return reply.status(500).send({ error: 'Clerk not configured' })
  }
  let clerkUserId: string
  let clerkOrgId: string
  try {
    const payload = await clerkVerifyToken(token, { secretKey })
    clerkUserId = payload.sub
    clerkOrgId  = (payload as Record<string, unknown>)['org_id'] as string
  } catch {
    return reply.status(401).send({ error: 'Invalid Clerk token' })
  }

  if (!clerkOrgId) {
    return reply.status(401).send({ error: 'Token missing org_id' })
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkOrgId, clerkOrgId))
  if (!tenant) {
    return reply.status(401).send({ error: 'Unknown organisation' })
  }

  const [member] = await db.select().from(members)
    .where(eq(members.clerkId, clerkUserId))
  if (!member) {
    return reply.status(401).send({ error: 'Member not enrolled — contact your admin' })
  }

  request.tenant      = tenant
  request.member      = member
  request.tokenPrefix = 'clerk'
}

export async function requireOrgToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveOrgToken(req, reply, false)
}

export async function requireAdminToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveOrgToken(req, reply, true)
}

export async function requireClerkAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.headers.authorization?.slice(7) ?? ''
  return resolveClerkJwt(req, reply, token)
}

export async function requireOrgTokenOrClerkAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const token = auth.slice(7)
  if (token.startsWith('ps_')) {
    return resolveOrgToken(req, reply, false)
  }
  return resolveClerkJwt(req, reply, token)
}

export async function requireAdminTokenOrClerkAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const token = auth.slice(7)
  if (token.startsWith('ps_')) {
    return resolveOrgToken(req, reply, true)
  }
  await resolveClerkJwt(req, reply, token)
  if (reply.sent) return
  if (req.member?.role !== 'super_admin') {
    return reply.status(403).send({ error: 'Admin access required' })
  }
}
