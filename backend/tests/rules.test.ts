import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

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

describe('POST /v1/subjects/:subjectId/rules', () => {
  it('creates a keyword rule', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'keyword', keywords: ['secret', 'confidential'], action: 'block' })
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('keyword')
    expect(res.body.keywords).toContain('secret')
    expect(res.body.keywords).toContain('confidential')
    expect(res.body.action).toBe('block')
    expect(res.body.active).toBe(true)
    expect(res.body.id).toBeDefined()
    expect(res.body.reportLevel).toBe('none') // default
  })

  it('creates a rule with custom reportLevel', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'keyword', keywords: ['secret'], action: 'block', reportLevel: 'rich' })
    expect(res.status).toBe(201)
    expect(res.body.reportLevel).toBe('rich')
  })

  it('creates a pattern rule', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'pattern', pattern: '\\d{4}-\\d{4}-\\d{4}-\\d{4}', action: 'warn', message: 'Credit card detected' })
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('pattern')
    expect(res.body.pattern).toBe('\\d{4}-\\d{4}-\\d{4}-\\d{4}')
    expect(res.body.message).toBe('Credit card detected')
  })

  it('creates a judge_prompt rule', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        kind: 'judge_prompt',
        prompt: 'This message discloses a Social Security Number, even if disguised or spelled out.',
        action: 'block',
      })
    expect(res.status).toBe(201)
    expect(res.body.kind).toBe('judge_prompt')
    expect(res.body.prompt).toBe('This message discloses a Social Security Number, even if disguised or spelled out.')
    expect(res.body.pattern).toBeNull()
    expect(res.body.keywords).toBeNull()
  })

  it('rejects a judge_prompt rule missing a prompt with a clear error, not a silent null', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'judge_prompt', action: 'block' })
    // judge_prompt is meant to be the sole real enforcement mechanism for
    // its rule — an empty prompt isn't a harmless no-op, it's an empty
    // claim the model would judge every message against, which is an
    // arbitrary-match risk, not inert. The DB column stays nullable (an
    // existing row predating this validation, or one with kind temporarily
    // something else, shouldn't be impossible to represent) but creating
    // or updating a rule AS judge_prompt with no prompt text is rejected.
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('prompt')
  })

  it('rejects a judge_prompt rule with a prompt over the length cap', async () => {
    const res = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'judge_prompt', prompt: 'x'.repeat(1001), action: 'block' })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('prompt')
  })
})

describe('PATCH /v1/rules/:id — judge_prompt', () => {
  it('updates an existing judge_prompt rule\'s prompt text', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'judge_prompt', prompt: 'original claim', action: 'warn' })

    const res = await supertest(app.server)
      .patch(`/v1/rules/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ prompt: 'revised, more precise claim' })

    expect(res.status).toBe(200)
    expect(res.body.prompt).toBe('revised, more precise claim')
  })

  it('rejects clearing an existing judge_prompt rule\'s prompt to empty', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'judge_prompt', prompt: 'original claim', action: 'warn' })

    const res = await supertest(app.server)
      .patch(`/v1/rules/${created.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ prompt: '' })

    expect(res.status).toBe(400)
  })
})

describe('judge_prompt entitlement', () => {
  it('rejects judge_prompt on a plan without the entitlement', async () => {
    const freeTenant = await buildTestTenant('free-plan')
    await db.update(tenants).set({ plan: 'free' }).where(eq(tenants.id, freeTenant.tenantId))

    const { body: freeSubject } = await supertest(app.server)
      .post('/v1/subjects')
      .set('Authorization', `Bearer ${freeTenant.adminToken}`)
      .send({ name: 'Free Plan Subject' })

    const res = await supertest(app.server)
      .post(`/v1/subjects/${freeSubject.id}/rules`)
      .set('Authorization', `Bearer ${freeTenant.adminToken}`)
      .send({ kind: 'judge_prompt', prompt: 'test claim', action: 'block' })
    expect(res.status).toBe(402)
    expect(res.body.error).toContain('judge_prompt')
  })
})

describe('GET /v1/subjects/:subjectId/rules', () => {
  it('lists active rules for the subject', async () => {
    await supertest(app.server).post(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'keyword', keywords: ['a'], action: 'warn' })
    await supertest(app.server).post(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'keyword', keywords: ['b'], action: 'block' })
    const res = await supertest(app.server).get(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/rules/:id', () => {
  it('updates rule action', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'keyword', keywords: ['x'], action: 'warn' })
    const res = await supertest(app.server)
      .patch(`/v1/rules/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'block' })
    expect(res.status).toBe(200)
    expect(res.body.action).toBe('block')
  })

  it('can deactivate a rule', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'keyword', keywords: ['x'], action: 'warn' })
    await supertest(app.server).patch(`/v1/rules/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`).send({ active: false })
    const list = await supertest(app.server).get(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((r: { id: string }) => r.id === created.id)).toBeUndefined()
  })

  it('can update reportLevel', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ kind: 'keyword', keywords: ['x'], action: 'warn' })
    const res = await supertest(app.server)
      .patch(`/v1/rules/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reportLevel: 'medium' })
    expect(res.status).toBe(200)
    expect(res.body.reportLevel).toBe('medium')
  })

  it('returns 404 for unknown id', async () => {
    const res = await supertest(app.server)
      .patch('/v1/rules/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'block' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /v1/rules/:id', () => {
  it('removes the rule', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`).send({ kind: 'keyword', keywords: ['x'], action: 'warn' })
    expect((await supertest(app.server).delete(`/v1/rules/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get(`/v1/subjects/${subjectId}/rules`).set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((r: { id: string }) => r.id === created.id)).toBeUndefined()
  })
})
