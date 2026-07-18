import { useEffect, useRef, useState } from "react";
import type { Finding, Action } from "@/detection/types";
import { buildSnippet } from "@/detection/engine";

export type ModalDecision =
  | { type: "edit" }
  | { type: "send_anyway" };

interface Props {
  findings: Finding[];
  highestAction: Action;
  promptText: string;
  onDecision: (decision: ModalDecision) => void;
}

const BADGE_CLASS: Record<string, string> = {
  low:      "ciyo-badge ciyo-badge-low",
  medium:   "ciyo-badge ciyo-badge-medium",
  high:     "ciyo-badge ciyo-badge-high",
  critical: "ciyo-badge ciyo-badge-critical",
};

function CiyoLogo() {
  const [isDark, setIsDark] = useState(() =>
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const src = chrome.runtime.getURL(isDark ? "logo-dark.png" : "logo-light.png");
  return <img src={src} alt="Pretzel" style={{ width: 20, height: 20, display: "block" }} />;
}

function FindingRow({ finding, promptText }: { finding: Finding; promptText: string }) {
  const snippet = buildSnippet(promptText, finding.startOffset, finding.endOffset);
  const badgeClass = BADGE_CLASS[finding.severity] ?? "ciyo-badge ciyo-badge-medium";
  const parts = snippet.split(/\[|\]/);

  return (
    <li className="ciyo-finding">
      <div className="ciyo-finding-header">
        <span className={badgeClass}>{finding.severity}</span>
        <span className="ciyo-finding-name">{finding.ruleName}</span>
      </div>
      <p className="ciyo-snippet">
        {parts[0]}
        {parts[1] && <mark>{parts[1]}</mark>}
        {parts[2]}
      </p>
      {finding.message && <p className="ciyo-finding-message">{finding.message}</p>}
    </li>
  );
}

export function WarningModal({ findings, highestAction, promptText, onDecision }: Props) {
  const editBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => { editBtnRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onDecision({ type: "edit" }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecision]);

  const canSendAnyway = findings.every(finding => finding.isOverridable === true);

  return (
    <div className="ciyo-backdrop" role="dialog" aria-modal="true" aria-labelledby="ciyo-modal-title">
      <div className="ciyo-modal">

        {/* Header */}
        <div className="ciyo-modal-header">
          <div className="ciyo-brand-row">
            <CiyoLogo />
            <span className="ciyo-brand-label">
            <span style={{ color: "var(--text-primary)" }}>c</span>
            <span style={{ color: "var(--brand)" }}>i</span>
            <span style={{ color: "var(--text-primary)" }}>yo</span>
          </span>
          </div>
          <div className="ciyo-title-row">
            <div className="ciyo-warn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <h2 id="ciyo-modal-title" className="ciyo-modal-title">
                Sensitive content detected
              </h2>
              <p className="ciyo-modal-subtitle">
                {findings.length} issue{findings.length !== 1 ? "s" : ""} found before sending. Highest action: {highestAction}.
              </p>
            </div>
          </div>
        </div>

        {/* Findings */}
        <ul className="ciyo-modal-body" style={{ listStyle: "none", margin: 0, padding: "14px 20px" }}>
          {findings.map((f, i) => (
            <FindingRow key={`${f.ruleId}-${i}`} finding={f} promptText={promptText} />
          ))}
        </ul>

        {/* Footer */}
        <div className="ciyo-modal-footer">
          <div className="ciyo-footer-actions">
            {canSendAnyway && (
              <button
                className="ciyo-btn-ghost"
                onClick={() => onDecision({ type: "send_anyway" })}
              >
                Looks fine, send it
              </button>
            )}
            <button ref={editBtnRef} className="ciyo-btn-primary" onClick={() => onDecision({ type: "edit" })}>
              Edit prompt
            </button>
          </div>
          {!canSendAnyway && (
            <p className="ciyo-blocked-msg">Your policy does not allow sending this content.</p>
          )}
        </div>

      </div>
    </div>
  );
}
