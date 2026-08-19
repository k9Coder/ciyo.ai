import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import type { FastifyRequest, FastifyReply } from 'fastify'

// Mock auth middleware — auth is tested in clerk-auth.test.ts; here we test routing behaviour
vi.mock('../src/auth/middleware.js', () => ({
  requireOrgTokenOrClerkAuth:     vi.fn(async () => {}),
  requireAdminTokenOrClerkAdmin:  vi.fn(async () => {}),
  // requireActiveSubscription is NOT mocked — router imports + uses the real one
  requireActiveSubscription: vi.fn(async (req: FastifyRequest, reply: FastifyReply) => {
    const tenant = (req as any).tenant
    if (tenant.subscriptionStatus === 'cancelled') {
      return reply.status(402).send({ error: 'subscription_cancelled' })
    }
    if (tenant.subscriptionStatus === 'past_due') {
      const expired = tenant.gracePeriodEndsAt && tenant.gracePeriodEndsAt < new Date()
      if (expired) return reply.status(402).send({ error: 'subscription_expired' })
    }
  }),
}))

vi.mock('../src/policy/service.js', () => ({
  getVersionOnly:  vi.fn().mockResolvedValue(1),
  getLatestPolicy: vi.fn().mockResolvedValue({
    version: 1,
    policyJson: { version: 1, tenantId: 't1', subjects: [], siteConfigs: {} },
  }),
  publishPolicy: vi.fn().mockResolvedValue(2),
  getHistory:    vi.fn().mockResolvedValue([]),
  rollback:      vi.fn().mockResolvedValue(1),
}))
vi.mock('../src/policy/resolver.js', () => ({
  resolveMemberPolicy: vi.fn().mockImplementation((_t: unknown, _m: unknown, snap: unknown) => snap),
}))
vi.mock('../src/events/policy-bus.js', () => ({
  policyBus: { emit: vi.fn() },
  policyUpdatedEvent: (id: string) => `policy:updated:${id}`,
}))

const { mockAddException, mockRemoveException, mockGetExceptionSummary } = vi.hoisted(() => ({
  mockAddException: vi.fn().mockResolvedValue(undefined),
  mockRemoveException: vi.fn().mockResolvedValue(undefined),
  mockGetExceptionSummary: vi.fn().mockResolvedValue([]),
}))
vi.mock('../src/policy/exceptions.js', () => ({
  addException: mockAddException,
  removeException: mockRemoveException,
  getExceptionSummary: mockGetExceptionSummary,
}))

function makeApp(tenantOverrides: Record<string, unknown> = {}, member: Record<string, unknown> | null = null) {
  const app = Fastify()
  app.addHook('onRequest', async (req) => {
    ;(req as any).tenant = {
      id: 't1', name: 'Acme', plan: 'pro',
      gracePeriodEndsAt: null, subscriptionStatus: 'active',
      ...tenantOverrides,
    }
    ;(req as any).member = member
  })
  // Import inline to use the already-mocked module
  return app
}

async function makeRegisteredApp(
  tenantOverrides: Record<string, unknown> = {},
  member: Record<string, unknown> | null = null,
) {
  const { policyRouter } = await import('../src/policy/router.js')
  const app = makeApp(tenantOverrides, member)
  await app.register(policyRouter, { prefix: '' })
  return app
}

// ── Stub db for last-updates queries ────────────────────────────────────────
vi.mock('../src/db/client.js', () => {
  const mockWhere = vi.fn().mockResolvedValue([{ publishedAt: new Date('2026-01-01T00:00:00Z') }])
  return {
    db: {
      select:  vi.fn().mockReturnValue({ from: vi.fn().mockReturnValue({ where: mockWhere }) }),
    },
  }
})

