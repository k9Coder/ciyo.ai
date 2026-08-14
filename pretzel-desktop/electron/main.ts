/**
 * Electron main process — app lifecycle, system tray, IPC hub.
 */

// A dev/QA harness that spawns this process (e.g. Playwright's electron.launch(),
// or a terminal the user closes) can go away while this process is still
// running, closing the read end of stdout/stderr. Node doesn't guard against
// that by default — the next console.log/error call throws EPIPE, and since
// nothing catches it, it crashes the whole main process. Logging to a pipe
// nobody's reading should be a silent no-op, not a fatal error.
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })

import { app, Tray, Menu, nativeImage, BrowserWindow, ipcMain, Notification, shell } from 'electron'
import path from 'path'
import { proxy, PROXY_PORT, type ProxyDecisionEvent } from './proxy'
import { generateCACert, saveCACertFile, installCACert, isCACertTrusted, storeCAKeyInKeychain, loadCAKeyFromKeychain, type CACert } from './ca'
import {
  registerIpcHandlers,
  setCurrentPolicy,
  setProxyRunning,
  setSystemProxyActive,
  pushStatusUpdate,
  pushUpdateAvailable,
} from './ipc-handlers'
import { checkForUpdate, DOWNLOAD_URL } from './version-check'
import { showDecisionWindow } from './decision-window'
import { activateSystemProxy, restoreSystemProxy } from './system-proxy'
import { isAuthenticated, signIn, cancelSignIn } from './auth'
import { startNagging, stopNagging } from './nag'
import { startPolicySync, stopPolicySync, triggerSync } from './policy-sync'
import forge from 'node-forge'

// Headless CI (bare Xvfb, no GPU) hangs BrowserWindow creation forever
// without these — Chromium's sandbox/GPU init never completes there.
if (process.env.PRETZEL_E2E === '1') {
  app.commandLine.appendSwitch('no-sandbox')
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-software-rasterizer')
  // The default /dev/shm in CI containers/runners is too small for
  // Chromium's shared memory needs — this is what actually crashes the
  // GPU/renderer process on launch, not the GPU flags above alone.
  app.commandLine.appendSwitch('disable-dev-shm-usage')
  app.disableHardwareAcceleration()
}

// Without this, a second launch (e.g. a QA/dev instance started while a
// packaged install is already running) silently shares the same userData/
// Chromium profile as the first — no error, just contention on profile
// files that can stall the second instance's window creation forever with
// no visible cause. Fail fast instead: if another instance already holds
// the lock, quit immediately rather than hang.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}

let tray: Tray | null = null
let trayWin: BrowserWindow | null = null
let ca: CACert | null = null

async function ensureCA(): Promise<CACert> {
  const storedKey = await loadCAKeyFromKeychain()
  const certPath = path.join(app.getPath('userData'), 'pretzel-ca.crt')
  const fs = await import('fs')

  let ca: CACert
  if (storedKey && fs.existsSync(certPath)) {
    const certPem = fs.readFileSync(certPath, 'utf-8')
    ca = { cert: forge.pki.certificateFromPem(certPem), certPem, keyPem: storedKey }
  } else {
    const generated = generateCACert()
    saveCACertFile(generated.certPem)
    await storeCAKeyInKeychain(generated.keyPem)
    ca = generated
  }

  // Ensure the cert is actually trusted every launch — not just when first
  // generated. This self-heals the common case where the very first run
  // couldn't elevate (so the store write was skipped) and every launch since
  // has silently served an untrusted MITM cert (ERR_CERT_AUTHORITY_INVALID).
  // installCACert pops a single native elevation prompt; if the user declines,
  // we log and carry on (proxy works, just untrusted) rather than crash.
  if (!isCACertTrusted()) {
    try {
      await installCACert(certPath)
    } catch (err) {
      console.error('[pretzel-desktop] CA trust install failed or was declined:', err)
    }
  }
  return ca
}

