import type { FastifyInstance } from 'fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { db } from '../db/client.js'
import { chatMessages, chatSessions, subjectVersions, subjects, rules as rulesTable } from '../db/schema.js'
import { sendMessage, getSessions, getMessages } from './service.js'
import { executeActions } from './apply.js'
import { resolveAffectedSubjectIds } from './versioning.js'
import { snapshotSubject } from '../subjects/snapshot.js'
import { PLAN_LIMITS, type Plan } from '../billing/limits.js'
import type { LlmService, Action } from './llm/interface.js'

async function makeLlmService(): Promise<LlmService> {
  if (process.env.LLM_PROVIDER === 'openai') {
    const { OpenAiLlmService } = await import('./llm/openai.js')
    return new OpenAiLlmService()
  }
  if (process.env.LLM_PROVIDER === 'groq') {
    const { GroqLlmService } = await import('./llm/groq.js')
    return new GroqLlmService()
  }
  const { AnthropicLlmService } = await import('./llm/anthropic.js')
  return new AnthropicLlmService()
}

export async function assistantRouter(fastify: FastifyInstance): Promise<void> {
  const llm = await makeLlmService()

  fastify.post('/assistant/chat', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const plan = req.tenant.plan as Plan
    if (!PLAN_LIMITS[plan]?.assistantEnabled) {
      return reply.status(402).send({
        error: 'The AI Assistant is available on the Business plan. Upgrade to access it.',
      })
    }
    const { message, sessionId } = req.body as { message: string; sessionId?: string }
    if (!message || typeof message !== 'string') {
      return reply.status(400).send({ error: 'message is required' })
    }
    return sendMessage({ tenantId: req.tenant.id, memberId: req.member?.id, sessionId, message, llm })
  })

  fastify.post('/assistant/apply', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { messageId } = req.body as { messageId: string }

    // Join through chatSessions to ensure the message belongs to this tenant
    const [row] = await db
      .select({ msg: chatMessages })
      .from(chatMessages)
      .innerJoin(chatSessions, and(
        eq(chatMessages.sessionId, chatSessions.id),
        eq(chatSessions.tenantId, req.tenant.id),
      ))
      .where(eq(chatMessages.id, messageId))
    const msg = row?.msg
    if (!msg) return reply.status(404).send({ error: 'Message not found' })
    if (msg.appliedAt) return reply.status(409).send({ error: 'Already applied' })

    const actions = Array.isArray(msg.actionsJson)
      ? (msg.actionsJson as Action[])
      : []

    // Snapshot affected subjects BEFORE applying — this is the revert point
    const affectedIds = await resolveAffectedSubjectIds(req.tenant.id, actions)
    await Promise.all(
      affectedIds.map(id => snapshotSubject(req.tenant.id, id, 'pre_ai_apply', messageId))
    )

    const { applied, errors } = await executeActions(req.tenant.id, actions)
    await db.update(chatMessages).set({ appliedAt: new Date() }).where(eq(chatMessages.id, messageId))

    return { applied, errors }
  })

  // Revert all subject changes made by a specific assistant message
  fastify.post('/assistant/messages/:messageId/revert', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string }

    const versions = await db
      .select()
      .from(subjectVersions)
      .where(eq(subjectVersions.conversationMsgId, messageId))

    if (!versions.length) return reply.status(404).send({ error: 'No revertible changes found for this message' })

    for (const ver of versions) {
      if (ver.tenantId !== req.tenant.id) return reply.status(403).send({ error: 'Forbidden' })
      const snap = ver.snapshot

      // Restore subject metadata
      await db.update(subjects)
        .set({ name: snap.name, description: snap.description, active: snap.active })
        .where(eq(subjects.id, ver.subjectId))

      // Replace rules: delete current, reinsert from snapshot
      await db.delete(rulesTable).where(eq(rulesTable.subjectId, ver.subjectId))

      if (snap.rules.length > 0) {
        await db.insert(rulesTable).values(
          snap.rules.map(r => ({
            tenantId:            req.tenant.id,
            subjectId:           ver.subjectId,
            kind:                r.kind,
            keywords:            r.keywords,
            pattern:             r.pattern,
            destinations:        r.destinations,
            destinationGroupIds: r.destinationGroupIds,
            action:              r.action,
            message:             r.message,
            isOverridable:       r.isOverridable,
            reportLevel:         r.reportLevel,
            active:              r.active,
          }))
        )
      }

      // Record the rollback as a new version (audit trail)
      await snapshotSubject(req.tenant.id, ver.subjectId, 'rollback')
    }

    return { reverted: versions.length }
  })

  fastify.get('/assistant/sessions', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    return { sessions: await getSessions(req.tenant.id) }
  })

  fastify.get('/assistant/sessions/:id/messages', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const messages = await getMessages(req.tenant.id, id)
    if (!messages.length) return reply.status(404).send({ error: 'Session not found' })

    // Enrich: mark which assistant messages have associated version snapshots
    const assistantMsgIds = messages
      .filter(m => m.role === 'assistant' && m.appliedAt)
      .map(m => m.id)

    const snapshotMsgIds = new Set<string>()
    if (assistantMsgIds.length > 0) {
      const rows = await db
        .selectDistinct({ conversationMsgId: subjectVersions.conversationMsgId })
        .from(subjectVersions)
        .where(inArray(subjectVersions.conversationMsgId, assistantMsgIds))
      for (const row of rows) {
        if (row.conversationMsgId) snapshotMsgIds.add(row.conversationMsgId)
      }
    }

    return {
      messages: messages.map(m => ({
        ...m,
        hasVersionSnapshot: snapshotMsgIds.has(m.id),
      })),
    }
  })
}
