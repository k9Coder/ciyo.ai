import { eq, and } from 'drizzle-orm'
import { db } from '../db/client.js'
import { memberTeams, members } from '../db/schema.js'
import { teamsClient, destinationGroupsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import type { PolicyDoc, RulePolicy, SubjectPolicy } from '../policy/compiler.js'

export interface ResolvedRulePolicy {
  id: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  action: 'warn' | 'block'
  message: string | null
}

export interface ResolvedSubjectPolicy {
  id: string
  name: string
  rules: ResolvedRulePolicy[]
}

export interface ResolvedPolicy {
  version: number
  tenantId: string
  subjects: ResolvedSubjectPolicy[]
  failMode: 'open' | 'closed'
}

type Scope = 'global' | 'division' | 'team'
const SCOPE_PRIORITY: Record<Scope, number> = { global: 0, division: 1, team: 2 }

function scopeOf(s: SubjectPolicy): Scope {
  if (s.teamId) return 'team'
  if (s.divisionId) return 'division'
  return 'global'
}

function detectionKey(r: RulePolicy): string {
  if (r.kind === 'keyword') return `keyword:${[...(r.keywords ?? [])].sort().join(',')}`
  if (r.kind === 'pattern') return `pattern:${r.pattern ?? ''}`
  return r.kind
}

export async function resolveMemberPolicy(
  tenantId: string,
  memberId: string,
  snapshot: PolicyDoc,
): Promise<ResolvedPolicy> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  // memberTeams and members are owned by the members domain — direct DB access
  // is legitimate. A member's failMode overrides the tenant default when set;
  // null falls back to whatever the published snapshot carries.
  const [memberRow] = await db
    .select({ failMode: members.failMode })
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.tenantId, tenantId)))
  const failMode = memberRow?.failMode ?? snapshot.failMode

  const teamRows = await db
    .select({ teamId: memberTeams.teamId })
    .from(memberTeams)
    .where(eq(memberTeams.memberId, memberId))
  const memberTeamIds = new Set(teamRows.map(r => r.teamId))

  let memberDivisionIds = new Set<string>()
  if (memberTeamIds.size > 0) {
    const divRows = await Promise.all(
      [...memberTeamIds].map(id =>
        teamsClient.get<{ divisionId: string }>(`/${id}`)
          .then(r => r.data.divisionId)
          .catch(e => { if ((e as Error).message.startsWith('[404]')) return null; throw e })
      )
    )
    memberDivisionIds = new Set(divRows.filter((d): d is string => d !== null))
  }

  const applicable = snapshot.subjects.filter(s => {
    if (!s.teamId && !s.divisionId) return true
    if (s.teamId) return memberTeamIds.has(s.teamId)
    if (s.divisionId) return memberDivisionIds.has(s.divisionId)
    return false
  })

  type RuleEntry = { rule: RulePolicy; scope: Scope; subjectId: string; subjectName: string }
  const byKey = new Map<string, RuleEntry>()

  for (const subject of applicable) {
    const scope = scopeOf(subject)
    for (const rule of subject.rules) {
      const key = detectionKey(rule)
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, { rule, scope, subjectId: subject.id, subjectName: subject.name })
      } else {
        const existingPriority = SCOPE_PRIORITY[existing.scope]
        const newPriority = SCOPE_PRIORITY[scope]
        if (newPriority > existingPriority || (newPriority === existingPriority && rule.action === 'block')) {
          byKey.set(key, { rule, scope, subjectId: subject.id, subjectName: subject.name })
        }
      }
    }
  }

  const allGroupIds = [...new Set([...byKey.values()].flatMap(e => e.rule.destinationGroupIds ?? []))]
  const groupDomainsMap: Record<string, string[]> = {}
  if (allGroupIds.length > 0) {
    const allGroups = await destinationGroupsClient.get<Array<{ id: string; domains: string[] }>>('/')
      .then(r => r.data)
    for (const row of allGroups) {
      if (allGroupIds.includes(row.id)) groupDomainsMap[row.id] = row.domains ?? []
    }
  }

  const subjectMap = new Map<string, ResolvedSubjectPolicy>()
  for (const { rule, subjectId, subjectName } of byKey.values()) {
    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, { id: subjectId, name: subjectName, rules: [] })
    }
    const merged = [
      ...(rule.destinations ?? []),
      ...(rule.destinationGroupIds ?? []).flatMap(gid => groupDomainsMap[gid] ?? []),
    ]
    subjectMap.get(subjectId)!.rules.push({
      id: rule.id,
      kind: rule.kind,
      keywords: rule.keywords,
      pattern: rule.pattern,
      destinations: [...new Set(merged)],
      action: rule.action,
      message: rule.message,
    })
  }

  return {
    version: snapshot.version,
    tenantId,
    subjects: [...subjectMap.values()],
    failMode,
  }
}
