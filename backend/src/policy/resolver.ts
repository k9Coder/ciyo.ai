import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { memberTeams, teams, destinationGroups } from '../db/schema.js'
import type { PolicyDoc, RulePolicy, SubjectPolicy } from './compiler.js'

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
  const teamRows = await db
    .select({ teamId: memberTeams.teamId })
    .from(memberTeams)
    .where(eq(memberTeams.memberId, memberId))
  const memberTeamIds = new Set(teamRows.map(r => r.teamId))

  let memberDivisionIds = new Set<string>()
  if (memberTeamIds.size > 0) {
    const divRows = await db
      .select({ divisionId: teams.divisionId })
      .from(teams)
      .where(inArray(teams.id, [...memberTeamIds]))
    memberDivisionIds = new Set(divRows.map(r => r.divisionId))
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
        const ep = SCOPE_PRIORITY[existing.scope]
        const np = SCOPE_PRIORITY[scope]
        if (np > ep || (np === ep && rule.action === 'block')) {
          byKey.set(key, { rule, scope, subjectId: subject.id, subjectName: subject.name })
        }
      }
    }
  }

  const allGroupIds = [...new Set([...byKey.values()].flatMap(e => e.rule.destinationGroupIds ?? []))]
  const groupDomainsMap: Record<string, string[]> = {}
  if (allGroupIds.length > 0) {
    const groupRows = await db
      .select({ id: destinationGroups.id, domains: destinationGroups.domains })
      .from(destinationGroups)
      .where(inArray(destinationGroups.id, allGroupIds))
    for (const row of groupRows) {
      groupDomainsMap[row.id] = row.domains ?? []
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
  }
}
