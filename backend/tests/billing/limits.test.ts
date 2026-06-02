import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, isOverScanLimit, isOverSeatLimit, isRuleKindAllowed, getScanLimit, getSeatLimit } from '../../src/billing/limits.js'

describe('PLAN_LIMITS', () => {
  it('free plan allows only keyword rules', () => {
    expect(PLAN_LIMITS.free.allowedRuleKinds).toEqual(['keyword'])
  })
  it('starter plan allows keyword and pattern', () => {
    expect(PLAN_LIMITS.starter.allowedRuleKinds).toContain('keyword')
    expect(PLAN_LIMITS.starter.allowedRuleKinds).toContain('pattern')
    expect(PLAN_LIMITS.starter.allowedRuleKinds).not.toContain('entropy')
  })
  it('business plan allows all rule kinds', () => {
    expect(PLAN_LIMITS.business.allowedRuleKinds).toContain('entropy')
    expect(PLAN_LIMITS.business.allowedRuleKinds).toContain('score')
  })
  it('free plan has no assistant', () => {
    expect(PLAN_LIMITS.free.assistantEnabled).toBe(false)
  })
  it('business plan has assistant', () => {
    expect(PLAN_LIMITS.business.assistantEnabled).toBe(true)
  })
})

describe('isOverScanLimit', () => {
  it('blocks free plan at 500', () => {
    expect(isOverScanLimit('free', 500)).toBe(true)
  })
  it('allows free plan at 499', () => {
    expect(isOverScanLimit('free', 499)).toBe(false)
  })
  it('blocks starter at 50000', () => {
    expect(isOverScanLimit('starter', 50_000)).toBe(true)
  })
  it('business plan is never blocked', () => {
    expect(isOverScanLimit('business', 9_999_999)).toBe(false)
  })
  it('enterprise plan is never blocked', () => {
    expect(isOverScanLimit('enterprise', 9_999_999)).toBe(false)
  })
})

describe('isOverSeatLimit', () => {
  it('blocks free plan at 3 seats', () => {
    expect(isOverSeatLimit('free', 3)).toBe(true)
  })
  it('allows free plan with 2 seats', () => {
    expect(isOverSeatLimit('free', 2)).toBe(false)
  })
  it('blocks starter at 25 seats', () => {
    expect(isOverSeatLimit('starter', 25)).toBe(true)
  })
  it('business plan has unlimited seats', () => {
    expect(isOverSeatLimit('business', 10_000)).toBe(false)
  })
})

describe('isRuleKindAllowed', () => {
  it('free plan cannot use entropy rules', () => {
    expect(isRuleKindAllowed('free', 'entropy')).toBe(false)
  })
  it('free plan cannot use score rules', () => {
    expect(isRuleKindAllowed('free', 'score')).toBe(false)
  })
  it('free plan cannot use pattern rules', () => {
    expect(isRuleKindAllowed('free', 'pattern')).toBe(false)
  })
  it('free plan can use keyword rules', () => {
    expect(isRuleKindAllowed('free', 'keyword')).toBe(true)
  })
  it('starter plan can use pattern rules', () => {
    expect(isRuleKindAllowed('starter', 'pattern')).toBe(true)
  })
  it('business plan can use all rule kinds', () => {
    expect(isRuleKindAllowed('business', 'entropy')).toBe(true)
    expect(isRuleKindAllowed('business', 'score')).toBe(true)
  })
})

describe('getScanLimit / getSeatLimit', () => {
  it('free scan limit is 500', () => {
    expect(getScanLimit('free')).toBe(500)
  })
  it('business scan limit is -1 (unlimited)', () => {
    expect(getScanLimit('business')).toBe(-1)
  })
  it('free seat limit is 3', () => {
    expect(getSeatLimit('free')).toBe(3)
  })
  it('business seat limit is -1 (unlimited)', () => {
    expect(getSeatLimit('business')).toBe(-1)
  })
})
