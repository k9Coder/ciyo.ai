import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { subjects, rules, events } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let adminToken: string
let ruleId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  adminToken = t.adminToken

  const [subj] = await db.insert(subjects)
    .values({ tenantId, name: 'API Keys', active: true })
    .returning({ id: subjects.id })

  const [rule] = await db.insert(rules)
    .values({ tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['key'], action: 'block', reportLevel: 'medium' })
    .returning({ id: rules.id })
  ruleId = rule!.id
})
afterAll(async () => { await app.close() })

describe('GET /v1/audit-log', () => {
  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).get('/v1/audit-log')
    expect(res.status).toBe(401)
  })

  it('returns empty entries for a new tenant', async () => {
    const res = await supertest(app.server)
      .get('/v1/audit-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toEqual([])
    expect(res.body.nextBefore).toBeNull()
  })

  it('returns entries with correct shape', async () => {
    await db.insert(events).values({ tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com', matchedTerm: 'secret' })
    const res = await supertest(app.server)
      .get('/v1/audit-log')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    const e = res.body.entries[0]
    expect(e).toMatchObject({
      subjectName: 'API Keys',
      ruleKind: 'keyword',
      action: 'block',
      siteUrl: 'https://chatgpt.com',
      matchedTerm: 'secret',
      memberEmail: null,
    })
    expect(typeof e.occurredAt).toBe('string')
  })

  it('paginates: limit=2 returns nextBefore when more exist', async () => {
    const vals = Array.from({ length: 3 }, (_, i) => ({
      tenantId, ruleId, action: 'warn' as const, siteUrl: `https://site${i}.com`,
    }))
    await db.insert(events).values(vals)
    const res = await supertest(app.server)
      .get('/v1/audit-log?limit=2')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(2)
    expect(res.body.nextBefore).not.toBeNull()
  })

  it('filters by action=warn', async () => {
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://a.com' },
      { tenantId, ruleId, action: 'warn',  siteUrl: 'https://b.com' },
    ])
    const res = await supertest(app.server)
      .get('/v1/audit-log?action=warn')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.entries).toHaveLength(1)
    expect(res.body.entries[0].action).toBe('warn')
  })
})
