import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { verifyToken as clerkVerifyToken } from '@clerk/backend'
import { parseToken, compareToken } from './tokens.js'
import { db } from '../db/client.js'
import { members, users, tenants } from '../db/schema.js'
import type { Tenant } from '../db/schema.js'
import { env } from '../env.js'

const _tenantCache = new Map<string, { data: Tenant; expiresAt: number }>()

// DELIBERATE EXCEPTION: auth middleware is foundational infrastructure that validates
// all incoming tokens. It requires direct DB access to get typed Tenant objects (with
// proper Date fields) for the hot-path token-validation cache. HTTP deserialization
// converts Date fields to strings, breaking gracePeriodEndsAt comparisons.
async function getTenantCached(id: string): Promise<Tenant | null> {
  const hit = _tenantCache.get(id)
  if (hit && hit.expiresAt > Date.now()) return hit.data
  const [row] = await db.select().from(tenants).where(eq(tenants.id, id))
  if (!row) return null
  _tenantCache.set(id, { data: row, expiresAt: Date.now() + 30_000 })
  return row
}

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
  const tenant = await getTenantCached(parsed.tenantId)
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

export async function resolveClerkJwt(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string
): Promise<void> {
  const secretKey = env.CLERK_SECRET_KEY
  if (!secretKey) {
    return reply.status(500).send({ error: 'Clerk not configured' })
  }

  let clerkUserId: string
  try {
    const payload = await clerkVerifyToken(token, { secretKey })
    clerkUserId = payload.sub
  } catch {
    return reply.status(401).send({ error: 'Invalid Clerk token' })
  }

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkUserId))
  if (!user) {
    return reply.status(401).send({ error: 'User not found — sign up first' })
  }

  const memberRows = await db.select().from(members).where(eq(members.userId, user.id))
  if (memberRows.length === 0) {
    return reply.status(401).send({ error: 'Not enrolled in any organisation — contact your admin' })
  }

  let member = memberRows[0]!
  if (memberRows.length > 1) {
    const tenantIdHint = request.headers['x-tenant-id'] as string | undefined
    if (!tenantIdHint) {
      return reply.status(400).send({ error: 'Multiple organisations found — specify X-Tenant-Id header' })
    }
    const t = await getTenantCached(tenantIdHint)
    if (!t) return reply.status(401).send({ error: 'Unknown tenant' })
    const found = memberRows.find(m => m.tenantId === t.id)
    if (!found) return reply.status(401).send({ error: 'Not a member of that organisation' })
    member = found
    request.tenant = t
  } else {
    const t = await getTenantCached(member.tenantId)
    if (!t) return reply.status(401).send({ error: 'Tenant not found' })
    request.tenant = t
  }

  request.user = user
  request.member = member
  request.tokenPrefix = 'clerk'
}

export function invalidateTenantCache(tenantId: string): void {
  _tenantCache.delete(tenantId)
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

export async function requirePlatformAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }

  const secretKey = env.CLERK_SECRET_KEY
  if (!secretKey) return reply.status(500).send({ error: 'Clerk not configured' })

  let clerkUserId: string
  try {
    const payload = await clerkVerifyToken(auth.slice(7), { secretKey })
    clerkUserId = payload.sub
  } catch {
    return reply.status(401).send({ error: 'Invalid Clerk token' })
  }

  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkUserId))
  if (!user) return reply.status(401).send({ error: 'User not found' })
  if (!user.isPlatformAdmin) return reply.status(403).send({ error: 'Platform admin access required' })

  req.platformUser = user

  const tenantId = (req.params as Record<string, string | undefined>)['tenantId']
  if (tenantId) {
    const tenant = await getTenantCached(tenantId)
    if (!tenant) return reply.status(404).send({ error: 'Tenant not found' })
    req.tenant = tenant
  }
}

export async function requireActiveSubscription(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { subscriptionStatus, gracePeriodEndsAt } = req.tenant
  if (subscriptionStatus === 'cancelled') {
    return reply.status(402).send({ error: 'subscription_cancelled' })
  }
  if (subscriptionStatus === 'past_due') {
    const expired = gracePeriodEndsAt && gracePeriodEndsAt < new Date()
    if (expired) return reply.status(402).send({ error: 'subscription_expired' })
  }
}           
