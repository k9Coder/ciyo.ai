/**
 * IPC channel registry — main ↔ renderer.
 * All messages validated with Zod before acting. Renderer is untrusted.
 */
import { ipcMain, BrowserWindow, shell } from 'electron'
import { z } from 'zod'
import type { Policy } from '@mykka/detect'
import { checkForUpdate, DOWNLOAD_URL } from './version-check'

const DecisionResponseSchema = z.object({
  requestId: z.string(),
  allow: z.boolean(),
})

type DecisionCallback = (requestId: string, allow: boolean) => void
type SignInCallback = () => void
type CancelSignInCallback = () => void

let onDecision: DecisionCallback | null = null
let onSignIn: SignInCallback | null = null
let onCancelSignIn: CancelSignInCallback | null = null

export function registerIpcHandlers(options: {
  onDecision: DecisionCallback
  onSignIn?: SignInCallback
  onCancelSignIn?: CancelSignInCallback
}): void {
  onDecision = options.onDecision
  onSignIn = options.onSignIn ?? null
  onCancelSignIn = options.onCancelSignIn ?? null

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

  ipcMain.handle('policy:get', (): Policy | null => {
    // Populated by main.ts after policy sync
    return currentPolicy
  })

  ipcMain.handle('proxy:status', () => ({ proxyRunning, systemProxyActive }))

  // Manual "Check for updates" from the tray UI. Returns the same shape the
  // launch auto-check uses; the renderer renders "up to date" / "update
  // available" from it. Never throws (checkForUpdate swallows failures).
  ipcMain.handle('update:check', () => checkForUpdate())

  // "Download" button — open the installer page in the user's browser.
  ipcMain.on('update:open-download', () => {
    void shell.openExternal(DOWNLOAD_URL)
  })
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('decision:respond')
  ipcMain.removeAllListeners('auth:sign-in')
  ipcMain.removeAllListeners('auth:cancel')
  ipcMain.removeAllListeners('update:open-download')
  ipcMain.removeHandler('policy:get')
  ipcMain.removeHandler('proxy:status')
  ipcMain.removeHandler('update:check')
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
