import { describe, it, expect } from 'vitest'
import { MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH } from '@/content/intercept-messages'

describe('intercept message constants', () => {
  it('are distinct strings', () => {
    const all = [MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH]
    expect(new Set(all).size).toBe(3)
  })

  it('have expected values', () => {
    expect(MSG_INTERCEPT).toBe('MYKKA_INTERCEPT')
    expect(MSG_DECISION).toBe('MYKKA_DECISION')
    expect(MSG_UNLOCK_FETCH).toBe('MYKKA_UNLOCK_FETCH')
  })
})
