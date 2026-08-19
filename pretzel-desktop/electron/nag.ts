/**
 * Nag manager — prompts unauthenticated users to sign in.
 *
 * Rules:
 *   - If never authenticated: nag immediately on launch, then every 24h
 *   - Once authenticated: never nag again (nag interval cleared)
 *   - Nag = OS native Notification + tray window shown with sign-in prompt
 *   - "Nag" state stored in memory only — persisted authenticated state
 *     lives in auth.ts (auth-state.json + keychain)
 */
import { Notification, BrowserWindow } from 'electron'
import { isAuthenticated } from './auth'

const NAG_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

let nagTimer: ReturnType<typeof setInterval> | null = null
let onSignInRequest: (() => void) | null = null

function showNag(trayWin: BrowserWindow): void {
  // The nag runs on a timer, so the tray window can be gone (app quit, window
  // closed) by the time it fires. Touching a destroyed window throws an uncaught
  // "Object has been destroyed" and crashes the main process — stop nagging and
  // bail instead.
  if (trayWin.isDestroyed()) {
    stopNagging()
    return
  }
  if (isAuthenticated()) {
    stopNagging()
    return
  }

  // OS native notification
  if (Notification.isSupported()) {
    const notif = new Notification({
      title: 'Pretzel Desktop — Protection is off',
      // Accurate, not softened: with no policy loaded, the proxy has nothing
      // to check requests against and forwards everything unexamined — this
      // is genuinely "nothing is protected," not "default rules apply."
      body: "Nothing you send to ChatGPT, Claude, or Gemini is being checked right now. Sign in to load your organisation's policy.",
      urgency: 'normal',
    })
    notif.on('click', () => {
      if (trayWin.isDestroyed()) return
      trayWin.show()
      trayWin.focus()
      onSignInRequest?.()
    })
    notif.show()
  }

  // Also show tray window so user sees the sign-in button immediately on launch
  trayWin.show()
  trayWin.focus()

  // Tell renderer to show sign-in prompt
  if (!trayWin.webContents.isDestroyed()) {
    trayWin.webContents.send('auth:nag')
  }
}

/**
 * Start the nag cycle. Call once on app ready.
 * If already authenticated: no-op.
 * If not: nag immediately then every 24h.
 */
export function startNagging(trayWin: BrowserWindow, options?: { onSignInRequest?: () => void }): void {
  onSignInRequest = options?.onSignInRequest ?? null

  if (isAuthenticated()) return

  // Nag immediately on first launch
  showNag(trayWin)

  // Then repeat every 24h
  nagTimer = setInterval(() => {
    if (isAuthenticated()) {
      stopNagging()
    } else {
      showNag(trayWin)
    }
  }, NAG_INTERVAL_MS)
}

/** Call this after successful sign-in to stop nag cycle. */
export function stopNagging(): void {
  if (nagTimer) {
    clearInterval(nagTimer)
    nagTimer = null
  }
}

/** Exported for testing — resets internal state. */
export function _resetForTest(): void {
  stopNagging()
  onSignInRequest = null
}
