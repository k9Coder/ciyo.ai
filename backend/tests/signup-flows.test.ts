/**
 * The four "brand-new user" sign-up flows, end to end at the API level.
 *
 *   console   / no org        -> self-serve personal org, super_admin
 *   console   / existing org  -> admin-added email is claimed, no personal org
 *   extension / no org        -> rejected, nothing is created (extension never makes orgs)
 *   extension / existing org  -> signed in on the FIRST attempt, even when the Clerk
 *                                webhook has not landed yet (no "sign up, then sign in again")
 *
 * Clerk is mocked at its two seams (JWT verification and the Backend API user lookup);
 * the webhook goes through the real router with svix verification stubbed.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest'
import supertest from 'supertest'
import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { startTestApp } from './helpers/setup.js'
import { db } from '../src/db/client.js'
import { tenants, members, users, policies } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

const JWT = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'
const REDIRECT = 'https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/callback'

const { mockVerifyToken, mockGetUser } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn(),
  mockGetUser: vi.fn(),
}))

vi.mock('@clerk/backend', () => ({
  verifyToken: mockVerifyToken,
  createClerkClient: () => ({ users: { getUser: mockGetUser } }),
}))
vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockImplementation((body: string) => JSON.parse(body)),
  })),
}))

let app: FastifyInstance

beforeAll(async () => { ({ app } = await startTestApp()) })
afterAll(async () => { await app.close() })
beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockReset()
  mockGetUser.mockReset()
})

/** The Clerk identity the next JWT belongs to, and what Clerk's Backend API says about it. */
function signedInAs(clerkId: string, email: string, opts: { verified?: boolean } = {}): void {
  mockVerifyToken.mockResolvedValue({ sub: clerkId })
  mockGetUser.mockResolvedValue({
    id: clerkId,
    emailAddresses: [{ id: 'idn_1', emailAddress: email, verification: { status: opts.verified === false ? 'unverified' : 'verified' } }],
    primaryEmailAddressId: 'idn_1',
    firstName: 'Nina',
    lastName: 'New',
    imageUrl: '',
  })
}

function clerkWebhook(clerkId: string, email: string) {
  return supertest(app.server)
    .post('/webhooks/clerk')
    .set('svix-id', 'msg_test')
    .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
    .set('svix-signature', 'v1,test')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({
      type: 'user.created',
      data: { id: clerkId, first_name: 'Nina', last_name: 'New', image_url: '', email_addresses: [{ email_address: email }] },
    }))
}

/** What an admin does with "Add member": a membership row with an email and no user yet. */
async function adminAddsMember(tenantId: string, email: string, role: 'member' | 'super_admin' = 'member') {
  const [row] = await db.insert(members).values({ tenantId, email, role }).returning()
  return row!
}

const auth = (r: supertest.Test) => r.set('Authorization', `Bearer ${JWT}`)
const memberships = () => auth(supertest(app.server).get('/v1/me/memberships'))
const selfServe = () => auth(supertest(app.server).post('/v1/me/self-serve-org'))

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url')
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }
}

describe('console: new user, no organisation', () => {
  it('gets a personal org as super_admin, with an empty policy published, exactly once', async () => {
    signedInAs('user_nina', 'nina@solo.example')
    await clerkWebhook('user_nina', 'nina@solo.example')

    // Webhook alone leaves them at zero memberships...
    const before = await memberships()
    expect(before.status).toBe(200)
    expect(before.body.memberships).toEqual([])

    // ...and the console then self-serves an org.
    const first = await selfServe()
    expect(first.status).toBe(200)
    expect(first.body.memberships).toHaveLength(1)
    expect(first.body.memberships[0].role).toBe('super_admin')

    const tenantRows = await db.select().from(tenants)
    expect(tenantRows).toHaveLength(1)
    expect(tenantRows[0]!.autoProvisioned).toBe(true)
    expect(await db.select().from(policies).where(eq(policies.tenantId, tenantRows[0]!.id))).toHaveLength(1)

    // Idempotent: a second call (StrictMode double-invoke, retry) does not create another org.
    const second = await selfServe()
    expect(second.body.memberships).toHaveLength(1)
    expect(await db.select().from(tenants)).toHaveLength(1)
  })

  it('works even if the webhook never arrived (first call provisions the user)', async () => {
    signedInAs('user_nina', 'nina@solo.example')

    const res = await selfServe()
    expect(res.status).toBe(200)
    expect(res.body.memberships[0].role).toBe('super_admin')
    expect(await db.select().from(users)).toHaveLength(1)
  })
})

