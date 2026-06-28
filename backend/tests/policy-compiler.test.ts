import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { createSubject } from '../src/subjects/service.js'
import { createRule, updateRule } from '../src/rules/service.js'
import { compilePolicy } from '../src/policy/compiler.js'
import { requestContext } from '../src/context/request-context.js'
import type { FastifyInstance } from 'fastify'
import { startTestApp } from './helpers/setup.js'

let app: FastifyInstance
let tenantId: string

beforeAll(async () => { ({ app } = await startTestApp()) })
afterAll(async () => { await app.close() })

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId
})

// compilePolicy calls subjectsClient + rulesClient (HTTP) — needs request context
const compile = (tid: string) =>
  new Promise<Awaited<ReturnType<typeof compilePolicy>>>((resolve, reject) =>
    requestContext.run({ traceId: randomUUID(), tenantId: tid, isM2M: true }, () =>
      compilePolicy(tid).then(resolve).catch(reject)
    )
  )

describe('compilePolicy', () => {
  it('returns empty subjects list when no subjects exist', async () => {
    const policy = await compile(tenantId)
    expect(policy.version).toBe(1)
    expect(policy.tenantId).toBe(tenantId)
    expect(policy.subjects).toHaveLength(0)
  })

  it('includes active subjects with their active rules', async () => {
    const subject = await createSubject(tenantId, { name: 'Confidential Data' })
    await createRule(tenantId, subject.id, { kind: 'keyword', keywords: ['secret', 'classified'], action: 'block' })

    const policy = await compile(tenantId)
    expect(policy.subjects).toHaveLength(1)
    expect(policy.subjects[0]!.name).toBe('Confidential Data')
    expect(policy.subjects[0]!.rules).toHaveLength(1)
    expect(policy.subjects[0]!.rules[0]!.kind).toBe('keyword')
    expect(policy.subjects[0]!.rules[0]!.keywords).toContain('secret')
    expect(policy.subjects[0]!.rules[0]!.action).toBe('block')
  })

  it('excludes inactive rules', async () => {
    const subject = await createSubject(tenantId, { name: 'Test' })
    const rule = await createRule(tenantId, subject.id, { kind: 'keyword', keywords: ['x'], action: 'warn' })
    await updateRule(tenantId, rule.id, { active: false })

    const policy = await compile(tenantId)
    expect(policy.subjects[0]!.rules).toHaveLength(0)
  })

  it('reflects global scope when no divisionId or teamId', async () => {
    const subject = await createSubject(tenantId, { name: 'Global Subject' })
    const policy = await compile(tenantId)
    const compiled = policy.subjects.find(s => s.id === subject.id)!
    expect(compiled.divisionId).toBeNull()
    expect(compiled.teamId).toBeNull()
  })

  it('includes subjects from multiple categories in one snapshot', async () => {
    await createSubject(tenantId, { name: 'PII' })
    await createSubject(tenantId, { name: 'Legal' })
    await createSubject(tenantId, { name: 'Finance' })

    const policy = await compile(tenantId)
    expect(policy.subjects).toHaveLength(3)
  })

  it('subject with no rules compiles to empty rules array', async () => {
    await createSubject(tenantId, { name: 'Empty Subject' })
    const policy = await compile(tenantId)
    expect(policy.subjects[0]!.rules).toHaveLength(0)
  })

  it('stores destinationGroupIds in snapshot (not expanded)', async () => {
    const subject = await createSubject(tenantId, { name: 'Test' })
    await createRule(tenantId, subject.id, {
      kind: 'keyword',
      keywords: ['secret'],
      action: 'block',
      destinationGroupIds: ['00000000-0000-0000-0000-000000000001'],
    })
    const policy = await compile(tenantId)
    expect(policy.subjects[0]!.rules[0]!.destinationGroupIds).toContain('00000000-0000-0000-0000-000000000001')
  })
})
