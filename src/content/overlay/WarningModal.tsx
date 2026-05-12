import React, { useEffect, useRef, useState } from "react";
import type { Finding } from "@/detection/types";
import type { Action } from "@/detection/types";
import { SNIPPET_CONTEXT_CHARS } from "@/shared/constants";
import { buildSnippet } from "@/detection/engine";

export type ModalDecision =
  | { type: "edit" }
  | { type: "cancel" }
  | { type: "send_anyway"; reason: string };

interface Props {
  findings: Finding[];
  highestAction: Action;
  promptText: string;
  allowSendAnywayWithReason: boolean;
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

  // Split snippet at the [...] markers for highlighting
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

export function WarningModal({
  findings,
  highestAction,
  promptText,
  allowSendAnywayWithReason,
  onDecision,
}: Props) {
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const modalRef = useRef<HTMLDivElement>(null);
  const editBtnRef = useRef<HTMLButtonElement>(null);

  // Focus the Edit button on mount (default safe action)
  useEffect(() => {
    editBtnRef.current?.focus();
  }, []);

  // Keyboard: Esc = cancel, Enter on modal (not inside textarea) = edit
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onDecision({ type: "cancel" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDecision]);

  const canSendAnyway =
    allowSendAnywayWithReason && highestAction !== "block";

  function handleSendAnyway() {
    if (!showReason) {
      setShowReason(true);
      return;
    }
    if (reason.trim().length < 10) {
      setReasonError("Please enter at least 10 characters.");
      return;
    }
    onDecision({ type: "send_anyway", reason: reason.trim() });
  }

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-[2147483646] flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ps-modal-title"
      onClick={(e) => {
        // Click outside modal → cancel
        if (e.target === e.currentTarget) onDecision({ type: "cancel" });
      }}
    >
      {/* Panel */}
      <div
        ref={modalRef}
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4 max-h-[80vh] overflow-y-auto"
      >
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

        {/* Reason input */}
        {showReason && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="ps-reason">
              Reason for sending (required)
            </label>
            <textarea
              id="ps-reason"
              value={reason}
              onChange={(e) => { setReason(e.target.value); setReasonError(""); }}
              rows={3}
              placeholder="Describe why this content is safe to send…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {reasonError && (
              <p className="text-xs text-red-600">{reasonError}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => onDecision({ type: "cancel" })}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Cancel
          </button>

          {canSendAnyway && (
            <button
              onClick={handleSendAnyway}
              className="px-4 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-400"
            >
              {showReason ? "Confirm send" : "Send anyway…"}
            </button>
          )}

          <button
            ref={editBtnRef}
            onClick={() => onDecision({ type: "edit" })}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Edit prompt
          </button>
        </div>
      </div>
    </div>
  );
}
