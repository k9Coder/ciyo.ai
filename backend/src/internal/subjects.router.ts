import type { FastifyInstance, FastifyRequest } from 'fastify'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { subjectVersions } from '../db/schema.js'
import { listSubjects, createSubject, updateSubject, deleteSubject, revertSubjectToSnapshot } from '../subjects/service.js'
import { snapshotSubject } from '../subjects/snapshot.js'
import type { NewSubject, SubjectSnapshot } from '../db/schema.js'

function tid(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw Object.assign(new Error('missing X-Tenant-ID'), { statusCode: 400 })
  return id
}

export async function subjectsInternalRouter(app: FastifyInstance) {
  app.get<{ Querystring: { conversationMsgId: string } }>('/versions', async req => {
    return db.select().from(subjectVersions)
      .where(eq(subjectVersions.conversationMsgId, req.query.conversationMsgId))
  })

  app.get<{ Querystring: { messageIds: string } }>('/versions/has-snapshots', async req => {
    const ids = (req.query.messageIds ?? '').split(',').filter(Boolean)
    if (ids.length === 0) return { ids: [] }
    const rows = await db.selectDistinct({ id: subjectVersions.conversationMsgId })
      .from(subjectVersions)
      .where(inArray(subjectVersions.conversationMsgId, ids))
    return { ids: rows.map(r => r.id).filter(Boolean) }
  })

  app.get('/', async req => listSubjects(tid(req)))

  app.post<{ Body: Pick<NewSubject, 'name' | 'description' | 'divisionId' | 'teamId'> }>('/', async (req, reply) => {
    const subject = await createSubject(tid(req), req.body)
    return reply.code(201).send(subject)
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateSubject>[2] }>('/:id', async req => {
    await updateSubject(tid(req), req.params.id, req.body)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteSubject(tid(req), req.params.id)
    return reply.code(204).send()
  })

  app.post<{ Params: { id: string }; Body: { snapshot: SubjectSnapshot } }>('/:id/revert-snapshot', async (req, reply) => {
    const tenantId = tid(req)
    await revertSubjectToSnapshot(tenantId, req.params.id, req.body.snapshot)
    await snapshotSubject(tenantId, req.params.id, 'rollback')
    return reply.code(204).send()
  })
}
