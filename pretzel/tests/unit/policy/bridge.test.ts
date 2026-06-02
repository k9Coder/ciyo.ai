import { describe, it, expect } from 'vitest'
import { bridgePolicy } from '@/policy/bridge'
import type { PolicyDoc } from '@/policy/schema'

const MINIMAL_DOC: PolicyDoc = {
  version: 1,
  tenantId: 'tenant-1',
  subjects: [],
  siteConfigs: {},
}

describe('bridgePolicy', () => {
  it('returns a Policy with empty rules when no subjects', () => {
    const p = bridgePolicy(MINIMAL_DOC, [])
    expect(p.baseline).toHaveLength(0)
    expect(p.custom).toHaveLength(0)
  })

  it('maps keyword rule to DictionaryRule', () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Confidential',
        rules: [{ id: 'r1', kind: 'keyword', keywords: ['secret', 'classified'], pattern: null, destinations: [], action: 'warn', message: null, reportLevel: 'none' }],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom).toHaveLength(1)
    expect(p.custom[0]!.kind).toBe('dictionary')
    expect((p.custom[0] as { terms: string[] }).terms).toContain('secret')
    expect(p.custom[0]!.action).toBe('warn')
    expect(p.custom[0]!.enabled).toBe(true)
  })

  it('maps pattern rule to PatternRule', () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Keys',
        rules: [{ id: 'r2', kind: 'pattern', keywords: null, pattern: 'sk-[A-Za-z0-9]{20,}', destinations: [], action: 'block', message: 'API key', reportLevel: 'none' }],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom[0]!.kind).toBe('pattern')
    expect((p.custom[0] as { pattern: string }).pattern).toBe('sk-[A-Za-z0-9]{20,}')
    expect(p.custom[0]!.action).toBe('block')
  })

  it('maps entropy rule with defaults', () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Entropy',
        rules: [{ id: 'r3', kind: 'entropy', keywords: null, pattern: null, destinations: [], action: 'warn', message: null, reportLevel: 'none' }],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom[0]!.kind).toBe('entropy')
    expect((p.custom[0] as { minTokenLength: number }).minTokenLength).toBe(24)
  })

  it('injects disabledSites into perSite', () => {
    const p = bridgePolicy(MINIMAL_DOC, ['chatgpt.com'])
    expect(p.perSite['chatgpt.com']!.enabled).toBe(false)
  })
})
