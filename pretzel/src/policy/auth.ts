export async function getAuthToken(): Promise<string | null> {
  const clerkResult = await chrome.storage.local.get('clerkSessionToken') as Record<string, unknown>
  if (typeof clerkResult['clerkSessionToken'] === 'string') return clerkResult['clerkSessionToken']

  const managed = await chrome.storage.managed.get('orgToken').catch(() => ({})) as Record<string, unknown>
  if (typeof managed['orgToken'] === 'string') return managed['orgToken']

  const local = await chrome.storage.local.get('orgToken') as Record<string, unknown>
  return typeof local['orgToken'] === 'string' ? local['orgToken'] : null
}
