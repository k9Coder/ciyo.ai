/**
 * A decision is a hard block when any finding's rule action is `block` —
 * the same signal the proxy and OS notifications use (highestAction). It must
 * NOT be inferred from severity: a high-severity `block` rule would render as
 * a dismissible warning, and a critical-severity `warn` rule as a hard block.
 */
export function isBlockingDecision(findings: Array<{ action?: string }>): boolean {
  return findings.some((f) => f.action === 'block')
}
