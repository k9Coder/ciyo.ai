// Reconcile Clerk users into the local DB.
//
// WHY THIS EXISTS: signup provisioning is entirely webhook-driven
// (webhooks/clerk.ts, `user.created`). In local dev the Clerk webhook endpoint
// can't reach localhost, so it's frequently unregistered — every new signup
// then has a Clerk account but NO `users` row, and the console dies at
// TenantBootstrap with "Couldn't load your account" because /me/memberships
// returns 401 "User not found". This script backfills those rows so a local
// (or staging) signup can actually get in, without re-registering the webhook.
//
// It mirrors the webhook's `user.created` provisioning (webhooks/clerk.ts is the
// source of truth) but writes to the DB directly, like seed-e2e.ts, so it needs
// no running server / internal users service.
//
// SAFE BY DEFAULT: dry-run unless --apply is passed. Idempotent — a user who
// already has a `users` row + membership is skipped.
//
// Usage:
//   npm run provision:clerk-users                 # dry-run, all Clerk users
//   npm run provision:clerk-users -- --apply      # actually write
//   npm run provision:clerk-users -- --email you@example.com --apply
//   npm run provision:clerk-users -- --clerk-id user_123 --apply
//   npm run provision:clerk-users -- --report-orphans   # also list DB users whose
//                                                       # Clerk account no longer exists
import 'dotenv/config'
import { createClerkClient } from '@clerk/backend'
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, members, users } from '../db/schema.js'
import { generateSecret, hashToken } from '../auth/tokens.js'
import { publishInitialPolicy } from '../policy/service.js'
import { env } from '../env.js'

type Flags = {
  apply: boolean
  email?: string
  clerkId?: string
  reportOrphans: boolean
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { apply: false, reportOrphans: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--apply') flags.apply = true
    else if (a === '--report-orphans') flags.reportOrphans = true
    else if (a === '--email') flags.email = argv[++i]?.toLowerCase()
    else if (a === '--clerk-id') flags.clerkId = argv[++i]
    else if (a === '--help' || a === '-h') { printHelp(); process.exit(0) }
    else { console.error(`Unknown arg: ${a}`); printHelp(); process.exit(1) }
  }
  return flags
}

function printHelp() {
  console.log(`provision-clerk-users — backfill DB rows for Clerk users missing local provisioning

  --apply             write changes (default is dry-run)
  --email <addr>      only this email
  --clerk-id <id>     only this Clerk user id
  --report-orphans    also list DB users whose Clerk account no longer exists (read-only)
  --help              this message`)
}

type ClerkPerson = {
  clerkId: string
  email: string
  firstName: string | null
  lastName: string | null
  avatarUrl: string | undefined
}

async function fetchAllClerkUsers(secretKey: string): Promise<ClerkPerson[]> {
  const clerk = createClerkClient({ secretKey })
  const out: ClerkPerson[] = []
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const res = await clerk.users.getUserList({ limit: pageSize, offset })
    const list = Array.isArray(res) ? res : res.data
    if (!list || list.length === 0) break
    for (const u of list) {
      const primary = u.emailAddresses.find((e: { id: string }) => e.id === u.primaryEmailAddressId)
        ?? u.emailAddresses[0]
      const email = primary?.emailAddress
      if (!email) continue // Clerk user with no email can't be provisioned
      out.push({
        clerkId:   u.id,
        email:     email.toLowerCase(),
        firstName: u.firstName,
        lastName:  u.lastName,
        avatarUrl: u.imageUrl || undefined,
      })
    }
    if (list.length < pageSize) break
  }
  return out
}

type Outcome =
  | 'ok:already-enrolled'
  | 'would:link-clerk-id'   // user row exists by email but clerkId was missing/stale
  | 'would:claim-pending'   // pre-enrolled invite member waiting for this email
  | 'would:auto-provision'  // brand-new user → personal tenant + super_admin
  | 'done:link-clerk-id'
  | 'done:claim-pending'
  | 'done:auto-provision'

