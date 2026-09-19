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

import {
  triggerSync, alwaysAllowRule, startPolicySync, stopPolicySync, resetPolicySync,
  retryDelayMs, classifyPolicyResponse, getSyncIssue, getLastKnownPolicy,
} from '../../electron/policy-sync'

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadToken.mockResolvedValue('pd_test_token')
  resetPolicySync()
})

afterEach(() => { global.fetch = originalFetch })

describe('policy-sync auth-expiry handling', () => {
  it('clears credentials when /v1/policy returns 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any
    await triggerSync()
    expect(mockClearCredentials).toHaveBeenCalled()
  })

  it('tells the app when the token was rejected, so it can show the sign-in prompt', async () => {
    // Regression: ISSUE-007 — credentials were cleared but nothing notified the
    // tray, which sat on "Waiting" with no sign-in button until restart.
    // Found by /qa-desktop on 2026-09-19.
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any
    const onUnauthorized = vi.fn()
    startPolicySync(vi.fn(), { onUnauthorized })
    await vi.waitFor(() => expect(onUnauthorized).toHaveBeenCalledTimes(1))
    stopPolicySync()
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

describe('retryDelayMs', () => {
  it('backs off 5s, 15s, 30s, then holds at 60s', () => {
    expect([0, 1, 2, 3, 4, 10].map(retryDelayMs)).toEqual([5_000, 15_000, 30_000, 60_000, 60_000, 60_000])
  })
})

describe('classifyPolicyResponse — which failures are worth a fast retry', () => {
  it('treats 5xx, 408 and 429 as transient', () => {
    for (const status of [500, 502, 503, 408, 429]) expect(classifyPolicyResponse(status)).toBe('transient')
  })
  it('treats 401 as unauthorized (a sign-in problem, not a retry)', () => {
    expect(classifyPolicyResponse(401)).toBe('unauthorized')
  })
  it('treats other 4xx as invalid (retrying fast will not help)', () => {
    for (const status of [400, 403, 404]) expect(classifyPolicyResponse(status)).toBe('invalid')
  })
  it('treats 2xx as ok', () => {
    expect(classifyPolicyResponse(200)).toBe('ok')
  })
})

describe('startup retry while no policy has loaded', () => {
  const okResponse = { ok: true, status: 200, json: async () => ({ policy: { version: 1 } }) }

  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { stopPolicySync(); vi.useRealTimers() })

  it('retries after a network failure instead of waiting for the 2-minute tick, then stops', async () => {
    // Regression: ISSUE-005 — the single startup sync failed (network not up at
    // login) and the next attempt was 2 minutes away, leaving no policy loaded.
    // Found by /qa-desktop on 2026-09-19.
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(okResponse) as any
    await triggerSync()
    expect(getSyncIssue()).toBe('unreachable')
    expect(getLastKnownPolicy()).toBeNull()

    await vi.advanceTimersByTimeAsync(5_000)
    expect(global.fetch).toHaveBeenCalledTimes(2)
    expect(getSyncIssue()).toBeNull()
    expect(getLastKnownPolicy()).not.toBeNull()

    await vi.advanceTimersByTimeAsync(60_000)
    expect(global.fetch).toHaveBeenCalledTimes(2) // healthy now: no further fast retries
  })

  it('keeps backing off while the server stays down', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any
    await triggerSync()
    await vi.advanceTimersByTimeAsync(5_000)   // retry 1
    await vi.advanceTimersByTimeAsync(15_000)  // retry 2
    await vi.advanceTimersByTimeAsync(30_000)  // retry 3
    expect(global.fetch).toHaveBeenCalledTimes(4)
  })

  it('does not fast-retry once a policy is already loaded (stale policy keeps enforcing)', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce(okResponse).mockRejectedValue(new Error('offline')) as any
    await triggerSync()
    await triggerSync()
    expect(getSyncIssue()).toBe('unreachable')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(global.fetch).toHaveBeenCalledTimes(2)
  })

  it('does not fast-retry a 401 or an unreadable/4xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 403 }) as any
    await triggerSync()
    expect(getSyncIssue()).toBe('invalid')
    await vi.advanceTimersByTimeAsync(120_000)
    expect(global.fetch).toHaveBeenCalledTimes(1)
  })

  it('reports issue changes to the app', async () => {
    const onSyncIssue = vi.fn()
    global.fetch = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(okResponse) as any
    startPolicySync(vi.fn(), { onSyncIssue })
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(5_000)
    expect(onSyncIssue.mock.calls.map((c) => c[0])).toEqual(['unreachable', null])
  })
})
