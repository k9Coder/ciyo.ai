import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { publishPolicy } from '../src/policy/service.js'
import { db } from '../src/db/client.js'
import { tenants, divisions, teams, members, memberTeams } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { createSubject } from '../src/subjects/service.js'
import { createRule } from '../src/rules/service.js'
import { compilePolicy } from '../src/policy/compiler.js'

const BASE_POLICY = {
  version: 1 as const,
  tenantId: 'placeholder',
  subjects: [],
}

let app: FastifyInstance
let tenantId: string
let orgToken: string
let adminToken: string

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  orgToken = t.orgToken
  adminToken = t.adminToken
  await publishPolicy(tenantId, BASE_POLICY)
})
afterAll(async () => { await app.close() })

describe('GET /v1/policy/version', () => {
  it('returns current version for valid org token', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy/version')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
  })

  it('returns 401 without token', async () => {
    expect((await supertest(app.server).get('/v1/policy/version')).status).toBe(401)
  })
})

describe('GET /v1/policy', () => {
  it('returns PolicyResponse for active subscription', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
    expect(res.body.policy).toBeDefined()
    expect(res.body.tenantName).toBe('Test Firm LLP')
    expect(res.body.plan).toBe('pro')
  })

  it('returns 402 for cancelled subscription', async () => {
    await db.update(tenants).set({ subscriptionStatus: 'cancelled' }).where(eq(tenants.id, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(402)
  })

  it('returns 200 with warning for past_due within grace period', async () => {
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() + 6)
    await db.update(tenants)
      .set({ subscriptionStatus: 'past_due', gracePeriodEndsAt: endsAt })
      .where(eq(tenants.id, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.warning).toBe('subscription_expiring')
  })

  it('returns 402 after grace period has passed', async () => {
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() - 1)
    await db.update(tenants)
      .set({ subscriptionStatus: 'past_due', gracePeriodEndsAt: endsAt })
      .where(eq(tenants.id, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(402)
  })
})

describe('POST /v1/policy/publish', () => {
  it('compiles current matters and publishes a new version', async () => {
    const res = await supertest(app.server)
      .post('/v1/policy/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(2)
  })

  it('returns 403 with org token', async () => {
    expect((await supertest(app.server)
      .post('/v1/policy/publish')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({})).status).toBe(403)
  })
})

describe('GET /v1/policy/history', () => {
  it('returns versions newest-first', async () => {
    await supertest(app.server).post('/v1/policy/publish').set('Authorization', `Bearer ${adminToken}`).send({})
    const res = await supertest(app.server).get('/v1/policy/history').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body[0].version).toBe(2)
    expect(res.body[1].version).toBe(1)
  })
})

describe('POST /v1/policy/rollback/:version', () => {
  it('creates a new version from a past version', async () => {
    const res = await supertest(app.server)
      .post('/v1/policy/rollback/1')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(2)
  })
})

describe('GET /v1/policy with X-Member-Id', () => {
  it('returns only global subjects for a member with no teams', async () => {
    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const [div] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning()
    const [team] = await db.insert(teams).values({ tenantId, divisionId: div!.id, name: 'Corp', slug: 'corp' }).returning()
    const teamSubject = await createSubject(tenantId, { name: 'Team Only', teamId: team!.id, divisionId: div!.id })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['classified'], action: 'block' })

    const [member] = await db.insert(members).values({ tenantId, email: 'alice@example.com', role: 'member' }).returning()
    await publishPolicy(tenantId, await compilePolicy(tenantId))

    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
      .set('X-Member-Id', member!.id)
    expect(res.status).toBe(200)
    expect(res.body.policy.subjects).toHaveLength(1)
    expect(res.body.policy.subjects[0].name).toBe('Global')
  })

  it('returns full snapshot when X-Member-Id header is absent', async () => {
    const subject1 = await createSubject(tenantId, { name: 'A' })
    await createRule(tenantId, subject1.id, { kind: 'keyword', keywords: ['x'], action: 'warn' })
    const subject2 = await createSubject(tenantId, { name: 'B' })
    await createRule(tenantId, subject2.id, { kind: 'keyword', keywords: ['y'], action: 'block' })
    await publishPolicy(tenantId, await compilePolicy(tenantId))

    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.policy.subjects).toHaveLength(2)
  })
})
