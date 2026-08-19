/**
 * IPC channel registry — main ↔ renderer.
 * All messages validated with Zod before acting. Renderer is untrusted.
 */
import { ipcMain, BrowserWindow, shell, app } from 'electron'
import { z } from 'zod'
import type { Policy } from '@mykka/detect'
import { checkForUpdate, DOWNLOAD_URL } from './version-check'
import { loadSettings, saveSettings, SettingsPatchSchema, type Settings } from './settings'
import { isAutoUpdateSupported, checkForAutoUpdateAsync, downloadUpdate, installUpdate } from './auto-update'
import { getRecentActivity, type ActivityEntry } from './activity-log'

const DecisionResponseSchema = z.object({
  requestId: z.string(),
  allow: z.boolean(),
})

type DecisionCallback = (requestId: string, allow: boolean) => void
type SignInCallback = () => void
type CancelSignInCallback = () => void
type AlwaysAllowCallback = (ruleId: string) => void

let onDecision: DecisionCallback | null = null
let onSignIn: SignInCallback | null = null
let onCancelSignIn: CancelSignInCallback | null = null
let onAlwaysAllow: AlwaysAllowCallback | null = null

export function registerIpcHandlers(options: {
  onDecision: DecisionCallback
  onSignIn?: SignInCallback
  onCancelSignIn?: CancelSignInCallback
  onAlwaysAllow?: AlwaysAllowCallback
}): void {
  onDecision = options.onDecision
  onSignIn = options.onSignIn ?? null
  onCancelSignIn = options.onCancelSignIn ?? null
  onAlwaysAllow = options.onAlwaysAllow ?? null

  ipcMain.on('decision:respond', (_event, raw: unknown) => {
    const parsed = DecisionResponseSchema.safeParse(raw)
    if (!parsed.success) return
    onDecision?.(parsed.data.requestId, parsed.data.allow)
  })

  ipcMain.on('auth:sign-in', () => {
    onSignIn?.()
  })

  ipcMain.on('auth:cancel', () => {
    onCancelSignIn?.()
  })

  ipcMain.on('decision:always-allow', (_event, raw: unknown) => {
    if (typeof raw !== 'string' || !raw) return
    onAlwaysAllow?.(raw)
  })

  ipcMain.handle('policy:get', (): Policy | null => {
    // Populated by main.ts after policy sync
    return currentPolicy
  })

  ipcMain.handle('proxy:status', () => ({ proxyRunning, systemProxyActive }))

  // "Check for updates" from the tray UI. On win32 this runs the real
  // electron-updater check (populating its internal state so a later
  // downloadUpdate() actually has something to download); everywhere else
  // it's the existing lightweight version-string check. Either way the
  // renderer gets one consistent shape, plus whether "Download update"
  // means a real in-app download or opening a page. Never throws.
  ipcMain.handle('update:check', async () => {
    const result = isAutoUpdateSupported() ? await checkForAutoUpdateAsync() : await checkForUpdate()
    return { ...result, autoUpdateSupported: isAutoUpdateSupported() }
  })

  // "Download" button on platforms without in-app auto-update (mac/linux,
  // unsigned builds — see auto-update.ts) — open the installer page instead.
  ipcMain.on('update:open-download', () => {
    void shell.openExternal(DOWNLOAD_URL)
  })

  // In-app auto-update (win32 only — both are no-ops elsewhere, see
  // auto-update.ts). Progress/state flows back via the pushed
  // 'update:auto-status' event (see main.ts's initAutoUpdate wiring).
  ipcMain.on('update:download', () => downloadUpdate())
  ipcMain.on('update:install', () => installUpdate())

  ipcMain.handle('activity:list', (): ActivityEntry[] => getRecentActivity())

  ipcMain.handle('settings:get', (): Settings => loadSettings(app.getPath('userData')))

  // Renderer is untrusted — validate the patch shape before merging it into
  // the persisted file rather than trusting whatever object shape it sends.
  ipcMain.handle('settings:set', (_event, raw: unknown): Settings => {
    const parsed = SettingsPatchSchema.safeParse(raw)
    const current = loadSettings(app.getPath('userData'))
    if (!parsed.success) return current
    return saveSettings(app.getPath('userData'), parsed.data)
  })
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('decision:respond')
  ipcMain.removeAllListeners('auth:sign-in')
  ipcMain.removeAllListeners('auth:cancel')
  ipcMain.removeAllListeners('decision:always-allow')
  ipcMain.removeAllListeners('update:open-download')
  ipcMain.removeAllListeners('update:download')
  ipcMain.removeAllListeners('update:install')
  ipcMain.removeHandler('policy:get')
  ipcMain.removeHandler('proxy:status')
  ipcMain.removeHandler('update:check')
  ipcMain.removeHandler('settings:get')
  ipcMain.removeHandler('settings:set')
  ipcMain.removeHandler('activity:list')
}

// State shared between ipc-handlers and main — kept minimal
let currentPolicy: Policy | null = null
let proxyRunning = false
let systemProxyActive = false

export function setCurrentPolicy(policy: Policy | null): void {
  currentPolicy = policy
}

export function setProxyRunning(running: boolean): void {
  proxyRunning = running
}

export function setSystemProxyActive(active: boolean): void {
  systemProxyActive = active
}

/** Push a decision-required event to the decision window renderer. */
export function pushDecisionRequired(
  win: BrowserWindow,
  payload: { requestId: string; hostname: string; findings: unknown[] },
): void {
  win.webContents.send('decision:required', payload)
}

/** Push status update to tray window renderer. */
export function pushStatusUpdate(
  win: BrowserWindow,
  payload: { proxyRunning: boolean; policyAvailable: boolean; systemProxyActive?: boolean },
): void {
  win.webContents.send('status:update', payload)
}

/** Push an "update available" event to the tray renderer (from launch auto-check). */
export function pushUpdateAvailable(
  win: BrowserWindow,
  payload: { current: string; latest: string },
): void {
  win.webContents.send('update:available', payload)
}

/** Push an electron-updater lifecycle event (win32 only — see auto-update.ts) to the tray renderer. */
export function pushAutoUpdateStatus(
  win: BrowserWindow,
  payload: import('./auto-update').AutoUpdateEvent,
): void {
  win.webContents.send('update:auto-status', payload)
}

/** Push the updated recent-activity list to the tray renderer. */
export function pushActivityUpdate(win: BrowserWindow, entries: ActivityEntry[]): void {
  win.webContents.send('activity:update', entries)
}
