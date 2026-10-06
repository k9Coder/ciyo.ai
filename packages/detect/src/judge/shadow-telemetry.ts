import type { ShadowFinding } from "../detection/types";

export interface ShadowVerdictPayload {
  ruleId: string;
  kind: string;
  verdict: "match" | "no_match";
  confidence: number;
  enforced: false;
  timestamp: string;
}

/**
 * The engine only knows its own internal kind names (dictionary/pattern/
 * entropy/score — see bridge.ts). The backend's rule records use "keyword"
 * for what the engine calls "dictionary"; every other kind name is shared.
 * Telemetry reports the backend-facing name so it's directly comparable to
 * the rule records Section C will eventually read it alongside.
 */
const RULE_KIND_LABEL: Record<ShadowFinding["kind"], string> = {
  dictionary: "keyword",
  pattern: "pattern",
  entropy: "entropy",
  score: "score",
};

export function toShadowVerdictPayload(finding: ShadowFinding): ShadowVerdictPayload {
  return {
    ruleId: finding.ruleId,
    kind: RULE_KIND_LABEL[finding.kind],
    verdict: finding.verdict,
    confidence: finding.confidence,
    enforced: false,
    timestamp: finding.timestamp,
  };
}
