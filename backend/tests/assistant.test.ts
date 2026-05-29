import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { subjects, chatSessions, chatMessages } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

// Mock the LLM so tests don't hit real APIs
vi.mock('../src/assistant/llm/anthropic.js', () => ({
  AnthropicLlmService: class {
    async chat(_sys: string, _hist: unknown[], message: string) {
      if (message.toLowerCase().includes('create')) {
        return {
          reply: 'Creating a keyword rule.',
          actions: [{ op: 'create_rule', subjectId: '__SUBJECT_ID__', kind: 'keyword', keywords: ['test'], action: 'block' }],
        }
      }
      return { reply: 'Got it.', actions: [] }
    }
  },
}))

let app: FastifyInstance
let adminToken: string
let tenantId: string
let subjectId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  tenantId   = t.tenantId
  const [sub] = await db.insert(subjects).values({ tenantId, name: 'Test Subject', active: true }).returning()
  subjectId = sub!.id
})
afterAll(async () => { await app.close() })

describe('POST /v1/assistant/chat', () => {
  it('creates a session and returns a reply', async () => {
    const res = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Hello, what can you do?' })
    expect(res.status).toBe(200)
    expect(res.body.sessionId).toBeDefined()
    expect(res.body.messageId).toBeDefined()
    expect(typeof res.body.reply).toBe('string')
    expect(Array.isArray(res.body.actions)).toBe(true)
  })

  it('reuses existing session when sessionId provided', async () => {
    const first = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Hello' })
    const sessionId = first.body.sessionId as string

    const second = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Follow up', sessionId })
    expect(second.body.sessionId).toBe(sessionId)

    const msgs = await db.select().from(chatMessages)
      .innerJoin(chatSessions, eq(chatSessions.id, chatMessages.sessionId))
      .where(eq(chatSessions.id, sessionId))
    expect(msgs.length).toBe(4) // 2 user + 2 assistant
  })
})

describe('GET /v1/assistant/sessions', () => {
  it('returns sessions for tenant', async () => {
    await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'Hello' })
    const res = await supertest(app.server)
      .get('/v1/assistant/sessions')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.sessions.length).toBeGreaterThan(0)
    expect(res.body.sessions[0].title).toBeDefined()
  })
})

describe('POST /v1/assistant/apply', () => {
  it('executes actions and marks message applied', async () => {
    const chatRes = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'create a rule' })

    // Patch the message's actions_json to use a safe action (create_subject needs no FK)
    await db.update(chatMessages)
      .set({ actionsJson: [{ op: 'create_subject', name: 'Applied Subject' }] })
      .where(eq(chatMessages.id, chatRes.body.messageId as string))

    const applyRes = await supertest(app.server)
      .post('/v1/assistant/apply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messageId: chatRes.body.messageId })
    expect(applyRes.status).toBe(200)
    expect(applyRes.body.applied.length).toBeGreaterThan(0)

    const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, chatRes.body.messageId as string))
    expect(msg?.appliedAt).not.toBeNull()
  })

  it('returns 404 for unknown messageId', async () => {
    const res = await supertest(app.server)
      .post('/v1/assistant/apply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messageId: '00000000-0000-0000-0000-000000000000' })
    expect(res.status).toBe(404)
  })

  it('returns 409 when message already applied', async () => {
    const chatRes = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'create' })
    await db.update(chatMessages)
      .set({ actionsJson: [{ op: 'create_subject', name: 'S' }], appliedAt: new Date() })
      .where(eq(chatMessages.id, chatRes.body.messageId))
    const res = await supertest(app.server)
      .post('/v1/assistant/apply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messageId: chatRes.body.messageId })
    expect(res.status).toBe(409)
  })
})
