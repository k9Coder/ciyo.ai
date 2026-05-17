import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let divisionId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  const { body: div } = await supertest(app.server)
    .post('/v1/divisions')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Legal', slug: 'legal' })
  divisionId = div.id as string
})
afterAll(async () => { await app.close() })

describe('POST /v1/divisions/:divisionId/teams', () => {
  it('creates a team and returns it', async () => {
    const res = await supertest(app.server)
      .post(`/v1/divisions/${divisionId}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Litigation', slug: 'litigation' })
    expect(res.status).toBe(201)
    expect(res.body.name).toBe('Litigation')
    expect(res.body.slug).toBe('litigation')
    expect(res.body.divisionId).toBe(divisionId)
    expect(res.body.id).toBeDefined()
  })
})

describe('GET /v1/divisions/:divisionId/teams', () => {
  it('lists teams for the division', async () => {
    await supertest(app.server).post(`/v1/divisions/${divisionId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'A', slug: 'a' })
    await supertest(app.server).post(`/v1/divisions/${divisionId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'B', slug: 'b' })
    const res = await supertest(app.server).get(`/v1/divisions/${divisionId}/teams`).set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/teams/:id', () => {
  it('updates the team name', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/divisions/${divisionId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'Old', slug: 'old' })
    const res = await supertest(app.server)
      .patch(`/v1/teams/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New')
  })

  it('returns 404 for unknown id', async () => {
    const res = await supertest(app.server)
      .patch('/v1/teams/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'X' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /v1/teams/:id', () => {
  it('removes the team', async () => {
    const { body: created } = await supertest(app.server)
      .post(`/v1/divisions/${divisionId}/teams`).set('Authorization', `Bearer ${adminToken}`).send({ name: 'To Delete', slug: 'del' })
    expect((await supertest(app.server).delete(`/v1/teams/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get(`/v1/divisions/${divisionId}/teams`).set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((t: { id: string }) => t.id === created.id)).toBeUndefined()
  })
})

describe('GET /v1/teams/:teamId/members', () => {
  it('returns members assigned to the team', async () => {
    const { body: team } = await supertest(app.server)
      .post(`/v1/divisions/${divisionId}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Trial', slug: 'trial' })
    const { body: member } = await supertest(app.server)
      .post('/v1/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'jane@example.com', displayName: 'Jane' })
    await supertest(app.server)
      .post(`/v1/members/${member.id as string}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId: team.id as string })

    const res = await supertest(app.server)
      .get(`/v1/teams/${team.id as string}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].email).toBe('jane@example.com')
  })

  it('returns empty array for team with no members', async () => {
    const { body: team } = await supertest(app.server)
      .post(`/v1/divisions/${divisionId}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Empty', slug: 'empty' })
    const res = await supertest(app.server)
      .get(`/v1/teams/${team.id as string}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})
