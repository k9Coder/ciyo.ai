import type { PolicyDoc, Policy } from "./schema";

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

function bridgeRule(rule: PolicyDoc["subjects"][number]["rules"][number], subjectName: string): Policy["custom"][number] {
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
      return { ...base, kind: "dictionary" as const, terms: rule.keywords ?? [], caseSensitive: false, enforced: false }
    case "pattern":
      return { ...base, kind: "pattern" as const, pattern: rule.pattern ?? "", flags: "gi", validator: "none" as const, scope: "all" as const, enforced: false }
    case "entropy":
      return { ...base, kind: "entropy" as const, minTokenLength: 24, minBitsPerChar: 4.0, enforced: false }
    case "score":
      return { ...base, kind: "score" as const, signals: DEFAULT_SCORE_SIGNALS, warnThreshold: 40, confirmThreshold: 70, enforced: false }
    case "judge_prompt": {
      // The sole real enforcement mechanism for its own rule — never shadow.
      // An empty claim is not a harmless no-op: handed to the model, its
      // match/no-match behavior is undefined, and a false "match" would
      // block everything — a fail-CLOSED outcome in a design that promises
      // fail-open everywhere. The service layer should never let this
      // reach a published policy, but disable defensively here too.
      const hasPrompt = typeof rule.prompt === "string" && rule.prompt.trim().length > 0;
      return { ...base, kind: "judge_prompt" as const, prompt: rule.prompt ?? "", enforced: true, enabled: hasPrompt }
    }
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
