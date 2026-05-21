import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let subjectId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
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