describe('console: new user, existing organisation (email pre-added by an admin)', () => {
  it('is claimed into that org and does NOT get a personal org', async () => {
    const { tenantId } = await buildTestTenant('acme')
    await adminAddsMember(tenantId, 'nina@acme.example')
    signedInAs('user_nina', 'nina@acme.example')

    await clerkWebhook('user_nina', 'nina@acme.example')

    const res = await memberships()
    expect(res.body.memberships).toHaveLength(1)
    expect(res.body.memberships[0]).toMatchObject({ tenantId, role: 'member', autoProvisioned: false })

    // Console would call self-serve only for zero memberships; even if it does, nothing new is created.
    const again = await selfServe()
    expect(again.body.memberships).toHaveLength(1)
    expect(await db.select().from(tenants)).toHaveLength(1)
  })

  it('matches the email regardless of letter case', async () => {
    const { tenantId } = await buildTestTenant('acme')
    await adminAddsMember(tenantId, 'Nina.New@Acme.Example')
    signedInAs('user_nina', 'nina.new@acme.example')

    await clerkWebhook('user_nina', 'Nina.New@ACME.example')

    const res = await memberships()
    expect(res.body.memberships).toHaveLength(1)
    expect(res.body.memberships[0].tenantId).toBe(tenantId)
    expect((await db.select().from(users))[0]!.email).toBe('nina.new@acme.example')
  })

  it('a plain member is enrolled but not an admin (console will show the "You\'re all set" page)', async () => {
    const { tenantId } = await buildTestTenant('acme')
    await adminAddsMember(tenantId, 'nina@acme.example', 'member')
    signedInAs('user_nina', 'nina@acme.example')
    await clerkWebhook('user_nina', 'nina@acme.example')

    const res = await memberships()
    expect(res.body.memberships[0].role).toBe('member')
  })
})

describe('extension: new user, no organisation', () => {
  it('is rejected everywhere and nothing gets created (the extension never makes orgs)', async () => {
    signedInAs('user_nina', 'nina@nowhere.example')
    await clerkWebhook('user_nina', 'nina@nowhere.example')

    const { challenge } = pkcePair()
    const handshake = await auth(supertest(app.server).post('/auth/extension/authorize/complete'))
      .send({ state: 's1', code_challenge: challenge, redirect_uri: REDIRECT })
    expect(handshake.status).toBe(401)
    expect(handshake.body.error).toMatch(/Not enrolled in any organisation/)

    const policy = await auth(supertest(app.server).get('/v1/policy'))
    expect(policy.status).toBe(401)

    // The extension's own "no account" check reads memberships: empty, not an error.
    const m = await memberships()
    expect(m.body.memberships).toEqual([])

    expect(await db.select().from(tenants)).toHaveLength(0)
  })
})

