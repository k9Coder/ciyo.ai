import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShadowFinding } from '@mykka/detect'

vi.mock('../../../src/policy/auth', () => ({ getAuthToken: vi.fn() }))
vi.mock('../../../src/auth/headers', () => ({ buildAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer t' }) }))

import { getAuthToken } from '../../../src/policy/auth'
import { dispatchShadowTelemetry } from '../../../src/events/shadow-dispatch'

describe('dispatchShadowTelemetry', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('does nothing when there are no shadow findings', async () => {
    await dispatchShadowTelemetry([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when signed out', async () => {
    vi.mocked(getAuthToken).mockResolvedValue(null)
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await dispatchShadowTelemetry(findings)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the mapped payload array, fire-and-forget', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('clerk_token')
    const findings: ShadowFinding[] = [
      { ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' },
      { ruleId: 'r2', kind: 'entropy', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' },
    ]
    await dispatchShadowTelemetry(findings)
    expect(fetch).toHaveBeenCalledOnce()
    const [url, init] = vi.mocked(fetch).mock.calls[0]!
    expect(url).toContain('/v1/telemetry/shadow-verdict')
    const body = JSON.parse(init!.body as string)
    expect(body).toHaveLength(2)
    expect(body[0]).toEqual({ ruleId: 'r1', kind: 'keyword', verdict: 'match', confidence: 1, enforced: false, timestamp: '2026-10-07T00:00:00.000Z' })
  })

  it('swallows a fetch failure without throwing', async () => {
    vi.mocked(getAuthToken).mockResolvedValue('clerk_token')
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'score', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await expect(dispatchShadowTelemetry(findings)).resolves.toBeUndefined()
  })
})
