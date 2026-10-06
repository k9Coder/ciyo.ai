/**
 * Unit tests for auto-update.ts. electron-updater's autoUpdater mocked —
 * no real update feed hit, no real install.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { mockAutoUpdater } = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  return {
    mockAutoUpdater: {
      autoDownload: true,
      autoInstallOnAppQuit: true,
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => { listeners.set(event, cb) }),
      emit: (event: string, ...args: unknown[]) => listeners.get(event)?.(...args),
      checkForUpdates: vi.fn((): Promise<{ updateInfo: { version: string } } | void> => Promise.resolve()),
      downloadUpdate: vi.fn(() => Promise.resolve()),
      quitAndInstall: vi.fn(),
    },
  }
})

vi.mock('electron-updater', () => ({ autoUpdater: mockAutoUpdater }))
vi.mock('electron', () => ({ app: { getVersion: () => '1.0.0' } }))

import {
  isAutoUpdateSupported,
  initAutoUpdate,
  checkForAutoUpdateAsync,
  downloadUpdate,
  installUpdate,
  _resetAutoUpdateForTest,
} from '../../electron/auto-update'

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}
const realPlatform = process.platform

beforeEach(() => {
  vi.clearAllMocks()
  _resetAutoUpdateForTest()
})
afterEach(() => setPlatform(realPlatform))

describe('isAutoUpdateSupported', () => {
  it('true on win32', () => {
    setPlatform('win32')
    expect(isAutoUpdateSupported()).toBe(true)
  })

  it('false on darwin (unsigned build — Gatekeeper blocks it)', () => {
    setPlatform('darwin')
    expect(isAutoUpdateSupported()).toBe(false)
  })

  it('false on linux', () => {
    setPlatform('linux')
    expect(isAutoUpdateSupported()).toBe(false)
  })
})

describe('initAutoUpdate (win32)', () => {
  beforeEach(() => setPlatform('win32'))

  it('disables autoDownload and autoInstallOnAppQuit — user confirms both steps', () => {
    initAutoUpdate(vi.fn())
    expect(mockAutoUpdater.autoDownload).toBe(false)
    expect(mockAutoUpdater.autoInstallOnAppQuit).toBe(false)
  })

  it('forwards checking-for-update', () => {
    const onEvent = vi.fn()
    initAutoUpdate(onEvent)
    mockAutoUpdater.emit('checking-for-update')
    expect(onEvent).toHaveBeenCalledWith({ kind: 'checking' })
  })

  it('forwards update-available with version', () => {
    const onEvent = vi.fn()
    initAutoUpdate(onEvent)
    mockAutoUpdater.emit('update-available', { version: '1.2.3' })
    expect(onEvent).toHaveBeenCalledWith({ kind: 'available', version: '1.2.3' })
  })

  it('forwards download-progress with rounded percent', () => {
    const onEvent = vi.fn()
    initAutoUpdate(onEvent)
    mockAutoUpdater.emit('download-progress', { percent: 42.7 })
    expect(onEvent).toHaveBeenCalledWith({ kind: 'downloading', percent: 43 })
  })

  it('forwards update-downloaded with version', () => {
    const onEvent = vi.fn()
    initAutoUpdate(onEvent)
    mockAutoUpdater.emit('update-downloaded', { version: '1.2.3' })
    expect(onEvent).toHaveBeenCalledWith({ kind: 'downloaded', version: '1.2.3' })
  })

  it('forwards error with message', () => {
    const onEvent = vi.fn()
    initAutoUpdate(onEvent)
    mockAutoUpdater.emit('error', new Error('feed unreachable'))
    expect(onEvent).toHaveBeenCalledWith({ kind: 'error', message: 'feed unreachable' })
  })

  it('only wires listeners once even if called twice', () => {
    initAutoUpdate(vi.fn())
    initAutoUpdate(vi.fn())
    expect(mockAutoUpdater.on).toHaveBeenCalledTimes(6) // one call per event type, not 12
  })
})

describe('initAutoUpdate (darwin) — no-op', () => {
  it('does not wire any listeners', () => {
    setPlatform('darwin')
    initAutoUpdate(vi.fn())
    expect(mockAutoUpdater.on).not.toHaveBeenCalled()
  })
})

describe('checkForAutoUpdateAsync', () => {
  it('resolves with the real update info on win32', async () => {
    setPlatform('win32')
    mockAutoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '2.0.0' } })
    const result = await checkForAutoUpdateAsync()
    expect(result).toEqual({ current: '1.0.0', latest: '2.0.0', updateAvailable: true })
  })

  it('updateAvailable is false when latest is not newer', async () => {
    setPlatform('win32')
    mockAutoUpdater.checkForUpdates.mockResolvedValue({ updateInfo: { version: '1.0.0' } })
    const result = await checkForAutoUpdateAsync()
    expect(result.updateAvailable).toBe(false)
  })

  it('is a no-op returning no update on darwin, never calling electron-updater', async () => {
    setPlatform('darwin')
    const result = await checkForAutoUpdateAsync()
    expect(result).toEqual({ current: '1.0.0', latest: null, updateAvailable: false })
    expect(mockAutoUpdater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('never throws — resolves to no update available on failure', async () => {
    setPlatform('win32')
    mockAutoUpdater.checkForUpdates.mockRejectedValue(new Error('feed unreachable'))
    await expect(checkForAutoUpdateAsync()).resolves.toEqual({
      current: '1.0.0', latest: null, updateAvailable: false,
    })
  })
})

describe('downloadUpdate / installUpdate', () => {
  it('downloadUpdate calls through on win32', () => {
    setPlatform('win32')
    downloadUpdate()
    expect(mockAutoUpdater.downloadUpdate).toHaveBeenCalled()
  })

  it('downloadUpdate is a no-op on darwin', () => {
    setPlatform('darwin')
    downloadUpdate()
    expect(mockAutoUpdater.downloadUpdate).not.toHaveBeenCalled()
  })

  it('installUpdate calls through on win32', () => {
    setPlatform('win32')
    installUpdate()
    expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled()
  })

  it('installUpdate is a no-op on darwin', () => {
    setPlatform('darwin')
    installUpdate()
    expect(mockAutoUpdater.quitAndInstall).not.toHaveBeenCalled()
  })
})
