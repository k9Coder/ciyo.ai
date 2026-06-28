import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { subjects, rules, type Subject, type NewSubject, type SubjectSnapshot } from '../db/schema.js'

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

export async function revertSubjectToSnapshot(
  tenantId: string,
  subjectId: string,
  snapshot: SubjectSnapshot,
): Promise<void> {
  await db.transaction(async tx => {
    await tx.update(subjects)
      .set({ name: snapshot.name, description: snapshot.description, active: snapshot.active })
      .where(and(eq(subjects.id, subjectId), eq(subjects.tenantId, tenantId)))
    await tx.delete(rules).where(eq(rules.subjectId, subjectId))
    if (snapshot.rules.length > 0) {
      await tx.insert(rules).values(
        snapshot.rules.map(r => ({
          tenantId,
          subjectId,
          kind:                r.kind,
          keywords:            r.keywords,
          pattern:             r.pattern,
          destinations:        r.destinations,
          destinationGroupIds: r.destinationGroupIds,
          action:              r.action,
          message:             r.message,
          reportLevel:         r.reportLevel,
          active:              r.active,
        }))
      )
    }
  })
}
