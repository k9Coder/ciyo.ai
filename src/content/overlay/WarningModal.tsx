import { useEffect, useRef } from "react";
import type { Finding } from "@/detection/types";
import type { Action } from "@/detection/types";
import { buildSnippet } from "@/detection/engine";

export type ModalDecision =
  | { type: "edit" }
  | { type: "send_anyway"; reason: string };

interface Props {
  findings: Finding[];
  highestAction: Action;
  promptText: string;
  onDecision: (decision: ModalDecision) => void;
}

const SEVERITY_COLORS: Record<string, string> = {
  low: "bg-blue-100 text-blue-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

function FindingRow({ finding, promptText }: { finding: Finding; promptText: string }) {
  const snippet = buildSnippet(promptText, finding.startOffset, finding.endOffset);
  const colorClass = SEVERITY_COLORS[finding.severity] ?? "bg-gray-100 text-gray-800";
  const parts = snippet.split(/\[|\]/);

  return (
    <li className="border border-gray-200 rounded p-3 space-y-1">
      <div className="flex items-center gap-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colorClass}`}>
          {finding.severity.toUpperCase()}
        </span>
        <span className="text-sm font-medium text-gray-800">{finding.ruleName}</span>
      </div>
      <p className="text-xs font-mono text-gray-600 break-all">
        {parts[0]}
        {parts[1] && (
          <mark className="bg-yellow-300 text-gray-900 rounded px-0.5">{parts[1]}</mark>
        )}
        {parts[2]}
      </p>
    </li>
  );
}

export function WarningModal({ findings, highestAction, promptText, onDecision }: Props) {
  const editBtnRef = useRef<HTMLButtonElement>(null);

  // Focus "Edit prompt" on mount — safest default action
  useEffect(() => {
    editBtnRef.current?.focus();
  }, []);

  // Esc = edit prompt (close modal, go fix it)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDecision({ type: "edit" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecision]);

  // "block" severity means sending is not allowed
  const canSendAnyway = highestAction !== "block";

  return (
    <div
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ps-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[80vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex-shrink-0 w-8 h-8 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <div>
            <h2 id="ps-modal-title" className="text-lg font-semibold text-gray-900">
              Sensitive content detected
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {findings.length} issue{findings.length !== 1 ? "s" : ""} found before sending.
            </p>
          </div>
        </div>

        {/* Findings list */}
        <ul className="space-y-2">
          {findings.map((f, i) => (
            <FindingRow key={`${f.ruleId}-${i}`} finding={f} promptText={promptText} />
          ))}
        </ul>

        {/* Actions — two buttons, no cancel clutter */}
        <div className="flex gap-3 justify-end pt-1">
          {canSendAnyway && (
            <button
              onClick={() => onDecision({ type: "send_anyway", reason: "user acknowledged" })}
              className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 focus:outline-none focus:underline"
            >
              Looks fine, send it
            </button>
          )}

          <button
            ref={editBtnRef}
            onClick={() => onDecision({ type: "edit" })}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Edit prompt
          </button>
        </div>

        {highestAction === "block" && (
          <p className="text-xs text-red-500 text-center">
            Your policy does not allow sending this content.
          </p>
        )}

      </div>
    </div>
  );
}
