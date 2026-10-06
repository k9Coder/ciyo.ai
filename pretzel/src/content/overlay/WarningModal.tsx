import { useEffect, useRef } from "react";
import type { Finding, Action } from "@mykka/detect";
import { Logo } from "@/shared/Logo";
import type { ReportingSummary } from "@/events/dispatch";
import { HighlightLayer } from "./HighlightLayer";

export type ModalDecision =
  | { type: "edit" }
  | { type: "redact" }
  | { type: "send_anyway"; reason: string };

interface Props {
  findings: Finding[];
  highestAction: Action;
  promptText: string;
  /** Offer "Remove details & send". Only for prompt text we can rewrite in the composer. */
  canRedact?: boolean;
  /** What IT will receive for these findings; drives the footnote. */
  reporting?: ReportingSummary;
  onDecision: (decision: ModalDecision) => void;
}

const SEVERITY_LABEL: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function WarningModal({ findings, highestAction, promptText, canRedact = false, reporting = "none", onDecision }: Props) {
  const editBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { editBtnRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onDecision({ type: "edit" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecision]);

  const canSendAnyway = highestAction !== "block";

  return (
    <div className="mykka-backdrop" role="dialog" aria-modal="true" aria-labelledby="mykka-modal-title">
      <div className={`mykka-modal ${canSendAnyway ? "mykka-modal-warn" : "mykka-modal-block"}`}>

        {/* Header */}
        <div className="mykka-modal-header">
          <div className="mykka-brand-row">
            {canSendAnyway
              ? <span className="mykka-status-dot" />
              : <Logo size={16} />}
            <span>{canSendAnyway ? "Pretzel · check before sending" : "Pretzel"}</span>
            <span className="mykka-flex-spacer" />
            <span className="mykka-pill">{canSendAnyway ? "Warning" : "Blocked"}</span>
          </div>
          <h2 id="mykka-modal-title" className="mykka-modal-title">
            Sensitive content detected
          </h2>
          <p className="mykka-modal-subtitle">
            {canSendAnyway
              ? "You can still send it. Make sure it's okay to share."
              : canRedact
                ? "Your policy does not allow sending this content. We can take the details out and send the rest."
                : "Your policy does not allow sending this content."}
          </p>
        </div>

        {/* Prompt with flagged spans highlighted */}
        <div className="mykka-prompt-wrap">
          <HighlightLayer findings={findings} promptText={promptText} />
        </div>

        {/* Findings */}
        <ul className="mykka-findings">
          {findings.map((f, i) => (
            <li key={`${f.ruleId}-${i}`} className="mykka-finding">
              <span>{f.ruleName}</span>
              <span>{SEVERITY_LABEL[f.severity] ?? f.severity}</span>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="mykka-modal-footer">
          <div className="mykka-footer-actions">
            {canRedact && !canSendAnyway && (
              <button className="mykka-btn-primary" onClick={() => onDecision({ type: "redact" })}>
                Remove details &amp; send
              </button>
            )}
            <button
              ref={editBtnRef}
              className={canRedact && !canSendAnyway ? "mykka-btn-secondary" : "mykka-btn-primary"}
              onClick={() => onDecision({ type: "edit" })}
            >
              Edit myself
            </button>
            {canSendAnyway && (
              <button
                className="mykka-btn-secondary"
                onClick={() => onDecision({ type: "send_anyway", reason: "user acknowledged" })}
              >
                It's fine, send it
              </button>
            )}
          </div>
          {reporting !== "none" && (
            <p className="mykka-footnote">
              {reporting === "rich"
                ? "Your IT team is notified: the rule, the site and the matched text."
                : "Your IT team is notified: the rule and the site, not the prompt."}
            </p>
          )}
        </div>

      </div>
    </div>
  );
}
