import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { verifyToken as clerkVerifyToken } from '@clerk/backend'
import { db } from '../db/client.js'
import { members, users, tenants } from '../db/schema.js'

export async function meRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/me/memberships', async (req, reply) => {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Missing bearer token' })
    }

    const secretKey = process.env.CLERK_SECRET_KEY
    if (!secretKey) return reply.status(500).send({ error: 'Clerk not configured' })

    let clerkUserId: string
    try {
      const payload = await clerkVerifyToken(auth.slice(7), { secretKey })
      clerkUserId = payload.sub
    } catch {
      return reply.status(401).send({ error: 'Invalid Clerk token' })
    }

    const [user] = await db.select().from(users).where(eq(users.clerkId, clerkUserId))
    if (!user) return reply.status(401).send({ error: 'User not found — sign up first' })

    const rows = await db
      .select({ tenantId: tenants.id, tenantName: tenants.name, role: members.role })
      .from(members)
      .innerJoin(tenants, eq(members.tenantId, tenants.id))
      .where(eq(members.userId, user.id))

    return { memberships: rows }
  })
}
