import { describe, it, expect } from 'vitest'
import { bridgePolicy } from '../../src/policy/bridge'
import type { PolicyDoc } from '../../src/policy/schema'

const MINIMAL_DOC: PolicyDoc = {
  version: 1,
  tenantId: 'tenant-1',
  subjects: [],
  siteConfigs: {},
  failMode: 'open',
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
    expect(p.custom[0]!.enforced).toBe(false)
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
    expect(p.custom[0]!.enforced).toBe(false)
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
    expect(p.custom[0]!.enforced).toBe(false)
  })

  it('injects disabledSites into perSite', () => {
    const p = bridgePolicy(MINIMAL_DOC, ['chatgpt.com'])
    expect(p.perSite['chatgpt.com']!.enabled).toBe(false)
  })

  it("bridges a judge_prompt rule with enforced: true and the prompt text preserved", () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'SSN',
        rules: [
          { id: 'r1', kind: 'judge_prompt', keywords: null, pattern: null, prompt: 'This message discloses a Social Security Number.', destinations: [], action: 'block', message: null, reportLevel: 'none' },
        ],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom).toHaveLength(1)
    expect(p.custom[0]!.kind).toBe('judge_prompt')
    expect(p.custom[0]!.enforced).toBe(true)
    expect((p.custom[0] as { prompt: string }).prompt).toBe('This message discloses a Social Security Number.')
  })

  it("bridges legacy rule kinds with enforced: false", () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Mixed',
        rules: [
          { id: 'r1', kind: 'keyword', keywords: ['secret'], pattern: null, destinations: [], action: 'warn', message: null, reportLevel: 'none' },
          { id: 'r2', kind: 'pattern', keywords: null, pattern: 'sk-[A-Za-z0-9]{20,}', destinations: [], action: 'block', message: null, reportLevel: 'none' },
          { id: 'r3', kind: 'entropy', keywords: null, pattern: null, destinations: [], action: 'warn', message: null, reportLevel: 'none' },
          { id: 'r4', kind: 'score', keywords: null, pattern: null, destinations: [], action: 'block', message: null, reportLevel: 'none' },
        ],
      }],
    }
    const p = bridgePolicy(doc, [])
    expect(p.custom).toHaveLength(4)
    for (const rule of p.custom) expect(rule.enforced).toBe(false)
  })
})
