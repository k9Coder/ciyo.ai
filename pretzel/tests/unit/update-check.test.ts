import { describe, it, expect, vi, beforeEach } from 'vitest'

const store: Record<string, unknown> = {}
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (keys: string | string[]) => {
        const ks = Array.isArray(keys) ? keys : [keys]
        return Object.fromEntries(ks.map(k => [k, store[k]]))
      }),
      set: vi.fn(async (vals: Record<string, unknown>) => Object.assign(store, vals)),
    },
  },
})

const mockGetLastUpdatedAt = vi.fn<() => Promise<number | null>>()
vi.mock('../../src/realtime/index', () => ({
  lastUpdatesChecker: { getLastUpdatedAt: mockGetLastUpdatedAt },
}))

const mockSyncPolicy = vi.fn().mockResolvedValue(undefined)
vi.mock('../../src/policy/sync', () => ({ syncPolicy: mockSyncPolicy }))

beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k])
  vi.clearAllMocks()
})

describe('checkForUpdates', () => {
  it('calls syncPolicy when remoteTs > localSyncedAt', async () => {
    store['syncedAt'] = 1000
    mockGetLastUpdatedAt.mockResolvedValueOnce(2000)
    const { checkForUpdates } = await import('../../src/background/update-check')
    await checkForUpdates()
    expect(mockSyncPolicy).toHaveBeenCalledOnce()
  })

  it('does NOT call syncPolicy when remoteTs <= localSyncedAt', async () => {
    store['syncedAt'] = 2000
    mockGetLastUpdatedAt.mockResolvedValueOnce(2000)
    const { checkForUpdates } = await import('../../src/background/update-check')
    await checkForUpdates()
    expect(mockSyncPolicy).not.toHaveBeenCalled()
  })

  it('calls syncPolicy when no localSyncedAt (first run)', async () => {
    mockGetLastUpdatedAt.mockResolvedValueOnce(5000)
    const { checkForUpdates } = await import('../../src/background/update-check')
    await checkForUpdates()
    expect(mockSyncPolicy).toHaveBeenCalledOnce()
  })

  it('does nothing when getLastUpdatedAt returns null', async () => {
    mockGetLastUpdatedAt.mockResolvedValueOnce(null)
    const { checkForUpdates } = await import('../../src/background/update-check')
    await checkForUpdates()
    expect(mockSyncPolicy).not.toHaveBeenCalled()
  })

  it('updates syncedAt in storage after syncing', async () => {
    store['syncedAt'] = 0
    mockGetLastUpdatedAt.mockResolvedValueOnce(3000)
    const { checkForUpdates } = await import('../../src/background/update-check')
    await checkForUpdates()
    expect(store['syncedAt']).toBe(3000)
  })
})
