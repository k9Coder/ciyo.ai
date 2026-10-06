/** How one entry in the tray's recent-activity list reads, given how it ended. */
export function activityVerb(entry: Pick<ActivityEntryPayload, 'action' | 'outcome'>): string {
  switch (entry.outcome) {
    case 'blocked': return 'Blocked'
    case 'allowed': return 'Allowed'
    case 'timeout-blocked': return 'Blocked (no response)'
    case 'timeout-allowed': return 'Sent (no response)'
    default: return entry.action === 'block' ? 'Blocked' : 'Flagged'
  }
}

/** Dot colour: red only when the request was actually stopped. */
export function activityDot(entry: Pick<ActivityEntryPayload, 'action' | 'outcome'>): 'dot-danger' | 'dot-warn' {
  if (entry.outcome === 'blocked' || entry.outcome === 'timeout-blocked') return 'dot-danger'
  if (entry.outcome === 'allowed' || entry.outcome === 'timeout-allowed') return 'dot-warn'
  return entry.action === 'block' ? 'dot-danger' : 'dot-warn'
}
