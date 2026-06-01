import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant, buildTestMember, buildTestUser } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { scans, events, subjects, rules } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { getAnalyticsSummary, getAnalyticsDaily, getAnalyticsIncidents, getAnalyticsTopSites, getAnalyticsBySubject } from '../src/analytics/service.js'

let app: FastifyInstance
let tenantId: string
let adminToken: string
let memberId: string
let ruleId: string
let subjectId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  adminToken = t.adminToken
  const testUser = await buildTestUser('clerk_analytics', 'analytics@test.com')
  memberId = await buildTestMember(tenantId, testUser)

  const [subj] = await db.insert(subjects)
    .values({ tenantId, name: 'API Keys', active: true })
    .returning({ id: subjects.id })
  subjectId = subj!.id

  const [rule] = await db.insert(rules)
    .values({ tenantId, subjectId, kind: 'keyword', keywords: ['key'], action: 'block', reportLevel: 'medium' })
    .returning({ id: rules.id })
  ruleId = rule!.id
})
afterAll(async () => { await app.close() })

describe('getAnalyticsSummary', () => {
  it('returns zeroes when no data', async () => {
    const result = await getAnalyticsSummary(tenantId, 30)
    expect(result.scansTotal).toBe(0)
    expect(result.blocked).toBe(0)
    expect(result.warned).toBe(0)
    expect(result.activeUsers).toBe(0)
    expect(result.totalMembers).toBe(1)    // from buildTestMember
    expect(result.activeRulesCount).toBe(1) // from beforeEach
  })

  it('counts scans, events, and active users', async () => {
    await db.insert(scans).values([
      { tenantId, memberId },
      { tenantId, memberId },
      { tenantId, memberId: null },
    ])
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' },
      { tenantId, ruleId, action: 'warn',  siteUrl: 'https://claude.ai' },
    ])
    const result = await getAnalyticsSummary(tenantId, 30)
    expect(result.scansTotal).toBe(3)
    expect(result.blocked).toBe(1)
    expect(result.warned).toBe(1)
    expect(result.activeUsers).toBe(1) // 2 scans but same memberId
  })
})

describe('getAnalyticsDaily', () => {
  it('always returns 7 entries', async () => {
    const result = await getAnalyticsDaily(tenantId)
    expect(result).toHaveLength(7)
    expect(result[0]).toHaveProperty('day')
    expect(result[0]).toHaveProperty('date')
    expect(result[0]).toHaveProperty('blocked')
    expect(result[0]).toHaveProperty('warned')
    expect(result[0]).toHaveProperty('scanned')
  })

  it('counts today\'s events in the last bucket', async () => {
    await db.insert(events).values({ tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' })
    await db.insert(scans).values({ tenantId, memberId })
    const result = await getAnalyticsDaily(tenantId)
    const today = result[6]!
    expect(today.blocked).toBe(1)
    expect(today.scanned).toBe(1)
  })
})

describe('getAnalyticsIncidents', () => {
  it('returns empty array when no events', async () => {
    const result = await getAnalyticsIncidents(tenantId)
    expect(result).toHaveLength(0)
  })

  it('returns event with subject name and null email for anonymous event', async () => {
    await db.insert(events).values({ tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' })
    const result = await getAnalyticsIncidents(tenantId)
    expect(result).toHaveLength(1)
    expect(result[0]!.memberEmail).toBeNull()
    expect(result[0]!.subjectName).toBe('API Keys')
    expect(result[0]!.ruleKind).toBe('keyword')
    expect(result[0]!.action).toBe('block')
  })

  it('limits to 20 most recent', async () => {
    const vals = Array.from({ length: 25 }, (_, i) => ({
      tenantId, ruleId, action: 'warn' as const, siteUrl: `https://site${i}.com`,
    }))
    await db.insert(events).values(vals)
    const result = await getAnalyticsIncidents(tenantId)
    expect(result).toHaveLength(20)
  })
})

describe('getAnalyticsTopSites', () => {
  it('returns top domains by event count', async () => {
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com/chat/1' },
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com/chat/2' },
      { tenantId, ruleId, action: 'warn',  siteUrl: 'https://claude.ai/chat' },
    ])
    const result = await getAnalyticsTopSites(tenantId, 30)
    expect(result[0]!.domain).toBe('chatgpt.com')
    expect(result[0]!.count).toBe(2)
    expect(result[1]!.domain).toBe('claude.ai')
    expect(result[1]!.count).toBe(1)
  })

  it('returns empty array when no events', async () => {
    const result = await getAnalyticsTopSites(tenantId, 30)
    expect(result).toHaveLength(0)
  })
})

describe('getAnalyticsBySubject', () => {
  it('returns events grouped by subject with percentages', async () => {
    await db.insert(events).values([
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' },
      { tenantId, ruleId, action: 'block', siteUrl: 'https://chatgpt.com' },
    ])
    const result = await getAnalyticsBySubject(tenantId, 30)
    expect(result[0]!.subjectName).toBe('API Keys')
    expect(result[0]!.count).toBe(2)
    expect(result[0]!.pct).toBe(100)
  })

  it('returns empty array when no events', async () => {
    const result = await getAnalyticsBySubject(tenantId, 30)
    expect(result).toHaveLength(0)
  })
})
