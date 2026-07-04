import { describe, it, expect } from 'vitest'
import { MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH } from '@/content/intercept-messages'

describe('intercept message constants', () => {
  it('are distinct strings', () => {
    const all = [MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH]
    expect(new Set(all).size).toBe(3)
  })

  it('have expected values', () => {
    expect(MSG_INTERCEPT).toBe('CIYO_INTERCEPT')
    expect(MSG_DECISION).toBe('CIYO_DECISION')
    expect(MSG_UNLOCK_FETCH).toBe('CIYO_UNLOCK_FETCH')
  })
})
