import { lastUpdatesChecker } from '@/realtime/index'
import { syncPolicy } from '@/policy/sync'

export async function checkForUpdates(): Promise<void> {
  const remoteTs = await lastUpdatesChecker.getLastUpdatedAt()
  if (remoteTs === null) return

  const stored  = await chrome.storage.local.get('syncedAt') as { syncedAt?: number }
  const localTs = stored.syncedAt ?? 0

  if (remoteTs <= localTs) return

  await syncPolicy()
  await chrome.storage.local.set({ syncedAt: remoteTs })
}
