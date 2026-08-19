import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockLoadSettings, mockSaveSettings, mockCheckForUpdate, mockIsAutoUpdateSupported,
  mockCheckForAutoUpdateAsync, mockDownloadUpdate, mockInstallUpdate } = vi.hoisted(() => ({
  mockLoadSettings: vi.fn(() => ({ hasSeenWalkthrough: false, notifyOnBlock: 'native', notifyOnWarn: 'badge' })),
  mockSaveSettings: vi.fn((_dir: string, patch: object) => ({
    hasSeenWalkthrough: false, notifyOnBlock: 'native', notifyOnWarn: 'badge', ...patch,
  })),
  mockCheckForUpdate: vi.fn(() => Promise.resolve({ current: '1.0.0', latest: null, updateAvailable: false })),
  mockIsAutoUpdateSupported: vi.fn(() => false),
  mockCheckForAutoUpdateAsync: vi.fn(() => Promise.resolve({ current: '1.0.0', latest: '2.0.0', updateAvailable: true })),
  mockDownloadUpdate: vi.fn(),
  mockInstallUpdate: vi.fn(),
}))

// Mock electron before importing handlers
vi.mock('electron', () => ({
  ipcMain: {
    on: vi.fn(),
    handle: vi.fn(),
    removeAllListeners: vi.fn(),
    removeHandler: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  app: { getPath: vi.fn(() => 'C:/fake/userData') },
}))

vi.mock('../../electron/settings', async () => {
  const actual = await vi.importActual('../../electron/settings')
  return { ...actual, loadSettings: mockLoadSettings, saveSettings: mockSaveSettings }
})

vi.mock('../../electron/version-check', async () => {
  const actual = await vi.importActual('../../electron/version-check')
  return { ...actual, checkForUpdate: mockCheckForUpdate }
})

vi.mock('../../electron/auto-update', () => ({
  isAutoUpdateSupported: mockIsAutoUpdateSupported,
  checkForAutoUpdateAsync: mockCheckForAutoUpdateAsync,
  downloadUpdate: mockDownloadUpdate,
  installUpdate: mockInstallUpdate,
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
    registerIpcHandlers({ onDecision: vi.fn() })
    expect(mockIpcMain.on).toHaveBeenCalledWith('decision:respond', expect.any(Function))
  })

  it('registers policy:get handle', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    expect(mockIpcMain.handle).toHaveBeenCalledWith('policy:get', expect.any(Function))
  })

  it('registers proxy:status handle', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    expect(mockIpcMain.handle).toHaveBeenCalledWith('proxy:status', expect.any(Function))
  })
})

describe('unregisterIpcHandlers', () => {
  it('removes all listeners', () => {
    unregisterIpcHandlers()
    expect(mockIpcMain.removeAllListeners).toHaveBeenCalledWith('decision:respond')
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith('policy:get')
    expect(mockIpcMain.removeHandler).toHaveBeenCalledWith('proxy:status')
  })
})

describe('decision:respond IPC', () => {
  it('calls onDecision with valid payload', () => {
    const onDecision = vi.fn()
    registerIpcHandlers({ onDecision })

    // Extract the handler registered for 'decision:respond'
    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'decision:respond'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { requestId: 'req-1', allow: true })
    expect(onDecision).toHaveBeenCalledWith('req-1', true)
  })

  it('ignores invalid payload (missing requestId)', () => {
    const onDecision = vi.fn()
    registerIpcHandlers({ onDecision })

    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'decision:respond'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { allow: true }) // missing requestId
    expect(onDecision).not.toHaveBeenCalled()
  })

  it('ignores non-boolean allow field', () => {
    const onDecision = vi.fn()
    registerIpcHandlers({ onDecision })

    const handler = mockIpcMain.on.mock.calls.find(
      ([channel]) => channel === 'decision:respond'
    )?.[1] as (event: unknown, raw: unknown) => void

    handler({}, { requestId: 'req-2', allow: 'yes' }) // allow is string not boolean
    expect(onDecision).not.toHaveBeenCalled()
  })
})

