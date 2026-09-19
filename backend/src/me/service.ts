import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, members, type Member, type User } from '../db/schema.js'
import { generateSecret, hashToken } from '../auth/tokens.js'
import { publishInitialPolicy } from '../policy/service.js'
import { claimPendingMembers } from '../users/service.js'
import { env } from '../env.js'

// Self-serve org creation used to run unconditionally inside the Clerk
// user.created webhook, which fired identically for console, extension, and
// desktop sign-ups — there was no way to tell them apart, so anyone signing
// up from any surface got their own personal org. Console explicitly calls
// this (POST /me/self-serve-org) instead, so extension/desktop sign-ups
// never provision anything and fall through to the auth middleware's
// "Not enrolled in any organisation" rejection instead.
//
// Idempotent and race-safe: re-checks for an existing or pending membership
// before provisioning, so calling this after the webhook's own pending-claim
// already ran (or calling it twice) is a safe no-op / claim instead of a
// duplicate org.
export async function selfServeProvisionOrg(user: User): Promise<Member[]> {
  const existing = await db.select().from(members).where(eq(members.userId, user.id))
  if (existing.length > 0) return existing

  const [pending] = await db.select({ id: members.id })
    .from(members)
    .where(and(eq(members.email, user.email), isNull(members.userId)))
    .limit(1)

  if (pending) {
    await claimPendingMembers(user.email, user.id)
    return db.select().from(members).where(eq(members.userId, user.id))
  }

  const localPart = user.email.split('@')[0] ?? user.email

  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()

  const autoPlan = env.PILOT_MODE === 'true' ? 'pilot' : 'free'

  const [tenant] = await db.insert(tenants).values({
    name:            `${user.firstName ?? localPart}'s Organization`,
    orgTokenHash:    await hashToken(orgSecret),
    adminTokenHash:  await hashToken(adminSecret),
    plan:            autoPlan,
    autoProvisioned: true,
  }).returning({ id: tenants.id })

  const [member] = await db.insert(members).values({
    tenantId: tenant!.id,
    userId:   user.id,
    email:    user.email,
    role:     'super_admin',
  }).returning()

  // Publish an initial (empty) policy so the new org's clients get a real
  // policy from GET /policy immediately, instead of 404-ing until an admin
  // manually publishes. failMode defaults to 'open' to match the tenant row
  // we just inserted (no failMode override set).
  await publishInitialPolicy(tenant!.id)

  return [member!]
}
