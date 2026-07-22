/**
 * System-wide OS proxy manager.
 *
 * Sets 127.0.0.1:PROXY_PORT as the HTTP/HTTPS proxy for the entire OS,
 * so all apps — including Google Chrome — route through pretzel-desktop's
 * MITM daemon. Saves the original proxy config and restores it on quit
 * (including crash via SIGTERM/SIGINT handlers in main.ts).
 *
 * Per-platform:
 *   macOS  — networksetup, iterates all active network services
 *   Windows — HKCU registry Internet Settings
 *   Linux   — gsettings (GNOME) + env-var file for non-GNOME DEs
 */
import { execSync, execFileSync } from 'child_process'
import { debugLog } from './debug-log'
debugLog('module loaded: system-proxy.ts')

export interface ProxyState {
  enabled: boolean
  host: string
  port: number
}

interface SavedProxyConfig {
  platform: NodeJS.Platform
  // macOS: per-service saved state
  macServices?: Array<{ service: string; http: ProxyState; https: ProxyState }>
  // Windows: previous values
  winPrevEnabled?: number
  winPrevServer?: string
  // Linux: previous gsettings values
  linuxPrevMode?: string
  linuxPrevHost?: string
  linuxPrevPort?: number
}

let saved: SavedProxyConfig | null = null

// ─── macOS ─────────────────────────────────────────────────────────────────

function macListServices(): string[] {
  const out = execSync('networksetup -listallnetworkservices').toString()
  return out
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('An asterisk'))
}

function macGetProxyState(service: string, type: 'web' | 'secureweb'): ProxyState {
  try {
    const flag = type === 'web' ? '-getwebproxy' : '-getsecurewebproxy'
    const out = execSync(`networksetup ${flag} "${service}"`).toString()
    const enabled = /Enabled:\s*Yes/i.test(out)
    const hostMatch = out.match(/Server:\s*(.+)/)
    const portMatch = out.match(/Port:\s*(\d+)/)
    return {
      enabled,
      host: hostMatch?.[1]?.trim() ?? '',
      port: parseInt(portMatch?.[1] ?? '0', 10),
    }
  } catch {
    return { enabled: false, host: '', port: 0 }
  }
}

function macSetProxy(service: string, host: string, port: number): void {
  execSync(`networksetup -setwebproxy "${service}" ${host} ${port}`)
  execSync(`networksetup -setsecurewebproxy "${service}" ${host} ${port}`)
  execSync(`networksetup -setwebproxystate "${service}" on`)
  execSync(`networksetup -setsecurewebproxystate "${service}" on`)
}

function macRestoreProxy(service: string, http: ProxyState, https: ProxyState): void {
  if (http.enabled && http.host) {
    execSync(`networksetup -setwebproxy "${service}" ${http.host} ${http.port}`)
  } else {
    execSync(`networksetup -setwebproxystate "${service}" off`)
  }
  if (https.enabled && https.host) {
    execSync(`networksetup -setsecurewebproxy "${service}" ${https.host} ${https.port}`)
  } else {
    execSync(`networksetup -setsecurewebproxystate "${service}" off`)
  }
}

// ─── Windows ───────────────────────────────────────────────────────────────

const WIN_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings'

function winGetRegDword(name: string): number {
  try {
    const out = execSync(`reg query "${WIN_REG_PATH}" /v ${name}`).toString()
    const match = out.match(/0x([0-9a-f]+)/i)
    return match ? parseInt(match[1], 16) : 0
  } catch {
    return 0
  }
}

function winGetRegSz(name: string): string {
  try {
    const out = execSync(`reg query "${WIN_REG_PATH}" /v ${name}`).toString()
    const match = out.match(/REG_SZ\s+(.+)/)
    return match?.[1]?.trim() ?? ''
  } catch {
    return ''
  }
}

function winSetProxy(host: string, port: number): void {
  execSync(`reg add "${WIN_REG_PATH}" /v ProxyEnable /t REG_DWORD /d 1 /f`)
  execSync(`reg add "${WIN_REG_PATH}" /v ProxyServer /t REG_SZ /d "${host}:${port}" /f`)
  // Tell WinInet/Chrome to pick up the new settings immediately
  execSync(`reg add "${WIN_REG_PATH}" /v ProxyOverride /t REG_SZ /d "<local>" /f`)
}

