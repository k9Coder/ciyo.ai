/**
 * Decision window manager.
 * Spawns a BrowserWindow for warn/block decisions. Holds proxy request until
 * user responds or the 30s timeout fires in proxy.ts.
 */
import { BrowserWindow, screen, ipcMain } from 'electron'
import path from 'path'
import { pushDecisionRequired } from './ipc-handlers'
import type { ProxyDecisionEvent } from './proxy'

let decisionWin: BrowserWindow | null = null
let lastEvent: ProxyDecisionEvent | null = null
let rendererReady = false

function pushEvent(win: BrowserWindow, event: ProxyDecisionEvent): void {
  pushDecisionRequired(win, {
    requestId: event.requestId,
    hostname: event.hostname,
    findings: event.result.findings,
  })
}

// The decision renderer registers its onDecisionRequired listener inside a
// React effect, i.e. only after it has mounted. showDecisionWindow() used to
// push the finding synchronously right after win.show(), which for a
// freshly-created window landed before the listener existed and was dropped —
// so the FIRST block/warn left the window stuck on "Waiting for policy
// decision...". The renderer now emits 'decision:ready' once its listener is
// live; we (re)send the pending event then.
ipcMain.on('decision:ready', () => {
  rendererReady = true
  if (lastEvent && decisionWin && !decisionWin.isDestroyed()) {
    pushEvent(decisionWin, lastEvent)
  }
})

function getDecisionWin(): BrowserWindow {
  if (decisionWin && !decisionWin.isDestroyed()) return decisionWin

  rendererReady = false
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const winWidth = 520
  const winHeight = 400
  decisionWin = new BrowserWindow({
    width: winWidth,
    height: winHeight,
    x: Math.round(width / 2 - winWidth / 2),
    y: Math.round(height / 2 - winHeight / 2),
    resizable: false,
    alwaysOnTop: true,
    show: false,
    frame: false,
    roundedCorners: true,
    backgroundColor: '#0b0e16',
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
    decisionWin.loadFile(path.join(__dirname, '../dist/renderer/decision-ui/index.html'))
  }

  decisionWin.on('closed', () => { decisionWin = null; rendererReady = false })
  return decisionWin
}

/** Show the decision window for a proxy intercept event. */
export function showDecisionWindow(event: ProxyDecisionEvent): void {
  lastEvent = event
  const win = getDecisionWin()
  win.show()
  win.focus()

  // If the renderer is already mounted (window reused for a later decision),
  // push now; otherwise the 'decision:ready' handshake above replays it.
  if (rendererReady) pushEvent(win, event)
}

/**
 * Hide the decision window once its decision has been resolved (Block /
 * Allow / Always allow). Nothing called this before — the window used to
 * just sit there after every click, showing an empty "Waiting for policy
 * decision…" placeholder until the user noticed and dismissed it manually,
 * or the next decision happened to arrive and overwrite it.
 *
 * `.hide()`, not `.close()` (see closeDecisionWindow below) — this fires on
 * every single decision, so keeping the window (and its loaded renderer)
 * warm for the next one avoids a full destroy+recreate+reload cycle each
 * time, same tradeoff the tray window already makes.
 */
export function hideDecisionWindow(): void {
  if (decisionWin && !decisionWin.isDestroyed()) {
    decisionWin.hide()
  }
}

export function closeDecisionWindow(): void {
  if (decisionWin && !decisionWin.isDestroyed()) {
    decisionWin.close()
  }
}
