import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { teams, type Team, type NewTeam } from '../db/schema.js'

export async function listTeams(tenantId: string, divisionId?: string): Promise<Team[]> {
  if (divisionId) {
    return db.select().from(teams).where(
      and(eq(teams.tenantId, tenantId), eq(teams.divisionId, divisionId))
    )
  }
  return db.select().from(teams).where(eq(teams.tenantId, tenantId))
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

export async function getTeamById(tenantId: string, id: string): Promise<Team | null> {
  const [row] = await db.select().from(teams)
    .where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)))
  return row ?? null
}
