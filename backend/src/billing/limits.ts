export type Plan = 'free' | 'starter' | 'business' | 'enterprise'

export interface PlanLimits {
  maxSeats:          number    // -1 = unlimited
  monthlyScans:      number    // -1 = unlimited
  allowedRuleKinds:  ReadonlyArray<'keyword' | 'pattern' | 'entropy' | 'score'>
  assistantEnabled:  boolean
  advancedAnalytics: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxSeats:          3,
    monthlyScans:      500,
    allowedRuleKinds:  ['keyword'],
    assistantEnabled:  false,
    advancedAnalytics: false,
  },
  starter: {
    maxSeats:          25,
    monthlyScans:      50_000,
    allowedRuleKinds:  ['keyword', 'pattern'],
    assistantEnabled:  false,
    advancedAnalytics: false,
  },
  business: {
    maxSeats:          -1,
    monthlyScans:      -1,
    allowedRuleKinds:  ['keyword', 'pattern', 'entropy', 'score'],
    assistantEnabled:  true,
    advancedAnalytics: true,
  },
  enterprise: {
    maxSeats:          -1,
    monthlyScans:      -1,
    allowedRuleKinds:  ['keyword', 'pattern', 'entropy', 'score'],
    assistantEnabled:  true,
    advancedAnalytics: true,
  },
}

export function isOverScanLimit(plan: Plan, monthlyScans: number): boolean {
  const limit = PLAN_LIMITS[plan]?.monthlyScans ?? 500
  return limit !== -1 && monthlyScans >= limit
}

export function isOverSeatLimit(plan: Plan, currentSeats: number): boolean {
  const limit = PLAN_LIMITS[plan]?.maxSeats ?? 3
  return limit !== -1 && currentSeats >= limit
}

export function isRuleKindAllowed(plan: Plan, kind: string): boolean {
  const kinds = PLAN_LIMITS[plan]?.allowedRuleKinds ?? ['keyword']
  return (kinds as string[]).includes(kind)
}

export function getScanLimit(plan: Plan): number {
  return PLAN_LIMITS[plan]?.monthlyScans ?? 500
}

export function getSeatLimit(plan: Plan): number {
  return PLAN_LIMITS[plan]?.maxSeats ?? 3
}
