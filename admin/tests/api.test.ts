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

describe('api.matters.list', () => {
  it('calls GET /v1/matters with Bearer header', async () => {
    setToken('ps_adm_acme_token')
    mockFetch.mockReturnValueOnce(ok([]))
    await api.matters.list()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters'),
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
    await api.matters.list().catch(e => { thrown = e })
    expect(thrown).toBeInstanceOf(AdminApiError)
    expect((thrown as InstanceType<typeof AdminApiError>).status).toBe(401)
  })
})

describe('api.matters.create', () => {
  it('calls POST /v1/matters with body', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ id: '1', clientName: 'Acme' }))
    await api.matters.create({ clientName: 'Acme', matterNumber: 'AC-001' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clientName: 'Acme', matterNumber: 'AC-001' }),
      })
    )
  })
})

describe('api.matters.update', () => {
  it('calls PATCH /v1/matters/:id', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ id: 'abc', clientName: 'New' }))
    await api.matters.update('abc', { clientName: 'New' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters/abc'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})

describe('api.matters.remove', () => {
  it('calls DELETE /v1/matters/:id', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce({ ok: true, status: 204, json: () => Promise.resolve(undefined), statusText: 'No Content' })
    await api.matters.remove('abc')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters/abc'),
      expect.objectContaining({ method: 'DELETE' })
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
