import { describe, it, expect } from 'vitest'
import { bridgePolicy } from '../../src/policy/bridge'
import { detectPrompt } from '../../src/detection/engine'
import type { PolicyDoc } from '../../src/policy/schema'
import { DEFAULT_POLICY } from '../../src/policy/defaults'

const MINIMAL_DOC: PolicyDoc = {
  version: 1,
  tenantId: 'tenant-1',
  subjects: [],
  siteConfigs: {},
  failMode: 'open',
}

describe('bridgePolicy', () => {
  it('keeps the built-in baseline and adds no custom rules when no subjects', () => {
    const p = bridgePolicy(MINIMAL_DOC, [])
    expect(p.baseline).toBe(DEFAULT_POLICY.baseline)
    expect(p.custom).toHaveLength(0)
  })

  it('still blocks baseline PII (SSN) for a signed-in tenant with no matching rule', async () => {
    const result = await detectPrompt(
      { text: 'מזהה הלקוח שלי הוא 123-45-6789', hostname: 'chatgpt.com', pasteDetected: false, inputType: 'prompt' },
      bridgePolicy(MINIMAL_DOC, []),
    )
    expect(result.highestAction).toBe('block')
    expect(result.findings.map(f => f.ruleId)).toContain('us-ssn')
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

  it('a console pattern rule set to block actually blocks a matching prompt', async () => {
    const doc: PolicyDoc = {
      ...MINIMAL_DOC,
      subjects: [{
        id: 's1', name: 'Personal Identifiers',
        rules: [{ id: 'r1', kind: 'pattern', keywords: null, pattern: String.raw`\b\d{3}-\d{2}-\d{4}\b`, destinations: [], action: 'block', message: null, reportLevel: 'none' }],
      }],
    }
    const result = await detectPrompt('מזהה הלקוח שלי הוא 123-45-6789', bridgePolicy(doc, []), 'chatgpt.com')
    expect(result.highestAction).toBe('block')
    expect(result.findings[0]!.matchedText).toBe('123-45-6789')
  })
})
