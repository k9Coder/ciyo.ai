import { randomBytes } from 'node:crypto'
import { and, count, eq, isNull } from 'drizzle-orm'
import { db } from '../db/client.js'
import { invites, members, tenants, users, type Invite } from '../db/schema.js'
import { isOverSeatLimit, getSeatLimit, type Plan } from '../billing/limits.js'

const INVITE_TTL_MS = 72 * 60 * 60 * 1000 // 72 hours

function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export interface InvitePreview {
  tenantName: string
  role:       string
  email:      string | null
  expiresAt:  string
  valid:      boolean
}

export async function createInvite(
  tenantId:    string,
  createdById: string | null,
  opts: { email?: string; role?: Invite['role']; divisionId?: string }
): Promise<{ token: string; expiresAt: Date }> {
  const token     = generateToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await db.insert(invites).values({
    tenantId,
    token,
    email:       opts.email ?? null,
    role:        opts.role ?? 'member',
    divisionId:  opts.divisionId ?? null,
    createdById: createdById ?? null,
    expiresAt,
  })
  return { token, expiresAt }
}

export async function getInvitePreview(token: string): Promise<InvitePreview | null> {
  const now = new Date()
  const [row] = await db
    .select({ invite: invites, tenantName: tenants.name })
    .from(invites)
    .innerJoin(tenants, eq(invites.tenantId, tenants.id))
    .where(eq(invites.token, token))
    .limit(1)

  if (!row) return null

  const valid = !row.invite.usedAt && row.invite.expiresAt > now
  return {
    tenantName: row.tenantName,
    role:       row.invite.role,
    email:      row.invite.email,
    expiresAt:  row.invite.expiresAt.toISOString(),
    valid,
  }
}

export async function acceptInvite(
  token:  string,
  userId: string
): Promise<{ member: typeof members.$inferSelect } | { error: string; statusCode?: number }> {
  const now = new Date()

  // Validate the invite exists, is not used, and is not expired
  const [row] = await db
    .select()
    .from(invites)
    .where(eq(invites.token, token))
    .limit(1)

  if (!row)            return { error: 'Invite not found' }
  if (row.usedAt)      return { error: 'Invite already used', statusCode: 409 }
  if (row.expiresAt < now) return { error: 'Invite expired' }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return { error: 'User not found' }

  if (row.email && row.email.toLowerCase() !== user.email.toLowerCase()) {
    return { error: 'This invite is restricted to a different email address' }
  }

  // Already a member of this tenant — mark used and return existing membership
  const [existing] = await db
    .select()
    .from(members)
    .where(and(eq(members.tenantId, row.tenantId), eq(members.userId, userId)))
    .limit(1)

  if (existing) {
    await db.update(invites)
      .set({ usedAt: now, usedByUserId: userId })
      .where(eq(invites.token, token))
    return { member: existing }
  }

  // Seat limit is enforced BEFORE we claim the invite AND re-checked inside the
  // transaction below. Checking here alone isn't enough: the seat count could
  // change between this check and the claim (another accept lands concurrently),
  // so the transaction re-check guards the actual window that matters.
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, row.tenantId)).limit(1)
  if (!tenant) return { error: 'Tenant not found' }
  const plan = tenant.plan as Plan

  const seatCheck = await checkSeatLimit(db, row.tenantId, plan)
  if (seatCheck) return seatCheck

  // Claim the invite and insert the member inside a single transaction so that a
  // seat-limit rejection AFTER the claim (re-checked below) rolls the claim back
  // instead of burning the invite. Everything in this block must use `tx`.
  // drizzle only rolls back when the callback THROWS — returning an error object
  // would COMMIT the claim — so rejections inside the transaction are thrown and
  // translated back into result objects below.
  try {
    return await db.transaction(async tx => {
    // Atomically mark the invite as used — this prevents the TOCTOU race where
    // two concurrent accept requests both see usedAt = null and both try to insert
    // a member, causing a unique constraint violation on tenantEmailUniq.
    // The UPDATE only succeeds if usedAt is still null; if another concurrent request
    // won the race, the returning array will be empty and we return 409.
    const updated = await tx.update(invites)
      .set({ usedAt: now, usedByUserId: userId })
      .where(and(eq(invites.token, token), isNull(invites.usedAt)))
      .returning({ id: invites.id, tenantId: invites.tenantId, role: invites.role, divisionId: invites.divisionId })

    if (!updated.length) {
      // Another concurrent request claimed the invite first. Nothing was
      // modified in this transaction, so throwing vs returning is equivalent;
      // throw for consistency with the rollback rule above.
      throw new AcceptRejection({ error: 'Invite already used', statusCode: 409 })
    }

    const claimed = updated[0]!

    // Re-check the seat limit inside the transaction — a concurrent accept could
    // have consumed the last seat between the pre-check above and this claim.
    // Throwing here rolls back the UPDATE above, so the invite is NOT burned.
    const seatRecheck = await checkSeatLimit(tx, claimed.tenantId, plan)
    if (seatRecheck) throw new AcceptRejection(seatRecheck)

    const [member] = await tx.insert(members).values({
      tenantId:    claimed.tenantId,
      userId,
      email:       user.email,
      displayName: user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : undefined,
      role:            claimed.role,
      adminDivisionId: claimed.divisionId,
    }).returning()

    return { member: member! }
    })
  } catch (err) {
    if (err instanceof AcceptRejection) return err.result
    throw err
  }
}

class AcceptRejection extends Error {
  constructor(public readonly result: { error: string; statusCode: number }) {
    super(result.error)
  }
}

// db.transaction's callback receives a `tx` handle with the same query surface as
// `db`; this helper accepts either so it can run both outside and inside the transaction.
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]

async function checkSeatLimit(
  handle: DbOrTx,
  tenantId: string,
  plan: Plan
): Promise<{ error: string; statusCode: number } | null> {
  const [countRow] = await handle
    .select({ n: count() })
    .from(members)
    .where(eq(members.tenantId, tenantId))
  const currentSeats = countRow?.n ?? 0
  if (isOverSeatLimit(plan, currentSeats)) {
    const limit = getSeatLimit(plan)
    return {
      error: `Seat limit reached (${limit} seats on the ${plan} plan) — ask your admin to remove a member`,
      statusCode: 402,
    }
  }
  return null
}
