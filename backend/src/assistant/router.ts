import type { FastifyInstance } from 'fastify'
import { and, count, eq, gte } from 'drizzle-orm'
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
import type { Action } from './llm/interface.js'
import { getLlmClient } from './llm/index.js'

export async function countPromptsUsedToday(tenantId: string): Promise<number> {
  const todayStart = new Date()
  todayStart.setUTCHours(0, 0, 0, 0)

  const [row] = await db
    .select({ n: count() })
    .from(chatMessages)
    .innerJoin(chatSessions, eq(chatMessages.sessionId, chatSessions.id))
    .where(and(
      eq(chatSessions.tenantId, tenantId),
      eq(chatMessages.role, 'user'),
      gte(chatMessages.createdAt, todayStart),
    ))
  return row?.n ?? 0
}

export async function assistantRouter(fastify: FastifyInstance): Promise<void> {
  const llm = await getLlmClient()

  fastify.post('/assistant/chat', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const plan   = req.tenant.plan as Plan
    const limits = PLAN_LIMITS[plan]

    if (!limits?.assistantEnabled) {
      return reply.status(402).send({
        error: 'The AI Assistant is available on the Business plan. Upgrade to access it.',
      })
    }

    if (limits.assistantPromptsADay !== -1) {
      const used = await countPromptsUsedToday(req.tenant.id)
      if (used >= limits.assistantPromptsADay) {
        return reply.status(429).send({
          error: `Daily assistant limit reached (${limits.assistantPromptsADay} prompts/day). Resets at midnight UTC.`,
          promptsUsedToday: used,
          limit: limits.assistantPromptsADay,
        })
      }
    }

    const { message, sessionId } = req.body as { message: string; sessionId?: string }
    if (!message || typeof message !== 'string') {
      return reply.status(400).send({ error: 'message is required' })
    }

    const maxTokens = limits.assistantMaximumTokens !== -1 ? limits.assistantMaximumTokens : undefined

    return sendMessage({ tenantId: req.tenant.id, memberId: req.member?.id, sessionId, message, llm, maxTokens })
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

    // Admin-token callers hold org-wide authority (treated as super_admin); Clerk
    // callers reaching this admin-gated route are already super_admin, but read the
    // member role explicitly so the guard stays correct if gating ever loosens.
    const callerRole = req.tokenPrefix === 'ps_adm'
      ? 'super_admin' as const
      : (req.member?.role ?? 'member')
    const { applied, errors } = await executeActions(req.tenant.id, actions, { callerRole })
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
