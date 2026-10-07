/**
 * Reports legacy-rule shadow matches (pattern/keyword/entropy/score,
 * shadow-mode-only after docs/superpowers/specs/2026-10-06-judge-prompt-
 * client-engine-design.md) to a dedicated backend endpoint — never the
 * audit log, which now means "this actually happened." Fire-and-forget,
 * same as report-event.ts: a failed POST never affects the request path,
 * which has already completed by the time this runs.
 */
import { loadToken } from './auth'
import { env } from './env'
import { toShadowVerdictPayload } from '@mykka/detect'
import type { ShadowFinding } from '@mykka/detect'

const PRETZEL_API_BASE = env.PRETZEL_API_URL

export async function reportShadowTelemetry(shadowFindings: ShadowFinding[]): Promise<void> {
  if (shadowFindings.length === 0) return
  const token = await loadToken()
  if (!token) return

  try {
    await fetch(`${PRETZEL_API_BASE}/v1/telemetry/shadow-verdict`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(shadowFindings.map(toShadowVerdictPayload)),
    })
  } catch {
    // Best-effort — same reasoning as report-event.ts.
  }
}
