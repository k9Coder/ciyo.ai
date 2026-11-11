import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DEFAULT_POLICY } from '@mykka/detect'
import type { Policy, DetectionResult } from '@mykka/detect'
import type { JudgeShadowRow } from '@mykka/judge-v2'

vi.mock('../../electron/auth', () => ({ loadToken: vi.fn() }))
vi.mock('../../electron/env', () => ({ env: { PRETZEL_API_URL: 'https://api.test' } }))
vi.mock('onnxruntime-node', () => ({}))

import { loadToken } from '../../electron/auth'
import { shadowRulesFrom, primarySummaryFrom, createDesktopShadow, type WorkerLike } from '../../electron/judge-shadow'
import { isLowMemoryDesktop } from '../../electron/judge-shadow-runner'
import { reportJudgeShadow } from '../../electron/report-judge-shadow'
import { submitShadowSafely } from '../../electron/proxy'

const JP_ID = '11111111-1111-4111-8111-111111111111'
const KW_ID = '22222222-2222-4222-8222-222222222222'

const policy: Policy = {
  ...DEFAULT_POLICY,
  baseline: [],
  custom: [
    { id: JP_ID, name: 'jp', description: '', severity: 'high', action: 'block', enabled: true, tags: [], enforced: false,
      kind: 'judge_prompt', prompt: 'contains a customer list' },
    { id: 'off', name: 'jp-off', description: '', severity: 'high', action: 'block', enabled: false, tags: [], enforced: false,
      kind: 'judge_prompt', prompt: 'x' },
    { id: KW_ID, name: 'kw', description: '', severity: 'high', action: 'warn', enabled: true, tags: [], enforced: true,
      kind: 'dictionary', terms: ['banana'], caseSensitive: false },
    { id: 'pat', name: 'pat', description: '', severity: 'high', action: 'block', enabled: true, tags: [], enforced: true,
      kind: 'pattern', pattern: 'x', flags: 'gi', validator: 'none', scope: 'all' },
    { id: 'ent', name: 'ent', description: '', severity: 'high', action: 'block', enabled: true, tags: [], enforced: false,
      kind: 'entropy', minTokenLength: 24, minBitsPerChar: 4 },
  ],
} as Policy

const result = (findings: { ruleId: string; action: string }[]): DetectionResult => ({
  findings: findings.map((f) => ({ ...f, ruleName: f.ruleId, severity: 'high', matchedText: 'm', startOffset: 0, endOffset: 1 })),
  shadowFindings: [], highestAction: 'log', promptHash: 'h', detectedAtMs: 0, durationMs: 0,
} as unknown as DetectionResult)

describe('desktop judge shadow — policy and primary mapping', () => {
  it('maps enabled judge_prompt (with prompt), keyword and pattern rules; drops disabled, entropy and score', () => {
    expect(shadowRulesFrom(policy)).toEqual([
      { id: JP_ID, kind: 'judge_prompt', prompt: 'contains a customer list' },
      { id: KW_ID, kind: 'keyword' },
      { id: 'pat', kind: 'pattern' },
    ])
  })

  it('maps primary findings to actions; require_confirmation counts as warn', () => {
    expect(primarySummaryFrom(result([{ ruleId: KW_ID, action: 'warn' }, { ruleId: 'pat', action: 'require_confirmation' }, { ruleId: 'x', action: 'block' }])))
      .toEqual({ actionByRuleId: { [KW_ID]: 'warn', pat: 'warn', x: 'block' } })
  })
})

describe('submitShadowSafely', () => {
  it('returns synchronously and never throws, even when the shadow hook throws', () => {
    const hook = vi.fn(() => { throw new Error('boom') })
    expect(() => submitShadowSafely(hook, 'body', policy, result([]))).not.toThrow()
    expect(hook).toHaveBeenCalledOnce()
  })

  it('does nothing without a hook', () => {
    expect(() => submitShadowSafely(null, 'body', policy, result([]))).not.toThrow()
  })
})

