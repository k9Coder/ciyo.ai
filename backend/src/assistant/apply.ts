import type { Action } from './llm/interface.js'
import { createRule, updateRule, deleteRule } from '../rules/service.js'
import { createSubject, updateSubject, deleteSubject } from '../subjects/service.js'

export interface ApplyResult {
  applied: Action[]
  errors: string[]
}

export async function executeActions(tenantId: string, actions: Action[]): Promise<ApplyResult> {
  const applied: Action[] = []
  const errors: string[] = []

  for (const action of actions) {
    try {
      switch (action.op) {
        case 'create_rule':
          await createRule(tenantId, action.subjectId, {
            kind:                action.kind,
            keywords:            action.keywords ?? null,
            pattern:             action.pattern ?? null,
            destinations:        action.destinations ?? [],
            destinationGroupIds: action.destinationGroupIds ?? [],
            action:              action.action,
            message:             action.message ?? null,
            reportLevel:         action.reportLevel ?? 'none',
          })
          applied.push(action)
          break

        case 'update_rule':
          await updateRule(tenantId, action.ruleId, action.patch as Parameters<typeof updateRule>[2])
          applied.push(action)
          break

        case 'delete_rule':
          await deleteRule(tenantId, action.ruleId)
          applied.push(action)
          break

        case 'create_subject':
          await createSubject(tenantId, {
            name:        action.name,
            description: action.description ?? null,
            divisionId:  action.divisionId ?? null,
            teamId:      action.teamId ?? null,
          })
          applied.push(action)
          break

        case 'update_subject':
          await updateSubject(tenantId, action.subjectId, action.patch as Parameters<typeof updateSubject>[2])
          applied.push(action)
          break

        case 'delete_subject':
          await deleteSubject(tenantId, action.subjectId)
          applied.push(action)
          break
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      errors.push(`${action.op}: ${message}`)
    }
  }

  return { applied, errors }
}
