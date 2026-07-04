import type { DictionaryRule } from "../../policy/schema";
import type { Finding } from "../types";

export function runExactDictionaryRule(
  text: string,
  rule: DictionaryRule
): Finding[] {
  const findings: Finding[] = [];

  for (const term of rule.terms) {
    const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = rule.caseSensitive ? "g" : "gi";
    const re = new RegExp(`\\b${escapedTerm}\\b`, flags);

    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      findings.push({
        ruleId: rule.id,
        ruleName: rule.name,
        severity: rule.severity,
        action: rule.action,
        matchedText: match[0].slice(0, 200),
        startOffset: match.index,
        endOffset: match.index + match[0].length,
      });
    }
  }

  return findings;
}
