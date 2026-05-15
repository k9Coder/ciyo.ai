import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { divisions, type Division, type NewDivision } from '../db/schema.js'

export async function listDivisions(tenantId: string): Promise<Division[]> {
  return db.select().from(divisions).where(eq(divisions.tenantId, tenantId))
}

export async function createDivision(
  tenantId: string,
  data: Pick<NewDivision, 'name' | 'slug'>
): Promise<Division> {
  const [row] = await db.insert(divisions).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateDivision(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewDivision, 'name' | 'slug'>>
): Promise<Division | null> {
  const [row] = await db
    .update(divisions)
    .set(data)
    .where(and(eq(divisions.id, id), eq(divisions.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteDivision(tenantId: string, id: string): Promise<void> {
  await db.delete(divisions).where(and(eq(divisions.id, id), eq(divisions.tenantId, tenantId)))
}
