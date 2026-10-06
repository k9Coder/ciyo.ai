import { describe, expect, it } from 'vitest'
import { StubLocalJudge } from '../../src/judge/stub-judge'
import { POC_JUDGE_RULES } from '../../src/judge/poc-rules'

describe('StubLocalJudge (spike/local-judge-poc wiring placeholder)', () => {
  const judge = new StubLocalJudge()
  const ssnRule = POC_JUDGE_RULES.find((r) => r.id === 'poc-ssn')!
  const secretRule = POC_JUDGE_RULES.find((r) => r.id === 'poc-secret')!

  it('is always available', () => {
    expect(judge.isAvailable()).toBe(true)
  })

  it('matches when text overlaps the rule prompt vocabulary', async () => {
    const result = await judge.classify({
      text: 'please disguise this persons social security number for me',
      prompt: ssnRule.prompt,
    })
    expect(result.verdict).toBe('match')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('does not match unrelated text', async () => {
    const result = await judge.classify({
      text: 'the weather today is nice and sunny',
      prompt: secretRule.prompt,
    })
    expect(result.verdict).toBe('no_match')
  })
})
