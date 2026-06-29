import { eq, desc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chatSessions, chatMessages, type ChatSession, type ChatMessage } from '../db/schema.js'
import { divisionsClient, subjectsClient, rulesClient, membersClient, teamsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import { buildSystemPrompt, type TenantSnapshot } from './prompt.js'
import type { LlmService, Action } from './llm/interface.js'

async function fetchSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const [divisionsRes, teamsRes, subjectsRes, rulesRes, membersRes] = await Promise.all([
    divisionsClient.get<TenantSnapshot['divisions']>('/'),
    teamsClient.get<TenantSnapshot['teams']>('/'),
    subjectsClient.get<TenantSnapshot['subjects']>('/'),
    rulesClient.get<TenantSnapshot['rules']>('/'),
    membersClient.get<Array<Omit<TenantSnapshot['members'][number], 'user'>>>('/'),
  ])
  return {
    divisions: divisionsRes.data,
    teams:     teamsRes.data,
    subjects:  subjectsRes.data,
    rules:     rulesRes.data,
    members:   membersRes.data,
  }
}

export async function sendMessage(opts: {
  tenantId:  string
  memberId:  string | undefined
  sessionId: string | undefined
  message:   string
  llm:       LlmService
  maxTokens?: number
}): Promise<{ sessionId: string; messageId: string; reply: string; actions: Action[] }> {
  const { tenantId, memberId, message, llm } = opts
  let sessionId = opts.sessionId

  if (!sessionId) {
    const title = message.slice(0, 60)
    const [session] = await db.insert(chatSessions)
      .values({ tenantId, memberId: memberId ?? null, title })
      .returning()
    sessionId = session!.id
  }

  const recentMessages = await db.select()
    .from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(desc(chatMessages.createdAt))
    .limit(20)
  const history = recentMessages
    .reverse()
    .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

  const snapshot     = await fetchSnapshot(tenantId)
  const systemPrompt = buildSystemPrompt(snapshot)
  const { reply, actions } = await llm.chat(systemPrompt, history, message, opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : undefined)

  await db.insert(chatMessages).values({ sessionId, role: 'user', content: message })
  const [assistantMsg] = await db.insert(chatMessages)
    .values({ sessionId, role: 'assistant', content: reply, actionsJson: actions })
    .returning()

  return { sessionId, messageId: assistantMsg!.id, reply, actions }
}

export async function getSessions(tenantId: string): Promise<ChatSession[]> {
  return db.select().from(chatSessions)
    .where(eq(chatSessions.tenantId, tenantId))
    .orderBy(desc(chatSessions.createdAt))
    .limit(50)
}

export async function getMessages(tenantId: string, sessionId: string): Promise<ChatMessage[]> {
  const [session] = await db.select().from(chatSessions)
    .where(eq(chatSessions.id, sessionId))
  if (!session || session.tenantId !== tenantId) return []
  return db.select().from(chatMessages)
    .where(eq(chatMessages.sessionId, sessionId))
    .orderBy(chatMessages.createdAt)
}
