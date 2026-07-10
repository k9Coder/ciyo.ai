/**
 * Invite-acceptance API coverage.
 *
 * IMPORTANT HARNESS FINDING (discovered while writing this file, not assumed
 * up front): `POST /v1/invites` runs behind `requireAdminTokenOrClerkAdmin`
 * (backend/src/auth/middleware.ts), but the route handler itself
 * (backend/src/invites/router.ts) additionally requires `req.member` to be
 * set:
 *
 *   if (!req.member) return reply.status(403).send({ error: 'Clerk auth required to create invites' })
 *
 * `req.member` is ONLY populated by the Clerk-JWT path (`resolveClerkJwt`).
 * The plain `ps_adm_*` admin token used everywhere else in this suite
 * (`adminHeaders()`) passes the preHandler (`resolveOrgToken` sets
 * `req.tenant`/`req.tokenPrefix`) but never sets `req.member` — so creating
 * an invite is impossible with the tokens this harness's HTTP helpers
 * provide. It requires a genuine Clerk super_admin session JWT.
 *
 * The harness's only Clerk identity is the single seeded E2E user
 * (`E2E_CLERK_USER_ID` / `E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD`
 * in e2e/.env.e2e), and the only way this repo mints a session JWT for that
 * user is `@clerk/testing/playwright`'s `clerkSetup()` + a real browser
 * sign-in (see pretzel-console/e2e/auth.setup.ts), which produces a browser
 * storageState cookie session for the `admin` (Chromium) Playwright project
 * — not a bearer JWT string usable from the headless `api` project's plain
 * HTTP request context. There is no server-side JWT-minting helper in this
 * codebase (Clerk's Backend API does support creating sign-in/testing
 * tokens for automation, but wiring that up is new infrastructure beyond a
 * single spec file and was out of scope here).
 *
 * Net effect: NEITHER invite creation NOR invite acceptance can be exercised
 * end-to-end over live HTTP in the `api` project as currently wired — both
 * require a Clerk JWT this harness cannot produce outside a browser. This is
 * a stronger limitation than "just the accept step needs a second user."
 *
 * Covered live over HTTP in this file:
 *   - POST /v1/invites            auth rejections: 401 (no token), 403 (non-admin
 *                                  org token), 403 (admin token without Clerk
 *                                  session — the finding above), 401 (garbage token)
 *   - GET  /v1/invites/:token     public preview: valid / expired / already-used /
 *                                  restricted-email / unknown-token — using invite
 *                                  rows seeded directly via DB insert (the same
 *                                  technique already used for expiry/used-state
 *                                  manipulation, extended to creation since the
 *                                  create endpoint itself is unreachable here)
 *   - POST /v1/invites/:token/accept  auth rejection: 401 (no/garbage token)
 *
 * NOT covered live (documented, not faked) — all require a real Clerk JWT:
 *   - POST /v1/invites (success path, role validation, 201 shape)
 *   - POST /v1/invites/:token/accept (success path, 409 used, 4xx expired,
 *     4xx email mismatch, 402 seat-cap without burning the invite)
 *
 * If a Clerk sign-in-token minting helper is added to this harness later
 * (e.g. via Clerk Backend API `signInTokens.createSignInToken` + a session
 * exchange, callable from Node without a browser), promote the `test.fixme`
 * blocks below to real requests — the intended flow is documented at each one.
 */
import { test, expect, request as playwrightRequest } from '@playwright/test'
import postgres from 'postgres'
import { randomBytes } from 'node:crypto'
import { orgHeaders } from './helpers/org-headers.js'
import { adminHeaders } from './helpers/admin-headers.js'
import { getSeedState } from './helpers/seed-state.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

