import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { members } from '../src/db/schema.js'
import { createSubject } from '../src/subjects/service.js'
import { createRule } from '../src/rules/service.js'
import { addException, removeException, getMemberExceptionRuleIds, getExceptionSummary } from '../src/policy/exceptions.js'

let tenantId: string
let memberId: string
let ruleId: string

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId
  const [member] = await db.insert(members).values({ tenantId, email: 'alice@example.com', role: 'member' }).returning()
  memberId = member!.id
  const subject = await createSubject(tenantId, { name: 'Global' })
  const rule = await createRule(tenantId, subject.id, { kind: 'keyword', keywords: ['secret'], action: 'block' })
  ruleId = rule.id
})

describe('addException / getMemberExceptionRuleIds', () => {
  it('adds an exception that shows up for that member', async () => {
    await addException(tenantId, memberId, ruleId)
    const ids = await getMemberExceptionRuleIds(tenantId, memberId)
    expect(ids.has(ruleId)).toBe(true)
  })

  it('is idempotent — adding the same exception twice does not error', async () => {
    await addException(tenantId, memberId, ruleId)
    await expect(addException(tenantId, memberId, ruleId)).resolves.not.toThrow()
    const ids = await getMemberExceptionRuleIds(tenantId, memberId)
    expect(ids.size).toBe(1)
  })

  it('an unrelated member has no exceptions', async () => {
    await addException(tenantId, memberId, ruleId)
    const [other] = await db.insert(members).values({ tenantId, email: 'bob@example.com', role: 'member' }).returning()
    const ids = await getMemberExceptionRuleIds(tenantId, other!.id)
    expect(ids.size).toBe(0)
  })
})

describe('removeException', () => {
  it('removes a previously added exception', async () => {
    await addException(tenantId, memberId, ruleId)
    await removeException(tenantId, memberId, ruleId)
    const ids = await getMemberExceptionRuleIds(tenantId, memberId)
    expect(ids.has(ruleId)).toBe(false)
  })

  it('removing a non-existent exception does not throw', async () => {
    await expect(removeException(tenantId, memberId, ruleId)).resolves.not.toThrow()
  })
})

describe('getExceptionSummary', () => {
  it('aggregates member counts and emails per rule, admin-visible', async () => {
    const [bob] = await db.insert(members).values({ tenantId, email: 'bob@example.com', role: 'member' }).returning()
    await addException(tenantId, memberId, ruleId)
    await addException(tenantId, bob!.id, ruleId)

    const summary = await getExceptionSummary(tenantId)
    expect(summary).toHaveLength(1)
    expect(summary[0]!.ruleId).toBe(ruleId)
    expect(summary[0]!.memberCount).toBe(2)
    expect(summary[0]!.memberEmails.sort()).toEqual(['alice@example.com', 'bob@example.com'])
  })

  it('returns an empty list for a tenant with no exceptions', async () => {
    const summary = await getExceptionSummary(tenantId)
    expect(summary).toEqual([])
  })

  it('scopes to the given tenant only', async () => {
    await addException(tenantId, memberId, ruleId)
    const { tenantId: otherTenantId } = await buildTestTenant()
    const summary = await getExceptionSummary(otherTenantId)
    expect(summary).toEqual([])
  })
})
