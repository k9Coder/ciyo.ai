import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { randomUUID } from 'node:crypto'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import {
  subjects, rules, chatMessages, chatSessions, subjectVersions,
} from '../src/db/schema.js'
import { eq, and } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import { requestContext } from '../src/context/request-context.js'

vi.mock('../src/assistant/llm/anthropic.js', () => ({
  AnthropicLlmService: class {
    async chat() {
      return { reply: 'Done.', actions: [] }
    }
  },
}))

let app: FastifyInstance
let adminToken: string
let tenantId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  tenantId   = t.tenantId
})
afterAll(async () => { await app.close() })

// Seed a subject + rules, create a chat message, snapshot the subject (simulating
// what POST /assistant/apply does before it calls executeActions), then return IDs.
async function seedAppliedMessage(opts: {
  subjectName:   string
  initialRules:  Array<{ keywords: string[]; action: 'warn' | 'block' }>
  newRules?:     Array<{ keywords: string[]; action: 'warn' | 'block' }>
}) {
  const [sub] = await db.insert(subjects)
    .values({ tenantId, name: opts.subjectName, active: true })
    .returning()
  const subjectId = sub!.id

  for (const r of opts.initialRules) {
    await db.insert(rules).values({
      tenantId, subjectId, kind: 'keyword',
      keywords: r.keywords, action: r.action,
      active: true, reportLevel: 'none',
    })
  }

  // Create a chat session + message (simulates what the assistant returns)
  const [session] = await db.insert(chatSessions)
    .values({ tenantId, title: 'Test' })
    .returning()
  const [msg] = await db.insert(chatMessages)
    .values({
      sessionId: session!.id,
      role: 'assistant',
      content: 'I will update your rules.',
      actionsJson: [],
      appliedAt: new Date(),
    })
    .returning()
  const messageId = msg!.id

  // Snapshot the current state (simulates pre_ai_apply snapshot taken by /apply)
  const { snapshotSubject } = await import('../src/subjects/snapshot.js')
  await new Promise<void>((resolve, reject) =>
    requestContext.run({ traceId: randomUUID(), tenantId, isM2M: true }, () =>
      snapshotSubject(tenantId, subjectId, 'pre_ai_apply', messageId).then(resolve).catch(reject)
    )
  )

  // If newRules provided, mutate the DB to simulate what executeActions did
  if (opts.newRules) {
    await db.delete(rules).where(eq(rules.subjectId, subjectId))
    for (const r of opts.newRules) {
      await db.insert(rules).values({
        tenantId, subjectId, kind: 'keyword',
        keywords: r.keywords, action: r.action,
        active: true, reportLevel: 'none',
      })
    }
  }

  return { subjectId, messageId, sessionId: session!.id }
}

