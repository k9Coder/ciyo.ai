import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Finding } from '@mykka/detect'

const store: Record<string, unknown> = {}
vi.stubGlobal('chrome', {
  storage: {
    managed: { get: vi.fn(async () => ({})) },
    local: { get: vi.fn(async (k: string) => ({ [k]: store[k] })) },
  },
})

const mockToken = vi.hoisted(() => vi.fn<() => Promise<string | null>>())
vi.mock('../../../src/policy/auth', () => ({ getAuthToken: mockToken }))
vi.mock('../../../src/auth/headers', () => ({ buildAuthHeaders: vi.fn() }))

import { getReportingSummary } from '../../../src/events/dispatch'

const f = (ruleId: string, action: Finding['action']): Finding => ({
  ruleId, ruleName: ruleId, severity: 'high', action, matchedText: 'x', startOffset: 0, endOffset: 1,
})

const policy = (levels: Record<string, string>) => ({
  version: 1, tenantId: 't', siteConfigs: {},
  subjects: [{
    id: 's', name: 's',
    rules: Object.entries(levels).map(([id, reportLevel]) => ({
      id, kind: 'keyword', keywords: ['x'], pattern: null, destinations: [], action: 'block', message: null, reportLevel,
    })),
  }],
})

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  mockToken.mockResolvedValue('tok')
})

describe('getReportingSummary', () => {
  it('is none when signed out', async () => {
    mockToken.mockResolvedValue(null)
    store.policyDoc = policy({ a: 'medium' })
    expect(await getReportingSummary([f('a', 'block')])).toBe('none')
  })
  it('is none when every rule reports nothing', async () => {
    store.policyDoc = policy({ a: 'none' })
    expect(await getReportingSummary([f('a', 'block')])).toBe('none')
  })
  it('is standard for minimal/medium levels', async () => {
    store.policyDoc = policy({ a: 'medium' })
    expect(await getReportingSummary([f('a', 'warn')])).toBe('standard')
  })
  it('is rich when any rule sends the matched term', async () => {
    store.policyDoc = policy({ a: 'medium', b: 'rich' })
    expect(await getReportingSummary([f('a', 'warn'), f('b', 'block')])).toBe('rich')
  })
  it('ignores findings that are never dispatched (log)', async () => {
    store.policyDoc = policy({ a: 'rich' })
    expect(await getReportingSummary([f('a', 'log')])).toBe('none')
  })
})
