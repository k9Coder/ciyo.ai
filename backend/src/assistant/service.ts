import { eq, desc } from 'drizzle-orm'
import { db } from '../db/client.js'
import { chatSessions, chatMessages, teams, type ChatSession, type ChatMessage } from '../db/schema.js'
import { listDivisions } from '../divisions/service.js'
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import { buildSystemPrompt, type TenantSnapshot } from './prompt.js'
import type { LlmService, Action } from './llm/interface.js'

async function fetchSnapshot(tenantId: string): Promise<TenantSnapshot> {
  const [divisions, allTeams, subjects, rules] = await Promise.all([
    listDivisions(tenantId),
    db.select().from(teams).where(eq(teams.tenantId, tenantId)),
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
  ])
  return { divisions, teams: allTeams, subjects, rules }
}

export async function sendMessage(opts: {
  tenantId:  string
  memberId:  string | undefined
  sessionId: string | undefined
  message:   string
  llm:       LlmService
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
  const { reply, actions } = await llm.chat(systemPrompt, history, message)

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
