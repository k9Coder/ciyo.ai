/**
 * Regression test for a real bug: the backend wraps the policy in
 * { version, policy: {...}, tenantName, plan } (see backend policy/router.ts),
 * but policy-sync.ts was validating the whole envelope against PolicyDocSchema
 * instead of unwrapping `.policy` first (pretzel/src/policy/sync.ts does this
 * correctly — desktop didn't). That made every fetch fail validation silently,
 * so a signed-in desktop app could never actually load a policy.
 *
 * Uses the REAL @mykka/detect schema/bridge (not mocked) so this test fails
 * for the real reason if the unwrap regresses.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockLoadToken } = vi.hoisted(() => ({
  mockLoadToken: vi.fn(),
}))

vi.mock('../../electron/auth', () => ({
  loadToken: mockLoadToken,
  clearCredentials: vi.fn(),
}))

import { startPolicySync, stopPolicySync } from '../../electron/policy-sync'

const originalFetch = global.fetch

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadToken.mockResolvedValue('pd_test_token')
})

afterEach(() => {
  global.fetch = originalFetch
  stopPolicySync()
})

describe('policy-sync response envelope', () => {
  it('unwraps the backend response envelope and delivers a real policy, including failMode', async () => {
    const backendResponse = {
      version: 3,
      policy: {
        version: 1,
        tenantId: 'tenant-1',
        subjects: [],
        siteConfigs: {},
        failMode: 'closed',
      },
      tenantName: 'Acme',
      plan: 'business',
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => backendResponse,
    }) as any

    const onUpdate = vi.fn()
    startPolicySync(onUpdate)

    // startPolicySync fires an immediate async sync — flush microtasks.
    await new Promise(resolve => setImmediate(resolve))

    expect(onUpdate).toHaveBeenCalledTimes(1)
    expect(onUpdate.mock.calls[0]![0]).toMatchObject({ failMode: 'closed' })
  })
})
