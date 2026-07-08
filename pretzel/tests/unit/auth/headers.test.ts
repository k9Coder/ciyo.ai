import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockLocalGet = vi.fn()

vi.stubGlobal('chrome', {
  storage: {
    local: { get: mockLocalGet },
  },
})

const { buildAuthHeaders } = await import('@/auth/headers')

const CLERK_TOKEN = 'eyJhbGciOiJSUzI1NiJ9.clerk-jwt-payload.sig'
const ORG_TOKEN = 'ps_live_acmelaw_' + 'a'.repeat(32)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('buildAuthHeaders', () => {
  it('includes X-Tenant-Id for a Clerk token when a tenant is selected', async () => {
    mockLocalGet.mockResolvedValue({ selectedTenantId: 'tenant-123' })
    const headers = await buildAuthHeaders(CLERK_TOKEN)
    expect(headers).toEqual({
      Authorization: `Bearer ${CLERK_TOKEN}`,
      'X-Tenant-Id': 'tenant-123',
    })
  })

  it('omits X-Tenant-Id for an org (ps_) token even when a selection exists', async () => {
    mockLocalGet.mockResolvedValue({ selectedTenantId: 'tenant-123' })
    const headers = await buildAuthHeaders(ORG_TOKEN)
    expect(headers).toEqual({ Authorization: `Bearer ${ORG_TOKEN}` })
    expect(headers['X-Tenant-Id']).toBeUndefined()
  })

  it('omits X-Tenant-Id for a Clerk token when no selection exists', async () => {
    mockLocalGet.mockResolvedValue({})
    const headers = await buildAuthHeaders(CLERK_TOKEN)
    expect(headers).toEqual({ Authorization: `Bearer ${CLERK_TOKEN}` })
    expect(headers['X-Tenant-Id']).toBeUndefined()
  })
})
