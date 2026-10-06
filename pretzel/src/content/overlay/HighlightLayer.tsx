import React from "react";
import type { Finding } from "@mykka/detect";

interface Props {
  findings: Finding[];
  promptText: string;
}

/** Prompts longer than this are trimmed to a window around the findings. */
const WINDOW_TRIGGER_CHARS = 600;
const WINDOW_CONTEXT_CHARS = 140;

/**
 * Renders a read-only view of the prompt with every flagged span highlighted
 * inline. Used inside the modal to give users full context of what was flagged.
 */
export function HighlightLayer({ findings, promptText }: Props) {
  if (findings.length === 0) return null;

  // Build non-overlapping sorted ranges
  const ranges = [...findings]
    .sort((a, b) => a.startOffset - b.startOffset)
    .reduce<Array<{ start: number; end: number }>>((acc, f) => {
      const last = acc[acc.length - 1];
      if (last && f.startOffset < last.end) {
        // merge overlapping
        last.end = Math.max(last.end, f.endOffset);
      } else {
        acc.push({ start: f.startOffset, end: f.endOffset });
      }
      return acc;
    }, []);

  // For long prompts only show the part that contains the findings.
  let from = 0;
  let to = promptText.length;
  if (promptText.length > WINDOW_TRIGGER_CHARS) {
    from = Math.max(0, ranges[0].start - WINDOW_CONTEXT_CHARS);
    to = Math.min(promptText.length, ranges[ranges.length - 1].end + WINDOW_CONTEXT_CHARS);
  }

  const parts: React.ReactNode[] = [];
  if (from > 0) parts.push("… ");
  let cursor = from;
  for (const r of ranges) {
    if (r.end <= from || r.start >= to) continue;
    const start = Math.max(r.start, from);
    const end = Math.min(r.end, to);
    if (start > cursor) {
      parts.push(promptText.slice(cursor, start));
    }
    parts.push(<mark key={start}>{promptText.slice(start, end)}</mark>);
    cursor = end;
  }
  if (cursor < to) {
    parts.push(promptText.slice(cursor, to));
  }
  if (to < promptText.length) parts.push(" …");

  return <div className="mykka-prompt">{parts}</div>;
}
