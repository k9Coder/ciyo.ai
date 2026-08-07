import { describe, it, expect, beforeEach } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from '../../tests/helpers/db.js'
import { db } from '../db/client.js'
import { desktopAuthCodes, deviceTokens } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import {
  isLoopbackRedirectUri,
  isValidCodeChallenge,
  createDesktopAuthCode,
  exchangeDesktopAuthCode,
} from './service.js'

const REDIRECT = 'http://127.0.0.1:54321/callback'

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

describe('isLoopbackRedirectUri', () => {
  it('accepts a 127.0.0.1 http URL', () => {
    expect(isLoopbackRedirectUri('http://127.0.0.1:54321/callback')).toBe(true)
  })
  it('rejects localhost (desktop app always uses the literal IP)', () => {
    expect(isLoopbackRedirectUri('http://localhost:54321/callback')).toBe(false)
  })
  it('rejects https and other hosts', () => {
    expect(isLoopbackRedirectUri('https://127.0.0.1:54321/callback')).toBe(false)
    expect(isLoopbackRedirectUri('http://evil.example.com/callback')).toBe(false)
  })
  it('rejects garbage input', () => {
    expect(isLoopbackRedirectUri('not-a-url')).toBe(false)
  })
  it('rejects alternate IPv4 encodings that normalise to 127.0.0.1', () => {
    // WHATWG URL canonicalises all of these to hostname 127.0.0.1; only the
    // literal dotted-quad the desktop app actually sends is allowed.
    expect(isLoopbackRedirectUri('http://2130706433/callback')).toBe(false)   // decimal
    expect(isLoopbackRedirectUri('http://0177.0.0.1/callback')).toBe(false)   // octal
    expect(isLoopbackRedirectUri('http://0x7f.0.0.1/callback')).toBe(false)   // hex
  })
})

describe('isValidCodeChallenge', () => {
  it('accepts a real base64url S256 challenge (43 chars)', () => {
    const challenge = createHash('sha256').update(randomBytes(32)).digest('base64url')
    expect(challenge).toHaveLength(43)
    expect(isValidCodeChallenge(challenge)).toBe(true)
  })
  it('rejects too-short, wrong-charset, and empty challenges', () => {
    expect(isValidCodeChallenge('tooshort')).toBe(false)
    expect(isValidCodeChallenge('a'.repeat(43) + '=')).toBe(false)  // padding not allowed
    expect(isValidCodeChallenge('has spaces and+slashes/'.padEnd(43, 'x'))).toBe(false)
    expect(isValidCodeChallenge('')).toBe(false)
  })
})

describe('createDesktopAuthCode / exchangeDesktopAuthCode', () => {
  let tenantId: string
  let memberId: string

  beforeEach(async () => {
    await truncateAll()
    const t = await buildTestTenant()
    tenantId = t.tenantId
    const user = await buildTestUser('clerk_desktop_test', 'desktop@example.com')
    memberId = await buildTestMember(tenantId, user)
  })

  it('exchanges a valid code + matching verifier for a device token', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createDesktopAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })

    const result = await exchangeDesktopAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.token).toMatch(/^pd_[0-9a-f-]{36}_[A-Za-z0-9_-]{32}$/)
      expect(result.tenantId).toBe(tenantId)
    }

    const rows = await db.select().from(deviceTokens).where(eq(deviceTokens.tenantId, tenantId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.memberId).toBe(memberId)
  })

  it('rejects a mismatched verifier', async () => {
    const { challenge } = pkcePair()
    const { code } = await createDesktopAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })
    const wrongVerifier = randomBytes(32).toString('base64url')

    const result = await exchangeDesktopAuthCode({ code, codeVerifier: wrongVerifier, redirectUri: REDIRECT })
    expect('error' in result).toBe(true)
  })

  it('rejects reuse of an already-exchanged code', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createDesktopAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })

    const first = await exchangeDesktopAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in first).toBe(false)

    const second = await exchangeDesktopAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in second).toBe(true)
  })

  it('rejects an expired code', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createDesktopAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })
    await db.update(desktopAuthCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(desktopAuthCodes.code, code))

    const result = await exchangeDesktopAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in result).toBe(true)
  })

  it('rejects a redirect_uri that does not match the one the code was issued for', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createDesktopAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })

    const result = await exchangeDesktopAuthCode({ code, codeVerifier: verifier, redirectUri: 'http://127.0.0.1:9999/callback' })
    expect('error' in result).toBe(true)
  })

  it('rejects an unknown code', async () => {
    const result = await exchangeDesktopAuthCode({ code: 'nonexistent', codeVerifier: 'x', redirectUri: REDIRECT })
    expect('error' in result).toBe(true)
  })
})
