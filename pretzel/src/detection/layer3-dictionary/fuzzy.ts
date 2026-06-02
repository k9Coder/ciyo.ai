import type { DictionaryRule } from "@/policy/schema";
import type { Finding } from "@/detection/types";

/**
 * Levenshtein distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i]![j] = dp[i - 1]![j - 1]!;
      } else {
        dp[i]![j] =
          1 +
          Math.min(
            dp[i - 1]![j]!,      // delete
            dp[i]![j - 1]!,      // insert
            dp[i - 1]![j - 1]!  // replace
          );
      }
    }
  }
  return dp[m]![n]!;
}

/**
 * Scan text word-by-word looking for fuzzy matches within maxDistance edits.
 * Only applied to short terms (≤ 20 chars) to keep it fast.
 */
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
      // Only fuzz short terms — long fuzzy matches have too many false positives
      if (compareTerm.length > 20) continue;
      const dist = levenshtein(word, compareTerm);
      if (dist <= maxDistance && dist > 0) {
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          action: rule.action,
          matchedText: match[0].slice(0, 200),
          startOffset: match.index,
          endOffset: match.index + match[0].length,
        });
        break; // one finding per word per rule
      }
    }
  }

  return findings;
}
