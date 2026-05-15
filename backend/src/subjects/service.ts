import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { subjects, type Subject, type NewSubject } from '../db/schema.js'

export async function listSubjects(tenantId: string): Promise<Subject[]> {
  return db.select().from(subjects).where(
    and(eq(subjects.tenantId, tenantId), eq(subjects.active, true))
  )
}

export async function createSubject(
  tenantId: string,
  data: Pick<NewSubject, 'name' | 'description' | 'divisionId' | 'teamId'>
): Promise<Subject> {
  const [row] = await db.insert(subjects).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateSubject(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewSubject, 'name' | 'description' | 'active' | 'divisionId' | 'teamId'>>
): Promise<Subject | null> {
  const [row] = await db
    .update(subjects)
    .set(data)
    .where(and(eq(subjects.id, id), eq(subjects.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteSubject(tenantId: string, id: string): Promise<void> {
  await db.delete(subjects).where(
    and(eq(subjects.id, id), eq(subjects.tenantId, tenantId))
  )
}
