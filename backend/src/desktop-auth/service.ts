import { randomBytes, createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { desktopAuthCodes, deviceTokens } from '../db/schema.js'
import { generateSecret, hashToken, formatDeviceToken } from '../auth/tokens.js'

const CODE_TTL_MS = 5 * 60 * 1000                    // matches the desktop app's callback-server timeout
const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

// The only client this endpoint serves is the desktop app. A fixed client_id
// lets /authorize reject requests that don't originate from it instead of
// redirecting for any arbitrary value.
export const DESKTOP_CLIENT_ID = 'pretzel-desktop'

// PKCE S256 code_challenge is the base64url-encoded SHA-256 of the verifier:
// always exactly 43 chars from the base64url alphabet (no padding). Reject
// anything else before it's persisted so a too-short/garbage challenge can't
// be stored and later "verified" against.
const CODE_CHALLENGE_SHAPE = /^[A-Za-z0-9_-]{43}$/

export function isValidCodeChallenge(challenge: string): boolean {
  return CODE_CHALLENGE_SHAPE.test(challenge)
}

// Host must be the literal 127.0.0.1 dotted-quad, right after the scheme and
// optional userinfo. WHATWG URL normalises alternate IPv4 encodings (octal
// 0177.0.0.1, decimal 2130706433, hex 0x7f.0.0.1) to 127.0.0.1, so a parsed
// hostname check alone would silently accept those forms — require the
// canonical literal in the raw string too.
const RAW_LOOPBACK_HOST = /^http:\/\/(?:[^@/?#]*@)?127\.0\.0\.1(?::\d+)?(?:[/?#]|$)/

/**
 * The desktop app always constructs redirect_uri as http://127.0.0.1:<port>/callback
 * (electron/auth.ts). Anything else is rejected — a wider allowance here would make
 * /auth/desktop/authorize an open redirect and let a malicious redirect_uri capture
 * the auth code.
 */
export function isLoopbackRedirectUri(redirectUri: string): boolean {
  try {
    const url = new URL(redirectUri)
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && RAW_LOOPBACK_HOST.test(redirectUri)
  } catch {
    return false
  }
}

function generateCode(): string {
  return randomBytes(32).toString('base64url')
}

export async function createDesktopAuthCode(opts: {
  memberId: string
  tenantId: string
  codeChallenge: string
  redirectUri: string
}): Promise<{ code: string }> {
  const code = generateCode()
  await db.insert(desktopAuthCodes).values({
    code,
    memberId:      opts.memberId,
    tenantId:      opts.tenantId,
    codeChallenge: opts.codeChallenge,
    redirectUri:   opts.redirectUri,
    expiresAt:     new Date(Date.now() + CODE_TTL_MS),
  })
  return { code }
}

export async function exchangeDesktopAuthCode(opts: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<{ token: string; tenantId: string } | { error: string }> {
  const now = new Date()
  const [row] = await db.select().from(desktopAuthCodes).where(eq(desktopAuthCodes.code, opts.code)).limit(1)

  // Collapse every failure mode (not found, used, expired, redirect_uri mismatch) into
  // one generic message — don't tell a caller which specific check failed.
  if (!row || row.usedAt || row.expiresAt < now || row.redirectUri !== opts.redirectUri) {
    return { error: 'Invalid or expired code' }
  }

  const computedChallenge = createHash('sha256').update(opts.codeVerifier).digest('base64url')
  if (computedChallenge !== row.codeChallenge) {
    return { error: 'Invalid or expired code' }
  }

  await db.update(desktopAuthCodes).set({ usedAt: now }).where(eq(desktopAuthCodes.id, row.id))

  const secret = generateSecret()
  const [deviceToken] = await db.insert(deviceTokens).values({
    memberId:  row.memberId,
    tenantId:  row.tenantId,
    tokenHash: await hashToken(secret),
    expiresAt: new Date(Date.now() + DEVICE_TOKEN_TTL_MS),
  }).returning({ id: deviceTokens.id })

  return { token: formatDeviceToken(deviceToken!.id, secret), tenantId: row.tenantId }
}
