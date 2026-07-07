import { describe, it, expect, vi, beforeEach } from 'vitest'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { setToken, getToken, clearToken, api, AdminApiError } = await import('../src/api.js')
const { setSelectedTenantId, clearSelectedTenantId } = await import('../src/lib/tenant.js')

function ok(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    statusText: 'OK',
  })
}

function err(status: number, body: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
    statusText: 'Error',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(store).forEach(k => delete store[k])
})

describe('token helpers', () => {
  it('setToken / getToken round-trip', () => {
    setToken('ps_adm_acme_abc123')
    expect(getToken()).toBe('ps_adm_acme_abc123')
  })

  it('clearToken removes the stored token', () => {
    setToken('ps_adm_acme_abc123')
    clearToken()
    expect(getToken()).toBeNull()
  })
})

describe('api.subjects.list', () => {
  it('calls GET /v1/subjects with Bearer header', async () => {
    setToken('ps_adm_acme_token')
    mockFetch.mockReturnValueOnce(ok([]))
    await api.subjects.list()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/subjects'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer ps_adm_acme_token' }),
      })
    )
  })

  it('throws AdminApiError on 401', async () => {
    setToken('bad')
    mockFetch.mockReturnValueOnce(err(401, { error: 'Unauthorized' }))
    let thrown: unknown = null
    await api.subjects.list().catch(e => { thrown = e })
    expect(thrown).toBeInstanceOf(AdminApiError)
    expect((thrown as InstanceType<typeof AdminApiError>).status).toBe(401)
  })
})

describe('api.subjects.create', () => {
  it('calls POST /v1/subjects with body', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ id: '1', name: 'Test Subject' }))
    await api.subjects.create({ name: 'Test Subject' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/subjects'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'Test Subject' }),
      })
    )
  })
})

describe('api.subjects.update', () => {
  it('calls PATCH /v1/subjects/:id', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ id: 'abc', name: 'New' }))
    await api.subjects.update('abc', { name: 'New' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/subjects/abc'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})

describe('api.subjects.remove', () => {
  it('calls DELETE /v1/subjects/:id', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce({ ok: true, status: 204, json: () => Promise.resolve(undefined), statusText: 'No Content' })
    await api.subjects.remove('abc')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/subjects/abc'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})

describe('X-Tenant-Id header', () => {
  it('sends X-Tenant-Id when a selection is set', async () => {
    setToken('tok')
    setSelectedTenantId('tenant_abc')
    mockFetch.mockReturnValueOnce(ok([]))
    await api.subjects.list()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/subjects'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Tenant-Id': 'tenant_abc' }),
      })
    )
  })

  it('omits X-Tenant-Id when no selection is set', async () => {
    setToken('tok')
    clearSelectedTenantId()
    mockFetch.mockReturnValueOnce(ok([]))
    await api.subjects.list()
    const headers = mockFetch.mock.calls[0]![1].headers
    expect(headers).not.toHaveProperty('X-Tenant-Id')
  })

  it('never sends X-Tenant-Id on the memberships call, even with a selection', async () => {
    setToken('tok')
    setSelectedTenantId('tenant_abc')
    mockFetch.mockReturnValueOnce(ok({ memberships: [] }))
    await api.me.memberships()
    const headers = mockFetch.mock.calls[0]![1].headers
    expect(headers).not.toHaveProperty('X-Tenant-Id')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/me/memberships'),
      expect.objectContaining({ method: 'GET' })
    )
  })
})

describe('api.policy.publish', () => {
  it('calls POST /v1/policy/publish', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ version: 3 }))
    const res = await api.policy.publish()
    expect(res.version).toBe(3)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/policy/publish'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('api.policy.rollback', () => {
  it('calls POST /v1/policy/rollback/:version', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ version: 4 }))
    await api.policy.rollback(2)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/policy/rollback/2'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
