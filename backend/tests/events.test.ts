import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import supertest from 'supertest'
import { truncateAll, buildTestTenant, buildTestMember, buildTestUser } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { subjects, rules, events } from '../src/db/schema.js'
import { startTestApp } from './helpers/setup.js'
import { requestContext } from '../src/context/request-context.js'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'

let app: FastifyInstance
let tenantId: string
let memberId: string
let ruleId: string

beforeAll(async () => { ({ app } = await startTestApp()) })

beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  const testUser = await buildTestUser('clerk_events', 'events@test.com')
  memberId = await buildTestMember(tenantId, testUser)

  const [subject] = await db.insert(subjects).values({
    tenantId, name: 'Test Subject', active: true,
  }).returning({ id: subjects.id })

  const [rule] = await db.insert(rules).values({
    tenantId,
    subjectId:   subject!.id,
    kind:        'keyword',
    keywords:    ['secret'],
    action:      'block',
    reportLevel: 'medium',
  }).returning({ id: rules.id })

  ruleId = rule!.id
})

afterAll(async () => { await app.close() })

import { ingestEvent } from '../src/events/service.js'

// ingestEvent now calls rulesClient (HTTP) — needs a request context with tenantId
function runWithCtx<T>(tid: string, fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) =>
    requestContext.run({ traceId: randomUUID(), tenantId: tid, isM2M: true }, () =>
      fn().then(resolve).catch(reject)
    )
  )
}

describe('ingestEvent', () => {
  it('returns null and stores nothing when reportLevel is none', async () => {
    await db.update(rules).set({ reportLevel: 'none' }).where(eq(rules.id, ruleId))
    const result = await runWithCtx(tenantId, () =>
      ingestEvent(tenantId, ruleId, memberId, { action: 'block', siteUrl: 'https://chat.openai.com' })
    )
    expect(result).toBeNull()
    const stored = await db.select().from(events)
    expect(stored).toHaveLength(0)
  })

  it('stores event without memberId for minimal level', async () => {
    await db.update(rules).set({ reportLevel: 'minimal' }).where(eq(rules.id, ruleId))
    const result = await runWithCtx(tenantId, () =>
      ingestEvent(tenantId, ruleId, memberId, { action: 'warn', siteUrl: 'https://gemini.google.com' })
    )
    expect(result).not.toBeNull()
    expect(result!.memberId).toBeNull()
    expect(result!.matchedTerm).toBeNull()
    expect(result!.action).toBe('warn')
    expect(result!.siteUrl).toBe('https://gemini.google.com')
  })

  it('stores event with memberId for medium level', async () => {
    const result = await runWithCtx(tenantId, () =>
      ingestEvent(tenantId, ruleId, memberId, { action: 'block', siteUrl: 'https://chat.openai.com' })
    )
    expect(result).not.toBeNull()
    expect(result!.memberId).toBe(memberId)
    expect(result!.matchedTerm).toBeNull()
  })

  it('stores event with memberId + matchedTerm for rich level', async () => {
    await db.update(rules).set({ reportLevel: 'rich' }).where(eq(rules.id, ruleId))
    const result = await runWithCtx(tenantId, () =>
      ingestEvent(tenantId, ruleId, memberId, {
        action: 'block', siteUrl: 'https://chat.openai.com', matchedTerm: 'Project Zeus',
      })
    )
    expect(result).not.toBeNull()
    expect(result!.memberId).toBe(memberId)
    expect(result!.matchedTerm).toBe('Project Zeus')
  })

  it('returns null for unknown ruleId', async () => {
    const result = await runWithCtx(tenantId, () =>
      ingestEvent(tenantId, '00000000-0000-0000-0000-000000000000', memberId, {
        action: 'block', siteUrl: 'https://chat.openai.com',
      })
    )
    expect(result).toBeNull()
  })

  it('returns null when ruleId belongs to a different tenant (cross-tenant scoping)', async () => {
    // Create a second tenant with its own rule
    const tenant2 = await buildTestTenant()
    const [subj2] = await db.insert(subjects).values({
      tenantId: tenant2.tenantId, name: 'Foreign Subject', active: true,
    }).returning({ id: subjects.id })
    const [foreignRule] = await db.insert(rules).values({
      tenantId:    tenant2.tenantId,
      subjectId:   subj2!.id,
      kind:        'keyword',
      keywords:    ['foreign'],
      action:      'block',
      reportLevel: 'medium',
    }).returning({ id: rules.id })

    // Tenant 1 tries to ingest an event with tenant 2's ruleId
    const result = await runWithCtx(tenantId, () =>
      ingestEvent(tenantId, foreignRule!.id, memberId, {
        action: 'block', siteUrl: 'https://chat.openai.com',
      })
    )
    // Should return null because the ruleId doesn't belong to tenantId
    expect(result).toBeNull()
    // No event should be stored
    const stored = await db.select().from(events)
    expect(stored).toHaveLength(0)
  })
})

describe('POST /v1/events HTTP', () => {
  it('returns 201 when event is stored (medium level)', async () => {
    const t = await buildTestTenant('httptenant')
    const [subj] = await db.insert(subjects)
      .values({ tenantId: t.tenantId, name: 'S', active: true })
      .returning({ id: subjects.id })
    const [r] = await db.insert(rules)
      .values({ tenantId: t.tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['x'], action: 'block', reportLevel: 'medium' })
      .returning({ id: rules.id })
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${t.orgToken}`)
      .send({ ruleId: r!.id, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(201)
    expect(res.body.id).toBeDefined()
  })

  it('returns 204 when rule reportLevel is none', async () => {
    const t = await buildTestTenant('httptenant2')
    const [subj] = await db.insert(subjects)
      .values({ tenantId: t.tenantId, name: 'S', active: true })
      .returning({ id: subjects.id })
    const [r] = await db.insert(rules)
      .values({ tenantId: t.tenantId, subjectId: subj!.id, kind: 'keyword', keywords: ['x'], action: 'block', reportLevel: 'none' })
      .returning({ id: rules.id })
    const res = await supertest(app.server)
      .post('/v1/events')
      .set('Authorization', `Bearer ${t.orgToken}`)
      .send({ ruleId: r!.id, action: 'warn', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(204)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server)
      .post('/v1/events')
      .send({ ruleId, action: 'block', siteUrl: 'https://chat.openai.com' })
    expect(res.status).toBe(401)
  })
})
