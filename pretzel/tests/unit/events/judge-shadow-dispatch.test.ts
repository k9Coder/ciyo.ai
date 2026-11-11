import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { JudgeShadowRow } from '@mykka/judge-v2'

const mockToken = vi.hoisted(() => vi.fn<() => Promise<string | null>>())
vi.mock('../../../src/policy/auth', () => ({ getAuthToken: mockToken }))
vi.mock('../../../src/auth/headers', () => ({ buildAuthHeaders: vi.fn(async (t: string) => ({ Authorization: `Bearer ${t}` })) }))
vi.mock('../../../src/shared/constants', () => ({ API_BASE: 'https://api.test' }))

import { dispatchJudgeShadow } from '../../../src/events/judge-shadow-dispatch'

const row = (i: number): JudgeShadowRow => ({
  checkId: '22222222-2222-4222-8222-222222222222', surface: 'extension', ruleId: '11111111-1111-4111-8111-111111111111',
  ruleKind: 'judge_prompt', primaryAction: 'none', secondaryVerdict: 'ok', fastScore: 0.1, secondScore: null,
  spanStart: null, spanEnd: null, messageChars: i, windows: 0, latencyMs: 1, modelVersion: 'fast_v7+so_v7', occurredAt: '2026-11-11T00:00:00.000Z',
})

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
})

describe('dispatchJudgeShadow', () => {
  it('posts batches of at most 100 rows to /v1/telemetry/judge-shadow', async () => {
    mockToken.mockResolvedValue('tok')
    await dispatchJudgeShadow(Array.from({ length: 150 }, (_, i) => row(i)))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1]!.body as string).length)).toEqual([100, 50])
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://api.test/v1/telemetry/judge-shadow')
  })

  it('does nothing signed out or with no rows; network errors never escape', async () => {
    mockToken.mockResolvedValue(null)
    await dispatchJudgeShadow([row(1)])
    expect(fetch).not.toHaveBeenCalled()
    mockToken.mockResolvedValue('tok')
    await dispatchJudgeShadow([])
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    await expect(dispatchJudgeShadow([row(1)])).resolves.toBeUndefined()
  })
})
