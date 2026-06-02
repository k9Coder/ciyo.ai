import { and, count, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { members, users, memberTeams, tenants, type Member, type NewMember, type User } from '../db/schema.js'
import { getUserByEmail } from '../users/service.js'
import { isOverSeatLimit, getSeatLimit, type Plan } from '../billing/limits.js'

export interface MemberRow extends Member {
  user: Pick<User, 'email' | 'firstName' | 'lastName' | 'avatarUrl'> | null
}

export async function listMembers(tenantId: string): Promise<MemberRow[]> {
  const rows = await db
    .select()
    .from(members)
    .leftJoin(users, eq(members.userId, users.id))
    .where(eq(members.tenantId, tenantId))
  return rows.map(r => ({
    ...r.members,
    user: r.users
      ? { email: r.users.email, firstName: r.users.firstName, lastName: r.users.lastName, avatarUrl: r.users.avatarUrl }
      : null,
  }))
}

export async function getMemberByEmail(tenantId: string, email: string): Promise<Member | null> {
  const [row] = await db.select().from(members).where(
    and(eq(members.tenantId, tenantId), eq(members.email, email))
  )
  return row ?? null
}

export async function createMember(
  tenantId: string,
  data: Pick<NewMember, 'email' | 'displayName' | 'role'>
): Promise<Member> {
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))

  if (tenant) {
    const plan = tenant.plan as Plan
    const [countRow] = await db
      .select({ n: count() })
      .from(members)
      .where(eq(members.tenantId, tenantId))
    const currentSeats = countRow?.n ?? 0
    if (isOverSeatLimit(plan, currentSeats)) {
      const limit = getSeatLimit(plan)
      throw Object.assign(
        new Error(`Seat limit reached (${limit} seats on ${plan} plan). Upgrade to add more members.`),
        { statusCode: 402 }
      )
    }
  }

  const existingUser = await getUserByEmail(data.email)
  const [row] = await db.insert(members).values({
    tenantId,
    ...data,
    userId: existingUser?.id ?? null,
  }).returning()
  return row!
}

export async function updateMember(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewMember, 'displayName' | 'role' | 'adminDivisionId'>>
): Promise<Member | null> {
  const [row] = await db
    .update(members)
    .set(data)
    .where(and(eq(members.id, id), eq(members.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteMember(tenantId: string, id: string): Promise<void> {
  await db.delete(memberTeams).where(eq(memberTeams.memberId, id))
  await db.delete(members).where(and(eq(members.id, id), eq(members.tenantId, tenantId)))
}

export async function assignTeam(memberId: string, teamId: string): Promise<void> {
  await db.insert(memberTeams).values({ memberId, teamId }).onConflictDoNothing()
}

export async function removeTeam(memberId: string, teamId: string): Promise<void> {
  await db.delete(memberTeams).where(
    and(eq(memberTeams.memberId, memberId), eq(memberTeams.teamId, teamId))
  )
}

export async function importMembers(
  tenantId: string,
  rows: Array<{ email: string; displayName?: string }>
): Promise<Member[]> {
  if (rows.length === 0) return []
  const toInsert = await Promise.all(rows.map(async r => {
    const existingUser = await getUserByEmail(r.email)
    return {
      tenantId,
      email:       r.email,
      displayName: r.displayName ?? null,
      role:        'member' as const,
      userId:      existingUser?.id ?? null,
    }
  }))
  return db.insert(members).values(toInsert).onConflictDoNothing().returning()
}
