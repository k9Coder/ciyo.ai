import { getAuthToken } from '@/policy/auth'
import { API_BASE } from '@/shared/constants'
import type { ILastUpdatesChecker } from './types'

export class BackendRESTChecker implements ILastUpdatesChecker {
  async getLastUpdatedAt(): Promise<number | null> {
    const token = await getAuthToken()
    if (!token) return null
    try {
      const res = await fetch(`${API_BASE}/v1/policy/last-updates`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return null
      const { ts } = await res.json() as { ts: number }
      return ts
    } catch {
      return null
    }
  }
}
