import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock chrome APIs before importing the module
const mockManagedGet = vi.fn()
const mockLocalGet = vi.fn()
const mockLocalSet = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    managed: { get: mockManagedGet },
    local: { get: mockLocalGet, set: mockLocalSet },
  },
})

// Mock fetch
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { syncPolicy } = await import('@/policy/sync')

const TOKEN = 'ps_live_acmelaw_' + 'a'.repeat(32)
const POLICY_RESPONSE = {
  version: 3,
  policy: { version: 1, baseline: [], custom: [], perSite: {}, allowSendAnywayWithReason: false, auditRetentionDays: 365 },
  tenantName: 'Acme Law',
  plan: 'pro',
  expiresAt: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockManagedGet.mockResolvedValue({})
  mockLocalGet.mockImplementation((keys: string | string[]) => {
    const k = Array.isArray(keys) ? keys : [keys]
    const result: Record<string, unknown> = {}
    if ((k as string[]).includes('orgToken')) result['orgToken'] = TOKEN
    return Promise.resolve(result)
  })
  mockLocalSet.mockResolvedValue(undefined)
})

describe('syncPolicy', () => {
  it('does nothing when no org token is present', async () => {
    mockLocalGet.mockResolvedValue({})
    await syncPolicy()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('skips full policy fetch when version is unchanged', async () => {
    mockLocalGet.mockImplementation((keys: unknown) => {
      const k = Array.isArray(keys) ? keys : [keys]
      const result: Record<string, unknown> = {}
      if ((k as string[]).includes('orgToken')) result['orgToken'] = TOKEN
      if ((k as string[]).includes('cachedPolicyVersion')) result['cachedPolicyVersion'] = 3
      return Promise.resolve(result)
    })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ version: 3 }),
    })
    await syncPolicy()
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('fetches and stores policy when version changes', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ version: 3 }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(POLICY_RESPONSE) })
    await syncPolicy()
    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(mockLocalSet).toHaveBeenCalledWith(expect.objectContaining({
      cachedPolicyVersion: 3,
      tenantName: 'Acme Law',
      subscriptionExpired: false,
    }))
  })

  it('sets subscriptionExpired flag on 402 from /version', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 402 })
    await syncPolicy()
    expect(mockLocalSet).toHaveBeenCalledWith({ subscriptionExpired: true })
  })

  it('sets subscriptionExpired flag on 402 from /policy', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ version: 5 }) })
      .mockResolvedValueOnce({ ok: false, status: 402 })
    await syncPolicy()
    expect(mockLocalSet).toHaveBeenCalledWith({ subscriptionExpired: true })
  })

  it('does not throw on network error — leaves cached policy intact', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    await expect(syncPolicy()).resolves.not.toThrow()
    expect(mockLocalSet).not.toHaveBeenCalled()
  })
})
