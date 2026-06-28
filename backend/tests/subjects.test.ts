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

describe('POST /v1/subjects', () => {
  it('creates a global subject and returns it', async () => {
    const res = await supertest(app.server)
      .post('/v1/subjects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Confidential Data' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Confidential Data')
    expect(res.body.divisionId).toBeNull()
    expect(res.body.teamId).toBeNull()
    expect(res.body.active).toBe(true)
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/subjects')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ name: 'Confidential Data' })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/subjects', () => {
  it('lists only active subjects — inactive ones are excluded', async () => {
    // Create two active subjects and one inactive subject
    const { body: activeA } = await supertest(app.server)
      .post('/v1/subjects').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Active A' })
    const { body: activeB } = await supertest(app.server)
      .post('/v1/subjects').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Active B' })
    const { body: toDeactivate } = await supertest(app.server)
      .post('/v1/subjects').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Will be inactive' })

    // Deactivate the third subject so it should not appear in the list
    await supertest(app.server)
      .patch(`/v1/subjects/${toDeactivate.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ active: false })

    const res = await supertest(app.server).get('/v1/subjects').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    // Should return only the 2 active subjects, not the inactive one
    expect(res.body).toHaveLength(2)
    const ids = (res.body as Array<{ id: string }>).map(s => s.id)
    expect(ids).toContain(activeA.id)
    expect(ids).toContain(activeB.id)
    expect(ids).not.toContain(toDeactivate.id)
  })
})

describe('PATCH /v1/subjects/:id', () => {
  it('updates name and description', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/subjects').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Old' })
    const res = await supertest(app.server)
      .patch(`/v1/subjects/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New', description: 'Updated desc' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New')
    expect(res.body.description).toBe('Updated desc')
  })

  it('can deactivate a subject', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/subjects').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Active' })
    await supertest(app.server).patch(`/v1/subjects/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`).send({ active: false })
    const list = await supertest(app.server).get('/v1/subjects').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((s: { id: string }) => s.id === created.id)).toBeUndefined()
  })

  it('returns 404 for unknown id', async () => {
    const res = await supertest(app.server)
      .patch('/v1/subjects/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /v1/subjects/:id', () => {
  it('removes the subject', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/subjects').set('Authorization', `Bearer ${adminToken}`).send({ name: 'To Delete' })
    expect((await supertest(app.server).delete(`/v1/subjects/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/subjects').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((s: { id: string }) => s.id === created.id)).toBeUndefined()
  })
})
