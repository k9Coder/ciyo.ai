import { randomBytes, createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { extensionAuthCodes, deviceTokens } from '../db/schema.js'
import { generateSecret, hashToken, formatDeviceToken } from '../auth/tokens.js'

const CODE_TTL_MS = 5 * 60 * 1000                    // matches chrome.identity.launchWebAuthFlow's own timeout window
const DEVICE_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000 // 90 days

// The only client this endpoint serves is the Chrome extension. A fixed
// client_id lets /authorize reject requests that don't originate from it
// instead of redirecting for any arbitrary value.
export const EXTENSION_CLIENT_ID = 'pretzel-extension'

// PKCE S256 code_challenge is the base64url-encoded SHA-256 of the verifier:
// always exactly 43 chars from the base64url alphabet (no padding). Reject
// anything else before it's persisted so a too-short/garbage challenge can't
// be stored and later "verified" against.
const CODE_CHALLENGE_SHAPE = /^[A-Za-z0-9_-]{43}$/

export function isValidCodeChallenge(challenge: string): boolean {
  return CODE_CHALLENGE_SHAPE.test(challenge)
}

// chrome.identity.launchWebAuthFlow's reserved callback URL is always
// https://<32-char-extension-id>.chromiumapp.org/<path>. Chrome itself only
// delivers that redirect back to the extension holding that exact ID, so
// (unlike the desktop loopback check) an open-redirect isn't a realistic risk
// here — the shape check exists to reject anything that isn't actually that
// reserved host.
const CHROMIUMAPP_REDIRECT_SHAPE = /^https:\/\/[a-p]{32}\.chromiumapp\.org(?:\/.*)?$/

export function isExtensionRedirectUri(redirectUri: string): boolean {
  return CHROMIUMAPP_REDIRECT_SHAPE.test(redirectUri)
}

function generateCode(): string {
  return randomBytes(32).toString('base64url')
}

export async function createExtensionAuthCode(opts: {
  memberId: string
  tenantId: string
  codeChallenge: string
  redirectUri: string
}): Promise<{ code: string }> {
  const code = generateCode()
  await db.insert(extensionAuthCodes).values({
    code,
    memberId:      opts.memberId,
    tenantId:      opts.tenantId,
    codeChallenge: opts.codeChallenge,
    redirectUri:   opts.redirectUri,
    expiresAt:     new Date(Date.now() + CODE_TTL_MS),
  })
  return { code }
}

export async function exchangeExtensionAuthCode(opts: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<{ token: string; tenantId: string } | { error: string }> {
  const now = new Date()
  const [row] = await db.select().from(extensionAuthCodes).where(eq(extensionAuthCodes.code, opts.code)).limit(1)

  // Collapse every failure mode (not found, used, expired, redirect_uri mismatch) into
  // one generic message — don't tell a caller which specific check failed.
  if (!row || row.usedAt || row.expiresAt < now || row.redirectUri !== opts.redirectUri) {
    return { error: 'Invalid or expired code' }
  }

  const computedChallenge = createHash('sha256').update(opts.codeVerifier).digest('base64url')
  if (computedChallenge !== row.codeChallenge) {
    return { error: 'Invalid or expired code' }
  }

  await db.update(extensionAuthCodes).set({ usedAt: now }).where(eq(extensionAuthCodes.id, row.id))

  const secret = generateSecret()
  const [deviceToken] = await db.insert(deviceTokens).values({
    memberId:  row.memberId,
    tenantId:  row.tenantId,
    tokenHash: await hashToken(secret),
    client:    'extension',
    expiresAt: new Date(Date.now() + DEVICE_TOKEN_TTL_MS),
  }).returning({ id: deviceTokens.id })

  return { token: formatDeviceToken(deviceToken!.id, secret), tenantId: row.tenantId }
}
