import { useEffect, useRef, useState } from "react";
import type { Finding, Action } from "@mykka/detect";
import { buildSnippet } from "@mykka/detect";

export type ModalDecision =
  | { type: "edit" }
  | { type: "send_anyway"; reason: string };

interface Props {
  findings: Finding[];
  highestAction: Action;
  promptText: string;
  onDecision: (decision: ModalDecision) => void;
}

const BADGE_CLASS: Record<string, string> = {
  low:      "mykka-badge mykka-badge-low",
  medium:   "mykka-badge mykka-badge-medium",
  high:     "mykka-badge mykka-badge-high",
  critical: "mykka-badge mykka-badge-critical",
};

function MykkaLogo() {
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
  const badgeClass = BADGE_CLASS[finding.severity] ?? "mykka-badge mykka-badge-medium";
  const parts = snippet.split(/\[|\]/);

  return (
    <li className="mykka-finding">
      <div className="mykka-finding-header">
        <span className={badgeClass}>{finding.severity}</span>
        <span className="mykka-finding-name">{finding.ruleName}</span>
      </div>
      <p className="mykka-snippet">
        {parts[0]}
        {parts[1] && <mark>{parts[1]}</mark>}
        {parts[2]}
      </p>
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

  const canSendAnyway = highestAction !== "block";

  return (
    <div className="mykka-backdrop" role="dialog" aria-modal="true" aria-labelledby="mykka-modal-title">
      <div className="mykka-modal">

        {/* Header */}
        <div className="mykka-modal-header">
          <div className="mykka-brand-row">
            <MykkaLogo />
            <span className="mykka-brand-label">
            <span style={{ color: "var(--text-primary)" }}>m</span>
            <span style={{ color: "var(--brand)" }}>y</span>
            <span style={{ color: "var(--text-primary)" }}>kka</span>
          </span>
          </div>
          <div className="mykka-title-row">
            <div className="mykka-warn-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </div>
            <div>
              <h2 id="mykka-modal-title" className="mykka-modal-title">
                Sensitive content detected
              </h2>
              <p className="mykka-modal-subtitle">
                {findings.length} issue{findings.length !== 1 ? "s" : ""} found before sending.
              </p>
            </div>
          </div>
        </div>

        {/* Findings */}
        <ul className="mykka-modal-body" style={{ listStyle: "none", margin: 0, padding: "14px 20px" }}>
          {findings.map((f, i) => (
            <FindingRow key={`${f.ruleId}-${i}`} finding={f} promptText={promptText} />
          ))}
        </ul>

        {/* Footer */}
        <div className="mykka-modal-footer">
          <div className="mykka-footer-actions">
            {canSendAnyway && (
              <button
                className="mykka-btn-ghost"
                onClick={() => onDecision({ type: "send_anyway", reason: "user acknowledged" })}
              >
                Looks fine, send it
              </button>
            )}
            <button ref={editBtnRef} className="mykka-btn-primary" onClick={() => onDecision({ type: "edit" })}>
              Edit prompt
            </button>
          </div>
          {!canSendAnyway && (
            <p className="mykka-blocked-msg">Your policy does not allow sending this content.</p>
          )}
        </div>

      </div>
    </div>
  );
}
