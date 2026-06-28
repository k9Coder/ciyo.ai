import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { divisions, teams, members, memberTeams, destinationGroups } from '../src/db/schema.js'
import { createSubject } from '../src/subjects/service.js'
import { createRule } from '../src/rules/service.js'
import { compilePolicy } from '../src/policy/compiler.js'
import { resolveMemberPolicy } from '../src/policy/resolver.js'
import { requestContext } from '../src/context/request-context.js'
import type { FastifyInstance } from 'fastify'
import { startTestApp } from './helpers/setup.js'

let app: FastifyInstance
let tenantId: string
let divisionId: string
let teamId: string
let memberId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
afterAll(async () => { await app.close() })

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId

  const [div] = await db.insert(divisions).values({ tenantId, name: 'Legal', slug: 'legal' }).returning()
  divisionId = div!.id

  const [team] = await db.insert(teams).values({ tenantId, divisionId, name: 'Corp', slug: 'corp' }).returning()
  teamId = team!.id

  const [member] = await db.insert(members).values({ tenantId, email: 'alice@example.com', role: 'member' }).returning()
  memberId = member!.id
})

// Both compilePolicy and resolveMemberPolicy make internal HTTP calls — run in context
function runWithCtx<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) =>
    requestContext.run({ traceId: randomUUID(), tenantId, isM2M: true }, () =>
      fn().then(resolve).catch(reject)
    )
  )
}

describe('resolveMemberPolicy', () => {
  it('member with no teams gets only global subjects', async () => {
    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const teamSubject = await createSubject(tenantId, { name: 'Team Only', teamId, divisionId })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['classified'], action: 'block' })

    const resolved = await runWithCtx(async () => {
      const snapshot = await compilePolicy(tenantId)
      return resolveMemberPolicy(tenantId, memberId, snapshot)
    })

    expect(resolved.subjects).toHaveLength(1)
    expect(resolved.subjects[0]!.name).toBe('Global')
  })

  it('member in a team gets global + division + team subjects', async () => {
    await db.insert(memberTeams).values({ memberId, teamId })

    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['global'], action: 'warn' })

    const divSubject = await createSubject(tenantId, { name: 'Division', divisionId })
    await createRule(tenantId, divSubject.id, { kind: 'keyword', keywords: ['division'], action: 'warn' })

    const teamSubject = await createSubject(tenantId, { name: 'Team', teamId, divisionId })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['team'], action: 'block' })

    const resolved = await runWithCtx(async () => {
      const snapshot = await compilePolicy(tenantId)
      return resolveMemberPolicy(tenantId, memberId, snapshot)
    })

    const names = resolved.subjects.map(s => s.name)
    expect(names).toContain('Global')
    expect(names).toContain('Division')
    expect(names).toContain('Team')
  })

  it('team scope beats global for same detection key', async () => {
    await db.insert(memberTeams).values({ memberId, teamId })

    const globalSubject = await createSubject(tenantId, { name: 'Global' })
    await createRule(tenantId, globalSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const teamSubject = await createSubject(tenantId, { name: 'Team', teamId, divisionId })
    await createRule(tenantId, teamSubject.id, { kind: 'keyword', keywords: ['secret'], action: 'block' })

    const resolved = await runWithCtx(async () => {
      const snapshot = await compilePolicy(tenantId)
      return resolveMemberPolicy(tenantId, memberId, snapshot)
    })

    const allRules = resolved.subjects.flatMap(s => s.rules)
    expect(allRules).toHaveLength(1)
    expect(allRules[0]!.action).toBe('block')
  })

  it('block beats warn at the same scope level', async () => {
    const subject1 = await createSubject(tenantId, { name: 'SubjectA' })
    await createRule(tenantId, subject1.id, { kind: 'keyword', keywords: ['secret'], action: 'warn' })

    const subject2 = await createSubject(tenantId, { name: 'SubjectB' })
    await createRule(tenantId, subject2.id, { kind: 'keyword', keywords: ['secret'], action: 'block' })

    const resolved = await runWithCtx(async () => {
      const snapshot = await compilePolicy(tenantId)
      return resolveMemberPolicy(tenantId, memberId, snapshot)
    })

    const allRules = resolved.subjects.flatMap(s => s.rules)
    expect(allRules).toHaveLength(1)
    expect(allRules[0]!.action).toBe('block')
  })

  it('expands destination group IDs into domain strings', async () => {
    const [group] = await db.insert(destinationGroups).values({
      tenantId, name: 'External Email', domains: ['gmail.com', 'yahoo.com'],
    }).returning()

    const subject = await createSubject(tenantId, { name: 'Confidential' })
    await createRule(tenantId, subject.id, {
      kind: 'keyword', keywords: ['secret'], action: 'block',
      destinationGroupIds: [group!.id],
    })

    const resolved = await runWithCtx(async () => {
      const snapshot = await compilePolicy(tenantId)
      return resolveMemberPolicy(tenantId, memberId, snapshot)
    })

    const rule = resolved.subjects[0]!.rules[0]!
    expect(rule.destinations).toContain('gmail.com')
    expect(rule.destinations).toContain('yahoo.com')
  })

  it('merges explicit destinations with group domains and deduplicates', async () => {
    const [group] = await db.insert(destinationGroups).values({
      tenantId, name: 'Cloud', domains: ['dropbox.com', 'shared.com'],
    }).returning()

    const subject = await createSubject(tenantId, { name: 'Files' })
    await createRule(tenantId, subject.id, {
      kind: 'keyword', keywords: ['confidential'], action: 'warn',
      destinations: ['drive.google.com', 'shared.com'],
      destinationGroupIds: [group!.id],
    })

    const resolved = await runWithCtx(async () => {
      const snapshot = await compilePolicy(tenantId)
      return resolveMemberPolicy(tenantId, memberId, snapshot)
    })

    const rule = resolved.subjects[0]!.rules[0]!
    expect(rule.destinations).toContain('drive.google.com')
    expect(rule.destinations).toContain('dropbox.com')
    expect(rule.destinations.filter(d => d === 'shared.com')).toHaveLength(1)
  })

  it('does not include destinationGroupIds in resolved output', async () => {
    const subject = await createSubject(tenantId, { name: 'Test' })
    await createRule(tenantId, subject.id, { kind: 'keyword', keywords: ['x'], action: 'warn' })

    const resolved = await runWithCtx(async () => {
      const snapshot = await compilePolicy(tenantId)
      return resolveMemberPolicy(tenantId, memberId, snapshot)
    })

    expect((resolved.subjects[0]!.rules[0]! as Record<string, unknown>)['destinationGroupIds']).toBeUndefined()
  })
})
