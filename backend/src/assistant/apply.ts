import type { Action } from './llm/interface.js'
import { rulesClient, subjectsClient, divisionsClient, teamsClient, membersClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'

export interface ApplyResult {
  applied: Action[]
  errors: string[]
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export async function executeActions(tenantId: string, actions: Action[]): Promise<ApplyResult> {
  const applied: Action[] = []
  const errors: string[] = []

  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  for (const action of actions) {
    try {
      switch (action.op) {
        case 'create_rule':
          await rulesClient.post('/', {
            subjectId: action.subjectId,
            kind: action.kind,
            keywords: action.keywords ?? null,
            pattern: action.pattern ?? null,
            destinations: action.destinations ?? [],
            destinationGroupIds: action.destinationGroupIds ?? [],
            action: action.action,
            message: action.message ?? null,
            reportLevel: action.reportLevel ?? 'none',
          })
          applied.push(action)
          break

        case 'update_rule':
          await rulesClient.patch(`/${action.ruleId}`, action.patch)
          applied.push(action)
          break

        case 'delete_rule':
          await rulesClient.delete(`/${action.ruleId}`)
          applied.push(action)
          break

        case 'create_subject':
          await subjectsClient.post('/', {
            name: action.name,
            description: action.description ?? null,
            divisionId: action.divisionId ?? null,
            teamId: action.teamId ?? null,
          })
          applied.push(action)
          break

        case 'update_subject':
          await subjectsClient.patch(`/${action.subjectId}`, action.patch)
          applied.push(action)
          break

        case 'delete_subject':
          await subjectsClient.delete(`/${action.subjectId}`)
          applied.push(action)
          break

        case 'create_division':
          await divisionsClient.post('/', { name: action.name, slug: toSlug(action.name) })
          applied.push(action)
          break

        case 'delete_division':
          await divisionsClient.delete(`/${action.divisionId}`)
          applied.push(action)
          break

        case 'create_team':
          await teamsClient.post('/', { divisionId: action.divisionId, name: action.name, slug: toSlug(action.name) })
          applied.push(action)
          break

        case 'delete_team':
          await teamsClient.delete(`/${action.teamId}`)
          applied.push(action)
          break

        case 'create_member': {
          const res = await membersClient.post<{ id: string }>('/', { email: action.email, role: action.role, displayName: action.displayName ?? null })
          if (action.adminDivisionId) {
            await membersClient.patch(`/${res.data.id}`, { adminDivisionId: action.adminDivisionId })
          }
          applied.push(action)
          break
        }

        case 'delete_member':
          await membersClient.delete(`/${action.memberId}`)
          applied.push(action)
          break

        case 'assign_member_team':
          await membersClient.post(`/${action.memberId}/assign-team`, { teamId: action.teamId })
          applied.push(action)
          break

        case 'remove_member_team':
          await membersClient.post(`/${action.memberId}/remove-team`, { teamId: action.teamId })
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