describe('policy:get handle', () => {
  it('returns null when policy not set', () => {
    setCurrentPolicy(null)
    registerIpcHandlers({ onDecision: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'policy:get'
    )?.[1] as () => Policy | null

    expect(handler()).toBeNull()
  })

  it('returns current policy when set', () => {
    const policy: Policy = { ...DEFAULT_POLICY }
    setCurrentPolicy(policy)
    registerIpcHandlers({ onDecision: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'policy:get'
    )?.[1] as () => Policy | null

    expect(handler()).toBe(policy)
  })
})

describe('proxy:status handle', () => {
  it('returns proxyRunning: false when proxy not running', () => {
    setProxyRunning(false)
    registerIpcHandlers({ onDecision: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'proxy:status'
    )?.[1] as () => { proxyRunning: boolean; systemProxyActive: boolean }

    expect(handler().proxyRunning).toBe(false)
  })

  it('returns proxyRunning: true when proxy running', () => {
    setProxyRunning(true)
    registerIpcHandlers({ onDecision: vi.fn() })

    const handler = mockIpcMain.handle.mock.calls.find(
      ([channel]) => channel === 'proxy:status'
    )?.[1] as () => { proxyRunning: boolean; systemProxyActive: boolean }

    expect(handler().proxyRunning).toBe(true)
  })

  it('returns systemProxyActive field', () => {
    setProxyRunning(true)
    setSystemProxyActive(true)
    registerIpcHandlers({ onDecision: vi.fn() })

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

describe('decision:always-allow IPC', () => {
  it('calls onAlwaysAllow with the ruleId', () => {
    const onAlwaysAllow = vi.fn()
    registerIpcHandlers({ onDecision: vi.fn(), onAlwaysAllow })

    const handler = mockIpcMain.on.mock.calls.find(([c]) => c === 'decision:always-allow')?.[1] as
      (event: unknown, raw: unknown) => void
    handler({}, 'rule-123')
    expect(onAlwaysAllow).toHaveBeenCalledWith('rule-123')
  })

  it('ignores a non-string payload', () => {
    const onAlwaysAllow = vi.fn()
    registerIpcHandlers({ onDecision: vi.fn(), onAlwaysAllow })

    const handler = mockIpcMain.on.mock.calls.find(([c]) => c === 'decision:always-allow')?.[1] as
      (event: unknown, raw: unknown) => void
    handler({}, { ruleId: 'rule-123' })
    expect(onAlwaysAllow).not.toHaveBeenCalled()
  })

  it('is a no-op if no onAlwaysAllow callback was registered', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.on.mock.calls.find(([c]) => c === 'decision:always-allow')?.[1] as
      (event: unknown, raw: unknown) => void
    expect(() => handler({}, 'rule-123')).not.toThrow()
  })
})

describe('update:check handle', () => {
  it('uses the lightweight version check when auto-update is unsupported', async () => {
    mockIsAutoUpdateSupported.mockReturnValue(false)
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.handle.mock.calls.find(([c]) => c === 'update:check')?.[1] as () => Promise<unknown>

    const result = await handler()
    expect(mockCheckForUpdate).toHaveBeenCalled()
    expect(mockCheckForAutoUpdateAsync).not.toHaveBeenCalled()
    expect(result).toEqual({ current: '1.0.0', latest: null, updateAvailable: false, autoUpdateSupported: false })
  })

  it('uses the real electron-updater check when auto-update is supported', async () => {
    mockIsAutoUpdateSupported.mockReturnValue(true)
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.handle.mock.calls.find(([c]) => c === 'update:check')?.[1] as () => Promise<unknown>

    const result = await handler()
    expect(mockCheckForAutoUpdateAsync).toHaveBeenCalled()
    expect(mockCheckForUpdate).not.toHaveBeenCalled()
    expect(result).toEqual({ current: '1.0.0', latest: '2.0.0', updateAvailable: true, autoUpdateSupported: true })
  })
})

describe('update:download / update:install', () => {
  it('update:download calls downloadUpdate', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.on.mock.calls.find(([c]) => c === 'update:download')?.[1] as () => void
    handler()
    expect(mockDownloadUpdate).toHaveBeenCalled()
  })

  it('update:install calls installUpdate', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.on.mock.calls.find(([c]) => c === 'update:install')?.[1] as () => void
    handler()
    expect(mockInstallUpdate).toHaveBeenCalled()
  })
})

describe('settings:get handle', () => {
  it('returns settings loaded from userData', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.handle.mock.calls.find(([c]) => c === 'settings:get')?.[1] as () => unknown
    expect(handler()).toEqual({ hasSeenWalkthrough: false, notifyOnBlock: 'native', notifyOnWarn: 'badge' })
    expect(mockLoadSettings).toHaveBeenCalledWith('C:/fake/userData')
  })
})

describe('settings:set handle', () => {
  it('saves a valid patch', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.handle.mock.calls.find(([c]) => c === 'settings:set')?.[1] as
      (event: unknown, raw: unknown) => unknown

    const result = handler({}, { notifyOnBlock: 'off' })
    expect(mockSaveSettings).toHaveBeenCalledWith('C:/fake/userData', { notifyOnBlock: 'off' })
    expect(result).toMatchObject({ notifyOnBlock: 'off' })
  })

  it('ignores an invalid patch and returns current settings unchanged', () => {
    registerIpcHandlers({ onDecision: vi.fn() })
    const handler = mockIpcMain.handle.mock.calls.find(([c]) => c === 'settings:set')?.[1] as
      (event: unknown, raw: unknown) => unknown

    mockSaveSettings.mockClear()
    const result = handler({}, { notifyOnBlock: 'not-a-real-level' })
    expect(mockSaveSettings).not.toHaveBeenCalled()
    expect(result).toEqual({ hasSeenWalkthrough: false, notifyOnBlock: 'native', notifyOnWarn: 'badge' })
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