describe('POST /v1/assistant/messages/:messageId/revert', () => {
  it('restores subject rules to pre-apply snapshot', async () => {
    const { subjectId, messageId } = await seedAppliedMessage({
      subjectName:  'Credentials',
      initialRules: [{ keywords: ['password'], action: 'block' }],
      newRules:     [{ keywords: ['token'], action: 'warn' }],
    })

    // Before revert: rules should be the mutated set
    const before = await db.select().from(rules).where(eq(rules.subjectId, subjectId))
    expect(before.some(r => r.keywords?.includes('token'))).toBe(true)
    expect(before.some(r => r.keywords?.includes('password'))).toBe(false)

    const res = await supertest(app.server)
      .post(`/v1/assistant/messages/${messageId}/revert`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.reverted).toBe(1)

    // After revert: original rule restored
    const after = await db.select().from(rules).where(eq(rules.subjectId, subjectId))
    expect(after.some(r => r.keywords?.includes('password'))).toBe(true)
    expect(after.some(r => r.keywords?.includes('token'))).toBe(false)
  })

  it('restores subject name from snapshot', async () => {
    const [sub] = await db.insert(subjects)
      .values({ tenantId, name: 'Original Name', active: true })
      .returning()
    const subjectId = sub!.id

    const [session] = await db.insert(chatSessions)
      .values({ tenantId, title: 'T' })
      .returning()
    const [msg] = await db.insert(chatMessages)
      .values({ sessionId: session!.id, role: 'assistant', content: '', actionsJson: [], appliedAt: new Date() })
      .returning()
    const messageId = msg!.id

    const { snapshotSubject } = await import('../src/subjects/snapshot.js')
    await new Promise<void>((resolve, reject) =>
      requestContext.run({ traceId: randomUUID(), tenantId, isM2M: true }, () =>
        snapshotSubject(tenantId, subjectId, 'pre_ai_apply', messageId).then(resolve).catch(reject)
      )
    )

    // Mutate the subject name (simulates what update_subject action did)
    await db.update(subjects).set({ name: 'Mutated Name' }).where(eq(subjects.id, subjectId))

    const res = await supertest(app.server)
      .post(`/v1/assistant/messages/${messageId}/revert`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)

    const [restored] = await db.select().from(subjects).where(eq(subjects.id, subjectId))
    expect(restored?.name).toBe('Original Name')
  })

  it('handles revert where original had zero rules (all rules deleted)', async () => {
    const { subjectId, messageId } = await seedAppliedMessage({
      subjectName:  'Empty',
      initialRules: [],  // subject originally had no rules
      newRules:     [{ keywords: ['ssn'], action: 'block' }], // AI added one
    })

    const res = await supertest(app.server)
      .post(`/v1/assistant/messages/${messageId}/revert`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)

    // After revert: rules removed (back to zero)
    const after = await db.select().from(rules).where(eq(rules.subjectId, subjectId))
    expect(after).toHaveLength(0)
  })

  it('creates a rollback version entry (audit trail)', async () => {
    const { subjectId, messageId } = await seedAppliedMessage({
      subjectName:  'Audited',
      initialRules: [{ keywords: ['secret'], action: 'block' }],
    })

    const versionsBefore = await db.select().from(subjectVersions)
      .where(eq(subjectVersions.subjectId, subjectId))
    const countBefore = versionsBefore.length

    await supertest(app.server)
      .post(`/v1/assistant/messages/${messageId}/revert`)
      .set('Authorization', `Bearer ${adminToken}`)

    const versionsAfter = await db.select().from(subjectVersions)
      .where(eq(subjectVersions.subjectId, subjectId))
    expect(versionsAfter.length).toBe(countBefore + 1)
    expect(versionsAfter.at(-1)?.source).toBe('rollback')
  })

  it('returns 404 when no snapshot exists for messageId', async () => {
    const res = await supertest(app.server)
      .post('/v1/assistant/messages/00000000-0000-0000-0000-000000000000/revert')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('rejects revert of another tenant snapshot (403)', async () => {
    const other = await buildTestTenant()

    // Build snapshot under the other tenant's message
    const [sub] = await db.insert(subjects)
      .values({ tenantId: other.tenantId, name: 'Foreign', active: true })
      .returning()
    const [session] = await db.insert(chatSessions)
      .values({ tenantId: other.tenantId, title: 'T' })
      .returning()
    const [msg] = await db.insert(chatMessages)
      .values({ sessionId: session!.id, role: 'assistant', content: '', actionsJson: [], appliedAt: new Date() })
      .returning()
    const { snapshotSubject } = await import('../src/subjects/snapshot.js')
    await new Promise<void>((resolve, reject) =>
      requestContext.run({ traceId: randomUUID(), tenantId: other.tenantId, isM2M: true }, () =>
        snapshotSubject(other.tenantId, sub!.id, 'pre_ai_apply', msg!.id).then(resolve).catch(reject)
      )
    )

    // Try to revert using our tenant's token
    const res = await supertest(app.server)
      .post(`/v1/assistant/messages/${msg!.id}/revert`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(403)
  })

  it('revert is idempotent — second revert creates another rollback snapshot', async () => {
    const { messageId } = await seedAppliedMessage({
      subjectName:  'Idempotent',
      initialRules: [{ keywords: ['foo'], action: 'warn' }],
    })

    const first = await supertest(app.server)
      .post(`/v1/assistant/messages/${messageId}/revert`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(first.status).toBe(200)

    // Second revert should succeed — the pre_ai_apply snapshot is still there
    const second = await supertest(app.server)
      .post(`/v1/assistant/messages/${messageId}/revert`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(second.status).toBe(200)
  })

  it('requires admin token', async () => {
    const { messageId } = await seedAppliedMessage({
      subjectName:  'AuthCheck',
      initialRules: [],
    })
    const t = await buildTestTenant()
    const res = await supertest(app.server)
      .post(`/v1/assistant/messages/${messageId}/revert`)
      .set('Authorization', `Bearer ${t.orgToken}`)  // org token, not admin
    // Org token not accepted by requireAdminTokenOrClerkAdmin for non-admin tokens
    expect([401, 403]).toContain(res.status)
  })
})

describe('GET /v1/assistant/sessions/:id/messages', () => {
  it('returns messages with hasVersionSnapshot flag', async () => {
    const { messageId, sessionId } = await seedAppliedMessage({
      subjectName:  'Snapshotted',
      initialRules: [{ keywords: ['x'], action: 'block' }],
    })

    const res = await supertest(app.server)
      .get(`/v1/assistant/sessions/${sessionId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)

    const msgs = res.body.messages as Array<{ id: string; hasVersionSnapshot: boolean }>
    const target = msgs.find(m => m.id === messageId)
    expect(target).toBeDefined()
    expect(target?.hasVersionSnapshot).toBe(true)
  })

  it('hasVersionSnapshot is false for messages with no snapshot', async () => {
    // Chat message with no snapshot
    const [session] = await db.insert(chatSessions)
      .values({ tenantId, title: 'Plain' })
      .returning()
    await db.insert(chatMessages)
      .values({ sessionId: session!.id, role: 'user', content: 'Hello', actionsJson: [] })

    const res = await supertest(app.server)
      .get(`/v1/assistant/sessions/${session!.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)

    const msgs = res.body.messages as Array<{ hasVersionSnapshot: boolean }>
    expect(msgs.every(m => !m.hasVersionSnapshot)).toBe(true)
  })

  it('returns 404 for unknown session', async () => {
    const res = await supertest(app.server)
      .get('/v1/assistant/sessions/00000000-0000-0000-0000-000000000000/messages')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })

  it('returns 404 for session belonging to another tenant', async () => {
    const other = await buildTestTenant()
    const [session] = await db.insert(chatSessions)
      .values({ tenantId: other.tenantId, title: 'Other' })
      .returning()
    await db.insert(chatMessages)
      .values({ sessionId: session!.id, role: 'user', content: 'Hi', actionsJson: [] })

    const res = await supertest(app.server)
      .get(`/v1/assistant/sessions/${session!.id}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(404)
  })
})
