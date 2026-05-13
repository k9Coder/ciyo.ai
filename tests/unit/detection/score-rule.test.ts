import { describe, it, expect } from 'vitest'
import type { ScoreRule } from '@/detection/types'
import { ScoreRuleSchema } from '@/policy/schema'

describe('ScoreRule types', () => {
  it('ScoreRuleSchema validates a well-formed score rule', () => {
    const rule: ScoreRule = {
      kind: 'score',
      id: 'test-score',
      name: 'Test Score',
      description: 'Test',
      severity: 'high',
      action: 'block',
      enabled: true,
      tags: [],
      signals: [{ id: 'paste_detected', description: 'Paste', points: 20, enabled: true }],
      warnThreshold: 50,
      confirmThreshold: 80,
    }
    expect(ScoreRuleSchema.safeParse(rule).success).toBe(true)
  })

  it('rejects a rule missing warnThreshold', () => {
    const bad = { kind: 'score', id: 'x', name: 'x', description: '', severity: 'low', action: 'log', enabled: true, tags: [], signals: [], confirmThreshold: 80 }
    expect(ScoreRuleSchema.safeParse(bad).success).toBe(false)
  })
})
