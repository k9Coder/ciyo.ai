import type { PolicyDoc, RulePolicy, SubjectPolicy } from './compiler.js'

/**
 * "Draft" = the live subjects/rules/site-configs/fail-mode tables. Clients only
 * ever read published snapshots, so a change is "not live" until it is published.
 * diffPolicy compares the latest snapshot with a freshly compiled policy so the
 * console can list what publishing would change.
 */

export type DraftChangeKind   = 'added' | 'changed' | 'removed'
export type DraftChangeEntity = 'subject' | 'rule' | 'siteConfig' | 'failMode'

export interface DraftChange {
  kind:   DraftChangeKind
  entity: DraftChangeEntity
  id:     string
  title:  string
  detail: string
}

const MAX_TERMS = 3
const MAX_TERM_LEN = 40

function clip(s: string, n = MAX_TERM_LEN): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

/** Snapshots published before a field existed lack it; treat that as the default. */
function normalizeRule(r: Partial<RulePolicy> & { id: string }): RulePolicy {
  return {
    id:                  r.id,
    kind:                r.kind ?? 'keyword',
    keywords:            r.keywords ?? null,
    pattern:             r.pattern ?? null,
    destinations:        r.destinations ?? [],
    destinationGroupIds: r.destinationGroupIds ?? [],
    action:              r.action ?? 'warn',
    message:             r.message ?? null,
    reportLevel:         r.reportLevel ?? 'none',
  }
}

function describeRule(r: RulePolicy): string {
  if (r.message) return clip(r.message, 60)
  if (r.kind === 'keyword' && r.keywords?.length) {
    const shown = r.keywords.slice(0, MAX_TERMS).map(k => clip(k)).join(', ')
    return r.keywords.length > MAX_TERMS ? `${shown} +${r.keywords.length - MAX_TERMS} more` : shown
  }
  if (r.kind === 'pattern' && r.pattern) return `Pattern ${clip(r.pattern)}`
  return `${r.kind} rule`
}

const RULE_FIELD_LABEL: Array<[keyof RulePolicy, string]> = [
  ['action', 'action'],
  ['kind', 'type'],
  ['keywords', 'keywords'],
  ['pattern', 'pattern'],
  ['message', 'message'],
  ['reportLevel', 'report level'],
  ['destinations', 'destinations'],
  ['destinationGroupIds', 'destination groups'],
]

function changedRuleFields(a: RulePolicy, b: RulePolicy): string[] {
  return RULE_FIELD_LABEL
    .filter(([k]) => JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    .map(([, label]) => label)
}

function scopeOf(s: SubjectPolicy): string {
  return `${s.divisionId ?? ''}|${s.teamId ?? ''}`
}

export function diffPolicy(prev: PolicyDoc | null, next: PolicyDoc): DraftChange[] {
  const changes: DraftChange[] = []

  const prevSubjects = new Map((prev?.subjects ?? []).map(s => [s.id, s]))
  const nextSubjects = new Map(next.subjects.map(s => [s.id, s]))

  for (const s of next.subjects) {
    const before = prevSubjects.get(s.id)
    if (!before) {
      changes.push({
        kind: 'added', entity: 'subject', id: s.id, title: s.name,
        detail: s.rules.length === 1 ? 'New policy with 1 rule' : `New policy with ${s.rules.length} rules`,
      })
      continue
    }
    const parts: string[] = []
    if (before.name !== s.name) parts.push(`renamed from "${clip(before.name, 60)}"`)
    if (scopeOf(before) !== scopeOf(s)) parts.push('scope changed')
    if (parts.length) {
      changes.push({ kind: 'changed', entity: 'subject', id: s.id, title: s.name, detail: parts.join(', ') })
    }
  }
  for (const s of prev?.subjects ?? []) {
    if (!nextSubjects.has(s.id)) {
      changes.push({
        kind: 'removed', entity: 'subject', id: s.id, title: s.name,
        detail: s.rules.length === 1 ? 'Policy and its 1 rule removed' : `Policy and its ${s.rules.length} rules removed`,
      })
    }
  }

  // Rules are compared by id. Rules inside an added/removed subject are already
  // covered by that subject's line, so only rules of subjects present on both sides count.
  const prevRules = new Map<string, { rule: RulePolicy; subject: SubjectPolicy }>()
  for (const s of prev?.subjects ?? []) {
    for (const r of s.rules) prevRules.set(r.id, { rule: normalizeRule(r), subject: s })
  }
  const nextRules = new Map<string, { rule: RulePolicy; subject: SubjectPolicy }>()
  for (const s of next.subjects) {
    for (const r of s.rules) nextRules.set(r.id, { rule: normalizeRule(r), subject: s })
  }

  for (const [id, { rule, subject }] of nextRules) {
    const before = prevRules.get(id)
    if (!before) {
      if (!prevSubjects.has(subject.id)) continue
      changes.push({
        kind: 'added', entity: 'rule', id, title: describeRule(rule),
        detail: `${rule.action === 'block' ? 'Block' : 'Warn'} in ${subject.name}`,
      })
      continue
    }
    if (!prevSubjects.has(before.subject.id) || !nextSubjects.has(before.subject.id)) continue
    const fields = changedRuleFields(before.rule, rule)
    const moved = before.subject.id !== subject.id
    if (!moved && fields.length === 0) continue
    const parts: string[] = []
    if (moved) parts.push(`Moved from ${before.subject.name}`)
    if (fields.length) parts.push(`${fields.join(', ')} changed`)
    changes.push({
      kind: 'changed', entity: 'rule', id, title: describeRule(rule),
      detail: `In ${subject.name}: ${parts.join('; ')}`,
    })
  }
  for (const [id, { rule, subject }] of prevRules) {
    if (nextRules.has(id)) continue
    if (!nextSubjects.has(subject.id)) continue
    changes.push({
      kind: 'removed', entity: 'rule', id, title: describeRule(rule),
      detail: `Removed from ${subject.name}`,
    })
  }

  const prevSites = prev?.siteConfigs ?? {}
  for (const [domain, cfg] of Object.entries(next.siteConfigs)) {
    const before = prevSites[domain]
    if (!before) {
      changes.push({ kind: 'added', entity: 'siteConfig', id: domain, title: domain, detail: 'Site selectors added' })
    } else if (before.inputSelector !== cfg.inputSelector || before.sendButtonSelector !== cfg.sendButtonSelector) {
      changes.push({ kind: 'changed', entity: 'siteConfig', id: domain, title: domain, detail: 'Site selectors changed' })
    }
  }
  for (const domain of Object.keys(prevSites)) {
    if (!(domain in next.siteConfigs)) {
      changes.push({ kind: 'removed', entity: 'siteConfig', id: domain, title: domain, detail: 'Site selectors removed' })
    }
  }

  // A snapshot from before failMode existed reads as the default ('open').
  const prevFail = prev?.failMode ?? 'open'
  if (prev && prevFail !== next.failMode) {
    changes.push({
      kind: 'changed', entity: 'failMode', id: 'failMode', title: 'If a check can\'t finish',
      detail: next.failMode === 'closed' ? 'Now fails closed (blocks)' : 'Now fails open (allows)',
    })
  }

  return changes
}
