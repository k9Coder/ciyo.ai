import type { FastifyInstance } from 'fastify'
import { and, eq } from 'drizzle-orm'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { db } from '../db/client.js'
import { chatMessages, chatSessions, type SubjectVersion } from '../db/schema.js'
import { subjectsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
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

    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id

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

    const affectedIds = await resolveAffectedSubjectIds(req.tenant.id, actions)
    await Promise.all(
      affectedIds.map(id => snapshotSubject(req.tenant.id, id, 'pre_ai_apply', messageId))
    )

    const { applied, errors } = await executeActions(req.tenant.id, actions)
    await db.update(chatMessages).set({ appliedAt: new Date() }).where(eq(chatMessages.id, messageId))

    return { applied, errors }
  })

  fastify.post('/assistant/messages/:messageId/revert', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { messageId } = req.params as { messageId: string }

    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id

    const versionsRes = await subjectsClient.get<SubjectVersion[]>('/versions', {
      params: { conversationMsgId: messageId },
    })
    const versions = versionsRes.data

    if (!versions.length) return reply.status(404).send({ error: 'No revertible changes found for this message' })

    for (const ver of versions) {
      if (ver.tenantId !== req.tenant.id) return reply.status(403).send({ error: 'Forbidden' })
      await subjectsClient.post(`/${ver.subjectId}/revert-snapshot`, { snapshot: ver.snapshot })
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

    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = req.tenant.id

    const assistantMsgIds = messages
      .filter(m => m.role === 'assistant' && m.appliedAt)
      .map(m => m.id)

    const snapshotMsgIds = new Set<string>()
    if (assistantMsgIds.length > 0) {
      const res = await subjectsClient.get<{ ids: string[] }>('/versions/has-snapshots', {
        params: { messageIds: assistantMsgIds.join(',') },
      })
      for (const sid of res.data.ids) snapshotMsgIds.add(sid)
    }

    return {
      messages: messages.map(m => ({
        ...m,
        hasVersionSnapshot: snapshotMsgIds.has(m.id),
      })),
    }
  })
}
