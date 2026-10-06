import { describe, it, expect } from 'vitest'
import type { Finding } from '@mykka/detect'
import { redactPrompt, isRedacted, REDACTION_PLACEHOLDER } from '../../../src/content/redact'

function finding(text: string, matched: string, ruleName = 'Rule', nth = 0): Finding {
  let start = -1
  for (let i = 0; i <= nth; i++) start = text.indexOf(matched, start + 1)
  return {
    ruleId: ruleName, ruleName, severity: 'high', action: 'block',
    matchedText: matched, startOffset: start, endOffset: start + matched.length,
  }
}

describe('redactPrompt', () => {
  it('replaces each flagged span and keeps the rest', () => {
    const text = 'Summarise John (SSN 123-45-6789, john@acme.com) please'
    const out = redactPrompt(text, [
      finding(text, '123-45-6789', 'SSN'),
      finding(text, 'john@acme.com', 'Email'),
    ])
    expect(out.text).toBe(`Summarise John (SSN ${REDACTION_PLACEHOLDER}, ${REDACTION_PLACEHOLDER}) please`)
    expect(out.removedCount).toBe(2)
    expect(out.ruleNames).toEqual(['SSN', 'Email'])
  })

  it('collapses overlapping findings into one placeholder', () => {
    const text = 'key sk-ABCDEFGHIJ end'
    const a = finding(text, 'sk-ABCDEFGHIJ', 'API key')
    const b = finding(text, 'ABCDEFGHIJ', 'High entropy')
    const out = redactPrompt(text, [b, a])
    expect(out.text).toBe(`key ${REDACTION_PLACEHOLDER} end`)
    expect(out.removedCount).toBe(1)
    expect(out.ruleNames).toEqual(['API key', 'High entropy'])
  })

  it('is a no-op without findings', () => {
    expect(redactPrompt('hello', [])).toEqual({ text: 'hello', removedCount: 0, ruleNames: [] })
  })

  it('ignores out-of-range or empty spans', () => {
    const bad: Finding = { ruleId: 'x', ruleName: 'x', severity: 'low', action: 'warn', matchedText: '', startOffset: 50, endOffset: 60 }
    expect(redactPrompt('short', [bad]).text).toBe('short')
  })
})

describe('isRedacted', () => {
  it('is false while matched text is still present', () => {
    const text = 'a secret-token b'
    expect(isRedacted(text, [finding(text, 'secret-token')])).toBe(false)
  })
  it('is true once every matched text is gone', () => {
    const text = 'a secret-token b'
    expect(isRedacted(`a ${REDACTION_PLACEHOLDER} b`, [finding(text, 'secret-token')])).toBe(true)
  })
})