describe('requireActiveSubscription preHandler', () => {
  it('returns 402 subscription_cancelled', async () => {
    const app = await makeRegisteredApp({ subscriptionStatus: 'cancelled' })
    const res = await app.inject({ method: 'GET', url: '/policy' })
    expect(res.statusCode).toBe(402)
    expect(res.json().error).toBe('subscription_cancelled')
  })

  it('returns 402 subscription_expired when grace period has passed', async () => {
    const app = await makeRegisteredApp({
      subscriptionStatus: 'past_due',
      gracePeriodEndsAt: new Date(Date.now() - 1000),
    })
    const res = await app.inject({ method: 'GET', url: '/policy' })
    expect(res.statusCode).toBe(402)
    expect(res.json().error).toBe('subscription_expired')
  })

  it('returns 200 with warning when still in grace period', async () => {
    const app = await makeRegisteredApp({
      subscriptionStatus: 'past_due',
      gracePeriodEndsAt: new Date(Date.now() + 86_400_000),
    })
    const res = await app.inject({ method: 'GET', url: '/policy' })
    expect(res.statusCode).toBe(200)
    expect(res.json().warning).toBe('subscription_expiring')
  })

  it('returns 200 for active subscription', async () => {
    const app = await makeRegisteredApp()
    const res = await app.inject({ method: 'GET', url: '/policy' })
    expect(res.statusCode).toBe(200)
  })
})

describe('GET /policy/last-updates', () => {
  it('returns { ts } with the last publishedAt epoch', async () => {
    const app = await makeRegisteredApp()
    const res = await app.inject({ method: 'GET', url: '/policy/last-updates' })
    expect(res.statusCode).toBe(200)
    expect(res.json().ts).toBe(new Date('2026-01-01T00:00:00Z').getTime())
  })

  it('returns 402 for cancelled subscription', async () => {
    const app = await makeRegisteredApp({ subscriptionStatus: 'cancelled' })
    const res = await app.inject({ method: 'GET', url: '/policy/last-updates' })
    expect(res.statusCode).toBe(402)
  })
})

describe('POST /policy/exceptions', () => {
  it('requires a member context — org tokens (ps_) have none', async () => {
    const app = await makeRegisteredApp({}, null)
    const res = await app.inject({ method: 'POST', url: '/policy/exceptions', payload: { ruleId: 'r1' } })
    expect(res.statusCode).toBe(400)
    expect(mockAddException).not.toHaveBeenCalled()
  })

  it('requires a ruleId', async () => {
    const app = await makeRegisteredApp({}, { id: 'm1' })
    const res = await app.inject({ method: 'POST', url: '/policy/exceptions', payload: {} })
    expect(res.statusCode).toBe(400)
    expect(mockAddException).not.toHaveBeenCalled()
  })

  it('adds the exception for the authenticated member and tenant', async () => {
    const app = await makeRegisteredApp({}, { id: 'm1' })
    const res = await app.inject({ method: 'POST', url: '/policy/exceptions', payload: { ruleId: 'r1' } })
    expect(res.statusCode).toBe(201)
    expect(mockAddException).toHaveBeenCalledWith('t1', 'm1', 'r1')
  })
})

describe('DELETE /policy/exceptions/:ruleId', () => {
  it('requires a member context', async () => {
    const app = await makeRegisteredApp({}, null)
    const res = await app.inject({ method: 'DELETE', url: '/policy/exceptions/r1' })
    expect(res.statusCode).toBe(400)
    expect(mockRemoveException).not.toHaveBeenCalled()
  })

  it('removes the exception for the authenticated member and tenant', async () => {
    const app = await makeRegisteredApp({}, { id: 'm1' })
    const res = await app.inject({ method: 'DELETE', url: '/policy/exceptions/r1' })
    expect(res.statusCode).toBe(204)
    expect(mockRemoveException).toHaveBeenCalledWith('t1', 'm1', 'r1')
  })
})

describe('GET /policy/exceptions (admin)', () => {
  it('returns the tenant-wide exception summary', async () => {
    mockGetExceptionSummary.mockResolvedValueOnce([
      { ruleId: 'r1', ruleMessage: 'AWS key', memberCount: 3, memberEmails: ['a@x.com', 'b@x.com', 'c@x.com'] },
    ])
    const app = await makeRegisteredApp()
    const res = await app.inject({ method: 'GET', url: '/policy/exceptions' })
    expect(res.statusCode).toBe(200)
    expect(res.json().exceptions).toHaveLength(1)
    expect(res.json().exceptions[0].memberCount).toBe(3)
    expect(mockGetExceptionSummary).toHaveBeenCalledWith('t1')
  })
})
