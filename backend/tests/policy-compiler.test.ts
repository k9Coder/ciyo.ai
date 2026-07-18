import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { createSubject } from '../src/subjects/service.js'
import { createRule, updateRule } from '../src/rules/service.js'
import { compilePolicy } from '../src/policy/compiler.js'
import { db } from '../src/db/client.js'
import { destinationGroups } from '../src/db/schema.js'

let tenantId: string

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId
})

describe('compilePolicy', () => {
  it('returns empty subjects list when no subjects exist', async () => {
    const policy = await compilePolicy(tenantId)
    expect(policy.version).toBe(1)
    expect(policy.tenantId).toBe(tenantId)
    expect(policy.subjects).toHaveLength(0)
  })

  it('includes active subjects with their active rules', async () => {
    const subject = await createSubject(tenantId, { name: 'Confidential Data' })
    await createRule(tenantId, subject.id, { kind: 'keyword', keywords: ['secret', 'classified'], action: 'block' })

    const policy = await compilePolicy(tenantId)
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

    const policy = await compilePolicy(tenantId)
    expect(policy.subjects[0]!.rules).toHaveLength(0)
  })

  it('reflects global scope when no divisionId or teamId', async () => {
    const subject = await createSubject(tenantId, { name: 'Global Subject' })
    const policy = await compilePolicy(tenantId)
    const compiled = policy.subjects.find(s => s.id === subject.id)!
    expect(compiled.divisionId).toBeNull()
    expect(compiled.teamId).toBeNull()
  })

  it('includes subjects from multiple categories in one snapshot', async () => {
    await createSubject(tenantId, { name: 'PII' })
    await createSubject(tenantId, { name: 'Legal' })
    await createSubject(tenantId, { name: 'Finance' })

    const policy = await compilePolicy(tenantId)
    expect(policy.subjects).toHaveLength(3)
  })

  it('subject with no rules compiles to empty rules array', async () => {
    await createSubject(tenantId, { name: 'Empty Subject' })
    const policy = await compilePolicy(tenantId)
    expect(policy.subjects[0]!.rules).toHaveLength(0)
  })

  it('stores destinationGroupIds in snapshot (not expanded)', async () => {
    const subject = await createSubject(tenantId, { name: 'Test' })
    const [group] = await db.insert(destinationGroups).values({
      tenantId,
      name: 'Approved AI',
      domains: ['chatgpt.com'],
    }).returning({ id: destinationGroups.id })
    await createRule(tenantId, subject.id, {
      kind: 'keyword',
      keywords: ['secret'],
      action: 'block',
      destinationGroupIds: [group!.id],
    })
    const policy = await compilePolicy(tenantId)
    expect(policy.subjects[0]!.rules[0]!.destinationGroupIds).toContain(group!.id)
  })
})
