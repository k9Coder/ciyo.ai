import { PolicyDocSchema } from '@ciyo/detect'
import { getAuthToken } from './auth'
import { API_BASE } from '@/shared/constants'

async function getCachedVersion(): Promise<number | null> {
  const result = await chrome.storage.local.get('cachedPolicyVersion') as Record<string, unknown>
  const v = result['cachedPolicyVersion']
  return typeof v === 'number' ? v : null
}

export async function syncPolicy(): Promise<void> {
  const token = await getAuthToken()
  if (!token) return

  try {
    const versionRes = await fetch(`${API_BASE}/v1/policy/version`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!versionRes.ok) {
      if (versionRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true })
      return
    }
    const { version: contentVersion } = await versionRes.json() as { version: number }
    const cached = await getCachedVersion()
    if (cached === contentVersion) return

    const policyRes = await fetch(`${API_BASE}/v1/policy`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!policyRes.ok) {
      if (policyRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true })
      return
    }
    const raw    = await policyRes.json() as { policy: unknown }
    const parsed = PolicyDocSchema.safeParse(raw.policy)
    if (!parsed.success) return

    await chrome.storage.local.set({
      policyDoc:           parsed.data,
      cachedPolicyVersion: contentVersion,
      subscriptionExpired: false,
      syncedAt:            Date.now(),
    })
  } catch {
    // Network error — leave cached policy in place
  }
}
