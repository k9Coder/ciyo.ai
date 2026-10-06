import { useEffect, useState } from "react";

export type ToastSpec =
  | { id: number; kind: "redacted"; count: number; ruleNames: string[] }
  | { id: number; kind: "unchecked" };

const AUTO_DISMISS_MS = 7000;

function Toast({ toast, onDismiss }: { toast: ToastSpec; onDismiss: (id: number) => void }) {
  const [expanded, setExpanded] = useState(false);

  // Keep the toast up while the user is reading the details.
  useEffect(() => {
    if (expanded) return;
    const t = setTimeout(() => onDismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [expanded, toast.id, onDismiss]);

  if (toast.kind === "unchecked") {
    return (
      <div className="mykka-toast mykka-toast-warn" role="status">
        <span className="mykka-toast-icon" />
        <span>Pretzel couldn't check this one. It was sent without a check.</span>
      </div>
    );
  }

  return (
    <>
      <div className="mykka-toast mykka-toast-ok" role="status">
        <span className="mykka-toast-icon" />
        <span>
          Sent with <b>{toast.count} {toast.count === 1 ? "detail" : "details"} removed</b>
        </span>
        <button
          className="mykka-toast-action"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>
      {expanded && (
        <ul className="mykka-toast-details">
          {toast.ruleNames.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}
    </>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastSpec[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className="mykka-toast-stack">
      {toasts.map((t) => <Toast key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}
