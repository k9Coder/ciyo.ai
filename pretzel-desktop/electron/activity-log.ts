/**
 * Local recent-activity list, shown in the tray window. Kept in memory only
 * (resets on restart, not persisted) — this is a quick "what just happened"
 * glance, not a record of truth. The record of truth is the backend's
 * existing Audit Log (see report-event.ts), which is what admins see and
 * what survives across devices/restarts.
 */
const MAX_ENTRIES = 20

export interface ActivityEntry {
  hostname:  string
  ruleName:  string
  severity:  string
  action:    'warn' | 'block'
  timestamp: number
  /** Links the entry to its held request so the final outcome can be filled in. */
  requestId?: string
  /**
   * How the request ended. Absent while the prompt is still open.
   * `timeout-*` means nobody answered and Pretzel decided by policy.
   */
  outcome?:  'blocked' | 'allowed' | 'timeout-blocked' | 'timeout-allowed'
}

let entries: ActivityEntry[] = []

/** Record an activity entry, newest first, capped at MAX_ENTRIES. */
export function recordActivity(entry: ActivityEntry): void {
  entries = [entry, ...entries].slice(0, MAX_ENTRIES)
}

export function getRecentActivity(): ActivityEntry[] {
  return entries
}

/** Test-only: clear all recorded activity. */
export function _resetActivityForTest(): void {
  entries = []
}

/** Fill in how a held request ended, for every entry recorded for it. */
export function setActivityOutcome(requestId: string, outcome: NonNullable<ActivityEntry['outcome']>): void {
  entries = entries.map((e) => (e.requestId === requestId ? { ...e, outcome } : e))
}
