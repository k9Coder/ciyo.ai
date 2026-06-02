import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { db } from '../db/client.js'
import { chatMessages } from '../db/schema.js'
import { sendMessage, getSessions, getMessages } from './service.js'
import { executeActions } from './apply.js'
import { PLAN_LIMITS, type Plan } from '../billing/limits.js'
import type { LlmService } from './llm/interface.js'

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
    const result = await sendMessage({
      tenantId:  req.tenant.id,
      memberId:  req.member?.id,
      sessionId,
      message,
      llm,
    })
    return result
  })

  fastify.post('/assistant/apply', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { messageId } = req.body as { messageId: string }
    const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
    if (!msg) return reply.status(404).send({ error: 'Message not found' })
    if (msg.appliedAt) return reply.status(409).send({ error: 'Already applied' })

    const actions = Array.isArray(msg.actionsJson)
      ? (msg.actionsJson as Parameters<typeof executeActions>[1])
      : []
    const { applied, errors } = await executeActions(req.tenant.id, actions)

    await db.update(chatMessages)
      .set({ appliedAt: new Date() })
      .where(eq(chatMessages.id, messageId))

    return { applied, errors }
  })

  fastify.get('/assistant/sessions', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const sessions = await getSessions(req.tenant.id)
    return { sessions }
  })

  fastify.get('/assistant/sessions/:id/messages', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const messages = await getMessages(req.tenant.id, id)
    if (!messages.length) return reply.status(404).send({ error: 'Session not found' })
    return { messages }
  })
}
