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

import { triggerSync } from '../../electron/policy-sync'

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
