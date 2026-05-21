import { getAdapter } from "./adapters/registry";
import { showWarningModal } from "./overlay/overlay-root";
import { sendMessage } from "@/shared/messages";
import { appendAuditEvent } from "@/audit/log";
import type { DetectionResult } from "@/detection/types";
import type { AuditEvent } from "@/audit/types";
import { logger } from "@/shared/logger";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  try {
    await bootstrap();
  } catch (err) {
    logger.error("ciyo bootstrap failed:", err);
  }
})();

async function bootstrap() {
  const hostname = location.hostname;
  const adapter = getAdapter(hostname);

  logger.info("ciyo active on", adapter.name);

  let lastPasteAt = 0;
  document.addEventListener("paste", () => { lastPasteAt = Date.now(); }, { capture: true });
  function wasPasteRecent(): boolean { return Date.now() - lastPasteAt < 500; }

  adapter.onSendIntent(async (_e: Event) => {
    try {
      const composer = adapter.findComposer();
      if (!composer) return { proceed: true };

      const promptText = adapter.readPromptText(composer);
      if (!promptText.trim()) return { proceed: true };

      const result: DetectionResult = await sendMessage({
        type: "DETECT",
        payload: { text: promptText, hostname, pasteDetected: wasPasteRecent() },
      });

      logger.debug("Detection result:", result);

      await writeAuditEvent(result, promptText, hostname, "sent");

      if (result.highestAction === "log") {
        return { proceed: true };
      }

      const decision = await showWarningModal(result, promptText);

      switch (decision.type) {
        case "edit":
          await writeAuditEvent(result, promptText, hostname, "edited");
          composer.focus();
          return { proceed: false };

        case "send_anyway":
          await writeAuditEvent(result, promptText, hostname, "sent_with_reason", decision.reason);
          return { proceed: true };
      }
    } catch (err) {
      logger.error("Send-intent handler error:", err);
      return { proceed: true };
    }
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
