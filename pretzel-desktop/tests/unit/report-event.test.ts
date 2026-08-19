/**
 * Unit tests for report-event.ts — posting findings to the existing
 * backend Audit Log endpoint.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockLoadToken } = vi.hoisted(() => ({ mockLoadToken: vi.fn() }))
vi.mock('../../electron/auth', () => ({ loadToken: mockLoadToken }))

import { reportEvent } from '../../electron/report-event'

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadToken.mockResolvedValue('pd_test_token')
})
afterEach(() => { global.fetch = originalFetch })

const baseEvent = {
  hostname: 'chatgpt.com',
  result: {
    findings: [
      { ruleId: 'rule-1', ruleName: 'AWS Key', severity: 'critical' as const, matchedText: 'AKIA...' },
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

  it('posts one event per finding to /v1/events', async () => {
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

  it('maps non-critical/high severity to warn', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await reportEvent({
      hostname: 'claude.ai',
      result: { findings: [{ ruleId: 'r2', severity: 'medium', matchedText: 'x' }] },
    } as any)

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body)
    expect(body.action).toBe('warn')
  })

  it('posts one event per finding when there are multiple', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as any

    await reportEvent({
      hostname: 'chatgpt.com',
      result: { findings: [{ ruleId: 'r1', severity: 'high' }, { ruleId: 'r2', severity: 'low' }] },
    } as any)

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('never throws when the POST fails (best-effort)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any
    await expect(reportEvent(baseEvent as any)).resolves.toBeUndefined()
  })
})
