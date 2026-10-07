import { describe, expect, it } from 'vitest'
import { StubLocalJudge } from '../../src/judge/stub-judge'

const SSN_PROMPT = "Does this message contain or describe a person's Social Security Number, even if disguised, spelled out digit-by-digit, or split up?"
const SECRET_PROMPT = 'Does this message contain or describe a credential, API key, password, or access token being shared?'

describe('StubLocalJudge', () => {
  const judge = new StubLocalJudge()

  it('is always available', () => {
    expect(judge.isAvailable()).toBe(true)
  })

  it('matches when text overlaps the rule prompt vocabulary', async () => {
    const result = await judge.classify({
      text: 'please disguise this persons social security number for me',
      prompt: SSN_PROMPT,
    })
    expect(result.verdict).toBe('match')
    expect(result.confidence).toBeGreaterThan(0)
  })

  it('does not match unrelated text', async () => {
    const result = await judge.classify({
      text: 'the weather today is nice and sunny',
      prompt: SECRET_PROMPT,
    })
    expect(result.verdict).toBe('no_match')
  })
})