describe('reportJudgeShadow', () => {
  const row = (i: number): JudgeShadowRow => ({ checkId: JP_ID, surface: 'desktop', ruleId: JP_ID, ruleKind: 'judge_prompt', primaryAction: 'none',
    secondaryVerdict: 'ok', fastScore: 0.1, secondScore: null, spanStart: null, spanEnd: null, messageChars: i, windows: 0, latencyMs: 1,
    modelVersion: 'fast_v7+so_v7', occurredAt: '2026-11-11T00:00:00.000Z' })

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  })

  it('posts batches of at most 100 rows to /v1/telemetry/judge-shadow', async () => {
    vi.mocked(loadToken).mockResolvedValue('pd_tok')
    await reportJudgeShadow(Array.from({ length: 230 }, (_, i) => row(i)))
    expect(fetch).toHaveBeenCalledTimes(3)
    const sizes = vi.mocked(fetch).mock.calls.map((c) => JSON.parse(c[1]!.body as string).length)
    expect(sizes).toEqual([100, 100, 30])
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://api.test/v1/telemetry/judge-shadow')
  })

  it('does nothing without a token or rows, and swallows network errors', async () => {
    vi.mocked(loadToken).mockResolvedValue(null)
    await reportJudgeShadow([row(1)])
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(loadToken).mockResolvedValue('pd_tok')
    await reportJudgeShadow([])
    expect(fetch).not.toHaveBeenCalled()
    vi.mocked(fetch).mockRejectedValue(new Error('offline'))
    await expect(reportJudgeShadow([row(1)])).resolves.toBeUndefined()
  })
})

class FakeWorker implements WorkerLike {
  posted: unknown[] = []
  listeners: Record<string, ((v: unknown) => void)[]> = {}
  throwOnPost = false
  postMessage(m: unknown) { if (this.throwOnPost) throw new Error('worker gone'); this.posted.push(m) }
  on(ev: string, fn: (v: unknown) => void) { (this.listeners[ev] ??= []).push(fn); return this }
  emit(ev: string, v: unknown) { for (const fn of this.listeners[ev] ?? []) fn(v) }
}

describe('createDesktopShadow (main process side; inference runs in a worker thread)', () => {
  it('spawns no worker for a policy without judge_prompt rules', () => {
    const spawn = vi.fn(() => new FakeWorker())
    const s = createDesktopShadow({ spawn, report: vi.fn() })
    const noJudge = { ...policy, custom: policy.custom.filter((r) => r.kind !== 'judge_prompt') } as Policy
    s.prepare(noJudge)
    s.submit('body', noJudge, result([]))
    expect(spawn).not.toHaveBeenCalled()
  })

  it('posts the job to the worker (text, mapped rules, primary) and forwards rows back to report', () => {
    const w = new FakeWorker(); const report = vi.fn()
    const s = createDesktopShadow({ spawn: () => w, report })
    s.submit('body text', policy, result([{ ruleId: KW_ID, action: 'warn' }]))
    expect(w.posted).toEqual([{ type: 'submit', text: 'body text', rules: shadowRulesFrom(policy), primary: { actionByRuleId: { [KW_ID]: 'warn' } } }])
    w.emit('message', { type: 'rows', rows: [{ ruleId: JP_ID }] })
    expect(report).toHaveBeenCalledWith([{ ruleId: JP_ID }])
  })

  it('never throws when the worker fails, and respawns after the worker exits', () => {
    const workers: FakeWorker[] = []
    const s = createDesktopShadow({ spawn: () => { const w = new FakeWorker(); workers.push(w); return w }, report: vi.fn() })
    s.prepare(policy)
    expect(workers[0]!.posted).toEqual([{ type: 'prepare' }])
    workers[0]!.throwOnPost = true
    expect(() => s.submit('b', policy, result([]))).not.toThrow()
    workers[0]!.emit('exit', 1)
    s.submit('b', policy, result([]))
    expect(workers.length).toBe(2)
    expect(workers[1]!.posted[0]).toMatchObject({ type: 'submit', text: 'b' })
  })

  it('a spawn failure is swallowed', () => {
    const s = createDesktopShadow({ spawn: () => { throw new Error('no worker') }, report: vi.fn() })
    expect(() => s.submit('b', policy, result([]))).not.toThrow()
  })
})

describe('isLowMemoryDesktop', () => {
  it('uses total RAM (macOS free memory excludes cache): under 4 GiB is low', () => {
    expect(isLowMemoryDesktop(2 * 2 ** 30)).toBe(true)
    expect(isLowMemoryDesktop(4 * 2 ** 30)).toBe(false)
    expect(isLowMemoryDesktop(16 * 2 ** 30)).toBe(false)
  })
})
