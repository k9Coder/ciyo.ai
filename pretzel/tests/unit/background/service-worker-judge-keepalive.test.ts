/**
 * Regression: on staging, judge_prompt rules never actually enforced in a
 * real browser. RemoteLocalJudge.isAvailable() only ever got triggered
 * reactively from inside the DETECT message handler, whose promise chain
 * resolves almost immediately — Chrome was tearing the service worker down
 * before the fire-and-forget checkReady() (offscreen doc creation + ping)
 * ever got to run. Unit tests passed because fake timers don't model real
 * MV3 service-worker teardown.
 *
 * Found live via qa-extension on 2026-10-07, confirmed by forcing the exact
 * same sequence through an explicitly-awaited call (always succeeds) vs.
 * the real fire-and-forget path (never completes, even across 8 rapid
 * back-to-back DETECT calls on the same live service worker).
 *
 * Fix: (1) trigger the warm-up at service-worker module top-level — the
 * same place `syncPolicy()` already runs reliably on install — instead of
 * only reactively; (2) the offscreen document holds open a
 * chrome.runtime.connect() port back to the service worker, one of
 * Chrome's documented "don't tear this worker down" signals, so once the
 * document exists the service worker stops getting killed between calls.
 */
import { describe, it, expect, vi } from 'vitest'
import { RemoteLocalJudge } from '../../../src/background/remote-local-judge'

const connectListeners: Array<(port: { name: string }) => void> = []

vi.mock('../../../src/background/update-check', () => ({ checkForUpdates: vi.fn() }))
vi.mock('../../../src/policy/sync',             () => ({ syncPolicy: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../src/policy/loader',           () => ({ loadPolicy: vi.fn().mockResolvedValue({}) }))
vi.mock('../../../src/events/dispatch',         () => ({ dispatchEvents: vi.fn(), getReportingSummary: vi.fn() }))
vi.mock('../../../src/events/shadow-dispatch',  () => ({ dispatchShadowTelemetry: vi.fn() }))
vi.mock('../../../src/scans/dispatch',          () => ({ dispatchScan: vi.fn(), isScanLimitReached: vi.fn().mockResolvedValue(false) }))

vi.stubGlobal('chrome', {
  runtime: {
    onInstalled: { addListener: vi.fn() },
    onMessage:   { addListener: vi.fn() },
    onConnect:   { addListener: (fn: typeof connectListeners[0]) => connectListeners.push(fn) },
    getContexts: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn().mockResolvedValue({ available: false }),
    ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
  },
  alarms: {
    create:  vi.fn(),
    onAlarm: { addListener: vi.fn() },
  },
  offscreen: {
    createDocument: vi.fn().mockResolvedValue(undefined),
    Reason: { WORKERS: 'WORKERS' },
  },
  storage: {
    local:   { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
    managed: { get: vi.fn().mockResolvedValue({}) },
  },
})

describe('service-worker judge warm-up + keepalive wiring', () => {
  it('calls isAvailable() once at module load, not only reactively from DETECT', async () => {
    const spy = vi.spyOn(RemoteLocalJudge.prototype, 'isAvailable').mockReturnValue(false)
    await import('../../../src/background/service-worker')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('registers an onConnect listener for the judge keepalive port', () => {
    expect(connectListeners.length).toBeGreaterThan(0)
  })
})
