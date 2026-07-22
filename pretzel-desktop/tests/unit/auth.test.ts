/**
 * Unit tests for auth.ts — PKCE flow helpers, auth state, keychain wrappers.
 * Mocks: electron (app.getPath), keytar, fs, fetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'fs'
import path from 'path'

const MOCK_USER_DATA = '/tmp/pretzel-test-auth'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => MOCK_USER_DATA) },
  shell: { openExternal: vi.fn(() => Promise.resolve()) },
}))

const mockKeytar = {
  setPassword: vi.fn(() => Promise.resolve()),
  getPassword: vi.fn(() => Promise.resolve(null as string | null)),
  deletePassword: vi.fn(() => Promise.resolve()),
}
vi.mock('keytar', () => mockKeytar)

import {
  loadAuthState,
  saveAuthState,
  isAuthenticated,
  storeToken,
  loadToken,
  storeTenantId,
  loadTenantId,
  clearCredentials,
} from '../../electron/auth'

beforeEach(() => {
  vi.clearAllMocks()
  // Clean auth state file
  const statePath = path.join(MOCK_USER_DATA, 'auth-state.json')
  try { fs.unlinkSync(statePath) } catch { /* no file */ }
})

describe('loadAuthState', () => {
  it('returns { authenticated: false } when no file', () => {
    expect(loadAuthState()).toEqual({ authenticated: false })
  })

  it('returns stored state when file exists', () => {
    fs.mkdirSync(MOCK_USER_DATA, { recursive: true })
    const statePath = path.join(MOCK_USER_DATA, 'auth-state.json')
    fs.writeFileSync(statePath, JSON.stringify({ authenticated: true, tenantId: 'tid-1' }))
    // Verify file is actually written before calling loadAuthState
    expect(fs.existsSync(statePath)).toBe(true)
    const state = loadAuthState()
    expect(state.authenticated).toBe(true)
    expect(state.tenantId).toBe('tid-1')
  })
})

describe('saveAuthState / isAuthenticated', () => {
  it('isAuthenticated returns false when not saved', () => {
    expect(isAuthenticated()).toBe(false)
  })

  it('isAuthenticated returns true after saving authenticated=true', () => {
    fs.mkdirSync(MOCK_USER_DATA, { recursive: true })
    saveAuthState({ authenticated: true, tenantId: 'tid-2' })
    expect(isAuthenticated()).toBe(true)
  })

  it('saveAuthState persists authenticatedAt timestamp', () => {
    fs.mkdirSync(MOCK_USER_DATA, { recursive: true })
    const before = new Date().toISOString()
    saveAuthState({ authenticated: true, authenticatedAt: before })
    const loaded = loadAuthState()
    expect(loaded.authenticatedAt).toBe(before)
  })
})

describe('storeToken / loadToken', () => {
  it('storeToken calls keytar.setPassword', async () => {
    await storeToken('tok-abc')
    expect(mockKeytar.setPassword).toHaveBeenCalledWith('pretzel-desktop', 'session-token', 'tok-abc')
  })

  it('loadToken calls keytar.getPassword', async () => {
    mockKeytar.getPassword.mockResolvedValue('tok-xyz')
    const tok = await loadToken()
    expect(tok).toBe('tok-xyz')
    expect(mockKeytar.getPassword).toHaveBeenCalledWith('pretzel-desktop', 'session-token')
  })

  it('loadToken returns null when nothing stored', async () => {
    mockKeytar.getPassword.mockResolvedValue(null)
    expect(await loadToken()).toBeNull()
  })
})

describe('storeTenantId / loadTenantId', () => {
  it('storeTenantId calls keytar.setPassword with correct account', async () => {
    await storeTenantId('tenant-99')
    expect(mockKeytar.setPassword).toHaveBeenCalledWith('pretzel-desktop', 'tenant-id', 'tenant-99')
  })

  it('loadTenantId returns stored value', async () => {
    mockKeytar.getPassword.mockResolvedValue('tenant-99')
    expect(await loadTenantId()).toBe('tenant-99')
  })
})

describe('clearCredentials', () => {
  it('deletes both keychain entries', async () => {
    await clearCredentials()
    expect(mockKeytar.deletePassword).toHaveBeenCalledWith('pretzel-desktop', 'session-token')
    expect(mockKeytar.deletePassword).toHaveBeenCalledWith('pretzel-desktop', 'tenant-id')
  })

  it('resets auth state to not authenticated', async () => {
    fs.mkdirSync(MOCK_USER_DATA, { recursive: true })
    saveAuthState({ authenticated: true })
    await clearCredentials()
    expect(isAuthenticated()).toBe(false)
  })
})
