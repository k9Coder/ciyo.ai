import { describe, it, expect } from 'vitest'
import { secondsLeft, countdownText, timeoutNotice } from '../../renderer/decision-ui/decision-kind'
import { activityVerb, activityDot } from '../../renderer/tray-ui/activity-label'

describe('decision countdown', () => {
  it('counts whole seconds up and never goes negative', () => {
    expect(secondsLeft(30_000, 0)).toBe(30)
    expect(secondsLeft(30_000, 100)).toBe(30)
    expect(secondsLeft(30_000, 29_001)).toBe(1)
    expect(secondsLeft(30_000, 31_000)).toBe(0)
  })

  it('says what will happen if nobody answers', () => {
    expect(countdownText('block', 12)).toBe('No response in 12s will block this request.')
    expect(countdownText('allow', 12)).toBe('No response in 12s will send this request anyway.')
  })

  it('explains both automatic outcomes', () => {
    expect(timeoutNotice(false).title).toBe('Blocked automatically')
    expect(timeoutNotice(true).title).toBe('Sent automatically')
  })
})

describe('activity list wording', () => {
  it('shows how a request ended, including automatic outcomes', () => {
    expect(activityVerb({ action: 'warn', outcome: 'timeout-allowed' })).toBe('Sent (no response)')
    expect(activityVerb({ action: 'block', outcome: 'timeout-blocked' })).toBe('Blocked (no response)')
    expect(activityVerb({ action: 'block', outcome: 'allowed' })).toBe('Allowed')
    expect(activityVerb({ action: 'block', outcome: 'blocked' })).toBe('Blocked')
  })

  it('falls back to the rule action while the prompt is still open', () => {
    expect(activityVerb({ action: 'block' })).toBe('Blocked')
    expect(activityVerb({ action: 'warn' })).toBe('Flagged')
  })

  it('is red only when the request was actually stopped', () => {
    expect(activityDot({ action: 'block', outcome: 'allowed' })).toBe('dot-warn')
    expect(activityDot({ action: 'warn', outcome: 'timeout-blocked' })).toBe('dot-danger')
  })
})
