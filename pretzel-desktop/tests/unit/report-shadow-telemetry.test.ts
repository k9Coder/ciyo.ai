import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ShadowFinding } from '@mykka/detect'

vi.mock('../../electron/auth', () => ({ loadToken: vi.fn() }))
vi.mock('../../electron/env', () => ({ env: { PRETZEL_API_URL: 'https://api.test' } }))

import { loadToken } from '../../electron/auth'
import { reportShadowTelemetry } from '../../electron/report-shadow-telemetry'

describe('reportShadowTelemetry', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('does nothing when there are no shadow findings', async () => {
    await reportShadowTelemetry([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('does nothing when there is no stored token', async () => {
    vi.mocked(loadToken).mockResolvedValue(null)
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await reportShadowTelemetry(findings)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('posts the mapped payload array to the shadow-verdict endpoint', async () => {
    vi.mocked(loadToken).mockResolvedValue('pd_test_token')
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'dictionary', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await reportShadowTelemetry(findings)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test/v1/telemetry/shadow-verdict',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0]![1]!.body as string)
    expect(body).toEqual([{ ruleId: 'r1', kind: 'keyword', verdict: 'match', confidence: 1, enforced: false, timestamp: '2026-10-07T00:00:00.000Z' }])
  })

  it('swallows a fetch failure without throwing', async () => {
    vi.mocked(loadToken).mockResolvedValue('pd_test_token')
    vi.mocked(fetch).mockRejectedValue(new Error('network down'))
    const findings: ShadowFinding[] = [{ ruleId: 'r1', kind: 'pattern', verdict: 'match', confidence: 1, timestamp: '2026-10-07T00:00:00.000Z' }]
    await expect(reportShadowTelemetry(findings)).resolves.toBeUndefined()
  })
})
