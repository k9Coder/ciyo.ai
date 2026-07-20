import { initSentry, Sentry } from "@/lib/sentry";
import { getAdapter } from "./adapters/registry";
import { showWarningModal } from "./overlay/overlay-root";
import { sendMessage } from "@/shared/messages";
import { appendAuditEvent } from "@/audit/log";
import type { DetectionResult } from "@mykka/detect";
import type { AuditEvent } from "@/audit/types";
import { logger } from "@/shared/logger";
import { MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH, MSG_DEGRADED } from "./intercept-messages";
import type { EnforcementReason } from "@/shared/messages";

/** Report degraded enforcement to the service worker (which debounces + POSTs). */
function reportDegraded(reason: EnforcementReason): void {
  void sendMessage({ type: "REPORT_DEGRADED", payload: { hostname: location.hostname, reason } }).catch(() => {});
}

initSentry();

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  try {
    await bootstrap();
  } catch (err) {
    logger.error("ciyo bootstrap failed:", err);
    Sentry.captureException(err, { tags: { context: 'bootstrap' } });
  }
})();

async function bootstrap() {
  const hostname = location.hostname;
  const adapter = getAdapter(hostname);

  logger.info("ciyo active on", adapter.name);

  let lastPasteAt = 0;
  document.addEventListener("paste", () => { lastPasteAt = Date.now(); }, { capture: true });
  function wasPasteRecent(): boolean { return Date.now() - lastPasteAt < 500; }

  // MAIN world signals degraded enforcement (e.g. decision timeout) — forward it.
  if (typeof window !== "undefined") window.addEventListener("message", (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as { type?: string; reason?: EnforcementReason };
    if (data?.type === MSG_DEGRADED && data.reason) reportDegraded(data.reason);
  });

  // ── Fetch interceptor bridge ─────────────────────────────────────────────
  // The MAIN world fetch-interceptor posts CIYO_INTERCEPT when it catches a
  // file upload that wasn't triggered by the button-click path. We detect it
  // here (ISOLATED world has chrome API access) and post back CIYO_DECISION.
  if (typeof window !== "undefined") window.addEventListener("message", async (e: MessageEvent) => {
    if (e.source !== window) return;
    const data = e.data as { type?: string; id?: string; payload?: Record<string, unknown> };
    if (data?.type !== MSG_INTERCEPT || !data.id || !data.payload) return;

    const { id, payload } = data;
    const label = payload.filename ? String(payload.filename) : String(payload.text ?? "").slice(0, 80);

    try {
      const result: DetectionResult = await sendMessage({
        type: "DETECT",
        payload: {
          text:      String(payload.text ?? ""),
          hostname:  String(payload.hostname ?? hostname),
          inputType: payload.inputType as "prompt" | "file",
          filename:  payload.filename ? String(payload.filename) : undefined,
          mimeType:  payload.mimeType ? String(payload.mimeType) : undefined,
          pasteDetected: false,
        },
      });

      if (result.signInNudge) showSignInNudge();

      if (result.highestAction === "log") {
        window.postMessage({ type: MSG_DECISION, id, proceed: true }, "*");
        return;
      }

      const promptText = String(payload.text ?? "");
      const eventHostname = String(payload.hostname ?? hostname);
      const decision = await showWarningModal(result, label);
      const proceed = decision.type === "send_anyway";
      // Record the outcome — the network/file backstop must be visible in the audit
      // trail, not just the button-click path.
      await writeAuditEvent(
        result,
        promptText,
        eventHostname,
        proceed ? "sent_with_reason" : "edited",
        proceed && decision.type === "send_anyway" ? decision.reason : undefined,
      );
      window.postMessage({ type: MSG_DECISION, id, proceed }, "*");
    } catch (err) {
      logger.error("Fetch intercept bridge error:", err);
      reportDegraded("bridge_error");
      window.postMessage({ type: MSG_DECISION, id, proceed: true }, "*"); // fail open
    }
  });

  // ── Button-click send intent ─────────────────────────────────────────────
  adapter.onSendIntent(async (_e: Event) => {
    try {
      const composer = adapter.findComposer();
      if (!composer) {
        // A send fired but the adapter can't locate the composer — its selectors
        // are likely stale. Enforcement is degraded on this site.
        reportDegraded("adapter_miss");
        return { proceed: true };
      }

      const promptText = adapter.readPromptText(composer);
      if (!promptText.trim()) return { proceed: true };

      const result: DetectionResult = await sendMessage({
        type: "DETECT",
        payload: { text: promptText, hostname, pasteDetected: wasPasteRecent() },
      });

      logger.debug("Detection result:", result);

      if (result.signInNudge) {
        showSignInNudge();
      }

      // For log-only results the prompt proceeds without a modal — write the
      // "sent" event here as the outcome is already known.
      if (result.highestAction === "log") {
        await writeAuditEvent(result, promptText, hostname, "sent");
        // Tell the MAIN world fetch interceptor this send was pre-approved.
        window.postMessage({ type: MSG_UNLOCK_FETCH }, "*");
        return { proceed: true };
      }

      // For warn/block results, defer the audit write until AFTER the modal so
      // the logged decision reflects what the user actually chose. Writing
      // "sent" before the modal would produce a spurious extra event whenever
      // the user clicks "Edit prompt".
      const decision = await showWarningModal(result, promptText);

      switch (decision.type) {
        case "edit":
          await writeAuditEvent(result, promptText, hostname, "edited");
          composer.focus();
          return { proceed: false };

        case "send_anyway":
          await writeAuditEvent(result, promptText, hostname, "sent_with_reason", decision.reason);
          // Tell the MAIN world fetch interceptor this send was pre-approved.
          if (typeof window !== "undefined") window.postMessage({ type: MSG_UNLOCK_FETCH }, "*");
          return { proceed: true };
      }
    } catch (err) {
      logger.error("Send-intent handler error:", err);
      Sentry.captureException(err, { tags: { context: 'send-intent', hostname } });
      return { proceed: true };
    }
  });

  // Mark extension as ready for E2E test synchronisation — set synchronously
  // after ALL listeners so tests can waitFor this before interacting with the page.
  document.documentElement.dataset.ciyoReady = '1';

  // Cosmetic scan-limit banner — checked after all security listeners are registered
  // so service-worker startup latency cannot delay click interception.
  const limitStatus = await sendMessage<{ scanLimitReached: boolean }>({ type: "GET_SCAN_LIMIT_STATUS" }).catch(() => null);
  if (limitStatus?.scanLimitReached) showScanLimitBanner();
}

