/**
 * Unit tests for session.ts — the auth view the tray renders (account, expiry
 * warning, "session expired" vs "never signed in"), plus the two server calls.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  daysUntilExpiry, buildAuthView, fetchSession, reportSignOut, EXPIRY_WARN_DAYS, type SessionInfo,
} from '../../electron/session'

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.parse('2026-09-19T12:00:00.000Z')

function session(expiresInMs: number): SessionInfo {
  return {
    email: 'a@example.com', displayName: 'Alice', tenantName: 'Acme',
    signedInAt: new Date(NOW - DAY).toISOString(), expiresAt: new Date(NOW + expiresInMs).toISOString(),
  }
}

const originalFetch = global.fetch
afterEach(() => { global.fetch = originalFetch })

describe('daysUntilExpiry', () => {
  it('rounds partial days up and floors at 0', () => {
    expect(daysUntilExpiry(new Date(NOW + 2.2 * DAY).toISOString(), NOW)).toBe(3)
    expect(daysUntilExpiry(new Date(NOW + 60 * 1000).toISOString(), NOW)).toBe(1)
    expect(daysUntilExpiry(new Date(NOW - DAY).toISOString(), NOW)).toBe(0)
  })
})

describe('buildAuthView', () => {
  it('signed out and never signed in: no reason', () => {
    expect(buildAuthView({ authenticated: false, sessionLost: false, session: null })).toEqual({ authenticated: false })
  })

  it('signed out because the server rejected the token: reason expired', () => {
    expect(buildAuthView({ authenticated: false, sessionLost: true, session: null }))
      .toEqual({ authenticated: false, reason: 'expired' })
  })

  it('signed in: exposes the account but no expiry warning when far from expiry', () => {
    const view = buildAuthView({ authenticated: true, sessionLost: false, session: session(60 * DAY), now: NOW })
    expect(view.account).toEqual({ email: 'a@example.com', displayName: 'Alice', tenantName: 'Acme' })
    expect(view.expiresInDays).toBeUndefined()
  })

  it('warns inside the expiry window', () => {
    const view = buildAuthView({ authenticated: true, sessionLost: false, session: session(EXPIRY_WARN_DAYS * DAY), now: NOW })
    expect(view.expiresInDays).toBe(EXPIRY_WARN_DAYS)
  })

  it('signed in but session info not fetched yet: no account, no warning', () => {
    expect(buildAuthView({ authenticated: true, sessionLost: false, session: null })).toEqual({ authenticated: true })
  })
})

describe('fetchSession', () => {
  it('returns unauthorized on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any
    expect(await fetchSession('pd_x')).toBe('unauthorized')
  })

  it('returns null (try again later) on 5xx and on network errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 }) as any
    expect(await fetchSession('pd_x')).toBeNull()
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any
    expect(await fetchSession('pd_x')).toBeNull()
  })

  it('returns null when the body is missing required fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }) as any
    expect(await fetchSession('pd_x')).toBeNull()
  })

  it('parses a valid session', async () => {
    const body = { email: 'a@example.com', displayName: null, tenantName: 'Acme', signedInAt: 's', expiresAt: 'e' }
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body }) as any
    expect(await fetchSession('pd_x')).toEqual(body)
  })
})

describe('reportSignOut', () => {
  it('is true when the server recorded it, and when the token is already dead (401)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 }) as any
    expect(await reportSignOut('pd_x')).toBe(true)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 401 }) as any
    expect(await reportSignOut('pd_x')).toBe(true)
  })

  it('is false when the server could not be reached or errored', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as any
    expect(await reportSignOut('pd_x')).toBe(false)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as any
    expect(await reportSignOut('pd_x')).toBe(false)
  })
})
