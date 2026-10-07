/**
 * Unit tests for report-event.ts — posting findings to the existing
 * backend Audit Log endpoint, gated by each rule's reportLevel the same
 * way the extension's dispatchEvents already is.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockLoadToken, mockGetLastKnownPolicyDoc } = vi.hoisted(() => ({
  mockLoadToken: vi.fn(),
  mockGetLastKnownPolicyDoc: vi.fn(),
}))
vi.mock('../../electron/auth', () => ({ loadToken: mockLoadToken }))
vi.mock('../../electron/policy-sync', () => ({ getLastKnownPolicyDoc: mockGetLastKnownPolicyDoc }))

import { reportEvent } from '../../electron/report-event'

const originalFetch = global.fetch

function policyDocWithRule(ruleId: string, reportLevel: 'none' | 'minimal' | 'medium' | 'rich') {
  return {
    version: 1,
    tenantId: 't1',
    subjects: [{ id: 's1', name: 'S', rules: [{ id: ruleId, reportLevel }] }],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadToken.mockResolvedValue('pd_test_token')
  mockGetLastKnownPolicyDoc.mockReturnValue(null)
})
afterEach(() => { global.fetch = originalFetch })

const baseEvent = {
  hostname: 'chatgpt.com',
  result: {
    findings: [
      { ruleId: 'rule-1', ruleName: 'AWS Key', severity: 'critical' as const, action: 'block' as const, matchedText: 'AKIA...' },
    ],
  },
}

describe('reportEvent', () => {
  it('does nothing when not authenticated', async () => {
    mockLoadToken.mockResolvedValue(null)
    global.fetch = vi.fn() as any
    await reportEvent(baseEvent as any)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('posts one event per finding to /v1/events when reportLevel is rich', async () => {
    mockGetLastKnownPolicyDoc.mockReturnValue(policyDocWithRule('rule-1', 'rich'))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await reportEvent(baseEvent as any)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/events')
    const body = JSON.parse(opts.body)
    expect(body).toEqual({
      ruleId: 'rule-1',
      action: 'block',
      siteUrl: 'https://chatgpt.com/',
      matchedTerm: 'AKIA...',
    })
  })

  it('reports the rule action, not the severity', async () => {
    // Regression: the action used to be derived from severity, so a medium-severity
    // `block` rule was logged as a warn and a high-severity `warn` rule as a block.
    // Found by /qa-desktop on 2026-09-19.
    mockGetLastKnownPolicyDoc.mockReturnValue({
      version: 1, tenantId: 't1',
      subjects: [{ id: 's1', name: 'S', rules: [
        { id: 'r-block', reportLevel: 'rich' },
        { id: 'r-warn', reportLevel: 'rich' },
      ] }],
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await reportEvent({
      hostname: 'claude.ai',
      result: { findings: [
        { ruleId: 'r-block', severity: 'medium', action: 'block', matchedText: 'x' },
        { ruleId: 'r-warn', severity: 'critical', action: 'warn', matchedText: 'y' },
      ] },
    } as any)

    const bodies = fetchMock.mock.calls.map((c) => JSON.parse(c[1].body))
    expect(bodies.find((b) => b.ruleId === 'r-block').action).toBe('block')
    expect(bodies.find((b) => b.ruleId === 'r-warn').action).toBe('warn')
  })

  it('posts one event per finding when there are multiple, each reportable', async () => {
    mockGetLastKnownPolicyDoc.mockReturnValue({
      version: 1, tenantId: 't1',
      subjects: [{ id: 's1', name: 'S', rules: [
        { id: 'r1', reportLevel: 'minimal' },
        { id: 'r2', reportLevel: 'medium' },
      ] }],
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await reportEvent({
      hostname: 'chatgpt.com',
      result: { findings: [{ ruleId: 'r1', severity: 'high', action: 'block' }, { ruleId: 'r2', severity: 'low', action: 'warn' }] },
    } as any)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never throws when the POST fails (best-effort)', async () => {
    mockGetLastKnownPolicyDoc.mockReturnValue(policyDocWithRule('rule-1', 'rich'))
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any
    await expect(reportEvent(baseEvent as any)).resolves.toBeUndefined()
  })

  describe('reportLevel gating', () => {
    it('skips the event entirely when the rule\'s reportLevel is "none"', async () => {
      mockGetLastKnownPolicyDoc.mockReturnValue(policyDocWithRule('rule-1', 'none'))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      global.fetch = fetchMock as any

      await reportEvent(baseEvent as any)

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('skips the event when no policy has synced yet (fails open to "none", not "rich")', async () => {
      mockGetLastKnownPolicyDoc.mockReturnValue(null)
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      global.fetch = fetchMock as any

      await reportEvent(baseEvent as any)

      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends the event without matchedTerm when reportLevel is "minimal"', async () => {
      mockGetLastKnownPolicyDoc.mockReturnValue(policyDocWithRule('rule-1', 'minimal'))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      global.fetch = fetchMock as any

      await reportEvent(baseEvent as any)

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body).toEqual({ ruleId: 'rule-1', action: 'block', siteUrl: 'https://chatgpt.com/' })
    })

    it('sends the event without matchedTerm when reportLevel is "medium"', async () => {
      mockGetLastKnownPolicyDoc.mockReturnValue(policyDocWithRule('rule-1', 'medium'))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      global.fetch = fetchMock as any

      await reportEvent(baseEvent as any)

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.matchedTerm).toBeUndefined()
    })

    it('includes matchedTerm only when reportLevel is "rich"', async () => {
      mockGetLastKnownPolicyDoc.mockReturnValue(policyDocWithRule('rule-1', 'rich'))
      const fetchMock = vi.fn().mockResolvedValue({ ok: true })
      global.fetch = fetchMock as any

      await reportEvent(baseEvent as any)

      const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
      expect(body.matchedTerm).toBe('AKIA...')
    })
  })
})
