import { getAdapter } from "./adapters/registry";
import { showWarningModal } from "./overlay/overlay-root";
import { sendMessage } from "@/shared/messages";
import { appendAuditEvent } from "@/audit/log";
import type { DetectionResult } from "@/detection/types";
import type { Policy } from "@/policy/schema";
import type { AuditEvent } from "@/audit/types";
import { logger } from "@/shared/logger";

// ─── Bootstrap ────────────────────────────────────────────────────────────────

(async () => {
  try {
    await bootstrap();
  } catch (err) {
    // Never throw to the page
    logger.error("PromptShield bootstrap failed:", err);
  }
})();

async function bootstrap() {
  const hostname = location.hostname;
  const adapter = getAdapter(hostname);
  if (!adapter) {
    logger.info("No adapter for hostname:", hostname);
    return;
  }

  logger.info("PromptShield active on", adapter.name);

  let cachedPolicy: Policy | null = null;

  /** Fetch/refresh the policy from the background worker. */
  async function getPolicy(): Promise<Policy> {
    if (!cachedPolicy) {
      cachedPolicy = await sendMessage<Policy>({ type: "GET_POLICY" });
    }
    return cachedPolicy;
  }

  // Invalidate cache when policy changes
  chrome.storage.onChanged.addListener(() => {
    cachedPolicy = null;
  });

  // ── Send-intent handler ────────────────────────────────────────────────────
  adapter.onSendIntent(async (_e: Event) => {
    try {
      const composer = adapter.findComposer();
      if (!composer) return { proceed: true };

      const promptText = adapter.readPromptText(composer);
      if (!promptText.trim()) return { proceed: true };

      const policy = await getPolicy();

      // Detect via background service worker (runs in its own context)
      const result: DetectionResult = await sendMessage({
        type: "DETECT",
        payload: { text: promptText, hostname },
      });

      logger.debug("Detection result:", result);

      // Always write an audit event
      await writeAuditEvent(result, promptText, hostname, "sent");

      if (result.highestAction === "log") {
        return { proceed: true };
      }

      // Show modal and wait for user decision
      const decision = await showWarningModal(result, promptText, policy);

      switch (decision.type) {
        case "edit":
          await writeAuditEvent(result, promptText, hostname, "edited");
          composer.focus();
          return { proceed: false };

        case "cancel":
          await writeAuditEvent(result, promptText, hostname, "cancelled");
          return { proceed: false };

        case "send_anyway":
          await writeAuditEvent(result, promptText, hostname, "sent_with_reason", decision.reason);
          return { proceed: true };
      }
    } catch (err) {
      logger.error("Send-intent handler error:", err);
      return { proceed: true }; // fail open so we don't block the user
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
