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
  orgToken   = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/site-configs', () => {
  it('creates a site config and returns it', async () => {
    const res = await supertest(app.server)
      .post('/v1/site-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'app.acme.com', inputSelector: '#chat-input', sendButtonSelector: '#send-btn' })
    expect(res.status).toBe(201)
    expect(res.body.domain).toBe('app.acme.com')
    expect(res.body.inputSelector).toBe('#chat-input')
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/site-configs')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ domain: 'app.acme.com', inputSelector: '#x', sendButtonSelector: '#y' })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/site-configs', () => {
  it('lists all site configs for the tenant', async () => {
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'a.com', inputSelector: '#a', sendButtonSelector: '#b' })
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'b.com', inputSelector: '#c', sendButtonSelector: '#d' })
    const res = await supertest(app.server).get('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/site-configs/:domain', () => {
  it('updates inputSelector', async () => {
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'app.acme.com', inputSelector: '#old', sendButtonSelector: '#btn' })
    const res = await supertest(app.server)
      .patch('/v1/site-configs/app.acme.com')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inputSelector: '#new-input' })
    expect(res.status).toBe(200)
    expect(res.body.inputSelector).toBe('#new-input')
  })

  it('returns 404 for unknown domain', async () => {
    const res = await supertest(app.server)
      .patch('/v1/site-configs/notexist.com')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inputSelector: '#x' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /v1/site-configs/:domain', () => {
  it('removes the site config', async () => {
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'del.com', inputSelector: '#x', sendButtonSelector: '#y' })
    expect((await supertest(app.server).delete('/v1/site-configs/del.com').set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((s: { domain: string }) => s.domain === 'del.com')).toBeUndefined()
  })
})
