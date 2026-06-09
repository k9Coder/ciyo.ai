import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { teams, memberTeams, members, type Team, type NewTeam, type Member } from '../db/schema.js'

export async function listTeams(tenantId: string, divisionId: string): Promise<Team[]> {
  return db.select().from(teams).where(
    and(eq(teams.tenantId, tenantId), eq(teams.divisionId, divisionId))
  )
}

export async function createTeam(
  tenantId: string,
  divisionId: string,
  data: Pick<NewTeam, 'name' | 'slug'>
): Promise<Team> {
  const [row] = await db.insert(teams).values({ tenantId, divisionId, ...data }).returning()
  return row!
}

export async function updateTeam(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewTeam, 'name' | 'slug'>>
): Promise<Team | null> {
  const [row] = await db
    .update(teams)
    .set(data)
    .where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteTeam(tenantId: string, id: string): Promise<void> {
  await db.delete(teams).where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)))
}

export async function listMembersByTeam(tenantId: string, teamId: string): Promise<Member[]> {
  // First verify the team belongs to this tenant to prevent cross-tenant data exposure
  const [team] = await db.select({ id: teams.id }).from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.tenantId, tenantId)))
  if (!team) return []

  // Filter members by tenantId in SQL — not in JS — to prevent cross-tenant data leakage
  const rows = await db
    .select({ member: members })
    .from(memberTeams)
    .innerJoin(members, and(eq(members.id, memberTeams.memberId), eq(members.tenantId, tenantId)))
    .where(eq(memberTeams.teamId, teamId))
  return rows.map(r => r.member)
}
