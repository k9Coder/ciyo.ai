/**
 * Reports each finding to the backend's existing Audit Log (POST /v1/events)
 * — the same endpoint/table the browser extension already writes to, so a
 * block/warn from the desktop app shows up in the org's Audit Log page next
 * to everything else, instead of being a second, disconnected record. This
 * is what makes admin visibility real: the desktop app's own "recent
 * activity" list (activity-log.ts) is local-only and resets on restart —
 * this is the copy that survives and that admins actually see.
 *
 * Best-effort and fire-and-forget: reporting failures never affect the
 * block/allow decision itself, which has already happened by the time this
 * runs (see main.ts's 'decision-required' handler).
 */
import { loadToken } from './auth'
import { env } from './env'
import type { ProxyDecisionEvent } from './proxy'

const PRETZEL_API_BASE = env.PRETZEL_API_URL

export async function reportEvent(event: Pick<ProxyDecisionEvent, 'hostname' | 'result'>): Promise<void> {
  const token = await loadToken()
  if (!token) return

  await Promise.all(event.result.findings.map(async (finding) => {
    try {
      await fetch(`${PRETZEL_API_BASE}/v1/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ruleId: finding.ruleId,
          action: finding.severity === 'critical' || finding.severity === 'high' ? 'block' : 'warn',
          siteUrl: `https://${event.hostname}/`,
          matchedTerm: finding.matchedText,
        }),
      })
    } catch {
      // Best-effort — a rule that hasn't synced to this member's device yet
      // (or a network blip) just means this one event doesn't show up in
      // the admin audit log, not a broken decision.
    }
  }))
}