// Mirrors webhooks/clerk.ts `user.created`. Runs in a transaction so a partial
// failure never leaves a user row without its tenant/membership.
async function reconcileOne(p: ClerkPerson, apply: boolean): Promise<Outcome> {
  // Set inside the tx when we auto-provision, so we can publish the initial
  // policy AFTER the tx commits — publishInitialPolicy uses the global db
  // connection, so running it inside would insert against an uncommitted tenant.
  let provisionedTenantId: string | null = null
  const outcome = await db.transaction(async (tx) => {
    // Resolve the users row: prefer clerkId, fall back to the unique email
    // (covers a re-signup after Clerk deletion nulled the old clerkId).
    let [user] = await tx.select().from(users).where(eq(users.clerkId, p.clerkId)).limit(1)
    let linkedClerkId = false
    if (!user) {
      const [byEmail] = await tx.select().from(users).where(eq(users.email, p.email)).limit(1)
      if (byEmail) {
        user = byEmail
        if (byEmail.clerkId !== p.clerkId) {
          linkedClerkId = true
          if (apply) {
            await tx.update(users)
              .set({ clerkId: p.clerkId, updatedAt: new Date() })
              .where(eq(users.id, byEmail.id))
          }
        }
      }
    }

    if (!user) {
      // No users row at all — create it (webhook does this via the internal
      // users service; here we insert directly).
      if (apply) {
        const [created] = await tx.insert(users).values({
          clerkId:   p.clerkId,
          email:     p.email,
          firstName: p.firstName ?? undefined,
          lastName:  p.lastName ?? undefined,
          avatarUrl: p.avatarUrl,
        }).returning()
        user = created!
      } else {
        // Dry-run: no row to inspect for enrollment, so continue as brand-new.
        user = undefined as never
      }
    }

    // Already enrolled anywhere → nothing to do (matches webhook's early-out).
    if (user) {
      const [enrolled] = await tx.select({ id: members.id })
        .from(members).where(eq(members.userId, user.id)).limit(1)
      if (enrolled) return linkedClerkId
        ? (apply ? 'done:link-clerk-id' : 'would:link-clerk-id')
        : 'ok:already-enrolled'
    }

    // Pre-enrolled invite (userId still null) matching this email → claim it.
    const pending = await tx.select({ id: members.id })
      .from(members)
      .where(and(eq(members.email, p.email), isNull(members.userId)))
    if (pending.length > 0) {
      if (apply && user) {
        for (const m of pending) {
          await tx.update(members).set({ userId: user.id }).where(eq(members.id, m.id))
        }
      }
      return apply ? 'done:claim-pending' : 'would:claim-pending'
    }

    // Brand-new user with no invite → auto-provision a personal tenant.
    if (apply && user) {
      const orgSecret   = generateSecret()
      const adminSecret = generateSecret()
      const autoPlan    = env.PILOT_MODE === 'true' ? 'pilot' : 'free'
      const localPart   = p.email.split('@')[0] ?? p.email

      const [tenant] = await tx.insert(tenants).values({
        name:            `${p.firstName ?? localPart}'s Organization`,
        orgTokenHash:    await hashToken(orgSecret),
        adminTokenHash:  await hashToken(adminSecret),
        plan:            autoPlan,
        autoProvisioned: true,
      }).returning({ id: tenants.id })

      await tx.insert(members).values({
        tenantId: tenant!.id,
        userId:   user.id,
        email:    p.email,
        role:     'super_admin',
      })
      provisionedTenantId = tenant!.id
    }
    return apply ? 'done:auto-provision' : 'would:auto-provision'
  })

  // Post-commit: give the freshly auto-provisioned org an initial published
  // policy (mirrors the webhook) so its clients don't 404 on GET /policy.
  if (apply && provisionedTenantId) await publishInitialPolicy(provisionedTenantId)

  return outcome
}

async function main() {
  const flags = parseFlags(process.argv.slice(2))
  const secretKey = env.CLERK_SECRET_KEY

  console.log(`[provision-clerk-users] mode: ${flags.apply ? 'APPLY (writing)' : 'DRY-RUN (no writes)'}`)

  let people = await fetchAllClerkUsers(secretKey)
  console.log(`[provision-clerk-users] Clerk users fetched: ${people.length}`)
  if (flags.email)   people = people.filter(p => p.email === flags.email)
  if (flags.clerkId) people = people.filter(p => p.clerkId === flags.clerkId)
  if (flags.email || flags.clerkId) {
    console.log(`[provision-clerk-users] filtered to ${people.length} user(s)`)
  }

  const counts: Record<string, number> = {}
  for (const p of people) {
    let outcome: Outcome | 'error'
    try {
      outcome = await reconcileOne(p, flags.apply)
    } catch (err) {
      outcome = 'error'
      console.error(`  ✗ ${p.email} (${p.clerkId}): ${(err as Error).message}`)
    }
    counts[outcome] = (counts[outcome] ?? 0) + 1
    if (outcome !== 'ok:already-enrolled') {
      console.log(`  ${flags.apply ? '✔' : '•'} ${p.email.padEnd(32)} ${p.clerkId.padEnd(34)} ${outcome}`)
    }
  }

  console.log('\n[provision-clerk-users] summary:')
  for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k.padEnd(24)} ${v}`)
  if (!flags.apply) {
    const actionable = Object.entries(counts)
      .filter(([k]) => k.startsWith('would:'))
      .reduce((s, [, v]) => s + v, 0)
    console.log(`\n[provision-clerk-users] ${actionable} user(s) would be changed. Re-run with --apply to write.`)
  }

  if (flags.reportOrphans) {
    const clerkIds = new Set(people.map(p => p.clerkId))
    const dbUsers = await db.select({ id: users.id, email: users.email, clerkId: users.clerkId }).from(users)
    const orphans = dbUsers.filter(u => u.clerkId && !clerkIds.has(u.clerkId))
    console.log(`\n[provision-clerk-users] orphan DB users (have clerkId, no matching Clerk account): ${orphans.length}`)
    for (const o of orphans) console.log(`  ⚠ ${o.email} (clerkId ${o.clerkId})`)
    if (orphans.length) console.log('  (report only — this script never deletes DB rows)')
  }

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
