/**
 * Regression: ISSUE-002 — an unanswered prompt used to be resolved by failMode
 * alone, so walking away let a `block` rule's request through after 30s, and
 * nothing told the user it had happened.
 * Found by /qa-desktop on 2026-09-19.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { DetectionResult } from '@mykka/detect'
import {
  PretzelProxy, decideOnTimeout, type ProxyDecisionEvent, type ProxyDecisionTimeoutEvent,
} from '../../electron/proxy'

function detection(highestAction: DetectionResult['highestAction']): DetectionResult {
  return {
    findings: [{
      ruleId: 'r1', ruleName: 'Rule', severity: 'high', action: highestAction as 'block',
      matchedText: 'x', startOffset: 0, endOffset: 1,
    }],
    highestAction, promptHash: 'h', detectedAtMs: 0, durationMs: 0,
  } as DetectionResult
}

function proxyWithFailMode(failMode: 'open' | 'closed') {
  const proxy = new PretzelProxy()
  proxy.setPolicy({ failMode } as never)
  return proxy
}

const ask = (proxy: PretzelProxy, action: DetectionResult['highestAction']) =>
  (proxy as unknown as {
    awaitDecision(host: string, r: DetectionResult): Promise<{ allow: boolean; timedOut: boolean }>
  }).awaitDecision('chatgpt.com', detection(action))

describe('decideOnTimeout', () => {
  it('always blocks a block rule, even when the org is fail-open', () => {
    expect(decideOnTimeout('block', 'open')).toBe('block')
    expect(decideOnTimeout('block', 'closed')).toBe('block')
  })
  it('sends a warn rule when fail-open, blocks it when fail-closed', () => {
    expect(decideOnTimeout('warn', 'open')).toBe('allow')
    expect(decideOnTimeout('warn', 'closed')).toBe('block')
  })
})

describe('awaitDecision timeout', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('blocks an unanswered block rule after 30s under fail-open and announces it', async () => {
    const proxy = proxyWithFailMode('open')
    const timeouts: ProxyDecisionTimeoutEvent[] = []
    proxy.on('decision-timeout', (e: ProxyDecisionTimeoutEvent) => timeouts.push(e))

    const pending = ask(proxy, 'block')
    await vi.advanceTimersByTimeAsync(29_999)
    expect(timeouts).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)

    expect(await pending).toEqual({ allow: false, timedOut: true })
    expect(timeouts).toHaveLength(1)
    expect(timeouts[0]).toMatchObject({ hostname: 'chatgpt.com', allowed: false })
  })

  it('sends an unanswered warn rule under fail-open and announces it', async () => {
    const proxy = proxyWithFailMode('open')
    const timeouts: ProxyDecisionTimeoutEvent[] = []
    proxy.on('decision-timeout', (e: ProxyDecisionTimeoutEvent) => timeouts.push(e))

    const pending = ask(proxy, 'warn')
    await vi.advanceTimersByTimeAsync(30_000)

    expect(await pending).toEqual({ allow: true, timedOut: true })
    expect(timeouts[0]).toMatchObject({ allowed: true })
  })

  it('blocks an unanswered warn rule when the org is fail-closed', async () => {
    const proxy = proxyWithFailMode('closed')
    const pending = ask(proxy, 'warn')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(await pending).toEqual({ allow: false, timedOut: true })
  })

  it('tells the decision window what will happen and when', () => {
    const proxy = proxyWithFailMode('open')
    const events: ProxyDecisionEvent[] = []
    proxy.on('decision-required', (e: ProxyDecisionEvent) => events.push(e))

    void ask(proxy, 'block')
    void ask(proxy, 'warn')
    expect(events.map((e) => e.onTimeout)).toEqual(['block', 'allow'])
    expect(events[0]!.deadlineAt - Date.now()).toBe(30_000)
  })

  it('a real answer before the deadline wins and does not announce a timeout', async () => {
    const proxy = proxyWithFailMode('open')
    const timeouts: ProxyDecisionTimeoutEvent[] = []
    proxy.on('decision-timeout', (e: ProxyDecisionTimeoutEvent) => timeouts.push(e))
    let requestId = ''
    proxy.on('decision-required', (e: ProxyDecisionEvent) => { requestId = e.requestId })

    const pending = ask(proxy, 'block')
    proxy.resolveDecision(requestId, true) // user clicked "Allow anyway"

    expect(await pending).toEqual({ allow: true, timedOut: false })
    await vi.advanceTimersByTimeAsync(60_000)
    expect(timeouts).toHaveLength(0)
  })

  it('shutting down denies held block rules and releases held warn rules', async () => {
    const proxy = proxyWithFailMode('open')
    const blockPending = ask(proxy, 'block')
    const warnPending = ask(proxy, 'warn')
    await proxy.stop()
    expect((await blockPending).allow).toBe(false)
    expect((await warnPending).allow).toBe(true)
  })
})
