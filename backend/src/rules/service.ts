import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { rules, type Rule, type NewRule } from '../db/schema.js'

export async function listRules(tenantId: string, subjectId: string): Promise<Rule[]> {
  return db.select().from(rules).where(
    and(eq(rules.tenantId, tenantId), eq(rules.subjectId, subjectId), eq(rules.active, true))
  )
}

export async function listAllActiveRules(tenantId: string): Promise<Rule[]> {
  return db.select().from(rules).where(
    and(eq(rules.tenantId, tenantId), eq(rules.active, true))
  )
}

export async function createRule(
  tenantId: string,
  subjectId: string,
  data: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'reportLevel'>
): Promise<Rule> {
  const [row] = await db.insert(rules).values({ tenantId, subjectId, ...data }).returning()
  return row!
}

export async function updateRule(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'active' | 'reportLevel'>>
): Promise<Rule | null> {
  const [row] = await db
    .update(rules)
    .set(data)
    .where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteRule(tenantId: string, id: string): Promise<void> {
  await db.delete(rules).where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
}
