import { rulesClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
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
    const ctx = getContext()
    if (ctx && !ctx.tenantId) ctx.tenantId = tenantId
    const res = await rulesClient.get<Array<{ subjectId: string }>>('/subject-ids', {
      params: { ruleIds: ruleIdsToLookup.join(',') },
    })
    for (const row of res.data) ids.add(row.subjectId)
  }

  return Array.from(ids)
}
