/**
 * Policy sync — fetches PolicyDoc from mykka.ai backend using the stored token.
 * Runs on startup and every SYNC_INTERVAL_MS.
 * On success: updates the proxy's active policy.
 * On failure: keeps last known policy (never clears it mid-session).
 * If NO policy has loaded yet and the failure looks temporary (network error,
 * timeout, 5xx), retries quickly instead of waiting a full interval — see
 * retryDelayMs. The app starts at login, often before Wi-Fi is up.
 */
import { PolicyDocSchema, bridgePolicy } from '@mykka/detect'
import type { Policy, PolicyDoc } from '@mykka/detect'
import { loadToken, clearCredentials } from './auth'
import { env } from './env'

const SYNC_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes — same as extension
const FETCH_TIMEOUT_MS = 10_000

/** Fast-retry schedule while no policy has loaded yet; the last value repeats. */
const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000]

/** Delay before retry number `attempt` (0-based): 5s, 15s, 30s, then every 60s. */
export function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!
}

/** What a failed sync looked like — only 'unreachable' is worth a fast retry. */
export type SyncIssue = 'unreachable' | 'invalid'

type FetchResult =
  | { kind: 'ok'; doc: PolicyDoc }
  | { kind: 'unauthorized' }
  | { kind: 'transient' }   // network error, timeout, 5xx, 408, 429 — will likely pass by itself
  | { kind: 'invalid' }     // other 4xx or an unreadable body — retrying fast won't help

/**
 * Classifies one policy fetch. Kept separate from doSync so the "do we need to
 * retry?" decision is a pure function of the response, not of timers.
 */
export function classifyPolicyResponse(status: number | undefined): 'unauthorized' | 'transient' | 'invalid' | 'ok' {
  if (status === 401) return 'unauthorized'
  if (status !== undefined && (status >= 500 || status === 408 || status === 429)) return 'transient'
  if (status !== undefined && status >= 400) return 'invalid'
  return 'ok'
}
const PRETZEL_API_BASE = env.PRETZEL_API_URL

type PolicyUpdateCallback = (policy: Policy) => void

let syncTimer: ReturnType<typeof setInterval> | null = null
let onPolicyUpdate: PolicyUpdateCallback | null = null
let onUnauthorized: (() => void) | null = null
let onSyncIssue: ((issue: SyncIssue | null) => void) | null = null
let syncIssue: SyncIssue | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0
let lastKnownPolicy: Policy | null = null

export function getLastKnownPolicy(): Policy | null {
  return lastKnownPolicy
}

async function fetchPolicyDoc(token: string): Promise<FetchResult> {
  let res: Response
  try {
    res = await fetch(`${PRETZEL_API_BASE}/v1/policy`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    return { kind: 'transient' }
  }
  const verdict = classifyPolicyResponse(res.status)
  if (verdict === 'unauthorized' || verdict === 'transient' || verdict === 'invalid') return { kind: verdict }
  try {
    const json = await res.json() as { policy?: unknown }
    const parsed = PolicyDocSchema.safeParse(json.policy)
    return parsed.success ? { kind: 'ok', doc: parsed.data } : { kind: 'invalid' }
  } catch {
    return { kind: 'invalid' }
  }
}

function setSyncIssue(issue: SyncIssue | null): void {
  if (issue === syncIssue) return
  syncIssue = issue
  onSyncIssue?.(issue)
}

function cancelRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryAttempt = 0
}

// Only while no policy has ever loaded: once we have one the proxy keeps
// enforcing it, and the regular 2-minute tick is enough to refresh it.
function scheduleRetryIfNoPolicy(): void {
  if (lastKnownPolicy || retryTimer) return
  retryTimer = setTimeout(() => {
    retryTimer = null
    doSync().catch(console.error)
  }, retryDelayMs(retryAttempt++))
}

async function doSync(): Promise<void> {
  const token = await loadToken()
  if (!token) return // not authenticated yet

  const result = await fetchPolicyDoc(token)
  switch (result.kind) {
    case 'unauthorized':
      // Device token expired or was revoked — clear it so isAuthenticated() goes
      // false, then tell the app so it can actually re-prompt sign-in (the
      // tray UI and native menu only read auth state when told to).
      cancelRetry()
      setSyncIssue(null)
      await clearCredentials()
      onUnauthorized?.()
      return
    case 'transient':
      setSyncIssue('unreachable')
      scheduleRetryIfNoPolicy()
      return
    case 'invalid':
      setSyncIssue('invalid')
      return
    case 'ok': {
      cancelRetry()
      setSyncIssue(null)
      const policy = bridgePolicy(result.doc, [])
      lastKnownPolicy = policy
      onPolicyUpdate?.(policy)
    }
  }
}

/** Current failure state while no fresh policy is available (null = healthy). */
export function getSyncIssue(): SyncIssue | null {
  return syncIssue
}

/** Forget the loaded policy and any pending retry (sign-out / session lost). */
export function resetPolicySync(): void {
  lastKnownPolicy = null
  cancelRetry()
  setSyncIssue(null)
}

/**
 * Start background policy sync.
 * @param callback — called every time a fresh policy is fetched.
 */
export function startPolicySync(
  callback: PolicyUpdateCallback,
  options?: { onUnauthorized?: () => void; onSyncIssue?: (issue: SyncIssue | null) => void },
): void {
  onPolicyUpdate = callback
  onUnauthorized = options?.onUnauthorized ?? null
  onSyncIssue = options?.onSyncIssue ?? null

  // Sync immediately, then on interval
  doSync().catch(console.error)

  syncTimer = setInterval(() => {
    doSync().catch(console.error)
  }, SYNC_INTERVAL_MS)
}

export function stopPolicySync(): void {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
  cancelRetry()
}

/** Force an immediate re-sync (e.g. after sign-in). */
export function triggerSync(): Promise<void> {
  return doSync()
}

/**
 * "Always allow this rule" — reported to the backend (not a local-only
 * mute): the exception is stored per-member there, admin-visible via
 * GET /v1/policy/exceptions, and baked directly into what resolveMemberPolicy
 * returns for this member going forward. Re-syncs immediately after so the
 * rule stops appearing in findings without waiting for the next 2-minute
 * interval. Returns false (never throws) on any failure — the current
 * decision can still be resolved as a one-off allow even if this didn't
 * take.
 */
export async function alwaysAllowRule(ruleId: string): Promise<boolean> {
  const token = await loadToken()
  if (!token) return false
  try {
    const res = await fetch(`${PRETZEL_API_BASE}/v1/policy/exceptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleId }),
    })
    if (!res.ok) return false
  } catch {
    return false
  }
  await doSync()
  return true
}
