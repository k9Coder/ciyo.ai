import type { FastifyInstance } from 'fastify'
import { eq, and, desc } from 'drizzle-orm'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { db } from '../db/client.js'
import { subjects, subjectVersions } from '../db/schema.js'
import { listSubjects, createSubject, updateSubject, deleteSubject } from './service.js'

export async function subjectsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/subjects', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return listSubjects(req.tenant.id)
  })

  fastify.post('/subjects', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const body = req.body as { name: string; description?: string; divisionId?: string; teamId?: string }
    if (!body.name?.trim()) return reply.status(400).send({ error: 'name is required' })
    return reply.status(201).send(await createSubject(req.tenant.id, body))
  })

  fastify.patch('/subjects/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ name: string; description: string; active: boolean; divisionId: string; teamId: string }>
    if (body.name !== undefined && !body.name.trim()) return reply.status(400).send({ error: 'name is required' })
    const updated = await updateSubject(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Subject not found' })
    return updated
  })

  fastify.delete('/subjects/:id', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    await deleteSubject(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })

  fastify.get('/subjects/:subjectId/versions', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { subjectId } = req.params as { subjectId: string }

    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.tenantId, req.tenant.id)))
    if (!subject) return reply.status(404).send({ error: 'Subject not found' })

    const versions = await db
      .select({
        id:                subjectVersions.id,
        version:           subjectVersions.version,
        source:            subjectVersions.source,
        conversationMsgId: subjectVersions.conversationMsgId,
        createdAt:         subjectVersions.createdAt,
      })
      .from(subjectVersions)
      .where(eq(subjectVersions.subjectId, subjectId))
      .orderBy(desc(subjectVersions.version))

    return { versions }
  })
}
