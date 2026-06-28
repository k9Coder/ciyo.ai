import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let orgToken: string

beforeAll(async () => { ({ app } = await startTestApp()) })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  orgToken = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/destination-groups', () => {
  it('creates a global group and returns it', async () => {
    const res = await supertest(app.server)
      .post('/v1/destination-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'External Email', domains: ['gmail.com', 'yahoo.com'] })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('External Email')
    expect(res.body.domains).toContain('gmail.com')
    expect(res.body.divisionId).toBeNull()
    expect(res.body.teamId).toBeNull()
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/destination-groups')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: 'X', domains: [] })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/destination-groups', () => {
  it('lists all groups for the tenant', async () => {
    await supertest(app.server).post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', domains: [] })
    await supertest(app.server).post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'B', domains: [] })
    const res = await supertest(app.server).get('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/destination-groups/:id', () => {
  it('updates name and domains', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Old', domains: ['a.com'] })
    const res = await supertest(app.server)
      .patch(`/v1/destination-groups/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New', domains: ['b.com', 'c.com'] })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New')
    expect(res.body.domains).toContain('b.com')
  })

  it('returns 404 for unknown id', async () => {
    const res = await supertest(app.server)
      .patch('/v1/destination-groups/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /v1/destination-groups/:id', () => {
  it('removes the group', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Delete Me', domains: [] })
    expect((await supertest(app.server).delete(`/v1/destination-groups/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/destination-groups').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((g: { id: string }) => g.id === created.id)).toBeUndefined()
  })
})
