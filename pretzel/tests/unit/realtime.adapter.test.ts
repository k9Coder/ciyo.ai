import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

vi.mock('../../src/policy/auth', () => ({ getAuthToken: vi.fn().mockResolvedValue('tok') }))
vi.mock('../../src/shared/constants', () => ({ API_BASE: 'https://api.test' }))

vi.stubGlobal('chrome', {
  storage: {
    local: { get: vi.fn().mockResolvedValue({}) },
  },
})

const originalFetch = global.fetch
let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => { fetchMock = vi.fn(); global.fetch = fetchMock })
afterAll(() => { global.fetch = originalFetch })

describe('BackendRESTChecker', () => {
  it('fetches /v1/policy/last-updates with auth header and returns ts', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ts: 9999 }) })
    const { BackendRESTChecker } = await import('../../src/realtime/backend-rest.adapter')
    const result = await new BackendRESTChecker().getLastUpdatedAt()
    expect(result).toBe(9999)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test/v1/policy/last-updates',
      { headers: { Authorization: 'Bearer tok' } }
    )
  })

  it('returns null on network error', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'))
    const { BackendRESTChecker } = await import('../../src/realtime/backend-rest.adapter')
    expect(await new BackendRESTChecker().getLastUpdatedAt()).toBeNull()
  })

  it('returns null when response is not ok', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 402 })
    const { BackendRESTChecker } = await import('../../src/realtime/backend-rest.adapter')
    expect(await new BackendRESTChecker().getLastUpdatedAt()).toBeNull()
  })

  it('returns null when not authenticated', async () => {
    const { getAuthToken } = await import('../../src/policy/auth')
    vi.mocked(getAuthToken).mockResolvedValueOnce(null)
    const { BackendRESTChecker } = await import('../../src/realtime/backend-rest.adapter')
    expect(await new BackendRESTChecker().getLastUpdatedAt()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
