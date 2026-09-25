import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'

const { requireAdmin, mockGetLatest, mockCompile } = vi.hoisted(() => ({
  requireAdmin:  vi.fn(async () => {}),
  mockGetLatest: vi.fn(),
  mockCompile:   vi.fn(),
}))

vi.mock('../src/auth/middleware.js', () => ({
  requireOrgTokenOrClerkAuth:    vi.fn(async () => {}),
  requireAdminTokenOrClerkAdmin: requireAdmin,
  requireActiveSubscription:     vi.fn(async () => {}),
}))
vi.mock('../src/policy/service.js', () => ({
  getVersionOnly:  vi.fn(),
  getLatestPolicy: mockGetLatest,
  publishPolicy:   vi.fn(),
  getHistory:      vi.fn(),
  rollback:        vi.fn(),
}))
vi.mock('../src/policy/compiler.js', () => ({ compilePolicy: mockCompile }))
vi.mock('../src/policy/resolver.js', () => ({ resolveMemberPolicy: vi.fn() }))
vi.mock('../src/policy/exceptions.js', () => ({
  addException: vi.fn(), removeException: vi.fn(), getExceptionSummary: vi.fn(),
}))
vi.mock('../src/events/policy-bus.js', () => ({
  policyBus: { emit: vi.fn() },
  policyUpdatedEvent: (id: string) => `policy:updated:${id}`,
}))
vi.mock('../src/db/client.js', () => ({ db: {} }))

async function makeApp() {
  const { policyRouter } = await import('../src/policy/router.js')
  const app = Fastify()
  app.addHook('onRequest', async (req) => {
    ;(req as any).tenant = { id: 't1', name: 'Acme', plan: 'pilot', subscriptionStatus: 'active' }
  })
  await app.register(policyRouter, { prefix: '' })
  return app
}

const emptyDoc = { version: 1, tenantId: 't1', subjects: [], siteConfigs: {}, failMode: 'open' }

describe('GET /policy/draft', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireAdmin.mockImplementation(async () => {})
  })

  it('uses the admin pre-handler', async () => {
    mockGetLatest.mockResolvedValue({ version: 3, policyJson: emptyDoc })
    mockCompile.mockResolvedValue(emptyDoc)
    const app = await makeApp()
    await app.inject({ method: 'GET', url: '/policy/draft' })
    expect(requireAdmin).toHaveBeenCalled()
  })

  it('reports zero changes when the draft matches the live snapshot', async () => {
    mockGetLatest.mockResolvedValue({ version: 3, policyJson: emptyDoc })
    mockCompile.mockResolvedValue(emptyDoc)
    const app = await makeApp()
    const res = await app.inject({ method: 'GET', url: '/policy/draft' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ liveVersion: 3, nextVersion: 4, count: 0, changes: [] })
    expect(mockCompile).toHaveBeenCalledWith('t1')
  })

  it('lists changes made since the live snapshot', async () => {
    mockGetLatest.mockResolvedValue({ version: 12, policyJson: emptyDoc })
    mockCompile.mockResolvedValue({
      ...emptyDoc,
      subjects: [{ id: 's1', name: 'Payments', divisionId: null, teamId: null, rules: [] }],
    })
    const app = await makeApp()
    const body = (await app.inject({ method: 'GET', url: '/policy/draft' })).json()
    expect(body.liveVersion).toBe(12)
    expect(body.nextVersion).toBe(13)
    expect(body.count).toBe(1)
    expect(body.changes[0]).toMatchObject({ kind: 'added', entity: 'subject', title: 'Payments' })
  })

  it('handles a tenant with nothing published yet', async () => {
    mockGetLatest.mockResolvedValue(null)
    mockCompile.mockResolvedValue(emptyDoc)
    const app = await makeApp()
    const body = (await app.inject({ method: 'GET', url: '/policy/draft' })).json()
    expect(body).toEqual({ liveVersion: null, nextVersion: 1, count: 0, changes: [] })
  })
})
