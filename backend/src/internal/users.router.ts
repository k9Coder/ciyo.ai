import type { FastifyInstance } from 'fastify'
import {
  getUserByEmail, createUser, updateUserProfile, nullifyClerkId, claimPendingMembers,
} from '../users/service.js'
import type { NewUser } from '../db/schema.js'

export async function usersInternalRouter(app: FastifyInstance) {
  app.get<{ Querystring: { email: string } }>('/by-email', async (req, reply) => {
    const user = await getUserByEmail(req.query.email)
    if (!user) return reply.code(404).send({ error: 'user not found' })
    return user
  })

  app.post<{ Body: Pick<NewUser, 'clerkId' | 'email' | 'firstName' | 'lastName' | 'avatarUrl'> }>('/', async (req, reply) => {
    const user = await createUser(req.body)
    return reply.code(201).send(user)
  })

  // clerkId in path — updateUserProfile is keyed by clerkId, not DB id
  app.patch<{ Params: { clerkId: string }; Body: Partial<Pick<NewUser, 'firstName' | 'lastName' | 'avatarUrl'>> }>('/by-clerk/:clerkId', async req => {
    await updateUserProfile(req.params.clerkId, req.body)
    return { ok: true }
  })

  app.post<{ Params: { clerkId: string } }>('/by-clerk/:clerkId/nullify', async req => {
    await nullifyClerkId(req.params.clerkId)
    return { ok: true }
  })

  app.post<{ Body: { email: string; userId: string } }>('/claim-pending', async req => {
    await claimPendingMembers(req.body.email, req.body.userId)
    return { ok: true }
  })
}
