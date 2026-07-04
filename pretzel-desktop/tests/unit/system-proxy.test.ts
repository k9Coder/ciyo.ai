/**
 * Unit tests for system-proxy.ts.
 * Mocks execSync so no real OS commands run.
 * Tests: per-platform activate/restore logic, state tracking, idempotent restore.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// vi.hoisted ensures mockExecSync is initialised before the vi.mock factory runs
const { mockExecSync } = vi.hoisted(() => ({ mockExecSync: vi.fn() }))
vi.mock('child_process', () => ({ execSync: mockExecSync, execFileSync: vi.fn() }))

import {
  activateSystemProxy,
  restoreSystemProxy,
  isSystemProxyActive,
} from '../../electron/system-proxy'

const PORT = 18888

beforeEach(() => {
  vi.clearAllMocks()
  // Ensure clean state between tests
  restoreSystemProxy()
})

afterEach(() => {
  restoreSystemProxy()
})

// ─── macOS ─────────────────────────────────────────────────────────────────

describe('macOS — activateSystemProxy', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
  })

  it('lists network services on activate', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('listallnetworkservices')) return 'Wi-Fi\nEthernet\n'
      if (cmd.includes('getwebproxy') || cmd.includes('getsecurewebproxy'))
        return 'Enabled: No\nServer: \nPort: 0\n'
      return ''
    })

    activateSystemProxy(PORT)
    expect(mockExecSync).toHaveBeenCalledWith('networksetup -listallnetworkservices')
  })

  it('sets web and secure proxy on each service', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('listallnetworkservices')) return 'Wi-Fi\n'
      if (cmd.includes('getwebproxy') || cmd.includes('getsecurewebproxy'))
        return 'Enabled: No\nServer: \nPort: 0\n'
      return ''
    })

    activateSystemProxy(PORT)

    expect(mockExecSync).toHaveBeenCalledWith(`networksetup -setwebproxy "Wi-Fi" 127.0.0.1 ${PORT}`)
    expect(mockExecSync).toHaveBeenCalledWith(`networksetup -setsecurewebproxy "Wi-Fi" 127.0.0.1 ${PORT}`)
    expect(mockExecSync).toHaveBeenCalledWith(`networksetup -setwebproxystate "Wi-Fi" on`)
    expect(mockExecSync).toHaveBeenCalledWith(`networksetup -setsecurewebproxystate "Wi-Fi" on`)
  })

  it('marks proxy as active after activate', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('listallnetworkservices')) return 'Wi-Fi\n'
      return 'Enabled: No\nServer: \nPort: 0\n'
    })
    activateSystemProxy(PORT)
    expect(isSystemProxyActive()).toBe(true)
  })

  it('restores proxy-off state when previous was disabled', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('listallnetworkservices')) return 'Wi-Fi\n'
      return 'Enabled: No\nServer: \nPort: 0\n'
    })
    activateSystemProxy(PORT)
    restoreSystemProxy()

    expect(mockExecSync).toHaveBeenCalledWith(`networksetup -setwebproxystate "Wi-Fi" off`)
    expect(mockExecSync).toHaveBeenCalledWith(`networksetup -setsecurewebproxystate "Wi-Fi" off`)
  })

  it('restores previous proxy when one was set', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('listallnetworkservices')) return 'Wi-Fi\n'
      if (cmd.includes('getwebproxy')) return 'Enabled: Yes\nServer: corp.proxy.example.com\nPort: 8080\n'
      if (cmd.includes('getsecurewebproxy')) return 'Enabled: Yes\nServer: corp.proxy.example.com\nPort: 8080\n'
      return ''
    })
    activateSystemProxy(PORT)
    restoreSystemProxy()

    expect(mockExecSync).toHaveBeenCalledWith(
      `networksetup -setwebproxy "Wi-Fi" corp.proxy.example.com 8080`
    )
  })

  it('clears active state after restore', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('listallnetworkservices')) return 'Wi-Fi\n'
      return 'Enabled: No\nServer: \nPort: 0\n'
    })
    activateSystemProxy(PORT)
    restoreSystemProxy()
    expect(isSystemProxyActive()).toBe(false)
  })
})

// ─── Windows ───────────────────────────────────────────────────────────────

describe('Windows — activateSystemProxy', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
  })

  it('sets ProxyEnable=1 and ProxyServer in registry', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('ProxyEnable')) return '    ProxyEnable    REG_DWORD    0x0\n'
      if (cmd.includes('ProxyServer')) return ''
      return ''
    })

    activateSystemProxy(PORT)

    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('ProxyEnable /t REG_DWORD /d 1'))
    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining(`127.0.0.1:${PORT}`))
  })

  it('saves previous registry state before overwriting', () => {
    let queriedProxyEnable = false
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('query') && cmd.includes('ProxyEnable')) {
        queriedProxyEnable = true
        return '    ProxyEnable    REG_DWORD    0x0\n'
      }
      return ''
    })
    activateSystemProxy(PORT)
    expect(queriedProxyEnable).toBe(true)
  })

  it('restores ProxyEnable=0 when original was disabled', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.includes('query') && cmd.includes('ProxyEnable')) return '    ProxyEnable    REG_DWORD    0x0\n'
      if (cmd.includes('query') && cmd.includes('ProxyServer')) return ''
      return ''
    })
    activateSystemProxy(PORT)
    restoreSystemProxy()

    expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('ProxyEnable /t REG_DWORD /d 0'))
  })

  it('marks proxy active after activate', () => {
    mockExecSync.mockReturnValue('')
    activateSystemProxy(PORT)
    expect(isSystemProxyActive()).toBe(true)
  })
})

// ─── Linux ─────────────────────────────────────────────────────────────────

describe('Linux — activateSystemProxy', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
  })

  it('sets gsettings proxy to manual mode', () => {
    mockExecSync.mockReturnValue("'none'")
    activateSystemProxy(PORT)
    expect(mockExecSync).toHaveBeenCalledWith(`gsettings set org.gnome.system.proxy mode 'manual'`)
  })

  it('sets http and https proxy host and port', () => {
    mockExecSync.mockReturnValue("'none'")
    activateSystemProxy(PORT)
    expect(mockExecSync).toHaveBeenCalledWith(`gsettings set org.gnome.system.proxy.http host '127.0.0.1'`)
    expect(mockExecSync).toHaveBeenCalledWith(`gsettings set org.gnome.system.proxy.http port ${PORT}`)
    expect(mockExecSync).toHaveBeenCalledWith(`gsettings set org.gnome.system.proxy.https host '127.0.0.1'`)
    expect(mockExecSync).toHaveBeenCalledWith(`gsettings set org.gnome.system.proxy.https port ${PORT}`)
  })

  it('restores none mode when previous was none', () => {
    mockExecSync.mockReturnValue("'none'")
    activateSystemProxy(PORT)
    restoreSystemProxy()
    expect(mockExecSync).toHaveBeenCalledWith(`gsettings set org.gnome.system.proxy mode 'none'`)
  })
})

// ─── Idempotency ───────────────────────────────────────────────────────────

describe('restoreSystemProxy — idempotency', () => {
  it('is safe to call when never activated', () => {
    expect(() => restoreSystemProxy()).not.toThrow()
    expect(isSystemProxyActive()).toBe(false)
  })

  it('is safe to call twice', () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
    mockExecSync.mockReturnValue("'none'")
    activateSystemProxy(PORT)
    restoreSystemProxy()
    expect(() => restoreSystemProxy()).not.toThrow()
  })
})
