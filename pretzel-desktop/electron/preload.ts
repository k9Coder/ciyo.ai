/**
 * Preload script — exposes a minimal, validated API to renderer via contextBridge.
 * No nodeIntegration; renderer is sandboxed.
 */
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('pretzel', {
  // Decision UI
  onDecisionRequired: (cb: (payload: { requestId: string; hostname: string; findings: unknown[] }) => void) => {
    ipcRenderer.on('decision:required', (_event, payload) => cb(payload))
  },
  respondDecision: (requestId: string, allow: boolean) => {
    ipcRenderer.send('decision:respond', { requestId, allow })
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

  // Policy
  getPolicy: () => ipcRenderer.invoke('policy:get'),
  getProxyStatus: () => ipcRenderer.invoke('proxy:status'),
})
