import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let orgToken: string
let divisionId: string
let teamId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  orgToken = t.orgToken
  const { body: div } = await supertest(app.server)
    .post('/v1/divisions').set('Authorization', `Bearer ${adminToken}`).send({ name: 'Legal', slug: 'legal' })
  divisionId = div.id as string
  const { body: team } = await supertest(app.server)
    .post(`/v1/divisions/${divisionId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Corp', slug: 'corp' })
  teamId = team.id as string
})
afterAll(async () => { await app.close() })

describe('POST /v1/members', () => {
  it('creates a member with default role', async () => {
    const res = await supertest(app.server)
      .post('/v1/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'alice@example.com' })
    expect(res.status).toBe(201)
    expect(res.body.email).toBe('alice@example.com')
    expect(res.body.role).toBe('member')
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/members')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ email: 'alice@example.com' })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/members', () => {
  it('lists all members for the tenant', async () => {
    await supertest(app.server).post('/v1/members').set('Authorization', `Bearer ${adminToken}`).send({ email: 'a@example.com' })
    await supertest(app.server).post('/v1/members').set('Authorization', `Bearer ${adminToken}`).send({ email: 'b@example.com' })
    const res = await supertest(app.server).get('/v1/members').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/members/:id', () => {
  it('updates the display name', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/members').set('Authorization', `Bearer ${adminToken}`).send({ email: 'alice@example.com' })
    const res = await supertest(app.server)
      .patch(`/v1/members/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ displayName: 'Alice Smith' })
    expect(res.status).toBe(200)
    expect(res.body.displayName).toBe('Alice Smith')
  })
})

describe('DELETE /v1/members/:id', () => {
  it('removes the member', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/members').set('Authorization', `Bearer ${adminToken}`).send({ email: 'del@example.com' })
    expect((await supertest(app.server).delete(`/v1/members/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/members').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((m: { id: string }) => m.id === created.id)).toBeUndefined()
  })
})

describe('POST /v1/members/:id/teams/:teamId', () => {
  it('assigns a member to a team', async () => {
    const { body: member } = await supertest(app.server)
      .post('/v1/members').set('Authorization', `Bearer ${adminToken}`).send({ email: 'alice@example.com' })
    const res = await supertest(app.server)
      .post(`/v1/members/${member.id as string}/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)
  })
})

describe('DELETE /v1/members/:id/teams/:teamId', () => {
  it('removes a member from a team', async () => {
    const { body: member } = await supertest(app.server)
      .post('/v1/members').set('Authorization', `Bearer ${adminToken}`).send({ email: 'alice@example.com' })
    await supertest(app.server).post(`/v1/members/${member.id as string}/teams/${teamId}`).set('Authorization', `Bearer ${adminToken}`)
    const res = await supertest(app.server)
      .delete(`/v1/members/${member.id as string}/teams/${teamId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(204)
  })
})
