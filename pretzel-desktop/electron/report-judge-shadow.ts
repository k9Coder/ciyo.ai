/**
 * Posts judge v2 shadow rows (content-free; see @mykka/judge-v2 shadow.ts) to
 * /v1/telemetry/judge-shadow in batches of at most 100. Fire-and-forget like
 * report-shadow-telemetry.ts: a failed POST never affects anything else.
 */
import type { JudgeShadowRow } from '@mykka/judge-v2'
import { loadToken } from './auth'
import { env } from './env'

const BATCH = 100

export async function reportJudgeShadow(rows: JudgeShadowRow[]): Promise<void> {
  if (rows.length === 0) return
  const token = await loadToken()
  if (!token) return
  for (let i = 0; i < rows.length; i += BATCH) {
    try {
      await fetch(`${env.PRETZEL_API_URL}/v1/telemetry/judge-shadow`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(rows.slice(i, i + BATCH)),
      })
    } catch {
      // Best-effort.
    }
  }
}
