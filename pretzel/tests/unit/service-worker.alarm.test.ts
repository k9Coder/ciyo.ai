import { describe, it, expect, vi } from 'vitest'

const mockCheck = vi.fn().mockResolvedValue(undefined)
const mockSync  = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/background/update-check', () => ({ checkForUpdates: mockCheck }))
vi.mock('../../src/policy/sync',             () => ({ syncPolicy: mockSync }))
vi.mock('../../src/policy/loader',           () => ({ loadPolicy: vi.fn().mockResolvedValue({}) }))
vi.mock('../../src/detection/engine',        () => ({ detectPrompt: vi.fn().mockResolvedValue({ findings: [] }) }))
vi.mock('../../src/events/dispatch',         () => ({ dispatchEvents: vi.fn() }))
vi.mock('../../src/scans/dispatch',          () => ({ dispatchScan: vi.fn(), isScanLimitReached: vi.fn().mockResolvedValue(false) }))

const alarmListeners:   Array<(a: { name: string }) => void> = []
const installListeners: Array<(d: { reason: string }) => void> = []

vi.stubGlobal('chrome', {
  runtime: {
    onInstalled: { addListener: (fn: typeof installListeners[0]) => installListeners.push(fn) },
    onMessage:   { addListener: vi.fn() },
  },
  alarms: {
    create:  vi.fn(),
    onAlarm: { addListener: (fn: typeof alarmListeners[0]) => alarmListeners.push(fn) },
  },
  storage: {
    local:   { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
    managed: { get: vi.fn().mockResolvedValue({}) },
  },
})

describe('service-worker alarm wiring', () => {
  it('creates a 2-minute alarm on install and calls syncPolicy once', async () => {
    await import('../../src/background/service-worker')
    installListeners[0]?.({ reason: 'install' })
    expect(chrome.alarms.create).toHaveBeenCalledWith('policy-sync', { periodInMinutes: 2 })
    expect(mockSync).toHaveBeenCalledTimes(1)
  })

  it('calls checkForUpdates (not syncPolicy) when alarm fires', async () => {
    vi.clearAllMocks()
    alarmListeners[0]?.({ name: 'policy-sync' })
    await new Promise(r => setTimeout(r, 0))
    expect(mockCheck).toHaveBeenCalled()
    expect(mockSync).not.toHaveBeenCalled()
  })
})