function rebuildTrayMenu(authenticated: boolean): void {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: 'Pretzel Desktop', enabled: false },
    { type: 'separator' },
    { label: 'Open Status', click: () => trayWin?.show() },
    ...(authenticated ? [] : [{
      label: 'Sign in…',
      click: () => handleSignIn(),
    }] as Electron.MenuItemConstructorOptions[]),
    { type: 'separator' as const },
    { label: 'Quit', click: () => app.quit() },
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(authenticated ? 'Pretzel Desktop — Active' : 'Pretzel Desktop — Sign in required')
}

async function handleSignIn(): Promise<void> {
  try {
    await signIn()
    stopNagging()
    rebuildTrayMenu(true)
    // Immediately fetch policy after auth
    await triggerSync()
    trayWin?.webContents.send('auth:success')
  } catch (err) {
    // Log the raw error for debugging, but never surface it to the user —
    // strings like "Token exchange failed: 400" are developer-facing.
    console.error('[pretzel-desktop] Sign-in failed:', err)
    trayWin?.webContents.send('auth:error', "Couldn't sign you in. Please try again.")
  }
}

async function createTrayWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 320,
    height: 480,
    // Playwright's firstWindow() waits on paint/DOM-ready signals that
    // never fire for a window that's never shown — confirmed via multiple
    // closed microsoft/playwright issues (e.g. #13575, #21117). Show it
    // under E2E only; production keeps the real hidden-until-click UX.
    show: process.env.PRETZEL_E2E === '1',
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  try {
    if (isDev) {
      await win.loadURL('http://localhost:5174/tray-ui/')
    } else {
      await win.loadFile(path.join(__dirname, '../dist/renderer/tray-ui/index.html'))
    }
  } catch (err) {
    console.error('[pretzel-desktop] Tray window failed to load:', err)
  }
  return win
}

async function setupTray(authenticated: boolean): Promise<void> {
  // Real OS tray icon needs a tray host (StatusNotifierWatcher/D-Bus on Linux);
  // a bare Xvfb CI display has none, and `new Tray()` blocks indefinitely
  // waiting for it. Skip the OS integration under test, keep the window.
  // (Vite inlines process.env.NODE_ENV at build time, so a dedicated var is
  // used here instead — it's still readable at runtime in the built bundle.)
  if (process.env.PRETZEL_E2E !== '1') {
    const iconPath = path.join(__dirname, '../build/icon.png')
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
  }
  trayWin = await createTrayWindow()

  rebuildTrayMenu(authenticated)

  tray?.on('click', () => {
    if (trayWin?.isVisible()) {
      trayWin.hide()
    } else {
      trayWin?.show()
      trayWin?.focus()
    }
  })
}

async function startProxy(): Promise<void> {
  ca = await ensureCA()
  proxy.setCA(ca)
  await proxy.start()
  setProxyRunning(true)

  proxy.on('decision-required', (event: ProxyDecisionEvent) => {
    showDecisionWindow(event)
  })

  activateSystemProxy(PROXY_PORT)
  setSystemProxyActive(true)
  console.log(`[pretzel-desktop] Proxy listening on 127.0.0.1:${PROXY_PORT} — system proxy active`)
}

/**
 * Check for a newer published version once on launch. If we're behind, fire an
 * OS notification (click → download page) and push a banner into the tray UI.
 * Silent when up to date or when the check fails — a failed update check must
 * never interrupt the user.
 */
async function checkForUpdatesOnLaunch(): Promise<void> {
  const result = await checkForUpdate()
  if (!result.updateAvailable || !result.latest) return

  if (Notification.isSupported()) {
    const notif = new Notification({
      title: 'Pretzel Desktop — update available',
      body: `Version ${result.latest} is out (you have ${result.current}). Click to download.`,
      urgency: 'normal',
    })
    notif.on('click', () => { void shell.openExternal(DOWNLOAD_URL) })
    notif.show()
  }

  if (trayWin && !trayWin.isDestroyed() && !trayWin.webContents.isDestroyed()) {
    pushUpdateAvailable(trayWin, { current: result.current, latest: result.latest })
  }
}

app.on('second-instance', () => {
  trayWin?.show()
})

