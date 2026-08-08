import { and, count, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { members, users, memberTeams, type Member, type NewMember, type User } from '../db/schema.js'
import { usersClient, tenantsClient, teamsClient } from '../http/internal-client.js'
import { isOverSeatLimit, getSeatLimit, type Plan } from '../billing/limits.js'
import { getContext } from '../context/request-context.js'
import { anonymizeMember } from '../scans/service.js'
import { divisionExists } from '../divisions/service.js'

async function assertDivisionOwnership(tenantId: string, adminDivisionId: string | null | undefined): Promise<void> {
  if (!adminDivisionId) return
  if (!(await divisionExists(tenantId, adminDivisionId))) {
    throw Object.assign(new Error('Division not found'), { statusCode: 404 })
  }
}

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
  data: Pick<NewMember, 'email' | 'displayName' | 'role' | 'adminDivisionId'>
): Promise<Member> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId
  await assertDivisionOwnership(tenantId, data.adminDivisionId)

  const tenant = await tenantsClient.get<{ plan: string }>(`/${tenantId}`)
    .then(r => r.data)
    .catch(e => { if ((e as Error).message.startsWith('[404]')) return null; throw e })

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

  const existingUser = await usersClient.get<User>('/by-email', { params: { email: data.email } })
    .then(r => r.data)
    .catch(e => { if ((e as Error).message.startsWith('[404]')) return null; throw e })
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
  data: Partial<Pick<NewMember, 'displayName' | 'role' | 'adminDivisionId' | 'failMode'>>
): Promise<Member | null> {
  if ('adminDivisionId' in data) await assertDivisionOwnership(tenantId, data.adminDivisionId)
  const [row] = await db
    .update(members)
    .set(data)
    .where(and(eq(members.id, id), eq(members.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteMember(tenantId: string, id: string): Promise<void> {
  // Anonymize retained telemetry first: nulls memberId on this member's scans +
  // enforcement_signals so their personal link is erased (GDPR right to erasure)
  // and no dangling FK blocks the delete.
  await anonymizeMember(id)
  await db.delete(memberTeams).where(eq(memberTeams.memberId, id))
  await db.delete(members).where(and(eq(members.id, id), eq(members.tenantId, tenantId)))
}

export async function assignTeam(memberId: string, teamId: string, tenantId: string): Promise<void> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  await teamsClient.get(`/${teamId}`).catch((e: unknown) => {
    if ((e as Error).message.startsWith('[404]')) throw Object.assign(new Error('Team not found'), { statusCode: 404 })
    throw e
  })

  const [member] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.id, memberId), eq(members.tenantId, tenantId)))
  if (!member) throw Object.assign(new Error('Member not found'), { statusCode: 404 })

  await db.insert(memberTeams).values({ memberId, teamId }).onConflictDoNothing()
}

export async function removeTeam(memberId: string, teamId: string, tenantId: string): Promise<void> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const teamOk = await teamsClient.get(`/${teamId}`)
    .then(() => true)
    .catch((e: unknown) => { if ((e as Error).message.startsWith('[404]')) return false; throw e })
  if (!teamOk) return

  const [member] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.id, memberId), eq(members.tenantId, tenantId)))
  if (!member) return

  await db.delete(memberTeams).where(
    and(eq(memberTeams.memberId, memberId), eq(memberTeams.teamId, teamId))
  )
}

export async function listMembersByTeam(tenantId: string, teamId: string): Promise<Member[]> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const teamOk = await teamsClient.get(`/${teamId}`)
    .then(() => true)
    .catch((e: unknown) => { if ((e as Error).message.startsWith('[404]')) return false; throw e })
  if (!teamOk) return []

  // memberTeams is owned by members domain — direct DB access is legitimate
  const rows = await db
    .select({ member: members })
    .from(memberTeams)
    .innerJoin(members, and(eq(members.id, memberTeams.memberId), eq(members.tenantId, tenantId)))
    .where(eq(memberTeams.teamId, teamId))
  return rows.map(r => r.member)
}

export async function importMembers(
  tenantId: string,
  rows: Array<{ email: string; displayName?: string }>
): Promise<Member[]> {
  if (rows.length === 0) return []
  const toInsert = await Promise.all(rows.map(async r => {
    const existingUser = await usersClient.get<User>('/by-email', { params: { email: r.email } })
      .then(r => r.data)
      .catch(e => { if ((e as Error).message.startsWith('[404]')) return null; throw e })
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