// ─── Notification banners ────────────────────────────────────────────────────

interface BannerOpts {
  id:            string
  background:    string
  border:        string
  alignItems:    string
  maxWidth:      string
  setContent:    (span: HTMLSpanElement) => void
  autoDismissMs: number
}

function showBanner(opts: BannerOpts): void {
  if (document.getElementById(opts.id)) return;

  const banner = document.createElement("div");
  banner.id = opts.id;
  Object.assign(banner.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    background: opts.background,
    color: "#f0f0f0",
    borderRadius: "10px",
    padding: "12px 14px",
    fontSize: "13px",
    lineHeight: "1.4",
    boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
    border: opts.border,
    display: "flex",
    alignItems: opts.alignItems,
    gap: "10px",
    maxWidth: opts.maxWidth,
    fontFamily: "system-ui, -apple-system, sans-serif",
  });

  const msg = document.createElement("span");
  msg.style.flex = "1";
  opts.setContent(msg);

  const dismiss = document.createElement("button");
  dismiss.textContent = "×";
  Object.assign(dismiss.style, {
    background: "none",
    border: "none",
    color: "rgba(255,255,255,0.45)",
    cursor: "pointer",
    fontSize: "18px",
    lineHeight: "1",
    padding: "0",
    flexShrink: "0",
  });
  dismiss.addEventListener("click", () => banner.remove());

  banner.appendChild(msg);
  banner.appendChild(dismiss);
  document.body.appendChild(banner);

  setTimeout(() => banner.remove(), opts.autoDismissMs);
}

function showScanLimitBanner(): void {
  showBanner({
    id:         "ciyo-scan-limit-banner",
    background: "#1a0a0a",
    border:     "1px solid rgba(239,68,68,0.4)",
    alignItems: "flex-start",
    maxWidth:   "320px",
    setContent: (span) => {
      span.innerHTML = "<strong style='color:#ef4444'>Scan limit reached.</strong> Protection is still active but scan usage has hit the monthly cap. Upgrade your plan in the admin console.";
    },
    autoDismissMs: 12000,
  });
}

function showSignInNudge(): void {
  showBanner({
    id:         "ciyo-signin-nudge",
    background: "#16213e",
    border:     "1px solid rgba(255,255,255,0.1)",
    alignItems: "center",
    maxWidth:   "300px",
    setContent: (span) => {
      span.textContent = "Sign in to Ciyo to start protecting your prompts.";
    },
    autoDismissMs: 8000,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function writeAuditEvent(
  result: DetectionResult,
  promptText: string,
  hostname: string,
  userDecision: AuditEvent["userDecision"],
  reason?: string
): Promise<void> {
  try {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      hostname,
      action: result.highestAction,
      userDecision,
      reason,
      findings: result.findings,
      promptLengthChars: promptText.length,
      promptHash: result.promptHash,
    };
    await appendAuditEvent(event);
  } catch (err) {
    logger.error("Failed to write audit event:", err);
  }
}
