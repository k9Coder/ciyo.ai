import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import type { FastifyInstance } from 'fastify'

// Mock the LLM seam so the /assistant/chat call in the apply test doesn't hit a
// real API; the apply path itself exercises the real service choke point.
vi.mock('../src/assistant/llm/index.js', () => ({
  getLlmClient: async () => ({
    async chat() {
      return { reply: 'Creating a keyword rule.', actions: [] }
    },
  }),
}))

let app: FastifyInstance
let adminToken: string
let subjectId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  const { body: subject } = await supertest(app.server)
    .post('/v1/subjects')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Confidential Data' })
  subjectId = subject.id as string
})
afterAll(async () => { await app.close() })

const OVERSIZED_PATTERN = 'a'.repeat(501)

describe('rule pattern safety (ReDoS guard)', () => {
  it('rejects a known catastrophic-backtracking pattern with 400', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'pattern', pattern: '(a+)+$', action: 'block' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/unsafe|ReDoS/i)
  })

  it('accepts a valid, safe pattern', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'pattern', pattern: '\\d{3}-\\d{2}-\\d{4}', action: 'block' })
    expect(res.status).toBe(201)
    expect(res.body.pattern).toBe('\\d{3}-\\d{2}-\\d{4}')
  })

  it('rejects an invalid regex with 400', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'pattern', pattern: '(', action: 'block' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/valid regular expression/i)
  })

  it('rejects an oversized pattern with 400', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'pattern', pattern: OVERSIZED_PATTERN, action: 'block' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/too long/i)
  })

  it('rejects an unsafe pattern on the update path with 400', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'pattern', pattern: '\\d{4}', action: 'warn' })
    expect(created.id).toBeDefined()

    const res = await supertest(app.server)
      .patch(`/v1/rules/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ pattern: '(a+)+$' })
    expect(res.status).toBe(400)
    expect(res.body.error).toMatch(/unsafe|ReDoS/i)
  })

  it('surfaces the rejection in the assistant apply errors[] (not a whole-request failure)', async () => {
    // create_rule with an unsafe pattern goes through the same service choke point
    // via the internal rules client; the error must land in errors[], applied stays empty.
    const chatRes = await supertest(app.server)
      .post('/v1/assistant/chat')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ message: 'create a rule' })

    const { db } = await import('../src/db/client.js')
    const { chatMessages } = await import('../src/db/schema.js')
    const { eq } = await import('drizzle-orm')
    await db.update(chatMessages)
      .set({ actionsJson: [{ op: 'create_rule', subjectId, kind: 'pattern', pattern: '(a+)+$', action: 'block' }] })
      .where(eq(chatMessages.id, chatRes.body.messageId as string))

    const applyRes = await supertest(app.server)
      .post('/v1/assistant/apply')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ messageId: chatRes.body.messageId })
    expect(applyRes.status).toBe(200)
    expect(applyRes.body.applied).toHaveLength(0)
    expect(applyRes.body.errors.length).toBeGreaterThan(0)
    expect(applyRes.body.errors[0]).toMatch(/create_rule/)
  })
})
