import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { matters, type Matter, type NewMatter } from '../db/schema.js'

export async function listMatters(tenantId: string): Promise<Matter[]> {
  return db.select().from(matters).where(
    and(eq(matters.tenantId, tenantId), eq(matters.active, true))
  )
}

export async function createMatter(
  tenantId: string,
  data: Pick<NewMatter, 'clientName' | 'matterName' | 'matterNumber' | 'opposingParties'>
): Promise<Matter> {
  const [row] = await db.insert(matters).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateMatter(
  tenantId: string,
  matterId: string,
  data: Partial<Pick<NewMatter, 'clientName' | 'matterName' | 'matterNumber' | 'opposingParties' | 'active'>>
): Promise<Matter | null> {
  const [row] = await db
    .update(matters)
    .set(data)
    .where(and(eq(matters.id, matterId), eq(matters.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteMatter(tenantId: string, matterId: string): Promise<void> {
  await db.delete(matters).where(
    and(eq(matters.id, matterId), eq(matters.tenantId, tenantId))
  )
}
