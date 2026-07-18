import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { destinationGroups, type DestinationGroup, type NewDestinationGroup } from '../db/schema.js'
import { normalizeDestinations } from '../rules/validation.js'

export async function listDestinationGroups(tenantId: string): Promise<DestinationGroup[]> {
  return db.select().from(destinationGroups).where(eq(destinationGroups.tenantId, tenantId))
}

export async function createDestinationGroup(
  tenantId: string,
  data: Pick<NewDestinationGroup, 'name' | 'domains' | 'divisionId' | 'teamId'>
): Promise<DestinationGroup> {
  const [row] = await db.insert(destinationGroups).values({
    tenantId,
    ...data,
    domains: normalizeDestinations(data.domains),
  }).returning()
  return row!
}

export async function updateDestinationGroup(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewDestinationGroup, 'name' | 'domains' | 'divisionId' | 'teamId'>>
): Promise<DestinationGroup | null> {
  const patch = {
    ...data,
    ...(data.domains ? { domains: normalizeDestinations(data.domains) } : {}),
  }
  const [row] = await db
    .update(destinationGroups)
    .set(patch)
    .where(and(eq(destinationGroups.id, id), eq(destinationGroups.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteDestinationGroup(tenantId: string, id: string): Promise<void> {
  await db.delete(destinationGroups).where(
    and(eq(destinationGroups.id, id), eq(destinationGroups.tenantId, tenantId))
  )
}
