import { describe, it, expect } from 'vitest'
import {
  PLAN_LIMITS,
  isOverScanLimit,
  isOverSeatLimit,
  getScanLimit,
  getSeatLimit,
  assertRuleKindAllowed,
} from './limits.js'

describe('assertRuleKindAllowed — enforced in service layer (covers assistant path)', () => {
  it('rejects a pattern rule on the free plan with a 402-tagged error', () => {
    try {
      assertRuleKindAllowed('free', 'pattern')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as { statusCode?: number }).statusCode).toBe(402)
      expect((e as Error).message).toContain('free')
    }
  })

  it('rejects entropy/score on starter (keyword+pattern only)', () => {
    expect(() => assertRuleKindAllowed('starter', 'entropy')).toThrow()
    expect(() => assertRuleKindAllowed('starter', 'score')).toThrow()
  })

  it('allows keyword on every plan', () => {
    for (const plan of ['free', 'starter', 'business', 'enterprise', 'pilot'] as const) {
      expect(() => assertRuleKindAllowed(plan, 'keyword')).not.toThrow()
    }
  })

  it('allows pattern/entropy/score on business', () => {
    expect(() => assertRuleKindAllowed('business', 'pattern')).not.toThrow()
    expect(() => assertRuleKindAllowed('business', 'entropy')).not.toThrow()
    expect(() => assertRuleKindAllowed('business', 'score')).not.toThrow()
  })
})

describe('PlanLimits — new fields exist on all plans', () => {
  const plans = ['free', 'starter', 'business', 'enterprise', 'pilot'] as const

  it.each(plans)('%s has assistantMaximumTokens', (plan) => {
    expect(typeof PLAN_LIMITS[plan].assistantMaximumTokens).toBe('number')
  })

  it.each(plans)('%s has assistantPromptsADay', (plan) => {
    expect(typeof PLAN_LIMITS[plan].assistantPromptsADay).toBe('number')
  })
})

describe('pilot plan limits', () => {
  const pilot = PLAN_LIMITS['pilot']

  it('has 3 seats', () => {
    expect(pilot.maxSeats).toBe(3)
  })
  it('has unlimited monthly scans', () => {
    expect(pilot.monthlyScans).toBe(-1)
  })
  it('has assistant enabled', () => {
    expect(pilot.assistantEnabled).toBe(true)
  })
  it('has advanced analytics', () => {
    expect(pilot.advancedAnalytics).toBe(true)
  })
  it('allows all rule kinds', () => {
    expect(pilot.allowedRuleKinds).toEqual(['keyword', 'pattern', 'entropy', 'score'])
  })
  it('has 5 prompts per day', () => {
    expect(pilot.assistantPromptsADay).toBe(5)
  })
  it('has unlimited tokens (-1)', () => {
    expect(pilot.assistantMaximumTokens).toBe(-1)
  })
})

describe('existing plans are not broken', () => {
  it('free: maxSeats=3, assistantEnabled=false', () => {
    expect(PLAN_LIMITS['free'].maxSeats).toBe(3)
    expect(PLAN_LIMITS['free'].assistantEnabled).toBe(false)
    expect(PLAN_LIMITS['free'].assistantPromptsADay).toBe(-1)
    expect(PLAN_LIMITS['free'].assistantMaximumTokens).toBe(-1)
  })
  it('business: assistantEnabled=true, unlimited prompts', () => {
    expect(PLAN_LIMITS['business'].assistantEnabled).toBe(true)
    expect(PLAN_LIMITS['business'].assistantPromptsADay).toBe(-1)
  })
})

describe('limit helpers work with pilot', () => {
  it('isOverScanLimit returns false for pilot at any count', () => {
    expect(isOverScanLimit('pilot', 1_000_000)).toBe(false)
  })
  it('isOverSeatLimit returns false for pilot under cap', () => {
    expect(isOverSeatLimit('pilot', 2)).toBe(false)
  })
  it('isOverSeatLimit returns true for pilot at cap', () => {
    expect(isOverSeatLimit('pilot', 3)).toBe(true)
  })
  it('getScanLimit returns -1 for pilot', () => {
    expect(getScanLimit('pilot')).toBe(-1)
  })
  it('getSeatLimit returns 3 for pilot', () => {
    expect(getSeatLimit('pilot')).toBe(3)
  })
})
