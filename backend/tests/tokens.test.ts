import { describe, it, expect } from 'vitest'
import { tenants, policies, matters } from '../src/db/schema.js'
import {
  parseToken, generateSecret, formatToken, hashToken, compareToken,
} from '../src/auth/tokens.js'

describe('schema exports', () => {
  it('exports all three tables', () => {
    expect(tenants).toBeDefined()
    expect(policies).toBeDefined()
    expect(matters).toBeDefined()
  })
})

describe('parseToken', () => {
  const SECRET = 'a'.repeat(32)

  it('parses a valid org token', () => {
    const result = parseToken(`ps_live_acmelaw_${SECRET}`)
    expect(result).toEqual({ prefix: 'ps_live', slug: 'acmelaw', secret: SECRET })
  })

  it('parses a valid admin token', () => {
    expect(parseToken(`ps_adm_acmelaw_${SECRET}`)?.prefix).toBe('ps_adm')
  })

  it('returns null for wrong prefix', () => {
    expect(parseToken(`ps_test_acmelaw_${SECRET}`)).toBeNull()
  })

  it('returns null for secret shorter than 32 chars', () => {
    expect(parseToken('ps_live_acmelaw_tooshort')).toBeNull()
  })

  it('returns null for malformed string', () => {
    expect(parseToken('invalid')).toBeNull()
  })
})

describe('generateSecret', () => {
  it('produces a 32-char base64url string', () => {
    const s = generateSecret()
    expect(s).toHaveLength(32)
    expect(s).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('produces unique values each call', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })
})

describe('hashToken / compareToken', () => {
  it('round-trips: correct secret matches, wrong does not', async () => {
    const secret = generateSecret()
    const hash = await hashToken(secret)
    expect(await compareToken(secret, hash)).toBe(true)
    expect(await compareToken('wrongsecret123456789012345678901', hash)).toBe(false)
  })
})