// Direct DB access is used ONLY to induce states the HTTP API cannot produce
// here: seeding invite rows (create is unreachable — see file header) and
// backdating expiresAt / forcing usedAt (no HTTP endpoint does either).
// E2E_DATABASE_URL must point at a local/e2e database — global-setup.ts
// already refuses to run otherwise, but this file opens its own connection
// so it re-checks independently before touching anything.
const DB_URL = process.env.E2E_DATABASE_URL
if (!DB_URL) {
  throw new Error('E2E_DATABASE_URL is not set — required for invites.spec.ts DB-state seeding.')
}
if (!/localhost|127\.0\.0\.1/.test(DB_URL)) {
  throw new Error(`E2E_DATABASE_URL does not look local (${DB_URL}) — refusing to connect.`)
}

const sql = postgres(DB_URL, { max: 2 })

test.afterAll(async () => {
  await sql.end()
})

function runId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function generateToken(): string {
  // Mirrors backend/src/invites/service.ts generateToken() — 32 random bytes hex.
  return randomBytes(32).toString('hex')
}

interface SeededInvite {
  token:     string
  tenantId:  string
  email:     string | null
  role:      'member' | 'division_admin' | 'super_admin'
  expiresAt: Date
}

/** Inserts an invite row directly (invite creation itself needs a Clerk JWT — see file header). */
async function seedInvite(opts: {
  tenantId:   string
  email?:     string | null
  role?:      'member' | 'division_admin' | 'super_admin'
  expiresAt?: Date
  usedAt?:    Date | null
}): Promise<SeededInvite> {
  const token     = generateToken()
  const role      = opts.role ?? 'member'
  const expiresAt = opts.expiresAt ?? new Date(Date.now() + 72 * 60 * 60 * 1000)
  const email     = opts.email === undefined ? null : opts.email

  await sql`
    INSERT INTO invites (tenant_id, token, email, role, expires_at, used_at)
    VALUES (${opts.tenantId}, ${token}, ${email}, ${role}, ${expiresAt}, ${opts.usedAt ?? null})
  `
  return { token, tenantId: opts.tenantId, email, role, expiresAt }
}

async function deleteInviteByToken(token: string): Promise<void> {
  await sql`DELETE FROM invites WHERE token = ${token}`
}

