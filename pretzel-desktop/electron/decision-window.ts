/**
 * Decision window manager.
 * Spawns a BrowserWindow for warn/block decisions. Holds proxy request until
 * user responds or the 30s timeout fires in proxy.ts.
 */
import { BrowserWindow, screen } from 'electron'
import path from 'path'
import { pushDecisionRequired } from './ipc-handlers'
import type { ProxyDecisionEvent } from './proxy'

let decisionWin: BrowserWindow | null = null

function getDecisionWin(): BrowserWindow {
  if (decisionWin && !decisionWin.isDestroyed()) return decisionWin

  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  decisionWin = new BrowserWindow({
    width: 480,
    height: 320,
    x: Math.round(width / 2 - 240),
    y: Math.round(height / 2 - 160),
    resizable: false,
    alwaysOnTop: true,
    show: false,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    decisionWin.loadURL('http://localhost:5174/decision-ui/')
  } else {
    decisionWin.loadFile(path.join(__dirname, '../renderer/decision-ui/index.html'))
  }

  decisionWin.on('closed', () => { decisionWin = null })
  return decisionWin
}

/** Show the decision window for a proxy intercept event. */
export function showDecisionWindow(event: ProxyDecisionEvent): void {
  const win = getDecisionWin()
  win.show()
  win.focus()

  pushDecisionRequired(win, {
    requestId: event.requestId,
    hostname: event.hostname,
    findings: event.result.findings,
  })
}

export function closeDecisionWindow(): void {
  if (decisionWin && !decisionWin.isDestroyed()) {
    decisionWin.close()
  }
}
