import { createRoot, type Root } from "react-dom/client";
import { WarningModal, type ModalDecision } from "./WarningModal";
import type { DetectionResult } from "@/detection/types";
import { logger } from "@/shared/logger";
// Vite's ?inline suffix gives us the compiled Tailwind CSS as a plain string,
// which we inject into the shadow root so it's scoped there and can't be
// overridden by the host page's styles.
import overlayStyles from "./overlay.css?inline";

// ─── Shadow DOM setup ─────────────────────────────────────────────────────────

let shadowHost: HTMLElement | null = null;
let reactRoot: Root | null = null;

/** Inject the Shadow DOM host once, lazily. */
function ensureShadowHost(): ShadowRoot {
  if (!shadowHost) {
    shadowHost = document.createElement("div");
    shadowHost.id = "promptshield-overlay-host";
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

    // Inject the compiled Tailwind stylesheet directly into the shadow tree.
    // This ensures host-page CSS can never bleed in and break the modal.
    const style = document.createElement("style");
    style.textContent = overlayStyles;
    shadow.appendChild(style);

    const container = document.createElement("div");
    container.id = "ps-react-root";
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
  promptText: string
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
          onDecision={handleDecision}
        />
      );
    } catch (err) {
      logger.error("Failed to render warning modal:", err);
      resolve({ type: "edit" });
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
