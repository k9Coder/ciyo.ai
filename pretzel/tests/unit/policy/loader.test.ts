import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLocalGet = vi.fn()
const mockLocalSet = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    local: { get: mockLocalGet, set: mockLocalSet },
  },
})

const mockBridgePolicy = vi.fn()
vi.mock('@ciyo/detect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ciyo/detect')>()
  return { ...actual, bridgePolicy: mockBridgePolicy }
})
vi.mock('@/shared/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }))

const { loadPolicy, getSiteConfigs } = await import('@/policy/loader')
const { DEFAULT_POLICY } = await import('@ciyo/detect')

const SITE_OVERRIDES_KEY = 'promptshield_site_overrides'

const VALID_DOC = {
  version: 1,
  tenantId: 'tenant-x',
  subjects: [],
  siteConfigs: { 'chat.acme.com': { inputSelector: '#in', sendButtonSelector: '#send' } },
  failMode: 'open',
}

function mockStorage(overrides: Record<string, unknown> = {}) {
  mockLocalGet.mockImplementation((key: string) => {
    return Promise.resolve({ [key]: overrides[key] })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLocalSet.mockResolvedValue(undefined)
  mockBridgePolicy.mockReturnValue({ ...DEFAULT_POLICY })
})

describe('loadPolicy — no cached doc', () => {
  it('returns DEFAULT_POLICY when no doc and failMode absent (defaults open)', async () => {
    mockStorage({})
    const policy = await loadPolicy()
    expect(policy).toEqual(DEFAULT_POLICY)
    expect(mockLocalSet).not.toHaveBeenCalled()
  })

  it('returns DEFAULT_POLICY when no doc and failMode is "open"', async () => {
    mockStorage({ failMode: 'open' })
    const policy = await loadPolicy()
    expect(policy).toEqual(DEFAULT_POLICY)
  })

  it('returns CLOSED_POLICY when no doc and failMode is "closed"', async () => {
    mockStorage({ failMode: 'closed' })
    const policy = await loadPolicy()
    expect(policy.failMode).toBe('closed')
    expect(policy.baseline.some(r => r.id === 'ciyo-failmode-closed')).toBe(true)
    const blockRule = policy.baseline.find(r => r.id === 'ciyo-failmode-closed')
    expect(blockRule?.action).toBe('block')
  })

  it('unknown stored failMode value defaults to open', async () => {
    mockStorage({ failMode: 'garbage' })
    const policy = await loadPolicy()
    expect(policy).toEqual(DEFAULT_POLICY)
  })
})

describe('loadPolicy — valid cached doc', () => {
  it('returns bridgePolicy result when doc is present', async () => {
    const bridgeResult = { ...DEFAULT_POLICY, failMode: 'open' as const }
    mockBridgePolicy.mockReturnValue(bridgeResult)
    mockStorage({ policyDoc: VALID_DOC })
    const policy = await loadPolicy()
    expect(mockBridgePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant-x', failMode: 'open' }),
      expect.any(Array),
    )
    expect(policy).toBe(bridgeResult)
  })

  it('persists doc.failMode to storage when doc is present', async () => {
    mockStorage({ policyDoc: VALID_DOC })
    await loadPolicy()
    expect(mockLocalSet).toHaveBeenCalledWith({ failMode: 'open' })
  })

  it('persists failMode "closed" when doc has failMode closed', async () => {
    mockStorage({ policyDoc: { ...VALID_DOC, failMode: 'closed' } })
    await loadPolicy()
    expect(mockLocalSet).toHaveBeenCalledWith({ failMode: 'closed' })
  })

  it('passes disabled sites to bridgePolicy', async () => {
    mockLocalGet.mockImplementation((key: string) => {
      if (key === 'policyDoc') return Promise.resolve({ policyDoc: VALID_DOC })
      if (key === SITE_OVERRIDES_KEY) return Promise.resolve({ [SITE_OVERRIDES_KEY]: ['chatgpt.com'] })
      return Promise.resolve({})
    })
    await loadPolicy()
    expect(mockBridgePolicy).toHaveBeenCalledWith(
      expect.anything(),
      ['chatgpt.com'],
    )
  })

  it('treats non-array site overrides as empty array', async () => {
    mockLocalGet.mockImplementation((key: string) => {
      if (key === 'policyDoc') return Promise.resolve({ policyDoc: VALID_DOC })
      if (key === SITE_OVERRIDES_KEY) return Promise.resolve({ [SITE_OVERRIDES_KEY]: 'not-an-array' })
      return Promise.resolve({})
    })
    await loadPolicy()
    expect(mockBridgePolicy).toHaveBeenCalledWith(expect.anything(), [])
  })
})

describe('loadPolicy — corrupt or missing doc', () => {
  it('falls back to DEFAULT_POLICY when stored doc fails schema parse (fail open)', async () => {
    mockStorage({ policyDoc: { invalid: true }, failMode: 'open' })
    const policy = await loadPolicy()
    expect(policy).toEqual(DEFAULT_POLICY)
  })

  it('falls back to CLOSED_POLICY when stored doc fails parse and failMode is "closed"', async () => {
    mockStorage({ policyDoc: { bad: 'data' }, failMode: 'closed' })
    const policy = await loadPolicy()
    expect(policy.failMode).toBe('closed')
    expect(policy.baseline.some(r => r.id === 'ciyo-failmode-closed')).toBe(true)
  })

  it('returns DEFAULT_POLICY and does not throw when storage rejects', async () => {
    mockLocalGet.mockRejectedValue(new Error('storage quota exceeded'))
    const policy = await loadPolicy()
    expect(policy).toEqual(DEFAULT_POLICY)
  })
})

describe('getSiteConfigs', () => {
  it('returns {} when no stored doc', async () => {
    mockStorage({})
    expect(await getSiteConfigs()).toEqual({})
  })

  it('returns siteConfigs from stored doc', async () => {
    mockStorage({ policyDoc: VALID_DOC })
    const configs = await getSiteConfigs()
    expect(configs['chat.acme.com']).toEqual({ inputSelector: '#in', sendButtonSelector: '#send' })
  })

  it('returns {} when storage throws', async () => {
    mockLocalGet.mockRejectedValue(new Error('boom'))
    expect(await getSiteConfigs()).toEqual({})
  })
})
