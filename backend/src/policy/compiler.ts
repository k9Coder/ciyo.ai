import { eq } from 'drizzle-orm'
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import { db } from '../db/client.js'
import { siteConfigs } from '../db/schema.js'
import type { Rule } from '../db/schema.js'

export interface SiteConfig {
  inputSelector: string
  sendButtonSelector: string
}

export interface RulePolicy {
  id: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  destinationGroupIds: string[]
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
  siteConfigs: Record<string, SiteConfig>
}

function toRulePolicy(r: Rule): RulePolicy {
  return {
    id:                  r.id,
    kind:                r.kind,
    keywords:            r.keywords ?? null,
    pattern:             r.pattern ?? null,
    destinations:        r.destinations ?? [],
    destinationGroupIds: r.destinationGroupIds ?? [],
    action:              r.action,
    message:             r.message ?? null,
  }
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const [allSubjects, allRules, allSiteConfigs] = await Promise.all([
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
    db.select().from(siteConfigs).where(eq(siteConfigs.tenantId, tenantId)),
  ])

  const rulesBySubject = new Map<string, Rule[]>()
  for (const rule of allRules) {
    const arr = rulesBySubject.get(rule.subjectId) ?? []
    arr.push(rule)
    rulesBySubject.set(rule.subjectId, arr)
  }

  const siteConfigsMap: Record<string, SiteConfig> = {}
  for (const sc of allSiteConfigs) {
    siteConfigsMap[sc.domain] = { inputSelector: sc.inputSelector, sendButtonSelector: sc.sendButtonSelector }
  }

  return {
    version: 1,
    tenantId,
    subjects: allSubjects.map(s => ({
      id:         s.id,
      name:       s.name,
      divisionId: s.divisionId ?? null,
      teamId:     s.teamId ?? null,
      rules:      (rulesBySubject.get(s.id) ?? []).map(toRulePolicy),
    })),
    siteConfigs: siteConfigsMap,
  }
}
