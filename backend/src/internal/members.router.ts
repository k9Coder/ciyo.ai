import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  listMembers, createMember, updateMember, deleteMember,
  assignTeam, removeTeam, listMembersByTeam,
} from '../members/service.js'
import { resolveMemberPolicy } from '../members/resolver.js'
import type { NewMember } from '../db/schema.js'
import type { PolicyDoc } from '../policy/compiler.js'

function tid(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw Object.assign(new Error('missing X-Tenant-ID'), { statusCode: 400 })
  return id
}

export async function membersInternalRouter(app: FastifyInstance) {
  app.get('/', async req => {
    const rows = await listMembers(tid(req))
    return rows.map(({ user: _u, ...m }) => m)
  })

  app.post<{ Body: Pick<NewMember, 'email' | 'displayName' | 'role'> }>('/', async (req, reply) => {
    const member = await createMember(tid(req), req.body)
    return reply.code(201).send(member)
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateMember>[2] }>('/:id', async req => {
    const member = await updateMember(tid(req), req.params.id, req.body)
    return member ?? { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteMember(tid(req), req.params.id)
    return reply.code(204).send()
  })

  app.post<{ Params: { id: string }; Body: { teamId: string } }>('/:id/assign-team', async req => {
    await assignTeam(req.params.id, req.body.teamId, tid(req))
    return { ok: true }
  })

  app.post<{ Params: { id: string }; Body: { teamId: string } }>('/:id/remove-team', async req => {
    await removeTeam(req.params.id, req.body.teamId, tid(req))
    return { ok: true }
  })

  app.get<{ Params: { teamId: string } }>('/by-team/:teamId', async req =>
    listMembersByTeam(tid(req), req.params.teamId)
  )

  app.post<{ Body: { memberId: string; snapshot: PolicyDoc } }>('/resolve-policy', async req =>
    resolveMemberPolicy(tid(req), req.body.memberId, req.body.snapshot)
  )
}