describe('extension: new user, existing organisation', () => {
  it('signs in on the first attempt even though the webhook has not landed yet', async () => {
    const { tenantId } = await buildTestTenant('acme')
    const pending = await adminAddsMember(tenantId, 'Nina@Acme.Example')
    signedInAs('user_nina', 'nina@acme.example')
    // NOTE: no clerkWebhook() call yet - this is the race.

    const { verifier, challenge } = pkcePair()
    const handshake = await auth(supertest(app.server).post('/auth/extension/authorize/complete'))
      .send({ state: 's1', code_challenge: challenge, redirect_uri: REDIRECT })
    expect(handshake.status).toBe(200)
    const code = new URL(handshake.body.redirectUrl).searchParams.get('code')!

    const exchange = await supertest(app.server)
      .post('/auth/extension/token')
      .send({ code, code_verifier: verifier, redirect_uri: REDIRECT })
    expect(exchange.status).toBe(200)
    expect(exchange.body.token).toBeTruthy()

    // The membership the admin created is the one that got linked.
    const [row] = await db.select().from(members).where(eq(members.id, pending.id))
    expect(row!.userId).not.toBeNull()

    // The webhook finally arrives: it must not duplicate anything or undo the link.
    const late = await clerkWebhook('user_nina', 'nina@acme.example')
    expect(late.status).toBe(200)
    expect(await db.select().from(users)).toHaveLength(1)
    const rows = await db.select().from(members)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.userId).toBe(row!.userId)
    expect(await db.select().from(tenants)).toHaveLength(1)
  })

  it('also works when the webhook already ran (the normal, fast case)', async () => {
    const { tenantId } = await buildTestTenant('acme')
    await adminAddsMember(tenantId, 'nina@acme.example')
    signedInAs('user_nina', 'nina@acme.example')
    await clerkWebhook('user_nina', 'nina@acme.example')

    const { challenge } = pkcePair()
    const handshake = await auth(supertest(app.server).post('/auth/extension/authorize/complete'))
      .send({ state: 's1', code_challenge: challenge, redirect_uri: REDIRECT })
    expect(handshake.status).toBe(200)
    expect(mockGetUser).not.toHaveBeenCalled() // row already existed - no Clerk lookup needed
  })

  it('serves the company policy right after sign-up (policy sync works on the first call)', async () => {
    const { tenantId } = await buildTestTenant('acme')
    await adminAddsMember(tenantId, 'nina@acme.example')
    signedInAs('user_nina', 'nina@acme.example')

    const res = await auth(supertest(app.server).get('/v1/me/memberships'))
    expect(res.status).toBe(200)
    expect(res.body.memberships[0].tenantId).toBe(tenantId)
  })
})

describe('just-in-time provisioning guards', () => {
  // env is a live read-through of process.env (see src/env.ts)
  const originalAppEnv = process.env.APP_ENV
  afterEach(() => {
    if (originalAppEnv === undefined) delete process.env.APP_ENV
    else process.env.APP_ENV = originalAppEnv
  })

  it('in production, does not claim a membership for an UNVERIFIED email', async () => {
    process.env.APP_ENV = 'production'
    const { tenantId } = await buildTestTenant('acme')
    await adminAddsMember(tenantId, 'victim@acme.example')
    signedInAs('user_attacker', 'victim@acme.example', { verified: false })

    const res = await memberships()
    expect(res.status).toBe(401)
    expect(await db.select().from(users)).toHaveLength(0)
    expect((await db.select().from(members))[0]!.userId).toBeNull()
  })

  it('outside production, accepts an unverified email (dev/staging Clerk does not verify at sign-up)', async () => {
    process.env.APP_ENV = 'staging'
    const { tenantId } = await buildTestTenant('acme')
    await adminAddsMember(tenantId, 'nina@acme.example')
    signedInAs('user_nina', 'nina@acme.example', { verified: false })

    const res = await memberships()
    expect(res.status).toBe(200)
    expect(res.body.memberships[0].tenantId).toBe(tenantId)
  })

  it('stays a 401 (not a 500) when the Clerk lookup fails', async () => {
    signedInAs('user_nina', 'nina@acme.example')
    mockGetUser.mockRejectedValue(new Error('clerk down'))

    const res = await memberships()
    expect(res.status).toBe(401)
    expect(await db.select().from(users)).toHaveLength(0)
  })

  it('never creates an organisation on its own', async () => {
    signedInAs('user_nina', 'nina@solo.example')
    await memberships()
    expect(await db.select().from(tenants)).toHaveLength(0)
  })
})
