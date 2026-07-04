import type { DictionaryRule } from "../../policy/schema";
import type { Finding } from "../types";

export function levenshtein(a: string, b: string, maxDist = Infinity): number {
  const m = a.length;
  const n = b.length;

  if (Math.abs(m - n) > maxDist) return maxDist + 1;

  let prev: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  let curr: number[] = new Array(n + 1) as number[];

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    let rowMin = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]!
          : 1 + Math.min(prev[j]!, curr[j - 1]!, prev[j - 1]!);
      if (curr[j]! < rowMin) rowMin = curr[j]!;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[n]!;
}

export function runFuzzyDictionaryRule(
  text: string,
  rule: DictionaryRule
): Finding[] {
  if (!rule.fuzzyTerms?.length) return [];
  const findings: Finding[] = [];
  const wordRe = /\b\w+\b/g;
  let match: RegExpExecArray | null;

  while ((match = wordRe.exec(text)) !== null) {
    const word = rule.caseSensitive ? match[0] : match[0].toLowerCase();

    for (const { term, maxDistance } of rule.fuzzyTerms) {
      const compareTerm = rule.caseSensitive ? term : term.toLowerCase();
      if (compareTerm.length > 20) continue;
      if (Math.abs(word.length - compareTerm.length) > maxDistance) continue;
      const dist = levenshtein(word, compareTerm, maxDistance);
      if (dist <= maxDistance) {
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          action: rule.action,
          matchedText: match[0].slice(0, 200),
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        });
        break;
      }
    }
  }

  return findings;
}
