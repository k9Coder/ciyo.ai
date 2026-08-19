/**
 * In-app auto-update via electron-updater — Windows only, deliberately.
 *
 * macOS auto-update has a hard requirement electron-updater can't work
 * around: Gatekeeper refuses to apply an update unless the app is
 * codesigned AND notarized with an Apple Developer ID. This project ships
 * an unsigned macOS beta (see build/electron-builder.yml — no codesign
 * identity configured), so wiring electron-updater there today wouldn't
 * open a real update path, it would just replace one dead end (a download
 * page) with a worse one (a silent or scary failure mid-update). Windows
 * NSIS updates carry no such requirement, so Windows gets the real thing;
 * macOS/Linux keep the existing manual check-then-open-download-page flow
 * (version-check.ts) until this project has a Developer ID to sign with.
 */
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import { compareVersions } from './version-check'

export type AutoUpdateEvent =
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'not-available' }
  | { kind: 'downloading'; percent: number }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string }

export function isAutoUpdateSupported(): boolean {
  return process.platform === 'win32'
}

let wired = false

/**
 * Wire electron-updater's events to a callback. Call once at startup — a
 * no-op on unsupported platforms so callers don't need their own platform
 * check before calling it.
 */
export function initAutoUpdate(onEvent: (e: AutoUpdateEvent) => void): void {
  if (!isAutoUpdateSupported() || wired) return
  wired = true

  // Ask before downloading (a surprise multi-hundred-MB download on a
  // metered connection is bad manners) and before installing (never yank
  // the app out from under someone mid-session).
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => onEvent({ kind: 'checking' }))
  autoUpdater.on('update-available', (info) => onEvent({ kind: 'available', version: info.version }))
  autoUpdater.on('update-not-available', () => onEvent({ kind: 'not-available' }))
  autoUpdater.on('download-progress', (progress) =>
    onEvent({ kind: 'downloading', percent: Math.round(progress.percent) }))
  autoUpdater.on('update-downloaded', (info) => onEvent({ kind: 'downloaded', version: info.version }))
  autoUpdater.on('error', (err) => onEvent({ kind: 'error', message: err.message }))
}

/**
 * Check now and resolve with a version-check.ts-compatible shape, so
 * ipc-handlers.ts can return one consistent response regardless of which
 * platform-specific mechanism actually ran the check. Also populates
 * electron-updater's own internal state, which downloadUpdate() below
 * requires — a bare checkForUpdates() call the UI never awaits would leave
 * that state empty and downloadUpdate() would silently fail. Never throws.
 */
export async function checkForAutoUpdateAsync(): Promise<{
  current: string
  latest: string | null
  updateAvailable: boolean
}> {
  const current = app.getVersion()
  if (!isAutoUpdateSupported()) return { current, latest: null, updateAvailable: false }
  try {
    const result = await autoUpdater.checkForUpdates()
    const latest = result?.updateInfo.version ?? null
    return { current, latest, updateAvailable: !!latest && compareVersions(latest, current) > 0 }
  } catch {
    return { current, latest: null, updateAvailable: false }
  }
}

export function downloadUpdate(): void {
  if (!isAutoUpdateSupported()) return
  autoUpdater.downloadUpdate().catch(() => { /* 'error' event already fired */ })
}

/** Quits the app and installs the already-downloaded update. */
export function installUpdate(): void {
  if (!isAutoUpdateSupported()) return
  autoUpdater.quitAndInstall()
}

/** Test-only: allow re-wiring in a fresh test. */
export function _resetAutoUpdateForTest(): void {
  wired = false
}
