/**
 * Preload script — exposes a minimal, validated API to renderer via contextBridge.
 * No nodeIntegration; renderer is sandboxed.
 */
import { contextBridge, ipcRenderer } from 'electron'
import type { AutoUpdateEvent as AutoUpdateEventPayload } from './auto-update'
import type { ActivityEntry as ActivityEntryPayload } from './activity-log'

contextBridge.exposeInMainWorld('pretzel', {
  // Decision UI
  onDecisionRequired: (cb: (payload: { requestId: string; hostname: string; findings: unknown[] }) => void) => {
    ipcRenderer.on('decision:required', (_event, payload) => cb(payload))
  },
  // Signals that the decision renderer's listener is registered, so the main
  // process can (re)send a pending decision without racing React mount.
  decisionReady: () => {
    ipcRenderer.send('decision:ready')
  },
  respondDecision: (requestId: string, allow: boolean) => {
    ipcRenderer.send('decision:respond', { requestId, allow })
  },
  alwaysAllowRule: (ruleId: string) => {
    ipcRenderer.send('decision:always-allow', ruleId)
  },

  // Status (tray UI)
  onStatusUpdate: (cb: (status: { proxyRunning: boolean; policyAvailable: boolean; systemProxyActive?: boolean }) => void) => {
    ipcRenderer.on('status:update', (_event, status) => cb(status))
  },

  // Auth
  onAuthNag: (cb: () => void) => {
    ipcRenderer.on('auth:nag', () => cb())
  },
  onAuthSuccess: (cb: () => void) => {
    ipcRenderer.on('auth:success', () => cb())
  },
  onAuthError: (cb: (msg: string) => void) => {
    ipcRenderer.on('auth:error', (_event, msg: string) => cb(msg))
  },
  signIn: () => {
    ipcRenderer.send('auth:sign-in')
  },
  cancelSignIn: () => {
    ipcRenderer.send('auth:cancel')
  },

  // Policy
  getPolicy: () => ipcRenderer.invoke('policy:get'),
  getProxyStatus: () => ipcRenderer.invoke('proxy:status'),

  // Window chrome (tray UI has none of its own — frame: false)
  hideWindow: () => ipcRenderer.send('window:hide'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:set', patch),

  // Recent activity (local, in-memory — see activity-log.ts)
  getRecentActivity: () => ipcRenderer.invoke('activity:list'),
  onActivityUpdate: (cb: (entries: ActivityEntryPayload[]) => void) => {
    ipcRenderer.on('activity:update', (_event, entries) => cb(entries))
  },

  // Updates
  checkForUpdate: (): Promise<{
    current: string; latest: string | null; updateAvailable: boolean; autoUpdateSupported: boolean
  }> => ipcRenderer.invoke('update:check'),
  openDownloadPage: () => ipcRenderer.send('update:open-download'),
  onUpdateAvailable: (cb: (payload: { current: string; latest: string }) => void) => {
    ipcRenderer.on('update:available', (_event, payload) => cb(payload))
  },

  // In-app auto-update (win32 only — no-ops elsewhere, see auto-update.ts)
  downloadUpdate: () => ipcRenderer.send('update:download'),
  installUpdate: () => ipcRenderer.send('update:install'),
  onAutoUpdateStatus: (cb: (event: AutoUpdateEventPayload) => void) => {
    ipcRenderer.on('update:auto-status', (_event, payload) => cb(payload))
  },

  // QA-only: trigger the decision window with a synthetic finding. The main
  // process only honours this when PRETZEL_E2E=1 (see main.ts), so it is a
  // no-op in real builds.
  triggerE2eDecision: () => ipcRenderer.send('e2e:trigger-decision'),
})
