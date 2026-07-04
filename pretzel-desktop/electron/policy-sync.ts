/**
 * Policy sync — fetches PolicyDoc from ciyo.ai backend using the stored token.
 * Runs on startup and every SYNC_INTERVAL_MS.
 * On success: updates the proxy's active policy.
 * On failure: keeps last known policy (never clears it mid-session).
 */
import { PolicyDocSchema, bridgePolicy } from '@ciyo/detect'
import type { Policy, PolicyDoc } from '@ciyo/detect'
import { loadToken } from './auth'

const SYNC_INTERVAL_MS = 2 * 60 * 1000 // 2 minutes — same as extension
const CIYO_API_BASE = process.env.CIYO_API_URL ?? 'https://api.ciyo.ai'

type PolicyUpdateCallback = (policy: Policy) => void

let syncTimer: ReturnType<typeof setInterval> | null = null
let onPolicyUpdate: PolicyUpdateCallback | null = null
let lastKnownPolicy: Policy | null = null

export function getLastKnownPolicy(): Policy | null {
  return lastKnownPolicy
}

async function fetchPolicyDoc(token: string): Promise<PolicyDoc | null> {
  const res = await fetch(`${CIYO_API_BASE}/v1/policy`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) return null
  const json = await res.json()
  const parsed = PolicyDocSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

async function doSync(): Promise<void> {
  const token = await loadToken()
  if (!token) return // not authenticated yet

  const doc = await fetchPolicyDoc(token)
  if (!doc) return

  const policy = bridgePolicy(doc, [])
  lastKnownPolicy = policy
  onPolicyUpdate?.(policy)
}

/**
 * Start background policy sync.
 * @param callback — called every time a fresh policy is fetched.
 */
export function startPolicySync(callback: PolicyUpdateCallback): void {
  onPolicyUpdate = callback

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
}

/** Force an immediate re-sync (e.g. after sign-in). */
export function triggerSync(): Promise<void> {
  return doSync()
}
