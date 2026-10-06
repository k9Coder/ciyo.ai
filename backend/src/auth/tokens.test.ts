import { describe, it, expect } from 'vitest'
import { parseDeviceToken, formatDeviceToken, generateSecret } from './tokens.js'

describe('formatDeviceToken / parseDeviceToken', () => {
  it('round-trips a valid device token', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    const secret = generateSecret()
    const token = formatDeviceToken(id, secret)
    expect(token).toBe(`pd_${id}_${secret}`)
    const parsed = parseDeviceToken(token)
    expect(parsed).toEqual({ deviceTokenId: id, secret })
  })

  it('returns null for a malformed token', () => {
    expect(parseDeviceToken('pd_not-a-uuid_shortsecret')).toBeNull()
    expect(parseDeviceToken('ps_live_11111111-2222-3333-4444-555555555555_abc')).toBeNull()
    expect(parseDeviceToken('')).toBeNull()
  })
})
