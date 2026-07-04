import { eq } from 'drizzle-orm'
import { subjectsClient, rulesClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import { db } from '../db/client.js'
import { siteConfigs, tenants } from '../db/schema.js'
import type { Rule, Subject } from '../db/schema.js'

export interface SiteConfig {
  inputSelector: string
  sendButtonSelector: string
}

export interface RulePolicy {
  id:                  string
  kind:                'keyword' | 'pattern' | 'entropy' | 'score'
  keywords:            string[] | null
  pattern:             string | null
  destinations:        string[]
  destinationGroupIds: string[]
  action:              'warn' | 'block'
  message:             string | null
  reportLevel:         'none' | 'minimal' | 'medium' | 'rich'
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
  failMode: 'open' | 'closed'
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
    reportLevel:         r.reportLevel,
  }
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const [subjectsRes, rulesRes, allSiteConfigs, tenantRows] = await Promise.all([
    subjectsClient.get<Subject[]>('/'),
    rulesClient.get<Rule[]>('/'),
    db.select().from(siteConfigs).where(eq(siteConfigs.tenantId, tenantId)),
    db.select({ failMode: tenants.failMode }).from(tenants).where(eq(tenants.id, tenantId)),
  ])

  const allSubjects = subjectsRes.data
  const allRules    = rulesRes.data

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
    failMode: tenantRows[0]?.failMode ?? 'open',
  }
}
