import type { PolicyDoc, ResolvedRule, Policy } from "./schema";

type EngineAction = "log" | "warn" | "require_confirmation" | "block"
type Severity = "low" | "medium" | "high" | "critical"

function toEngineAction(a: "warn" | "block"): EngineAction {
  return a
}

function toSeverity(a: "warn" | "block"): Severity {
  return a === "block" ? "high" : "medium"
}

const DEFAULT_SCORE_SIGNALS = [
  { id: "paste_detected",      description: "Text was pasted",              points: 20, enabled: true },
  { id: "long_text",           description: "More than 400 words",          points: 20, enabled: true, threshold: 400 },
  { id: "legal_terms_whereas", description: "Legal boilerplate detected",   points: 25, enabled: true },
  { id: "numbered_paragraphs", description: "Numbered paragraph structure", points: 15, enabled: true },
  { id: "long_avg_sentence",   description: "Long average sentence length", points: 10, enabled: true },
  { id: "formal_heading",      description: "All-caps heading detected",    points: 10, enabled: true },
  { id: "block_quote",         description: "Block quote or indented text", points: 10, enabled: true },
]

function bridgeRule(rule: ResolvedRule, subjectName: string): Policy["custom"][number] {
  const base = {
    id:          rule.id,
    name:        `${subjectName} — ${rule.kind}`,
    description: rule.message ?? "",
    severity:    toSeverity(rule.action),
    action:      toEngineAction(rule.action),
    enabled:     true,
    tags:        [] as string[],
  }

  switch (rule.kind) {
    case "keyword":
      return { ...base, kind: "dictionary" as const, terms: rule.keywords ?? [], caseSensitive: false }
    case "pattern":
      return { ...base, kind: "pattern" as const, pattern: rule.pattern ?? "", flags: "gi", validator: "none" as const, scope: "all" as const }
    case "entropy":
      return { ...base, kind: "entropy" as const, minTokenLength: 24, minBitsPerChar: 4.0 }
    case "score":
      return { ...base, kind: "score" as const, signals: DEFAULT_SCORE_SIGNALS, warnThreshold: 40, confirmThreshold: 70 }
  }
}

export function bridgePolicy(doc: PolicyDoc, disabledSites: string[]): Policy {
  const allRules = doc.subjects.flatMap(subject =>
    subject.rules.map(rule => bridgeRule(rule, subject.name))
  )

  const perSite: Record<string, { enabled: boolean }> = {}
  for (const hostname of disabledSites) {
    perSite[hostname] = { enabled: false }
  }

  return {
    version:                   1,
    tenantId:                  doc.tenantId,
    baseline:                  [],
    custom:                    allRules,
    perSite,
    allowSendAnywayWithReason: false,
    auditRetentionDays:        90,
    failMode:                  doc.failMode,
  }
}
