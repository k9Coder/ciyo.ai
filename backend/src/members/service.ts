import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { members, memberTeams, type Member, type NewMember } from '../db/schema.js'

export async function listMembers(tenantId: string): Promise<Member[]> {
  return db.select().from(members).where(eq(members.tenantId, tenantId))
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
  const [row] = await db.insert(members).values({ tenantId, ...data }).returning()
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
  const toInsert = rows.map(r => ({
    tenantId,
    email: r.email,
    displayName: r.displayName ?? null,
    role: 'member' as const,
  }))
  return db.insert(members).values(toInsert).onConflictDoNothing().returning()
}
