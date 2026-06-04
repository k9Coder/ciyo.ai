import { randomBytes } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { invites, members, tenants, users, type Invite } from '../db/schema.js'

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
  opts: { email?: string; role?: Invite['role'] }
): Promise<{ token: string; expiresAt: Date }> {
  const token     = generateToken()
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
  await db.insert(invites).values({
    tenantId,
    token,
    email:       opts.email ?? null,
    role:        opts.role ?? 'member',
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
): Promise<{ member: typeof members.$inferSelect } | { error: string }> {
  const now = new Date()
  const [row] = await db
    .select()
    .from(invites)
    .where(eq(invites.token, token))
    .limit(1)

  if (!row)            return { error: 'Invite not found' }
  if (row.usedAt)      return { error: 'Invite already used' }
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

  const [member] = await db.insert(members).values({
    tenantId:    row.tenantId,
    userId,
    email:       user.email,
    displayName: user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : undefined,
    role: row.role,
  }).returning()

  await db.update(invites)
    .set({ usedAt: now, usedByUserId: userId })
    .where(eq(invites.token, token))

  return { member: member! }
}
