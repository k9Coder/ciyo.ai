import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing handlers
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeAllListeners: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
}))

import { ipcMain } from 'electron'
import {
  registerIpcHandlers,
  unregisterIpcHandlers,
  setCurrentPolicy,
  setProxyRunning,
  setSystemProxyActive,
  pushDecisionRequired,
  pushStatusUpdate,
} from '../../electron/ipc-handlers'
import type { Policy } from '@mykka/detect'
import { DEFAULT_POLICY } from '@mykka/detect'

const mockIpcMain = ipcMain as unknown as {
  on: ReturnType<typeof vi.fn>
  handle: ReturnType<typeof vi.fn>
  removeAllListeners: ReturnType<typeof vi.fn>
  removeHandler: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('registerIpcHandlers', () => {
  it('registers decision:respond handler', () => {
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })
    expect(mockIpcMain.on).toHaveBeenCalledWith('decision:respond', expect.any(Function))
  })

  it('registers policy:update handler', () => {
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })
    expect(mockIpcMain.on).toHaveBeenCalledWith('policy:update', expect.any(Function))
  })

  it('registers policy:get handle', () => {
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })
    expect(mockIpcMain.handle).toHaveBeenCalledWith('policy:get', expect.any(Function))
  })

  it('registers proxy:status handle', () => {
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })
    expect(mockIpcMain.handle).toHaveBeenCalledWith('proxy:status', expect.any(Function))
  })
})

describe('unregisterIpcHandlers', () => {
  it('removes all listeners', () => {
    unregisterIpcHandlers()
    expect(mockIpcMain.removeAllListeners).toHaveBeenCalledWith('decision:respond')
    expect(mockIpcMain.removeAllListeners).toHaveBeenCalledWith('policy:update')
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith('policy:get')
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith('proxy:status')
  })
})

describe('decision:respond IPC', () => {
  it('calls onDecision with valid payload', () => {
    const onDecision = vi.fn()
    registerIpcHandlers({ onDecision, onPolicyUpdate: vi.fn() })

    // Extract the handler registered for 'decision:respond'
    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'decision:respond'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { requestId: 'req-1', allow: true })
    expect(onDecision).toHaveBeenCalledWith('req-1', true)
  })

  it('ignores invalid payload (missing requestId)', () => {
    const onDecision = vi.fn()
    registerIpcHandlers({ onDecision, onPolicyUpdate: vi.fn() })

    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'decision:respond'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { allow: true }) // missing requestId
    expect(onDecision).not.toHaveBeenCalled()
  })

  it('ignores non-boolean allow field', () => {
    const onDecision = vi.fn()
    registerIpcHandlers({ onDecision, onPolicyUpdate: vi.fn() })

    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'decision:respond'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { requestId: 'req-2', allow: 'yes' }) // allow is string not boolean
    expect(onDecision).not.toHaveBeenCalled()
  })
})

describe('policy:update IPC', () => {
  it('calls onPolicyUpdate with valid failMode', () => {
    const onPolicyUpdate = vi.fn()
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate })

    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'policy:update'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { failMode: 'closed' })
    expect(onPolicyUpdate).toHaveBeenCalledWith({ failMode: 'closed' })
  })

  it('ignores invalid failMode value', () => {
    const onPolicyUpdate = vi.fn()
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate })

    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'policy:update'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { failMode: 'maybe' })
    expect(onPolicyUpdate).not.toHaveBeenCalled()
  })
})

describe('policy:get handle', () => {
  it('returns null when policy not set', () => {
    setCurrentPolicy(null)
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'policy:get'
    )?.[1] as () => Policy | null

    expect(handler()).toBeNull()
  })

  it('returns current policy when set', () => {
    const policy: Policy = { ...DEFAULT_POLICY }
    setCurrentPolicy(policy)
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'policy:get'
    )?.[1] as () => Policy | null

    expect(handler()).toBe(policy)
  })
})

describe('proxy:status handle', () => {
  it('returns proxyRunning: false when proxy not running', () => {
    setProxyRunning(false)
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'proxy:status'
    )?.[1] as () => { proxyRunning: boolean; systemProxyActive: boolean }

    expect(handler().proxyRunning).toBe(false)
  })

  it('returns proxyRunning: true when proxy running', () => {
    setProxyRunning(true)
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'proxy:status'
    )?.[1] as () => { proxyRunning: boolean; systemProxyActive: boolean }

    expect(handler().proxyRunning).toBe(true)
  })

  it('returns systemProxyActive field', () => {
    setProxyRunning(true)
    setSystemProxyActive(true)
    registerIpcHandlers({ onDecision: vi.fn(), onPolicyUpdate: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'proxy:status'
    )?.[1] as () => { proxyRunning: boolean; systemProxyActive: boolean }

    expect(handler().systemProxyActive).toBe(true)
  })
})

describe('pushDecisionRequired', () => {
  it('sends decision:required to window webContents', () => {
    const mockSend = vi.fn()
    const mockWin = { webContents: { send: mockSend } } as unknown as import('electron').BrowserWindow
    const payload = { requestId: 'r1', hostname: 'chat.openai.com', findings: [] }
    pushDecisionRequired(mockWin, payload)
    expect(mockSend).toHaveBeenCalledWith('decision:required', payload)
  })
})

describe('pushStatusUpdate', () => {
  it('sends status:update to window webContents', () => {
    const mockSend = vi.fn()
    const mockWin = { webContents: { send: mockSend } } as unknown as import('electron').BrowserWindow
    pushStatusUpdate(mockWin, { proxyRunning: true, policyAvailable: false })
    expect(mockSend).toHaveBeenCalledWith('status:update', { proxyRunning: true, policyAvailable: false })
  })
})