app.whenReady().then(async () => {
  app.setLoginItemSettings({ openAtLogin: true })

  const authenticated = isAuthenticated()

  registerIpcHandlers({
    onDecision: (requestId, allow) => {
      // Route the user's Allow/Block choice back to the held proxy request.
      proxy.resolveDecision(requestId, allow)
    },
    onSignIn: () => { handleSignIn() },
    onCancelSignIn: () => { cancelSignIn() },
  })

  // QA-only: let the qa-bridge open the decision window directly with a
  // synthetic finding, so the warn/block UI can be verified without standing up
  // the MITM proxy + trusted CA (not automatable in the test harness). Gated on
  // PRETZEL_E2E so it never exists in a real build.
  if (process.env.PRETZEL_E2E === '1') {
    ipcMain.on('e2e:trigger-decision', () => {
      showDecisionWindow({
        requestId: `e2e-${Date.now()}`,
        hostname: 'chatgpt.com',
        // No real proxied request to release here — the e2e trigger only needs
        // the decision window to render for the qa-bridge to assert against.
        resolve: (allow: boolean) => {
          console.log(`[pretzel-desktop][e2e] decision resolved: ${allow ? 'allow' : 'block'}`)
        },
        result: {
          findings: [{
            ruleId: 'e2e-canary',
            ruleName: 'Integration canary',
            severity: 'critical',
            action: 'block',
            matchedText: 'ZZINTEGCANARY',
            startOffset: 0,
            endOffset: 13,
          }],
          highestAction: 'block',
          promptHash: 'e2e',
          detectedAtMs: Date.now(),
          durationMs: 0,
        },
      })
    })
  }

  await setupTray(authenticated)

  // Start background policy sync — feeds into proxy + IPC state
  startPolicySync((policy) => {
    setCurrentPolicy(policy)
    proxy.setPolicy(policy)
    if (trayWin) {
      pushStatusUpdate(trayWin, {
        proxyRunning: true,
        policyAvailable: true,
        systemProxyActive: true,
      })
    }
  })

  // Nag unauthenticated users every 24h until they sign in
  if (trayWin) {
    startNagging(trayWin, { onSignInRequest: handleSignIn })
  }

  // Non-blocking: tell the user if a newer version is out (no auto-updater yet).
  void checkForUpdatesOnLaunch()

  try {
    await startProxy()
    if (trayWin) {
      pushStatusUpdate(trayWin, {
        proxyRunning: true,
        policyAvailable: false,
        systemProxyActive: true,
      })
    }
  } catch (err) {
    console.error('[pretzel-desktop] Proxy start failed:', err)
    if (trayWin) {
      pushStatusUpdate(trayWin, { proxyRunning: false, policyAvailable: false, systemProxyActive: false })
    }
  }
})

app.on('window-all-closed', () => {
  // Keep running in tray — don't quit on window close (no app.quit() call)
})

app.on('before-quit', async () => {
  stopNagging()
  stopPolicySync()
  restoreSystemProxy()
  setSystemProxyActive(false)
  await proxy.stop()
})

for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP'] as const) {
  process.on(sig, () => {
    restoreSystemProxy()
    process.exit(0)
  })
}

// Last-resort safety nets so we never strand the user behind our proxy with no
// internet. restoreSystemProxy() is synchronous (execSync), so it's safe to run
// in an 'exit' handler. 'exit' covers normal/most abrupt teardowns the signal
// handlers above miss; uncaughtException/unhandledRejection cover a crash in our
// own code. (A hard SIGKILL / Task Manager "End task" still can't be caught —
// that's what the activate-time crash-recovery guard in system-proxy.ts is for.)
process.on('exit', () => { restoreSystemProxy() })
process.on('uncaughtException', (err) => {
  console.error('[pretzel-desktop] Uncaught exception:', err)
  restoreSystemProxy()
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  console.error('[pretzel-desktop] Unhandled rejection:', reason)
  restoreSystemProxy()
  process.exit(1)
})

export { setCurrentPolicy }
