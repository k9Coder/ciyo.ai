import React from "react";
import { createRoot, type Root } from "react-dom/client";
import { WarningModal, type ModalDecision } from "./WarningModal";
import type { DetectionResult } from "@/detection/types";
import type { Policy } from "@/policy/schema";
import { logger } from "@/shared/logger";

// ─── Shadow DOM setup ─────────────────────────────────────────────────────────

let shadowHost: HTMLElement | null = null;
let reactRoot: Root | null = null;

/** Inject the Shadow DOM host once, lazily. */
function ensureShadowHost(): ShadowRoot {
  if (!shadowHost) {
    shadowHost = document.createElement("div");
    shadowHost.id = "promptshield-overlay-host";
    // Position the host off-flow so it never affects page layout
    Object.assign(shadowHost.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      overflow: "visible",
      zIndex: "2147483647",
      pointerEvents: "none",
    });
    document.body.appendChild(shadowHost);
  }

  let shadow = shadowHost.shadowRoot;
  if (!shadow) {
    shadow = shadowHost.attachShadow({ mode: "open" });

    // Inject Tailwind styles into the shadow root so host-page styles can't leak in
    const style = document.createElement("style");
    // NOTE: At build time, @crxjs/vite-plugin inlines the CSS. We inject it here
    // so it scopes to the shadow root. The actual CSS is imported at content-script
    // load time via a side-effect import.
    // TODO: configure crxjs to emit shadow-compatible CSS and import it here.
    shadow.appendChild(style);

    const container = document.createElement("div");
    container.id = "ps-react-root";
    // Re-enable pointer events for the actual modal container
    container.style.pointerEvents = "auto";
    shadow.appendChild(container);
  }

  return shadow;
}

/** Mount or update the React root inside the shadow DOM. */
function getReactRoot(): Root {
  const shadow = ensureShadowHost();
  const container = shadow.getElementById("ps-react-root")!;
  if (!reactRoot) {
    reactRoot = createRoot(container);
  }
  return reactRoot;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Show the warning modal and resolve with the user's decision.
 * Returns a promise that resolves once the user clicks an action.
 */
export function showWarningModal(
  result: DetectionResult,
  promptText: string,
  policy: Policy
): Promise<ModalDecision> {
  return new Promise((resolve) => {
    try {
      const root = getReactRoot();

      const handleDecision = (decision: ModalDecision) => {
        root.render(<></>);
        resolve(decision);
      };

      root.render(
        <WarningModal
          findings={result.findings}
          highestAction={result.highestAction}
          promptText={promptText}
          allowSendAnywayWithReason={policy.allowSendAnywayWithReason}
          onDecision={handleDecision}
        />
      );
    } catch (err) {
      logger.error("Failed to render warning modal:", err);
      resolve({ type: "cancel" });
    }
  });
}

/** Unmount the modal without a decision (e.g. navigation). */
export function dismissModal(): void {
  try {
    reactRoot?.render(<></>);
  } catch {
    // ignore
  }
}
