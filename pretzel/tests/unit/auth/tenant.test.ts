import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLocalGet    = vi.fn()
const mockLocalSet    = vi.fn()
const mockLocalRemove = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    local: { get: mockLocalGet, set: mockLocalSet, remove: mockLocalRemove },
  },
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { ensureTenantSelected, getSelectedTenantId, setSelectedTenantId } = await import('@/auth/tenant')

const TOKEN = 'eyJhbGciOiJSUzI1NiJ9.clerk-jwt-payload.sig'

beforeEach(() => {
  vi.clearAllMocks()
  mockLocalGet.mockResolvedValue({}) // no existing selection by default
  mockLocalSet.mockResolvedValue(undefined)
  mockLocalRemove.mockResolvedValue(undefined)
})

describe('ensureTenantSelected', () => {
  it('auto-selects the tenant when exactly 1 membership is returned', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        memberships: [{ tenantId: 'tenant-1', tenantName: 'Solo Co', role: 'owner' }],
      }),
    })
    await ensureTenantSelected(TOKEN, { force: true })
    expect(mockLocalSet).toHaveBeenCalledWith({
      selectedTenantId: 'tenant-1',
      memberships: [{ tenantId: 'tenant-1', tenantName: 'Solo Co', role: 'owner' }],
    })
  })

  it('selects the first membership and stores the full list when >1 memberships', async () => {
    const memberships = [
      { tenantId: 'tenant-org', tenantName: 'Acme Org', role: 'member' },
      { tenantId: 'tenant-personal', tenantName: 'Personal', role: 'owner' },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ memberships }),
    })
    await ensureTenantSelected(TOKEN, { force: true })
    expect(mockLocalSet).toHaveBeenCalledWith({
      selectedTenantId: 'tenant-org',
      memberships,
    })
  })

  it('clears the selection when 0 memberships are returned', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ memberships: [] }),
    })
    await ensureTenantSelected(TOKEN, { force: true })
    expect(mockLocalRemove).toHaveBeenCalledWith(['selectedTenantId', 'memberships'])
  })

  it('does not fetch when a selection already exists and debounce window has not elapsed', async () => {
    mockLocalGet.mockResolvedValue({ selectedTenantId: 'tenant-1' })
    await ensureTenantSelected(TOKEN, { force: true }) // first call establishes lastEnsureAtMs
    mockFetch.mockClear()
    await ensureTenantSelected(TOKEN) // second call, not forced, within debounce window
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('leaves existing selection in place on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'))
    await expect(ensureTenantSelected(TOKEN, { force: true })).resolves.not.toThrow()
    expect(mockLocalSet).not.toHaveBeenCalled()
    expect(mockLocalRemove).not.toHaveBeenCalled()
  })
})

describe('getSelectedTenantId / setSelectedTenantId', () => {
  it('returns null when nothing is stored', async () => {
    mockLocalGet.mockResolvedValue({})
    expect(await getSelectedTenantId()).toBeNull()
  })

  it('returns the stored tenant id', async () => {
    mockLocalGet.mockResolvedValue({ selectedTenantId: 'tenant-42' })
    expect(await getSelectedTenantId()).toBe('tenant-42')
  })

  it('stores the tenant id', async () => {
    await setSelectedTenantId('tenant-99')
    expect(mockLocalSet).toHaveBeenCalledWith({ selectedTenantId: 'tenant-99' })
  })
})
