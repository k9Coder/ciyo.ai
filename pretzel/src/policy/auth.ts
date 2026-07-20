/**
 * Returns the best available auth token for backend API calls.
 *
 * Priority order (highest → lowest):
 *   1. MDM-managed org token (`chrome.storage.managed`) — set by enterprise
 *      IT policy. This MUST take precedence over personal Clerk sessions so
 *      an employee cannot bypass the organisation-wide DLP policy by logging
 *      in with their personal mykka account.
 *   2. Locally stored org token — manually entered org token from options page.
 *   3. Clerk session token — personal account JWT. Used when no org token is
 *      present (e.g. individual / non-enterprise users).
 *
 * Note: the backend independently authorises every API call; this token
 * selection is an extension-side optimisation only.
 */
export async function getAuthToken(): Promise<string | null> {
  // MDM-managed token wins over everything else in enterprise deployments.
  const managed = await chrome.storage.managed.get('orgToken').catch(() => ({})) as Record<string, unknown>
  if (typeof managed['orgToken'] === 'string') return managed['orgToken']

  // Locally stored org token (non-MDM enterprise or manual setup).
  const local = await chrome.storage.local.get('orgToken') as Record<string, unknown>
  if (typeof local['orgToken'] === 'string') return local['orgToken']

  // Fall back to Clerk JWT for personal / non-enterprise users.
  const clerkResult = await chrome.storage.local.get('clerkSessionToken') as Record<string, unknown>
  return typeof clerkResult['clerkSessionToken'] === 'string' ? clerkResult['clerkSessionToken'] : null
}
