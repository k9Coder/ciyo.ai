import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { assignTeam } from '../src/members/service.js'
import { startTestApp } from './helpers/setup.js'
import { requestContext } from '../src/context/request-context.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let divisionId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
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

describe('cross-tenant team assignment rejection', () => {
  it('rejects assigning a member to a team from a different tenant', async () => {
    // Create a second tenant with its own team
    const tenant2 = await buildTestTenant()
    const { body: div2 } = await supertest(app.server)
      .post('/v1/divisions')
      .set('Authorization', `Bearer ${tenant2.adminToken}`)
      .send({ name: 'Other Legal', slug: 'other-legal' })
    const { body: team2 } = await supertest(app.server)
      .post(`/v1/divisions/${div2.id as string}/teams`)
      .set('Authorization', `Bearer ${tenant2.adminToken}`)
      .send({ name: 'Other Team', slug: 'other-team' })

    // Create a member in tenant 1
    const { body: member1 } = await supertest(app.server)
      .post('/v1/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'alice@example.com' })

    // Tenant 1 admin tries to assign member to tenant 2's team
    const res = await supertest(app.server)
      .post(`/v1/members/${member1.id as string}/teams/${team2.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
    // Should be rejected with 404 (team not found in tenant 1)
    expect(res.status).toBe(404)
  })

  it('assignTeam service rejects cross-tenant team assignment directly', async () => {
    const tenant2 = await buildTestTenant()
    const { body: div2 } = await supertest(app.server)
      .post('/v1/divisions')
      .set('Authorization', `Bearer ${tenant2.adminToken}`)
      .send({ name: 'T2 Legal', slug: 't2-legal' })
    const { body: team2 } = await supertest(app.server)
      .post(`/v1/divisions/${div2.id as string}/teams`)
      .set('Authorization', `Bearer ${tenant2.adminToken}`)
      .send({ name: 'T2 Team', slug: 't2-team' })

    const { body: member1 } = await supertest(app.server)
      .post('/v1/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'bob@example.com' })

    // Directly call service with tenant1's ID but tenant2's teamId
    const t1 = await buildTestTenant()
    await expect(
      new Promise((_, reject) =>
        requestContext.run({ traceId: randomUUID(), tenantId: t1.tenantId, isM2M: true }, () =>
          assignTeam(member1.id as string, team2.id as string, t1.tenantId).catch(reject)
        )
      )
    ).rejects.toThrow('Team not found')
  })
})
