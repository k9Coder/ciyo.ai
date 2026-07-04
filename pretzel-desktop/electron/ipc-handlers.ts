/**
 * IPC channel registry — main ↔ renderer.
 * All messages validated with Zod before acting. Renderer is untrusted.
 */
import { ipcMain, BrowserWindow } from 'electron'
import { z } from 'zod'
import type { Policy } from '@ciyo/detect'

const DecisionResponseSchema = z.object({
  requestId: z.string(),
  allow: z.boolean(),
})

const PolicyUpdateSchema = z.object({
  failMode: z.enum(['open', 'closed']),
})

type DecisionCallback = (requestId: string, allow: boolean) => void
type PolicyUpdateCallback = (update: { failMode: 'open' | 'closed' }) => void
type SignInCallback = () => void

let onDecision: DecisionCallback | null = null
let onPolicyUpdate: PolicyUpdateCallback | null = null
let onSignIn: SignInCallback | null = null

export function registerIpcHandlers(options: {
  onDecision: DecisionCallback
  onPolicyUpdate: PolicyUpdateCallback
  onSignIn?: SignInCallback
}): void {
  onDecision = options.onDecision
  onPolicyUpdate = options.onPolicyUpdate
  onSignIn = options.onSignIn ?? null

  ipcMain.on('decision:respond', (_event, raw: unknown) => {
    const parsed = DecisionResponseSchema.safeParse(raw)
    if (!parsed.success) return
    onDecision?.(parsed.data.requestId, parsed.data.allow)
  })

  ipcMain.on('policy:update', (_event, raw: unknown) => {
    const parsed = PolicyUpdateSchema.safeParse(raw)
    if (!parsed.success) return
    onPolicyUpdate?.(parsed.data)
  })

  ipcMain.on('auth:sign-in', () => {
    onSignIn?.()
  })

  ipcMain.handle('policy:get', (): Policy | null => {
    // Populated by main.ts after policy sync
    return currentPolicy
  })

  ipcMain.handle('proxy:status', () => ({ proxyRunning, systemProxyActive }))
}

export function unregisterIpcHandlers(): void {
  ipcMain.removeAllListeners('decision:respond')
  ipcMain.removeAllListeners('policy:update')
  ipcMain.removeAllListeners('auth:sign-in')
  ipcMain.removeHandler('policy:get')
  ipcMain.removeHandler('proxy:status')
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
