/**
 * Fires (or doesn't) an OS notification when the proxy holds a request for a
 * decision, per the user's configured preference — see settings.ts's
 * notifyOnBlock/notifyOnWarn. This runs the INSTANT a decision is needed,
 * independent of the decision window itself, so a user who isn't staring at
 * their screen still gets a signal that something happened.
 *
 * Levels:
 *   off          — nothing. The decision window itself still shows.
 *   badge        — no OS notification; the decision window is the only cue.
 *   native       — a silent OS notification (visual only).
 *   native-sound — a normal OS notification (plays the OS's default sound).
 */
import { Notification } from 'electron'
import type { NotifyLevel } from './settings'
import type { ProxyDecisionEvent } from './proxy'

export function notifyDecision(
  level: NotifyLevel,
  event: Pick<ProxyDecisionEvent, 'hostname' | 'result'>,
): void {
  if (level === 'off' || level === 'badge') return
  if (!Notification.isSupported()) return

  const isBlock = event.result.highestAction === 'block'
  const rule = event.result.findings[0]?.ruleName ?? event.result.findings[0]?.ruleId ?? 'a policy rule'

  const notif = new Notification({
    title: isBlock ? `Pretzel blocked a request to ${event.hostname}` : `Pretzel flagged a request to ${event.hostname}`,
    body: `Matched: ${rule}`,
    urgency: isBlock ? 'critical' : 'normal',
    silent: level === 'native', // 'native' = visual only; 'native-sound' plays the OS default
  })
  notif.show()
}
