import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  orgToken = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/matters', () => {
  it('creates a matter and returns it', async () => {
    const res = await supertest(app.server)
      .post('/v1/matters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientName: 'Widget Corp', matterNumber: 'WC-001', opposingParties: ['Acme Inc'] })
    expect(res.status).toBe(201)
    expect(res.body.clientName).toBe('Widget Corp')
    expect(res.body.matterNumber).toBe('WC-001')
    expect(res.body.opposingParties).toContain('Acme Inc')
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/matters')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ clientName: 'Widget Corp' })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/matters', () => {
  it('lists all active matters for the tenant', async () => {
    await supertest(app.server).post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'A' })
    await supertest(app.server).post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'B' })
    const res = await supertest(app.server).get('/v1/matters').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/matters/:id', () => {
  it('updates the client name', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'Old' })
    const res = await supertest(app.server)
      .patch(`/v1/matters/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientName: 'New' })
    expect(res.status).toBe(200)
    expect(res.body.clientName).toBe('New')
  })
})

describe('DELETE /v1/matters/:id', () => {
  it('removes the matter', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'To Delete' })
    expect((await supertest(app.server).delete(`/v1/matters/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/matters').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((m: { id: string }) => m.id === created.id)).toBeUndefined()
  })
})