function winRestoreProxy(prevEnabled: number, prevServer: string): void {
  execSync(`reg add "${WIN_REG_PATH}" /v ProxyEnable /t REG_DWORD /d ${prevEnabled} /f`)
  if (prevServer) {
    execSync(`reg add "${WIN_REG_PATH}" /v ProxyServer /t REG_SZ /d "${prevServer}" /f`)
  } else {
    try { execSync(`reg delete "${WIN_REG_PATH}" /v ProxyServer /f`) } catch { /* not set */ }
  }
}

// ─── Linux ─────────────────────────────────────────────────────────────────

function linuxGetGsetting(schema: string, key: string): string {
  try {
    return execSync(`gsettings get ${schema} ${key}`).toString().trim().replace(/'/g, '')
  } catch {
    return ''
  }
}

function linuxSetProxy(host: string, port: number): void {
  execSync(`gsettings set org.gnome.system.proxy mode 'manual'`)
  execSync(`gsettings set org.gnome.system.proxy.http host '${host}'`)
  execSync(`gsettings set org.gnome.system.proxy.http port ${port}`)
  execSync(`gsettings set org.gnome.system.proxy.https host '${host}'`)
  execSync(`gsettings set org.gnome.system.proxy.https port ${port}`)
}

function linuxRestoreProxy(prevMode: string, prevHost: string, prevPort: number): void {
  execSync(`gsettings set org.gnome.system.proxy mode '${prevMode || 'none'}'`)
  if (prevHost) {
    execSync(`gsettings set org.gnome.system.proxy.http host '${prevHost}'`)
    execSync(`gsettings set org.gnome.system.proxy.http port ${prevPort}`)
    execSync(`gsettings set org.gnome.system.proxy.https host '${prevHost}'`)
    execSync(`gsettings set org.gnome.system.proxy.https port ${prevPort}`)
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Activate system-wide proxy pointing at the local MITM daemon.
 * Saves existing config so restoreSystemProxy() can undo it.
 */
export function activateSystemProxy(port: number): void {
  const host = '127.0.0.1'

  switch (process.platform) {
    case 'darwin': {
      const services = macListServices()
      const macServices = services.map(service => ({
        service,
        http: macGetProxyState(service, 'web'),
        https: macGetProxyState(service, 'secureweb'),
      }))
      saved = { platform: 'darwin', macServices }
      for (const { service } of macServices) {
        try { macSetProxy(service, host, port) } catch { /* skip inactive services */ }
      }
      break
    }

    case 'win32': {
      const winPrevEnabled = winGetRegDword('ProxyEnable')
      const winPrevServer = winGetRegSz('ProxyServer')
      saved = { platform: 'win32', winPrevEnabled, winPrevServer }
      winSetProxy(host, port)
      break
    }

    case 'linux': {
      const linuxPrevMode = linuxGetGsetting('org.gnome.system.proxy', 'mode')
      const linuxPrevHost = linuxGetGsetting('org.gnome.system.proxy.http', 'host')
      const linuxPrevPortStr = linuxGetGsetting('org.gnome.system.proxy.http', 'port')
      const linuxPrevPort = parseInt(linuxPrevPortStr, 10) || 0
      saved = { platform: 'linux', linuxPrevMode, linuxPrevHost, linuxPrevPort }
      linuxSetProxy(host, port)
      break
    }

    default:
      console.warn(`[system-proxy] Unsupported platform: ${process.platform}`)
  }
}

/**
 * Restore OS proxy settings to what they were before activateSystemProxy().
 * Safe to call multiple times; no-op if never activated.
 */
export function restoreSystemProxy(): void {
  if (!saved) return

  try {
    switch (saved.platform) {
      case 'darwin':
        for (const { service, http, https } of saved.macServices ?? []) {
          try { macRestoreProxy(service, http, https) } catch { /* skip */ }
        }
        break

      case 'win32':
        winRestoreProxy(saved.winPrevEnabled ?? 0, saved.winPrevServer ?? '')
        break

      case 'linux':
        linuxRestoreProxy(
          saved.linuxPrevMode ?? 'none',
          saved.linuxPrevHost ?? '',
          saved.linuxPrevPort ?? 0,
        )
        break
    }
  } catch (err) {
    console.error('[system-proxy] Restore failed:', err)
  } finally {
    saved = null
  }
}

/** Returns true if the system proxy is currently set to our local daemon. */
export function isSystemProxyActive(): boolean {
  return saved !== null
}
