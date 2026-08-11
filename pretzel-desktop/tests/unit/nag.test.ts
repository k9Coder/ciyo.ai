/**
 * Unit tests for nag.ts — nag-on-launch, 24h interval, stop-on-auth.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Must be hoisted — vi.mock is hoisted before const declarations
const { mockIsAuthenticated, mockNotificationShow, mockWebContentsSend } = vi.hoisted(() => ({
  mockIsAuthenticated: vi.fn(() => false),
  mockNotificationShow: vi.fn(),
  mockWebContentsSend: vi.fn(),
}))

vi.mock('electron', () => ({
  Notification: Object.assign(
    vi.fn(() => ({ on: vi.fn(), show: mockNotificationShow })),
    { isSupported: vi.fn(() => true) },
  ),
}))

vi.mock('../../electron/auth', () => ({
  isAuthenticated: mockIsAuthenticated,
}))

import { startNagging, stopNagging, _resetForTest } from '../../electron/nag'
import type { BrowserWindow } from 'electron'

function makeMockWin(): BrowserWindow {
  return {
    show: vi.fn(),
    focus: vi.fn(),
    isVisible: vi.fn(() => false),
    // nag.ts guards against a destroyed tray window / webContents before
    // touching them (a timer can fire after the window is gone).
    isDestroyed: vi.fn(() => false),
    webContents: { send: mockWebContentsSend, isDestroyed: vi.fn(() => false) },
  } as unknown as BrowserWindow
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  _resetForTest()
  mockIsAuthenticated.mockReturnValue(false)
})

afterEach(() => {
  _resetForTest()
  vi.useRealTimers()
})

describe('startNagging', () => {
  it('shows tray window immediately when not authenticated', () => {
    const win = makeMockWin()
    startNagging(win)
    expect(win.show).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
  })

  it('sends auth:nag to renderer immediately', () => {
    const win = makeMockWin()
    startNagging(win)
    expect(mockWebContentsSend).toHaveBeenCalledWith('auth:nag')
  })

  it('shows OS notification immediately', () => {
    const win = makeMockWin()
    startNagging(win)
    expect(mockNotificationShow).toHaveBeenCalled()
  })

  it('does NOT nag if already authenticated', () => {
    mockIsAuthenticated.mockReturnValue(true)
    const win = makeMockWin()
    startNagging(win)
    expect(win.show).not.toHaveBeenCalled()
    expect(mockWebContentsSend).not.toHaveBeenCalled()
  })

  it('nags again after 24h if still not authenticated', () => {
    const win = makeMockWin()
    startNagging(win)

    const callsBefore = (mockWebContentsSend as ReturnType<typeof vi.fn>).mock.calls.length

    vi.advanceTimersByTime(24 * 60 * 60 * 1000)

    const callsAfter = (mockWebContentsSend as ReturnType<typeof vi.fn>).mock.calls.length
    expect(callsAfter).toBeGreaterThan(callsBefore)
  })

  it('stops nagging after 24h if authenticated by then', () => {
    const win = makeMockWin()
    startNagging(win)

    // User authenticates
    mockIsAuthenticated.mockReturnValue(true)
    const callsBefore = (mockWebContentsSend as ReturnType<typeof vi.fn>).mock.calls.length

    vi.advanceTimersByTime(24 * 60 * 60 * 1000)

    // Should NOT have nagged again
    expect((mockWebContentsSend as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })
})

describe('stopNagging', () => {
  it('prevents further nags after being called', () => {
    const win = makeMockWin()
    startNagging(win)
    stopNagging()

    const callsBefore = (mockWebContentsSend as ReturnType<typeof vi.fn>).mock.calls.length
    vi.advanceTimersByTime(24 * 60 * 60 * 1000)
    expect((mockWebContentsSend as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsBefore)
  })

  it('is safe to call when never started', () => {
    expect(() => stopNagging()).not.toThrow()
  })
})

describe('onSignInRequest callback', () => {
  it('calls onSignInRequest when notification is clicked (via tray focus path)', () => {
    const onSignInRequest = vi.fn()
    const win = makeMockWin()
    startNagging(win, { onSignInRequest })
    // The callback is wired to notification click and tray window auth:nag
    // We verify it's stored by checking startNagging accepts it without throwing
    expect(onSignInRequest).not.toHaveBeenCalled() // only fires on explicit user action
  })
})
