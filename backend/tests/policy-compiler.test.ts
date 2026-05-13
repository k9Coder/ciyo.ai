import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { createMatter, updateMatter } from '../src/matters/service.js'
import { compilePolicy } from '../src/policy/compiler.js'

let tenantId: string

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId
})

describe('compilePolicy', () => {
  it('always includes confidentiality-markers DictionaryRule', async () => {
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'confidentiality-markers')
    expect((rule as { kind: string }).kind).toBe('dictionary')
    expect((rule as { terms: string[] }).terms).toContain('ATTORNEY-CLIENT PRIVILEGE')
  })

  it('always includes legal-document-structure ScoreRule', async () => {
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'legal-document-structure')
    expect((rule as { kind: string }).kind).toBe('score')
    expect((rule as { warnThreshold: number }).warnThreshold).toBe(50)
    expect((rule as { confirmThreshold: number }).confirmThreshold).toBe(80)
  })

  it('omits client-roster when no active matters exist', async () => {
    const policy = await compilePolicy(tenantId)
    expect(policy.custom.find(r => (r as { id: string }).id === 'client-roster')).toBeUndefined()
  })

  it('includes active matter fields in client-roster terms', async () => {
    await createMatter(tenantId, { clientName: 'Widget Corp', matterNumber: 'WC-001', opposingParties: ['Acme Inc'] })
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as { terms: string[] }
    expect(rule.terms).toContain('Widget Corp')
    expect(rule.terms).toContain('WC-001')
    expect(rule.terms).toContain('Acme Inc')
  })

  it('adds fuzzy variant for names ≤ 20 chars', async () => {
    await createMatter(tenantId, { clientName: 'Short Name' })
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as
      { fuzzyTerms?: Array<{ term: string; maxDistance: number }> }
    expect(rule.fuzzyTerms?.some(f => f.term === 'Short Name')).toBe(true)
  })

  it('does NOT add fuzzy variant for names > 20 chars', async () => {
    await createMatter(tenantId, { clientName: 'This Is A Very Long Client Name' })
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as
      { fuzzyTerms?: Array<{ term: string }> } | undefined
    expect(rule?.fuzzyTerms?.some(f => f.term === 'This Is A Very Long Client Name')).toBeFalsy()
  })

  it('excludes inactive matters', async () => {
    await createMatter(tenantId, { clientName: 'Active' })
    const inactive = await createMatter(tenantId, { clientName: 'Inactive' })
    await updateMatter(tenantId, inactive.id, { active: false })
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as { terms: string[] }
    expect(rule.terms).toContain('Active')
    expect(rule.terms).not.toContain('Inactive')
  })
})
