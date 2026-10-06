import type { FastifyInstance } from 'fastify'
import { eq, asc } from 'drizzle-orm'
import { verifyToken as clerkVerifyToken } from '@clerk/backend'
import { db } from '../db/client.js'
import { members, users, tenants } from '../db/schema.js'
import { env } from '../env.js'
import { requireClerkUser } from '../auth/middleware.js'
import { selfServeProvisionOrg } from './service.js'
import { getOrProvisionUserByClerkId } from '../users/jit.js'

export async function meRouter(fastify: FastifyInstance): Promise<void> {
  // Console-only: provisions a personal org for a signed-up-but-unenrolled
  // user. Never called by extension/desktop — see selfServeProvisionOrg for
  // why keeping this explicit (rather than automatic on every signup) is
  // what makes those surfaces admin-add-only. Race-safe/idempotent: safe to
  // call even if the webhook's pending-claim already enrolled this user.
  fastify.post('/me/self-serve-org', { preHandler: requireClerkUser }, async (req, reply) => {
    if (!req.user) return reply.status(401).send({ error: 'Not authenticated' })
    const memberships = await selfServeProvisionOrg(req.user)
    return reply.status(200).send({ memberships })
  })

  fastify.get('/me/memberships', async (req, reply) => {
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

    const user = await getOrProvisionUserByClerkId(clerkUserId)
    if (!user) return reply.status(401).send({ error: 'User not found — sign up first' })

    // Deterministic order: real (invited) orgs before auto-provisioned personal tenants,
    // oldest first within each group. Clients default to the first membership, so this
    // makes an invited employee land on the employer's org, not their empty auto-tenant.
    const rows = await db
      .select({
        tenantId:        tenants.id,
        tenantName:      tenants.name,
        role:            members.role,
        autoProvisioned: tenants.autoProvisioned,
      })
      .from(members)
      .innerJoin(tenants, eq(members.tenantId, tenants.id))
      .where(eq(members.userId, user.id))
      .orderBy(asc(tenants.autoProvisioned), asc(tenants.createdAt))

    return { memberships: rows }
  })
}
