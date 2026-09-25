import type { Finding } from "@mykka/detect";

export const REDACTION_PLACEHOLDER = "[removed]";

export interface RedactionResult {
  /** The prompt with every flagged span replaced by the placeholder. */
  text: string;
  /** Number of distinct spans removed (overlapping findings count once). */
  removedCount: number;
  /** Rule names that were removed, de-duplicated, in prompt order. */
  ruleNames: string[];
}

/**
 * Replaces every flagged span with a placeholder. Overlapping or touching
 * findings collapse into one span so the placeholder is not repeated.
 * Offsets are valid on the original text (normalisation is length-preserving).
 */
export function redactPrompt(text: string, findings: Finding[]): RedactionResult {
  const sorted = findings
    .filter((f) => f.endOffset > f.startOffset && f.startOffset >= 0 && f.startOffset < text.length)
    .sort((a, b) => a.startOffset - b.startOffset);

  const spans: Array<{ start: number; end: number }> = [];
  const ruleNames: string[] = [];
  for (const f of sorted) {
    const end = Math.min(f.endOffset, text.length);
    const last = spans[spans.length - 1];
    if (last && f.startOffset <= last.end) {
      last.end = Math.max(last.end, end);
    } else {
      spans.push({ start: f.startOffset, end });
    }
    if (!ruleNames.includes(f.ruleName)) ruleNames.push(f.ruleName);
  }

  let out = "";
  let cursor = 0;
  for (const s of spans) {
    out += text.slice(cursor, s.start) + REDACTION_PLACEHOLDER;
    cursor = s.end;
  }
  out += text.slice(cursor);

  return { text: out, removedCount: spans.length, ruleNames };
}

/** True when none of the findings' matched text remains in the composer text. */
export function isRedacted(current: string, findings: Finding[]): boolean {
  return findings.every((f) => !f.matchedText || !current.includes(f.matchedText));
}
