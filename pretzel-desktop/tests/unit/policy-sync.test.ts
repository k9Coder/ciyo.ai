/**
 * Unit tests for policy-sync.ts — clears stored credentials when the device
 * token has expired or been revoked (401 from /v1/policy), instead of silently
 * going stale until the 90-day expiry is discovered some other way.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockLoadToken, mockClearCredentials } = vi.hoisted(() => ({
  mockLoadToken: vi.fn(),
  mockClearCredentials: vi.fn(),
}))

vi.mock('../../electron/auth', () => ({
  loadToken: mockLoadToken,
  clearCredentials: mockClearCredentials,
}))

vi.mock('@mykka/detect', () => ({
  PolicyDocSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  bridgePolicy: (doc: unknown) => doc,
}))

import { triggerSync, alwaysAllowRule } from '../../electron/policy-sync'

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadToken.mockResolvedValue('pd_test_token')
})

afterEach(() => { global.fetch = originalFetch })

describe('policy-sync auth-expiry handling', () => {
  it('clears credentials when /v1/policy returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any
    await triggerSync()
    expect(mockClearCredentials).toHaveBeenCalled()
  })

  it('does not clear credentials on other failures (e.g. 5xx/network)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any
    await triggerSync()
    expect(mockClearCredentials).not.toHaveBeenCalled()
  })

  it('does not clear credentials on success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ subjects: [] }) }) as any
    await triggerSync()
    expect(mockClearCredentials).not.toHaveBeenCalled()
  })

  it('does nothing when not yet authenticated (no stored token)', async () => {
    mockLoadToken.mockResolvedValue(null)
    global.fetch = vi.fn() as any
    await triggerSync()
    expect(global.fetch).not.toHaveBeenCalled()
    expect(mockClearCredentials).not.toHaveBeenCalled()
  })
})

describe('alwaysAllowRule', () => {
  it('posts the exception and re-syncs on success', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true }) // POST /v1/policy/exceptions
      .mockResolvedValueOnce({ ok: true, json: async () => ({ subjects: [] }) }) // re-sync GET /v1/policy
    global.fetch = fetchMock as any

    const result = await alwaysAllowRule('rule-123')

    expect(result).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [url, opts] = fetchMock.mock.calls[0]!
    expect(url).toContain('/v1/policy/exceptions')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ ruleId: 'rule-123' })
  })

  it('returns false and does not re-sync when the POST fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 })
    global.fetch = fetchMock as any

    const result = await alwaysAllowRule('rule-123')

    expect(result).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1) // no follow-up re-sync call
  })

  it('returns false on a network error', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any
    const result = await alwaysAllowRule('rule-123')
    expect(result).toBe(false)
  })

  it('returns false when not authenticated', async () => {
    mockLoadToken.mockResolvedValue(null)
    global.fetch = vi.fn() as any
    const result = await alwaysAllowRule('rule-123')
    expect(result).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
