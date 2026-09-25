import { createClerkClient } from '@clerk/backend'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { members, type User } from '../db/schema.js'
import { env } from '../env.js'
import { logger } from '../logger/index.js'
import { claimPendingMembers, createUser, getUserByClerkId } from './service.js'

/**
 * Just-in-time user provisioning for a Clerk identity with no `users` row yet.
 *
 * The `user.created` webhook normally creates the row, but it arrives some time
 * after sign-up (and never reaches a local dev backend). A brand-new user's very
 * first authenticated call - the extension/desktop handshake or the console's
 * memberships fetch - can therefore beat it, which used to fail with
 * "User not found - sign up first" and force the person to sign in a second time.
 *
 * This does exactly what the webhook does for a new user: create the row and claim
 * any admin-added (pre-enrolled) membership for that email. It never creates an
 * organisation - that stays console-only (POST /me/self-serve-org). It is
 * idempotent and safe to race with the webhook (createUser is insert-or-return).
 *
 * The identity comes from the already-verified JWT `sub`; the email is read from
 * Clerk's Backend API. In production the primary address must also be verified,
 * because a pending membership is claimed by email and an unverified address proves
 * nothing. Dev/staging Clerk instances do not verify emails at sign-up, so outside
 * production an unverified address is accepted - matching what the user.created
 * webhook already does for every environment.
 *
 * Returns null (caller keeps its normal 401) if Clerk is unreachable, the user has
 * no verified primary email, or anything else goes wrong.
 */
export async function provisionUserFromClerk(clerkId: string): Promise<User | null> {
  const secretKey = env.CLERK_SECRET_KEY
  if (!secretKey) return null

  try {
    const clerk = createClerkClient({ secretKey })
    const cu = await clerk.users.getUser(clerkId)
    const primary = cu.emailAddresses.find(e => e.id === cu.primaryEmailAddressId) ?? cu.emailAddresses[0]
    if (!primary) return null
    if (env.APP_ENV === 'production' && primary.verification?.status !== 'verified') return null

    const email = primary.emailAddress.trim().toLowerCase()
    const user = await createUser({
      clerkId,
      email,
      firstName: cu.firstName ?? undefined,
      lastName:  cu.lastName  ?? undefined,
      avatarUrl: cu.imageUrl  || undefined,
    })
    if (!user) return null

    const [enrolled] = await db.select({ id: members.id }).from(members).where(eq(members.userId, user.id)).limit(1)
    if (!enrolled) await claimPendingMembers(email, user.id)
    return user
  } catch (err) {
    logger.warn('jit user provisioning failed', { clerkId, error: err instanceof Error ? err.message : String(err) })
    return null
  }
}

/** The user row for a Clerk id, creating it just-in-time when the webhook has not landed yet. */
export async function getOrProvisionUserByClerkId(clerkId: string): Promise<User | null> {
  return (await getUserByClerkId(clerkId)) ?? provisionUserFromClerk(clerkId)
}
