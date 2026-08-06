/**
 * Authentication — Clerk PKCE flow.
 *
 * Flow:
 *   1. Generate PKCE code_verifier + code_challenge
 *   2. Open sign-in URL in default browser via shell.openExternal
 *   3. Spin up a one-shot local HTTP server on a random port to receive the callback
 *   4. Exchange the auth code for a session token
 *   5. Store token + tenant info in OS keychain via keytar
 *   6. Persist `authenticated: true` to userData so nag logic knows
 *
 * Once stored the token is loaded on every subsequent launch — no re-auth needed.
 */
import http from 'http'
import crypto from 'crypto'
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { env } from './env'

const KEYCHAIN_SERVICE = 'pretzel-desktop'
const KEYCHAIN_ACCOUNT_TOKEN = 'session-token'
const KEYCHAIN_ACCOUNT_TENANT = 'tenant-id'
const AUTH_STATE_FILENAME = 'auth-state.json'

interface AuthState {
  authenticated: boolean
  tenantId?: string
  authenticatedAt?: string
}

// ─── Auth state (persisted to userData) ────────────────────────────────────

function authStatePath(): string {
  return path.join(app.getPath('userData'), AUTH_STATE_FILENAME)
}

export function loadAuthState(): AuthState {
  try {
    const raw = fs.readFileSync(authStatePath(), 'utf-8')
    return JSON.parse(raw) as AuthState
  } catch {
    return { authenticated: false }
  }
}

export function saveAuthState(state: AuthState): void {
  fs.writeFileSync(authStatePath(), JSON.stringify(state, null, 2), 'utf-8')
}

export function isAuthenticated(): boolean {
  return loadAuthState().authenticated
}

// ─── Keychain ──────────────────────────────────────────────────────────────

export async function storeToken(token: string): Promise<void> {
  const keytar = await import('keytar')
  await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_TOKEN, token)
}

export async function loadToken(): Promise<string | null> {
  const keytar = await import('keytar')
  return keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_TOKEN)
}

export async function storeTenantId(tenantId: string): Promise<void> {
  const keytar = await import('keytar')
  await keytar.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_TENANT, tenantId)
}

export async function loadTenantId(): Promise<string | null> {
  const keytar = await import('keytar')
  return keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_TENANT)
}

export async function clearCredentials(): Promise<void> {
  const keytar = await import('keytar')
  await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_TOKEN)
  await keytar.deletePassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT_TENANT)
  saveAuthState({ authenticated: false })
}

// ─── PKCE helpers ──────────────────────────────────────────────────────────

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

// ─── One-shot callback server ───────────────────────────────────────────────

// Set while a sign-in is in flight so cancelSignIn() can reach into it.
let activeCancel: (() => void) | null = null

function startCallbackServer(): Promise<{ port: number; codePromise: Promise<string>; cancel: () => void }> {
  return new Promise((resolve, reject) => {
    let resolveCode: (code: string) => void
    let rejectCode: (err: Error) => void
    const codePromise = new Promise<string>((res, rej) => {
      resolveCode = res
      rejectCode = rej
    })

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', `http://localhost`)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html' })
        res.end('<h2>Authentication failed. You can close this tab.</h2>')
        server.close()
        rejectCode(new Error(`Auth error: ${error}`))
        return
      }

      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end('<h2>Authenticated! You can close this tab and return to Pretzel.</h2>')
        server.close()
        resolveCode(code)
        return
      }

      res.writeHead(400)
      res.end('Missing code')
    })

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to bind callback server'))
        return
      }
      const cancel = () => {
        clearTimeout(timeoutHandle)
        server.close()
        rejectCode(new Error('Sign-in cancelled'))
      }
      resolve({ port: addr.port, codePromise, cancel })
    })

    server.on('error', reject)

    // Timeout after 90 seconds — long enough for a real browser round-trip,
    // short enough that a silently-failed shell.openExternal() (no default
    // browser registered, sandboxed/headless env) doesn't leave the button
    // stuck on "Opening browser…" for the full 5 minutes it used to.
    const timeoutHandle = setTimeout(() => {
      server.close()
      rejectCode(new Error('Auth timeout — no response after 90s'))
    }, 90 * 1000)
  })
}

/** Aborts an in-flight signIn(), if any. No-op otherwise. */
export function cancelSignIn(): void {
  activeCancel?.()
}

// ─── Main sign-in flow ─────────────────────────────────────────────────────

const PRETZEL_API_BASE = env.PRETZEL_API_URL
const CLERK_PUBLISHABLE_KEY = env.CLERK_PUBLISHABLE_KEY

export async function signIn(): Promise<{ token: string; tenantId: string }> {
  const { verifier, challenge } = generatePKCE()
  const { port, codePromise, cancel } = await startCallbackServer()
  activeCancel = cancel

  try {
    const redirectUri = `http://127.0.0.1:${port}/callback`
    const state = crypto.randomBytes(16).toString('hex')

    const signInUrl = new URL(`${PRETZEL_API_BASE}/auth/desktop/authorize`)
    signInUrl.searchParams.set('response_type', 'code')
    signInUrl.searchParams.set('redirect_uri', redirectUri)
    signInUrl.searchParams.set('code_challenge', challenge)
    signInUrl.searchParams.set('code_challenge_method', 'S256')
    signInUrl.searchParams.set('state', state)
    if (CLERK_PUBLISHABLE_KEY) signInUrl.searchParams.set('publishable_key', CLERK_PUBLISHABLE_KEY)

    // openExternal resolving doesn't guarantee a browser actually launched
    // (no default browser registered, sandboxed env, etc.) — that failure
    // mode is exactly why startCallbackServer()'s timeout exists instead of
    // relying on this call to reject.
    await shell.openExternal(signInUrl.toString())

    const code = await codePromise

    // Exchange code for token
    const tokenRes = await fetch(`${PRETZEL_API_BASE}/auth/desktop/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
    })

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${tokenRes.status}`)
    }

    const { token, tenantId } = await tokenRes.json() as { token: string; tenantId: string }

    await storeToken(token)
    await storeTenantId(tenantId)
    saveAuthState({ authenticated: true, tenantId, authenticatedAt: new Date().toISOString() })

    return { token, tenantId }
  } finally {
    activeCancel = null
  }
}
