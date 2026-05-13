import { describe, it, expect } from 'vitest'
import type { ScoreRule } from '@/detection/types'
import { ScoreRuleSchema } from '@/policy/schema'
import { runScoreRuleForTest } from '@/detection/engine'

describe('ScoreRule schema', () => {
  it('validates a well-formed score rule', () => {
    const rule: ScoreRule = {
      kind: 'score',
      id: 'test-score',
      name: 'Test',
      description: '',
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
})

describe('runScoreRuleForTest', () => {
  const baseRule: ScoreRule = {
    kind: 'score',
    id: 'legal',
    name: 'Legal',
    description: '',
    severity: 'high',
    action: 'block',
    enabled: true,
    tags: [],
    signals: [
      { id: 'paste_detected',      description: 'Paste',            points: 20, enabled: true },
      { id: 'long_text',           description: 'Long text',        points: 20, enabled: true, threshold: 5 },
      { id: 'legal_terms_whereas', description: 'Legal terms',      points: 25, enabled: true },
      { id: 'block_quote',         description: 'Block quote (neg)', points: -15, enabled: true },
    ],
    warnThreshold: 50,
    confirmThreshold: 80,
  }

  it('returns no findings when score is below warnThreshold', () => {
    // Only paste_detected fires (20 pts) — below 50 threshold
    expect(runScoreRuleForTest('short text', baseRule, true)).toHaveLength(0)
  })

  it('returns a warn-level finding when score is between thresholds', () => {
    // paste(20) + long_text(20) + legal_terms(25) = 65 — above warn(50) but below confirm(80)
    const text = 'word '.repeat(10) + 'WHEREAS some long legal clause with many many words spread across'
    const findings = runScoreRuleForTest(text, baseRule, true)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.action).toBe('warn')
  })

  it('returns a block-level finding when score >= confirmThreshold', () => {
    const rule: ScoreRule = {
      ...baseRule,
      signals: [
        { id: 'paste_detected',      description: 'Paste',    points: 40, enabled: true },
        { id: 'long_text',           description: 'Long',     points: 20, enabled: true, threshold: 5 },
        { id: 'legal_terms_whereas', description: 'Terms',    points: 25, enabled: true },
      ],
    }
    const text = 'word '.repeat(10) + 'WHEREAS this is a legal document with more words here and there'
    const findings = runScoreRuleForTest(text, rule, true)
    expect(findings).toHaveLength(1)
    expect(findings[0]!.action).toBe('block')
  })

  it('returns no findings when pasteDetected is false', () => {
    const text = 'word '.repeat(10) + 'WHEREAS HEREBY IN WITNESS WHEREOF legal document content'
    expect(runScoreRuleForTest(text, baseRule, false)).toHaveLength(0)
  })

  it('disabled signals do not contribute to score', () => {
    const rule: ScoreRule = {
      ...baseRule,
      signals: [
        { id: 'paste_detected', description: 'Paste', points: 20, enabled: false },
        { id: 'long_text',      description: 'Long',  points: 20, enabled: false, threshold: 5 },
      ],
    }
    expect(runScoreRuleForTest('word '.repeat(10), rule, true)).toHaveLength(0)
  })

  it('block_quote signal subtracts points', () => {
    const rule: ScoreRule = {
      ...baseRule,
      signals: [
        { id: 'paste_detected', description: 'Paste',       points: 40, enabled: true },
        { id: 'long_text',      description: 'Long',        points: 20, enabled: true, threshold: 5 },
        { id: 'block_quote',    description: 'Block quote', points: -15, enabled: true },
      ],
      warnThreshold: 50,
    }
    // paste(40) + long_text(20) - block_quote(15) = 45 < 50 → no finding
    const text = '> quoted line\n' + 'word '.repeat(10)
    expect(runScoreRuleForTest(text, rule, true)).toHaveLength(0)
  })
})
