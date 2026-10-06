/**
 * Helpers for the "brand-new user signs up" e2e specs (console side).
 * Mirrored in pretzel/e2e/helpers/signup.ts (that package is CommonJS, this one is ESM) - keep them in step.
 *
 * Real Clerk (the dev instance the suite already uses), real backend. What is NOT real:
 *   - the Clerk -> backend `user.created` webhook can't reach a local backend, so
 *     `postUserCreatedWebhook` delivers a correctly signed one on demand (and lets a test
 *     choose to deliver it late, or never, to model webhook lag);
 *   - Clerk bot protection is bypassed with a testing token (`@clerk/testing`, done in the specs).
 *
 * Test accounts use Clerk's `+clerk_test` sub-address so they are recognised as test users.
 * Every helper here is safe to call from a spec's afterEach/afterAll to clean up.
 */
import { createHmac, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'
export const TEST_PASSWORD = 'Pretzel-e2e-Passw0rd!-signup'

function seedState(): { tenantId: string; adminToken: string; orgToken: string } {
  return JSON.parse(readFileSync(path.join(__dirname, '../../../e2e/.seed-state.json'), 'utf-8'))
}

/** The org the seed created ("E2E Test Org"): the "existing organisation" a new user joins. */
export function existingOrgId(): string {
  return seedState().tenantId
}

/** A unique, obviously-fake address. `+clerk_test` marks it as a Clerk test user. */
export function uniqueTestEmail(tag: string): string {
  return `e2e-${tag}-${Date.now()}-${randomBytes(2).toString('hex')}+clerk_test@example.com`
}

// ── Clerk Backend API ──────────────────────────────────────────────────────────

function clerkSecret(): string {
  const key = process.env.CLERK_SECRET_KEY
  if (!key) throw new Error('CLERK_SECRET_KEY is required for the sign-up specs (see e2e/.env.e2e.example)')
  return key
}

async function clerk(pathAndQuery: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.clerk.com/v1${pathAndQuery}`, {
    ...init,
    headers: { Authorization: `Bearer ${clerkSecret()}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  })
}

interface ClerkUser { id: string; email_addresses: Array<{ email_address: string }> }

export async function findClerkUser(email: string): Promise<ClerkUser | null> {
  const res = await clerk(`/users?email_address=${encodeURIComponent(email)}`)
  if (!res.ok) return null
  const list = await res.json() as ClerkUser[]
  return list[0] ?? null
}

export async function deleteClerkUser(email: string): Promise<void> {
  const user = await findClerkUser(email)
  if (user) await clerk(`/users/${user.id}`, { method: 'DELETE' })
}

// ── Backend: what an admin does, and what the Clerk webhook does ────────────────

function adminHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${seedState().adminToken}`, 'Content-Type': 'application/json' }
}

interface MemberRow { id: string; email: string; userId?: string | null; role: string }

export async function listMembers(): Promise<MemberRow[]> {
  const res = await fetch(`${BACKEND}/v1/members`, { headers: adminHeaders() })
  return res.ok ? await res.json() as MemberRow[] : []
}

/** "Add member" in the console: pre-enrols an email in the existing org. */
export async function adminAddsMember(email: string, role: 'member' | 'super_admin' = 'member'): Promise<MemberRow> {
  const res = await fetch(`${BACKEND}/v1/members`, { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ email, role }) })
  if (!res.ok) throw new Error(`adding member ${email} failed: ${res.status} ${await res.text()}`)
  return await res.json() as MemberRow
}

export async function removeMemberByEmail(email: string): Promise<void> {
  const row = (await listMembers()).find(m => m.email.toLowerCase() === email.toLowerCase())
  if (row) await fetch(`${BACKEND}/v1/members/${row.id}`, { method: 'DELETE', headers: adminHeaders() })
}

export async function memberByEmail(email: string): Promise<MemberRow | undefined> {
  return (await listMembers()).find(m => m.email.toLowerCase() === email.toLowerCase())
}

/** Secret for signing webhooks; without it, specs that need one skip that step. */
export function webhookSecret(): string | undefined {
  return process.env.E2E_CLERK_WEBHOOK_SECRET ?? process.env.CLERK_WEBHOOK_SECRET
}

/**
 * Delivers Clerk's `user.created` webhook to the backend, signed the way Svix signs it
 * (HMAC-SHA256 over `${id}.${timestamp}.${body}` with the base64 part of the `whsec_` secret).
 */
export async function postUserCreatedWebhook(clerkUserId: string, email: string): Promise<number> {
  const secret = webhookSecret()
  if (!secret) throw new Error('no webhook secret configured')
  const body = JSON.stringify({
    type: 'user.created',
    data: { id: clerkUserId, first_name: 'E2E', last_name: 'Signup', image_url: '', email_addresses: [{ email_address: email }] },
  })
  const id = `msg_e2e_${randomBytes(6).toString('hex')}`
  const ts = String(Math.floor(Date.now() / 1000))
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const sig = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64')
  const res = await fetch(`${BACKEND}/webhooks/clerk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,${sig}` },
    body,
  })
  return res.status
}

/** Everything a sign-up spec created for one email, whatever state the test ended in. */
export async function cleanupSignup(email: string): Promise<void> {
  await removeMemberByEmail(email).catch(() => {})
  await deleteClerkUser(email).catch(() => {})
}
