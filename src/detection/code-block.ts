/**
 * Identifies spans that are inside markdown fenced code blocks.
 * Used by PatternRule scope filtering.
 */

export interface CodeSpan {
  start: number;
  end: number;
}

/** Returns an array of [start, end) ranges that fall inside code fences. */
export function findCodeSpans(text: string): CodeSpan[] {
  const spans: CodeSpan[] = [];
  // Match ``` ... ``` fences (optionally with a language tag after the opening)
  const fenceRe = /^```[^\n]*\n([\s\S]*?)^```/gm;
  let match: RegExpExecArray | null;
  while ((match = fenceRe.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  // Also match single-backtick inline code
  const inlineRe = /`([^`]+)`/g;
  while ((match = inlineRe.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }
  return spans;
}

/** Returns true when the given offset falls inside any of the provided code spans. */
export function isInsideCode(offset: number, codeSpans: CodeSpan[]): boolean {
  return codeSpans.some((s) => offset >= s.start && offset < s.end);
}
