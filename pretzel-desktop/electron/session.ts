/**
 * Device-session helpers: who is signed in (for the tray account row), when the
 * device token expires (for the pre-expiry warning), and telling the server the
 * user signed out (for the console's last sign-in / sign-out columns).
 * Pure/async functions only — no Electron imports, so they unit-test cleanly.
 */
import { env } from './env'

const PRETZEL_API_BASE = env.PRETZEL_API_URL
const REQUEST_TIMEOUT_MS = 8_000

/** Warn the user this many days before the 90-day device token lapses. */
export const EXPIRY_WARN_DAYS = 14

export interface SessionInfo {
  email: string
  displayName: string | null
  tenantName: string
  signedInAt: string
  expiresAt: string
}

export interface AuthViewState {
  authenticated: boolean
  /** Set when the app was signed out by the server (token expired / revoked), not by the user. */
  reason?: 'expired'
  account?: { email: string; displayName: string | null; tenantName: string }
  /** Whole days until the token expires; only set when it is inside the warning window. */
  expiresInDays?: number
}

/** Whole days left before `expiresAt`, rounded up; 0 when already past. */
export function daysUntilExpiry(expiresAt: string, now: number = Date.now()): number {
  const ms = new Date(expiresAt).getTime() - now
  return ms <= 0 ? 0 : Math.ceil(ms / (24 * 60 * 60 * 1000))
}

/** What the tray renderer needs to know about auth, derived from main-process state. */
export function buildAuthView(input: {
  authenticated: boolean
  sessionLost: boolean
  session: SessionInfo | null
  now?: number
}): AuthViewState {
  if (!input.authenticated) {
    return { authenticated: false, ...(input.sessionLost ? { reason: 'expired' as const } : {}) }
  }
  const view: AuthViewState = { authenticated: true }
  if (input.session) {
    view.account = {
      email: input.session.email,
      displayName: input.session.displayName,
      tenantName: input.session.tenantName,
    }
    const days = daysUntilExpiry(input.session.expiresAt, input.now)
    if (days <= EXPIRY_WARN_DAYS) view.expiresInDays = days
  }
  return view
}

/**
 * GET /auth/desktop/session. 'unauthorized' means the server rejected the
 * token (expired / revoked); null means we couldn't tell (network, 5xx) and
 * the caller should just try again later.
 */
export async function fetchSession(token: string): Promise<SessionInfo | 'unauthorized' | null> {
  try {
    const res = await fetch(`${PRETZEL_API_BASE}/auth/desktop/session`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (res.status === 401) return 'unauthorized'
    if (!res.ok) return null
    const json = await res.json() as Partial<SessionInfo>
    if (typeof json.email !== 'string' || typeof json.expiresAt !== 'string') return null
    return {
      email: json.email,
      displayName: json.displayName ?? null,
      tenantName: json.tenantName ?? '',
      signedInAt: json.signedInAt ?? '',
      expiresAt: json.expiresAt,
    }
  } catch {
    return null
  }
}

/**
 * POST /auth/desktop/sign-out — revokes this device token server-side and lets
 * the console show when the user signed out. Returns true when the server has
 * recorded it (a 401 also counts: the token is already dead server-side).
 */
export async function reportSignOut(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${PRETZEL_API_BASE}/auth/desktop/sign-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    return res.ok || res.status === 401
  } catch {
    return false
  }
}
