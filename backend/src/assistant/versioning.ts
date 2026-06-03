import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { rules } from '../db/schema.js'
import type { Action } from './llm/interface.js'

export async function resolveAffectedSubjectIds(
  tenantId: string,
  actions: Action[],
): Promise<string[]> {
  const ids = new Set<string>()
  const ruleIdsToLookup: string[] = []

  for (const action of actions) {
    switch (action.op) {
      case 'create_rule':
      case 'update_subject':
      case 'delete_subject':
        if ('subjectId' in action && action.subjectId) ids.add(action.subjectId)
        break
      case 'update_rule':
      case 'delete_rule':
        if ('ruleId' in action && action.ruleId) ruleIdsToLookup.push(action.ruleId)
        break
      // create_subject: nothing to snapshot before creation
    }
  }

  if (ruleIdsToLookup.length > 0) {
    const rows = await db
      .select({ subjectId: rules.subjectId })
      .from(rules)
      .where(and(eq(rules.tenantId, tenantId), inArray(rules.id, ruleIdsToLookup)))
    for (const row of rows) ids.add(row.subjectId)
  }

  return Array.from(ids)
}
