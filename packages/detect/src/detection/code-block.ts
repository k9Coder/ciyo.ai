/**
 * Identifies spans that are inside markdown fenced code blocks.
 * Used by PatternRule scope filtering.
 */

export interface CodeSpan {
  start: number;
  end: number;
}

/**
 * Returns an array of [start, end) ranges that fall inside code fences.
 *
 * Uses a linear line-by-line scan instead of a regex with [\s\S]*? to avoid
 * catastrophic backtracking on unterminated fences. The old regex was O(n²)
 * on inputs that start a fence but never close it (e.g. pasted file content).
 */
export function findCodeSpans(text: string): CodeSpan[] {
  const spans: CodeSpan[] = [];

  // ── Fenced code blocks (``` ... ```) ─────────────────────────────────────
  // Scan line-by-line for opening/closing ``` markers.
  const lines = text.split("\n");
  let fenceStart: number | null = null;
  let offset = 0;
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (fenceStart === null) {
        fenceStart = offset;
      } else {
        spans.push({ start: fenceStart, end: offset + line.length });
        fenceStart = null;
      }
    }
    offset += line.length + 1; // +1 for the \n
  }
  // Unterminated fence: treat the rest of the text as code (conservative)
  if (fenceStart !== null) {
    spans.push({ start: fenceStart, end: text.length });
  }

  // ── Single-backtick inline code ───────────────────────────────────────────
  // Restrict to same-line only (`[^`\n]+`) to prevent cross-line false negatives.
  const inlineRe = /`([^`\n]+)`/g;
  let match: RegExpExecArray | null;
  while ((match = inlineRe.exec(text)) !== null) {
    spans.push({ start: match.index, end: match.index + match[0].length });
  }

  // Sort spans by start offset so isInsideCode can binary-search.
  spans.sort((a, b) => a.start - b.start);

  return spans;
}

/**
 * Returns true when the given offset falls inside any of the provided code spans.
 *
 * Uses binary search on the sorted spans array instead of a linear .some() scan,
 * reducing the per-finding cost from O(spans) to O(log spans).
 */
export function isInsideCode(offset: number, codeSpans: CodeSpan[]): boolean {
  let lo = 0;
  let hi = codeSpans.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const span = codeSpans[mid]!;
    if (offset < span.start) {
      hi = mid - 1;
    } else if (offset >= span.end) {
      lo = mid + 1;
    } else {
      return true;
    }
  }
  return false;
}
