import type { Action, MemberRole } from './llm/interface.js'
import { rulesClient, subjectsClient, divisionsClient, teamsClient, membersClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'

export interface ApplyResult {
  applied: Action[]
  errors: string[]
}

export interface ApplyContext {
  // Role of the member applying the actions. Only a super_admin may create or
  // update a member with the super_admin role — this prevents privilege
  // escalation via the assistant. Admin-token callers hold org-wide authority
  // and are treated as super_admin.
  callerRole: MemberRole
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// True when the action would create or update a member with the super_admin
// role. Reads the raw shape so it also catches a future `update_member` op that
// carries a `role`/`patch.role` field, even though only `create_member` is in
// the current Action union.
function grantsSuperAdmin(action: Action): boolean {
  const op = (action as { op: string }).op
  if (op !== 'create_member' && op !== 'update_member') return false
  const a = action as { role?: unknown; patch?: { role?: unknown } }
  return a.role === 'super_admin' || a.patch?.role === 'super_admin'
}

export async function executeActions(
  tenantId: string,
  actions: Action[],
  callerCtx: ApplyContext = { callerRole: 'super_admin' },
): Promise<ApplyResult> {
  const applied: Action[] = []
  const errors: string[] = []

  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  for (const action of actions) {
    try {
      // Privilege-escalation guard: assigning the super_admin role requires the
      // caller to already be super_admin. Covers create_member and (defensively)
      // any future update_member action. Surfaced per-action so the rest of the
      // batch still applies.
      if (grantsSuperAdmin(action) && callerCtx.callerRole !== 'super_admin') {
        throw new Error('only a super_admin may grant the super_admin role')
      }

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
