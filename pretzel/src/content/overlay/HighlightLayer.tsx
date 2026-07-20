import React from "react";
import type { Finding } from "@mykka/detect";

interface Props {
  findings: Finding[];
  promptText: string;
}

/**
 * Renders a read-only highlighted view of the prompt text.
 * Used inside the modal to give users full context of what was flagged.
 */
export function HighlightLayer({ findings, promptText }: Props) {
  if (findings.length === 0) return null;

  // Build non-overlapping sorted ranges
  const ranges = [...findings]
    .sort((a, b) => a.startOffset - b.startOffset)
    .reduce<Array<{ start: number; end: number; severity: string }>>((acc, f) => {
      const last = acc[acc.length - 1];
      if (last && f.startOffset < last.end) {
        // merge overlapping
        last.end = Math.max(last.end, f.endOffset);
      } else {
        acc.push({ start: f.startOffset, end: f.endOffset, severity: f.severity });
      }
      return acc;
    }, []);

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) {
      parts.push(promptText.slice(cursor, r.start));
    }
    parts.push(
      <mark key={r.start} className="bg-yellow-300 text-gray-900">
        {promptText.slice(r.start, r.end)}
      </mark>
    );
    cursor = r.end;
  }
  if (cursor < promptText.length) {
    parts.push(promptText.slice(cursor));
  }

  return (
    <pre className="text-xs font-mono whitespace-pre-wrap break-all bg-gray-50 border border-gray-200 rounded p-3 max-h-40 overflow-y-auto">
      {parts}
    </pre>
  );
}
