/**
 * Regression: ISSUE-001 — decision window treated severity `critical` as "block"
 * instead of the rule's action, so a high-severity `block` rule showed as a
 * dismissible "Policy Warning" with an "Allow anyway" button.
 * Found by /qa-desktop on 2026-09-19.
 */
import { describe, it, expect } from 'vitest'
import { isBlockingDecision } from '../../renderer/decision-ui/decision-kind'

describe('isBlockingDecision', () => {
  it('is a block for a high-severity rule whose action is block', () => {
    expect(isBlockingDecision([{ action: 'block' }])).toBe(true)
  })

  it('is not a block for a warn-action rule, whatever its severity', () => {
    expect(isBlockingDecision([{ action: 'warn' }])).toBe(false)
  })

  it('is a block if any finding blocks', () => {
    expect(isBlockingDecision([{ action: 'warn' }, { action: 'block' }])).toBe(true)
  })

  it('is not a block when there are no findings or no action', () => {
    expect(isBlockingDecision([])).toBe(false)
    expect(isBlockingDecision([{}])).toBe(false)
  })
})
