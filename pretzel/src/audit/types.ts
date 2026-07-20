import type { Action, Finding } from "@mykka/detect";

export type UserDecision = "sent" | "edited" | "cancelled" | "sent_with_reason";

export interface AuditEvent {
  id: string;
  timestamp: number;
  hostname: string;
  action: Action;
  userDecision: UserDecision;
  reason?: string;
  findings: Finding[];
  /** Original prompt length in characters. We never persist the full text. */
  promptLengthChars: number;
  promptHash: string;
}
