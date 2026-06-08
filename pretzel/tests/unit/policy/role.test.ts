import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockManagedGet = vi.fn()
const mockLocalGet = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    managed: { get: mockManagedGet },
    local: { get: mockLocalGet },
  },
})

const { getRole } = await import('@/policy/role')

// Use UUID-based token format matching the current production token format:
// ps_live_<uuid>_<32char-secret> and ps_adm_<uuid>_<32char-secret>
// The old slug-based format (ps_live_acmelaw_...) is explicitly rejected by the backend parser.
const MOCK_TENANT_UUID = '3f2a1b9c-4d5e-6789-abcd-ef0123456789'
const ORG_TOKEN   = `ps_live_${MOCK_TENANT_UUID}_${'a'.repeat(32)}`
const ADMIN_TOKEN = `ps_adm_${MOCK_TENANT_UUID}_${'b'.repeat(32)}`

beforeEach(() => {
  vi.clearAllMocks()
  mockManagedGet.mockResolvedValue({})
  mockLocalGet.mockResolvedValue({})
})

describe('getRole', () => {
  it('returns "unregistered" when no tokens are present', async () => {
    expect(await getRole()).toBe('unregistered')
  })

  it('returns "user" when only org token is present (local storage)', async () => {
    mockLocalGet.mockResolvedValue({ orgToken: ORG_TOKEN })
    expect(await getRole()).toBe('user')
  })

  it('returns "admin" when admin token is present (local storage)', async () => {
    mockLocalGet.mockResolvedValue({ orgToken: ORG_TOKEN, adminToken: ADMIN_TOKEN })
    expect(await getRole()).toBe('admin')
  })

  it('returns "admin" when admin token is in managed storage', async () => {
    mockManagedGet.mockResolvedValue({ orgToken: ORG_TOKEN, adminToken: ADMIN_TOKEN })
    expect(await getRole()).toBe('admin')
  })

  it('managed storage org token + local admin token = admin', async () => {
    mockManagedGet.mockResolvedValue({ orgToken: ORG_TOKEN })
    mockLocalGet.mockResolvedValue({ adminToken: ADMIN_TOKEN })
    expect(await getRole()).toBe('admin')
  })

  it('returns "user" when admin token lacks correct prefix', async () => {
    mockLocalGet.mockResolvedValue({ orgToken: ORG_TOKEN, adminToken: 'invalid_token' })
    expect(await getRole()).toBe('user')
  })
})
