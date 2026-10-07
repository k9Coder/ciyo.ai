/**
 * Reports each finding to the backend's existing Audit Log (POST /v1/events)
 * — the same endpoint/table the browser extension already writes to, so a
 * block/warn from the desktop app shows up in the org's Audit Log page next
 * to everything else, instead of being a second, disconnected record. This
 * is what makes admin visibility real: the desktop app's own "recent
 * activity" list (activity-log.ts) is local-only and resets on restart —
 * this is the copy that survives and that admins actually see.
 *
 * Gated by each rule's reportLevel, mirroring the extension's dispatchEvents
 * (pretzel/src/events/dispatch.ts) exactly: "none" skips the event entirely,
 * "rich" is the only level that includes matchedTerm. Desktop used to send
 * every event unconditionally with matchedTerm always included — a judge_prompt
 * match's matchedTerm is up to 200 chars of the raw prompt text (not a
 * matched secret like legacy rules), which made that gap worth closing.
 *
 * Best-effort and fire-and-forget: reporting failures never affect the
 * block/allow decision itself, which has already happened by the time this
 * runs (see main.ts's 'decision-required' handler).
 */
import { loadToken } from './auth'
import { getLastKnownPolicyDoc } from './policy-sync'
import { env } from './env'
import type { ProxyDecisionEvent } from './proxy'

const PRETZEL_API_BASE = env.PRETZEL_API_URL

type ReportLevel = 'none' | 'minimal' | 'medium' | 'rich'

function getRuleReportLevel(ruleId: string): ReportLevel {
  const doc = getLastKnownPolicyDoc()
  if (!doc) return 'none'
  for (const subject of doc.subjects) {
    const rule = subject.rules.find(r => r.id === ruleId)
    if (rule) return rule.reportLevel
  }
  return 'none'
}

export async function reportEvent(event: Pick<ProxyDecisionEvent, 'hostname' | 'result'>): Promise<void> {
  const token = await loadToken()
  if (!token) return

  await Promise.all(event.result.findings.map(async (finding) => {
    const reportLevel = getRuleReportLevel(finding.ruleId)
    if (reportLevel === 'none') return

    const body: Record<string, unknown> = {
      ruleId: finding.ruleId,
      // The rule's action, not its severity: severity says how bad a match is,
      // action says what the policy does about it. (Deriving one from the other
      // logged medium-severity block rules as warns in the admins' audit log.)
      action: finding.action === 'block' ? 'block' : 'warn',
      siteUrl: `https://${event.hostname}/`,
    }
    if (reportLevel === 'rich') {
      body['matchedTerm'] = finding.matchedText
    }

    try {
      await fetch(`${PRETZEL_API_BASE}/v1/events`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    } catch {
      // Best-effort — a rule that hasn't synced to this member's device yet
      // (or a network blip) just means this one event doesn't show up in
      // the admin audit log, not a broken decision.
    }
  }))
}
