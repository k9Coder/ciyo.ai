import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Policy, DetectionResult } from '@mykka/detect'

const createDocument = vi.fn()
const getContexts = vi.fn()
const sendMessage = vi.fn()
vi.stubGlobal('chrome', {
  runtime: {
    getContexts, sendMessage,
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
  },
  offscreen: { createDocument, Reason: { WORKERS: 'WORKERS' } },
})

import { submitJudgeShadow, JUDGE_SHADOW_SUBMIT } from '../../../src/background/judge-shadow'
import { handleShadowSubmit, isLowMemory } from '../../../src/offscreen/judge-shadow-host'

const JP = '11111111-1111-4111-8111-111111111111'
const policy = (withJudge: boolean) => ({
  baseline: [],
  custom: withJudge
    ? [{ id: JP, name: 'jp', kind: 'judge_prompt', prompt: 'contains a customer list', enabled: true, enforced: false }]
    : [{ id: 'kw', name: 'kw', kind: 'dictionary', terms: ['x'], enabled: true, enforced: true }],
}) as unknown as Policy
const result = { findings: [] } as unknown as DetectionResult

beforeEach(() => {
  vi.resetAllMocks()
  getContexts.mockResolvedValue([])
  createDocument.mockResolvedValue(undefined)
})

describe('submitJudgeShadow (service worker)', () => {
  it('returns before the offscreen document answers', async () => {
    sendMessage.mockReturnValue(new Promise(() => {}))
    const done = submitJudgeShadow('secret text', policy(true), result)
    await expect(Promise.race([done, new Promise((r) => setTimeout(() => r('timeout'), 200))])).resolves.toBeUndefined()
    await vi.waitFor(() => expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ type: JUDGE_SHADOW_SUBMIT })))
  })

  it('does nothing (no offscreen document) when the policy has no judge_prompt rule', async () => {
    await submitJudgeShadow('x', policy(false), result)
    expect(createDocument).not.toHaveBeenCalled()
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('swallows an offscreen creation failure', async () => {
    createDocument.mockRejectedValue(new Error('quota'))
    await expect(submitJudgeShadow('x', policy(true), result)).resolves.toBeUndefined()
    expect(sendMessage).not.toHaveBeenCalled()
  })
})

describe('offscreen host', () => {
  it('passes the payload to the runner and never throws', () => {
    const runner = { submit: vi.fn(), idle: vi.fn() }
    const payload = { text: 't', rules: [{ id: JP, kind: 'judge_prompt' as const, prompt: 'p' }], primary: { actionByRuleId: {} } }
    handleShadowSubmit(runner, payload)
    expect(runner.submit).toHaveBeenCalledWith('t', payload.rules, payload.primary)
    const bad = { submit: vi.fn(() => { throw new Error('x') }), idle: vi.fn() }
    expect(() => handleShadowSubmit(bad, payload)).not.toThrow()
    expect(() => handleShadowSubmit(runner, null)).not.toThrow()
  })

  it('isLowMemory: deviceMemory under 4 GB is low; unknown is not', () => {
    expect(isLowMemory({ deviceMemory: 2 })).toBe(true)
    expect(isLowMemory({ deviceMemory: 4 })).toBe(false)
    expect(isLowMemory({})).toBe(false)
  })
})