test.describe('Invites API', () => {
  test.describe.configure({ mode: 'parallel' })

  // ── Create — auth rejections only (success path needs a Clerk JWT) ──────

  test('POST /v1/invites returns 401 without a token', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/invites`, {
      data: { email: `invite-noauth-${runId()}@e2e.test` },
    })
    expect(res.status()).toBe(401)
    await api.dispose()
  })

  test('POST /v1/invites returns 401 for a garbage bearer token', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/invites`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
      data:    { email: `invite-garbage-${runId()}@e2e.test` },
    })
    // Doesn't match the ps_* format, so it's routed to the Clerk verifier,
    // which rejects it as an invalid Clerk token.
    expect(res.status()).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/invalid clerk token/i)
    await api.dispose()
  })

  test('POST /v1/invites returns 403 for a non-admin org token', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/invites`, {
      headers: orgHeaders(),
      data:    { email: `invite-nonadmin-${runId()}@e2e.test` },
    })
    // orgHeaders() carries a ps_live (non-admin) token; requireAdminTokenOrClerkAdmin
    // rejects it at the preHandler before the route body ever runs.
    expect(res.status()).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/admin token required/i)
    await api.dispose()
  })

  test('POST /v1/invites returns 403 for a valid ps_adm admin token without a Clerk session', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/invites`, {
      headers: adminHeaders(),
      data:    { email: `invite-admtoken-${runId()}@e2e.test` },
    })
    // See file header: the route requires req.member, which the ps_adm path
    // never sets. This is the concrete harness limitation blocking a live
    // create test — asserted here so a future fix to either the route or the
    // harness's auth helpers is caught by this test flipping to something
    // else (201) rather than silently passing.
    expect(res.status()).toBe(403)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/clerk auth required/i)
    await api.dispose()
  })

  // ── Public preview — real HTTP against DB-seeded invite rows ────────────
  // (creation itself needs a Clerk JWT we don't have — see file header — so
  // rows are seeded directly, matching backend/src/invites/service.ts's
  // createInvite() token format exactly. Everything from here down through
  // the GET call is a real HTTP request/response against the live backend.)

  test('GET /v1/invites/:token returns a valid preview for a fresh invite', async () => {
    const { tenantId } = getSeedState()
    const email = `invite-preview-${runId()}@e2e.test`
    const invite = await seedInvite({ tenantId, email, role: 'member' })

    const api = await playwrightRequest.newContext()
    const res = await api.get(`${BACKEND}/v1/invites/${invite.token}`)

    expect(res.status()).toBe(200)
    // S3: the preview never echoes the restricted email (targeted-phishing vector).
    const preview = await res.json() as {
      tenantName: string; role: string; email?: string; expiresAt: string; valid: boolean
    }
    expect(preview.valid).toBe(true)
    expect(preview.email).toBeUndefined()
    expect(preview.role).toBe('member')
    expect(typeof preview.tenantName).toBe('string')

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  test('GET /v1/invites/:token returns a valid preview for an open (no-email) invite', async () => {
    const { tenantId } = getSeedState()
    const invite = await seedInvite({ tenantId, email: null, role: 'member' })

    const api = await playwrightRequest.newContext()
    const res = await api.get(`${BACKEND}/v1/invites/${invite.token}`)

    expect(res.status()).toBe(200)
    const preview = await res.json() as { email?: string; valid: boolean }
    expect(preview.email).toBeUndefined()
    expect(preview.valid).toBe(true)

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  test('GET /v1/invites/:token returns a uniform valid:false body for an unknown token', async () => {
    // S3: missing tokens return the same 200 { valid:false } body as expired/used ones
    // so the endpoint does not oracle whether a given token exists.
    const api = await playwrightRequest.newContext()
    const res = await api.get(`${BACKEND}/v1/invites/does-not-exist-${runId()}`)
    expect(res.status()).toBe(200)
    const preview = await res.json() as { valid: boolean; email?: string }
    expect(preview.valid).toBe(false)
    expect(preview.email).toBeUndefined()
    await api.dispose()
  })

  test('GET /v1/invites/:token reports valid:false once expired', async () => {
    const { tenantId } = getSeedState()
    const invite = await seedInvite({
      tenantId,
      email:     `invite-expired-${runId()}@e2e.test`,
      expiresAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour in the past
    })

    const api = await playwrightRequest.newContext()
    const res = await api.get(`${BACKEND}/v1/invites/${invite.token}`)

    expect(res.status()).toBe(200)
    // S3: invalid invites return a uniform body — valid:false, no detail leaked.
    const preview = await res.json() as { valid: boolean; email?: string }
    expect(preview.valid).toBe(false)
    expect(preview.email).toBeUndefined()

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  test('GET /v1/invites/:token reports valid:false once already used', async () => {
    const { tenantId } = getSeedState()
    const invite = await seedInvite({
      tenantId,
      email:  `invite-used-${runId()}@e2e.test`,
      usedAt: new Date(),
    })

    const api = await playwrightRequest.newContext()
    const res = await api.get(`${BACKEND}/v1/invites/${invite.token}`)

    expect(res.status()).toBe(200)
    const preview = await res.json() as { valid: boolean }
    expect(preview.valid).toBe(false)

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  test('GET /v1/invites/:token does NOT surface the restricted email (S3 anti-phishing)', async () => {
    const { tenantId } = getSeedState()
    const restrictedEmail = `invite-restricted-${runId()}@e2e.test`
    const invite = await seedInvite({ tenantId, email: restrictedEmail, role: 'division_admin' })

    const api = await playwrightRequest.newContext()
    const res = await api.get(`${BACKEND}/v1/invites/${invite.token}`)

    expect(res.status()).toBe(200)
    const preview = await res.json() as { email?: string; role: string; valid: boolean }
    // The email must not be exposed to an unauthenticated caller; accept re-checks it.
    expect(preview.email).toBeUndefined()
    expect(preview.role).toBe('division_admin')
    expect(preview.valid).toBe(true)

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  // ── Accept — auth rejections only (everything past auth needs a Clerk JWT) ──

  test('POST /v1/invites/:token/accept returns 401 without a token', async () => {
    const { tenantId } = getSeedState()
    const invite = await seedInvite({ tenantId, email: `invite-accept-noauth-${runId()}@e2e.test` })

    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/invites/${invite.token}/accept`)
    expect(res.status()).toBe(401)

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  test('POST /v1/invites/:token/accept returns 401 for a garbage bearer token', async () => {
    const { tenantId } = getSeedState()
    const invite = await seedInvite({ tenantId, email: `invite-accept-garbage-${runId()}@e2e.test` })

    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/invites/${invite.token}/accept`, {
      headers: { Authorization: 'Bearer not-a-real-token' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/invalid clerk token/i)

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  test('POST /v1/invites/:token/accept returns 401 for an org (ps_live) token — accept requires Clerk auth', async () => {
    const { tenantId } = getSeedState()
    const invite = await seedInvite({ tenantId, email: `invite-accept-orgtoken-${runId()}@e2e.test` })

    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/invites/${invite.token}/accept`, {
      headers: orgHeaders(),
    })
    // requireClerkAuth always routes through resolveClerkJwt regardless of
    // prefix, so a ps_live token fails Clerk verification outright.
    expect(res.status()).toBe(401)

    await deleteInviteByToken(invite.token)
    await api.dispose()
  })

  // ── Deferred — require a real Clerk JWT (see file header) ───────────────
  // Left as explicit, skipped placeholders so the gap is visible in the test
  // report rather than silently absent. Each documents the intended flow.

  test.fixme(
    'POST /v1/invites/:token/accept creates membership and the new member becomes visible via GET /v1/members — ' +
    'requires a real Clerk session JWT for the accepting user; this harness can only mint one for the ' +
    'single pre-seeded super_admin (already a member), and only via a browser Clerk sign-in, not from ' +
    'the headless api project',
    async () => {
      // Intended flow once a Clerk JWT is mintable for a fresh, non-member user:
      //   1. Seed (or admin-create, once that's reachable) an invite for new-user@example.com
      //   2. Obtain a Clerk session JWT for that user
      //   3. POST /v1/invites/:token/accept with that JWT -> 200, member returned, role matches invite
      //   4. GET /v1/members (adminHeaders()) includes the new member by email
    }
  )

  test.fixme(
    'POST /v1/invites/:token/accept returns 409 for an already-used invite (authenticated) — ' +
    'same Clerk-JWT limitation as above; the 409 path is unreachable without first passing auth',
    async () => {}
  )

  test.fixme(
    'POST /v1/invites/:token/accept returns 4xx for an expired invite (authenticated) — ' +
    'same Clerk-JWT limitation as above',
    async () => {}
  )

  test.fixme(
    'POST /v1/invites/:token/accept returns 4xx when the invite email does not match the accepting user — ' +
    'same Clerk-JWT limitation as above',
    async () => {}
  )

  test.fixme(
    'POST /v1/invites/:token/accept returns 402 without burning the invite when the tenant is at its seat cap — ' +
    'same Clerk-JWT limitation as above; backend/src/invites/service.ts checkSeatLimit() and the ' +
    'transactional re-check that prevents burning the invite on a 402 are unit-testable but not ' +
    'reachable live here',
    async () => {}
  )

  test.fixme(
    'POST /v1/invites (success path) returns 201 with token/url/expiresAt shape and honours role — ' +
    'requires a real Clerk super_admin session JWT; see file header for why adminHeaders() cannot reach this route',
    async () => {}
  )
})
