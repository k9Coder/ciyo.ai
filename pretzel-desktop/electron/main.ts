/**
 * Electron main process — app lifecycle, system tray, IPC hub.
 */
import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import path from 'path'
import { proxy, PROXY_PORT, type ProxyDecisionEvent } from './proxy'
import { generateCACert, saveCACertFile, installCACert, storeCAKeyInKeychain, loadCAKeyFromKeychain, type CACert } from './ca'
import {
  registerIpcHandlers,
  setCurrentPolicy,
  setProxyRunning,
  setSystemProxyActive,
  pushStatusUpdate,
} from './ipc-handlers'
import { showDecisionWindow } from './decision-window'
import { activateSystemProxy, restoreSystemProxy } from './system-proxy'
import { isAuthenticated, signIn } from './auth'
import { startNagging, stopNagging } from './nag'
import { startPolicySync, stopPolicySync, triggerSync } from './policy-sync'
import forge from 'node-forge'

let tray: Tray | null = null
let trayWin: BrowserWindow | null = null
let ca: CACert | null = null

async function ensureCA(): Promise<CACert> {
  const storedKey = await loadCAKeyFromKeychain()
  const certPath = path.join(app.getPath('userData'), 'pretzel-ca.crt')

  if (storedKey) {
    const fs = await import('fs')
    if (fs.existsSync(certPath)) {
      const certPem = fs.readFileSync(certPath, 'utf-8')
      const cert = forge.pki.certificateFromPem(certPem)
      return { cert, certPem, keyPem: storedKey }
    }
  }

  const generated = generateCACert()
  const saved = saveCACertFile(generated.certPem)
  await storeCAKeyInKeychain(generated.keyPem)
  installCACert(saved)
  return generated
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
    console.error('[pretzel-desktop] Sign-in failed:', err)
    trayWin?.webContents.send('auth:error', String(err))
  }
}

function createTrayWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 480,
    show: false,
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    win.loadURL('http://localhost:5174/tray-ui/')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/tray-ui/index.html'))
  }
  return win
}

function setupTray(authenticated: boolean): void {
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
  trayWin = createTrayWindow()

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

app.whenReady().then(async () => {
  app.setLoginItemSettings({ openAtLogin: true })

  const authenticated = isAuthenticated()

  registerIpcHandlers({
    onDecision: (requestId, allow) => {
      // Route the user's Allow/Block choice back to the held proxy request.
      proxy.resolveDecision(requestId, allow)
    },
    onPolicyUpdate: (update) => {
      console.log('[pretzel-desktop] Policy update from renderer:', update)
    },
    onSignIn: () => { handleSignIn() },
  })

  setupTray(authenticated)

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

export { setCurrentPolicy }
