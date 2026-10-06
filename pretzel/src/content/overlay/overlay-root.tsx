import { createRoot, type Root } from "react-dom/client";
import { WarningModal, type ModalDecision } from "./WarningModal";
import { ToastStack, type ToastSpec } from "./Toast";
import { StatusChip } from "./StatusChip";
import type { DetectionResult } from "@mykka/detect";
import type { ReportingSummary } from "@/events/dispatch";
import { logger } from "@/shared/logger";
import { STORAGE_SITE_OVERRIDES_KEY } from "@/shared/constants";
// Vite's ?inline suffix gives us the compiled Tailwind CSS as a plain string,
// which we inject into the shadow root so it's scoped there and can't be
// overridden by the host page's styles.
import overlayStyles from "./overlay.css?inline";

// ─── Shadow DOM setup ─────────────────────────────────────────────────────────

let shadowHost: HTMLElement | null = null;
let reactRoot: Root | null = null;
let _shadowRoot: ShadowRoot | null = null;

/** Inject the Shadow DOM host once, lazily. */
function ensureShadowHost(): ShadowRoot {
  if (!shadowHost) {
    shadowHost = document.createElement("div");
    shadowHost.id = "mykka-overlay-host";
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

  if (!_shadowRoot) {
    _shadowRoot = shadowHost.attachShadow({ mode: "open" });

    // Inject the compiled Tailwind stylesheet directly into the shadow tree.
    // This ensures host-page CSS can never bleed in and break the modal.
    const style = document.createElement("style");
    style.textContent = overlayStyles;
    _shadowRoot.appendChild(style);

    const container = document.createElement("div");
    container.id = "ps-react-root";
    container.style.pointerEvents = "auto";
    _shadowRoot.appendChild(container);

    // Toasts and the status chip render in their own React roots so a modal
    // render can never clobber them (and vice versa).
    const toastContainer = document.createElement("div");
    toastContainer.id = "ps-toast-root";
    toastContainer.style.pointerEvents = "auto";
    _shadowRoot.appendChild(toastContainer);

    const chipContainer = document.createElement("div");
    chipContainer.id = "ps-chip-root";
    chipContainer.style.pointerEvents = "none";
    _shadowRoot.appendChild(chipContainer);
  }

  return _shadowRoot;
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
async function applyTheme(): Promise<void> {
  // The host must exist before we can tag it; on the first modal it doesn't yet.
  ensureShadowHost();
  try {
    const stored = await chrome.storage.sync.get("theme") as Record<string, unknown>;
    const theme = stored["theme"] === "light" ? "light" : "dark";
    if (shadowHost) shadowHost.setAttribute("data-theme", theme);
  } catch {
    if (shadowHost) shadowHost.setAttribute("data-theme", "dark");
  }
}

export interface ModalOptions {
  /** Offer "Remove details & send" (prompt text we can rewrite in the composer). */
  canRedact?: boolean;
  /** What IT will receive for these findings; drives the modal footnote. */
  reporting?: ReportingSummary;
}

export async function showWarningModal(
  result: DetectionResult,
  promptText: string,
  options: ModalOptions = {}
): Promise<ModalDecision> {
  await applyTheme();
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
          canRedact={options.canRedact}
          reporting={options.reporting}
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

// ─── Toasts ───────────────────────────────────────────────────────────────────

let toastRoot: Root | null = null;
let toasts: ToastSpec[] = [];
let nextToastId = 1;

function renderToasts(): void {
  const shadow = ensureShadowHost();
  if (!toastRoot) toastRoot = createRoot(shadow.getElementById("ps-toast-root")!);
  toastRoot.render(<ToastStack toasts={toasts} onDismiss={dismissToast} />);
}

function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  renderToasts();
}

export type ToastInput =
  | { kind: "redacted"; count: number; ruleNames: string[] }
  | { kind: "unchecked" };

/** Show a transient toast above the composer. Never throws. */
export async function showToast(input: ToastInput): Promise<void> {
  try {
    await applyTheme();
    // One "unchecked" toast at a time is enough; don't stack repeats.
    if (input.kind === "unchecked" && toasts.some((t) => t.kind === "unchecked")) return;
    toasts = [...toasts, { ...input, id: nextToastId++ }];
    renderToasts();
  } catch (err) {
    logger.error("Failed to show toast:", err);
  }
}

// ─── "Pretzel on" chip ────────────────────────────────────────────────────────

let chipRoot: Root | null = null;

async function readSitePaused(hostname: string): Promise<boolean> {
  try {
    const stored = await chrome.storage.local.get(STORAGE_SITE_OVERRIDES_KEY) as Record<string, unknown>;
    const raw = stored[STORAGE_SITE_OVERRIDES_KEY];
    return Array.isArray(raw) && raw.includes(hostname);
  } catch {
    return false;
  }
}

/**
 * Mount the chip next to the composer and keep it in sync with the popup's
 * per-site pause toggle. Also follows theme changes.
 */
export async function mountStatusChip(findComposer: () => HTMLElement | null, hostname: string): Promise<void> {
  try {
    await applyTheme();
    const shadow = ensureShadowHost();
    if (!chipRoot) chipRoot = createRoot(shadow.getElementById("ps-chip-root")!);
    const root = chipRoot;

    const render = async () => {
      root.render(<StatusChip findComposer={findComposer} paused={await readSitePaused(hostname)} />);
    };
    await render();

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && STORAGE_SITE_OVERRIDES_KEY in changes) void render();
      if (area === "sync" && "theme" in changes) void applyTheme();
    });
  } catch (err) {
    logger.error("Failed to mount status chip:", err);
  }
}
