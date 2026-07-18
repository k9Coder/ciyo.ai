export type Severity = "low" | "medium" | "high" | "critical";
export type Action = "log" | "warn" | "require_confirmation" | "block";

export interface Finding {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  action: Action;
  isOverridable?: boolean;
  message?: string;
  /** The exact substring that matched. Never longer than ~200 chars (truncated). */
  matchedText: string;
  startOffset: number;
  endOffset: number;
}

export interface DetectionResult {
  findings: Finding[];
  /** The most severe action across all findings; "log" if findings is empty. */
  highestAction: Action;
  /** SHA-256 hex of the normalised prompt. Used for caching. */
  promptHash: string;
  detectedAtMs: number;
  durationMs: number;
  /** Set when the user is not signed in and it's time to show the sign-in nudge. */
  signInNudge?: true;
}

/** Ordered severity levels for comparison. */
const SEVERITY_ORDER: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/** Ordered action levels for comparison. */
const ACTION_ORDER: Record<Action, number> = {
  log: 0,
  warn: 1,
  require_confirmation: 2,
  block: 3,
};

export function compareSeverity(a: Severity, b: Severity): number {
  return SEVERITY_ORDER[a] - SEVERITY_ORDER[b];
}

export function compareAction(a: Action, b: Action): number {
  return ACTION_ORDER[a] - ACTION_ORDER[b];
}

/** Returns the more severe of two actions. */
export function maxAction(a: Action, b: Action): Action {
  return ACTION_ORDER[a] >= ACTION_ORDER[b] ? a : b;
}

export interface ScoreSignalConfig {
  id: string;
  description: string;
  points: number;
  enabled: boolean;
  /** Optional numeric threshold (e.g. word count for long_text signal). */
  threshold?: number;
}

export interface ScoreRule {
  kind: "score";
  id: string;
  name: string;
  description: string;
  severity: Severity;
  action: Action;
  enabled: boolean;
  tags: string[];
  signals: ScoreSignalConfig[];
  warnThreshold: number;
  confirmThreshold: number;
}
