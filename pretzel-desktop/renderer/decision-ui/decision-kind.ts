/**
 * A decision is a hard block when any finding's rule action is `block` —
 * the same signal the proxy and OS notifications use (highestAction). It must
 * NOT be inferred from severity: a high-severity `block` rule would render as
 * a dismissible warning, and a critical-severity `warn` rule as a hard block.
 */
export function isBlockingDecision(findings: Array<{ action?: string }>): boolean {
  return findings.some((f) => f.action === 'block')
}

/** Whole seconds left before the automatic decision; never negative. */
export function secondsLeft(deadlineAt: number, now: number = Date.now()): number {
  return Math.max(0, Math.ceil((deadlineAt - now) / 1000))
}

/** Countdown line under the findings: says what will happen and when. */
export function countdownText(onTimeout: 'block' | 'allow', seconds: number): string {
  return onTimeout === 'block'
    ? `No response in ${seconds}s will block this request.`
    : `No response in ${seconds}s will send this request anyway.`
}

/** Notice shown after the prompt timed out and the request was resolved automatically. */
export function timeoutNotice(allowed: boolean): { title: string; body: string } {
  return allowed
    ? { title: 'Sent automatically', body: "You didn't respond in time, so this request was sent anyway." }
    : { title: 'Blocked automatically', body: "You didn't respond in time, so this request was blocked." }
}
