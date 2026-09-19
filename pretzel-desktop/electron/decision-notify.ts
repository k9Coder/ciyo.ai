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
import type { ProxyDecisionEvent, ProxyDecisionTimeoutEvent } from './proxy'

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

/**
 * Tells the user a held request was resolved WITHOUT them, because the prompt
 * timed out. Shown even when they set notifications to Off/badge (raised to a
 * silent OS notification): something happened to their message that they did
 * not choose, so it must not be invisible.
 */
export function notifyTimeout(level: NotifyLevel, event: ProxyDecisionTimeoutEvent): void {
  if (!Notification.isSupported()) return

  const rule = event.result.findings[0]?.ruleName ?? event.result.findings[0]?.ruleId ?? 'a policy rule'
  const notif = new Notification({
    title: event.allowed
      ? `Pretzel sent a flagged request to ${event.hostname}`
      : `Pretzel blocked a request to ${event.hostname}`,
    body: event.allowed
      ? `No response to the prompt in time, so it was sent anyway. Matched: ${rule}`
      : `No response to the prompt in time, so it was blocked. Matched: ${rule}`,
    urgency: event.allowed ? 'normal' : 'critical',
    silent: level !== 'native-sound',
  })
  notif.show()
}
