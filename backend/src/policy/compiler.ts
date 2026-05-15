import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import type { Rule } from '../db/schema.js'

export interface RulePolicy {
  id: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  action: 'warn' | 'block'
  message: string | null
}

export interface SubjectPolicy {
  id: string
  name: string
  divisionId: string | null
  teamId: string | null
  rules: RulePolicy[]
}

export interface PolicyDoc {
  version: 1
  tenantId: string
  subjects: SubjectPolicy[]
}

function toRulePolicy(r: Rule): RulePolicy {
  return {
    id: r.id,
    kind: r.kind,
    keywords: r.keywords ?? null,
    pattern: r.pattern ?? null,
    destinations: r.destinations ?? [],
    action: r.action,
    message: r.message ?? null,
  }
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const [allSubjects, allRules] = await Promise.all([
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
  ])

  const rulesBySubject = new Map<string, Rule[]>()
  for (const rule of allRules) {
    const arr = rulesBySubject.get(rule.subjectId) ?? []
    arr.push(rule)
    rulesBySubject.set(rule.subjectId, arr)
  }

  return {
    version: 1,
    tenantId,
    subjects: allSubjects.map(s => ({
      id: s.id,
      name: s.name,
      divisionId: s.divisionId ?? null,
      teamId: s.teamId ?? null,
      rules: (rulesBySubject.get(s.id) ?? []).map(toRulePolicy),
    })),
  }
}
