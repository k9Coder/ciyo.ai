import { describe, it, expect, beforeEach } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { truncateAll, buildTestTenant, buildTestUser, buildTestMember } from '../../tests/helpers/db.js'
import { db } from '../db/client.js'
import { extensionAuthCodes, deviceTokens } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import {
  isExtensionRedirectUri,
  isValidCodeChallenge,
  createExtensionAuthCode,
  exchangeExtensionAuthCode,
} from './service.js'

const REDIRECT = 'https://kdbpjcacajffjaicggkbelmocbipimoc.chromiumapp.org/callback'

function pkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

describe('isExtensionRedirectUri', () => {
  it('accepts a chromiumapp.org URL with a 32-char a-p extension id', () => {
    expect(isExtensionRedirectUri(REDIRECT)).toBe(true)
    expect(isExtensionRedirectUri('https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/')).toBe(true)
  })
  it('rejects http and other hosts', () => {
    expect(isExtensionRedirectUri('http://kdbpjcacajffjaicggkbelmocbipimoc.chromiumapp.org/callback')).toBe(false)
    expect(isExtensionRedirectUri('https://evil.example.com/callback')).toBe(false)
  })
  it('rejects an extension id with characters outside a-p', () => {
    // Real Chrome extension IDs only ever use the 16 letters a-p; anything
    // with e.g. 'z' or a digit couldn't be a real extension's redirect.
    expect(isExtensionRedirectUri('https://kdbpjcacajffjaicggkbelmocbipimo9.chromiumapp.org/callback')).toBe(false)
    expect(isExtensionRedirectUri('https://short.chromiumapp.org/callback')).toBe(false)
  })
  it('rejects garbage input', () => {
    expect(isExtensionRedirectUri('not-a-url')).toBe(false)
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
    expect(isValidCodeChallenge('')).toBe(false)
  })
})

describe('createExtensionAuthCode / exchangeExtensionAuthCode', () => {
  let tenantId: string
  let memberId: string

  beforeEach(async () => {
    await truncateAll()
    const t = await buildTestTenant()
    tenantId = t.tenantId
    const user = await buildTestUser('clerk_extension_test', 'extension@example.com')
    memberId = await buildTestMember(tenantId, user)
  })

  it('exchanges a valid code + matching verifier for a device token tagged "extension"', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createExtensionAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })

    const result = await exchangeExtensionAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in result).toBe(false)
    if (!('error' in result)) {
      expect(result.token).toMatch(/^pd_[0-9a-f-]{36}_[A-Za-z0-9_-]{32}$/)
      expect(result.tenantId).toBe(tenantId)
    }

    const rows = await db.select().from(deviceTokens).where(eq(deviceTokens.tenantId, tenantId))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.memberId).toBe(memberId)
    expect(rows[0]!.client).toBe('extension')
  })

  it('rejects a mismatched verifier', async () => {
    const { challenge } = pkcePair()
    const { code } = await createExtensionAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })
    const wrongVerifier = randomBytes(32).toString('base64url')

    const result = await exchangeExtensionAuthCode({ code, codeVerifier: wrongVerifier, redirectUri: REDIRECT })
    expect('error' in result).toBe(true)
  })

  it('rejects reuse of an already-exchanged code', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createExtensionAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })

    const first = await exchangeExtensionAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in first).toBe(false)

    const second = await exchangeExtensionAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in second).toBe(true)
  })

  it('rejects an expired code', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createExtensionAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })
    await db.update(extensionAuthCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(extensionAuthCodes.code, code))

    const result = await exchangeExtensionAuthCode({ code, codeVerifier: verifier, redirectUri: REDIRECT })
    expect('error' in result).toBe(true)
  })

  it('rejects a redirect_uri that does not match the one the code was issued for', async () => {
    const { verifier, challenge } = pkcePair()
    const { code } = await createExtensionAuthCode({ memberId, tenantId, codeChallenge: challenge, redirectUri: REDIRECT })

    const result = await exchangeExtensionAuthCode({ code, codeVerifier: verifier, redirectUri: 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/callback' })
    expect('error' in result).toBe(true)
  })

  it('rejects an unknown code', async () => {
    const result = await exchangeExtensionAuthCode({ code: 'nonexistent', codeVerifier: 'x', redirectUri: REDIRECT })
    expect('error' in result).toBe(true)
  })
})
