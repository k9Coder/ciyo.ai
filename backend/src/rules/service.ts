import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { rules, type Rule, type NewRule } from '../db/schema.js'
import {
  assertDestinationGroupsBelongToTenant,
  defaultIsOverridable,
  normalizeDestinations,
  requireRuleMessage,
} from './validation.js'

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
  data: Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'isOverridable' | 'reportLevel'>
): Promise<Rule> {
  const destinations = normalizeDestinations(data.destinations)
  const destinationGroupIds = await assertDestinationGroupsBelongToTenant(tenantId, data.destinationGroupIds)
  const message = requireRuleMessage(data.action, data.message)
  const isOverridable = data.isOverridable ?? defaultIsOverridable(data.action)
  const [row] = await db.insert(rules).values({
    tenantId,
    subjectId,
    ...data,
    destinations,
    destinationGroupIds,
    message,
    isOverridable,
  }).returning()
  return row!
}

export async function updateRule(
  tenantId: string,
  id: string,
  data: Partial<Pick<NewRule, 'kind' | 'keywords' | 'pattern' | 'destinations' | 'destinationGroupIds' | 'action' | 'message' | 'isOverridable' | 'active' | 'reportLevel'>>
): Promise<Rule | null> {
  const [existing] = await db.select().from(rules).where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
  if (!existing) return null

  const action = data.action ?? existing.action
  const message = 'message' in data ? requireRuleMessage(action, data.message) : requireRuleMessage(action, existing.message)
  const patch = {
    ...data,
    ...(data.destinations ? { destinations: normalizeDestinations(data.destinations) } : {}),
    ...(data.destinationGroupIds ? { destinationGroupIds: await assertDestinationGroupsBelongToTenant(tenantId, data.destinationGroupIds) } : {}),
    ...(data.action && data.isOverridable === undefined ? { isOverridable: defaultIsOverridable(data.action) } : {}),
    message,
  }

  const [row] = await db
    .update(rules)
    .set(patch)
    .where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteRule(tenantId: string, id: string): Promise<void> {
  await db.delete(rules).where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
}
