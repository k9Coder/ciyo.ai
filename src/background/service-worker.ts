import { detectPrompt } from "@/detection/engine";
import { loadPolicy, savePolicy } from "@/policy/loader";
import { appendAuditEvent } from "@/audit/log";
import { syncPolicy } from "@/policy/sync";
import { getRole } from "@/policy/role";
import type { Message } from "@/shared/messages";
import { logger } from "@/shared/logger";

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  logger.info("PromptShield installed. Reason:", reason);
  void syncPolicy();
  chrome.alarms.create("policy-sync", { periodInMinutes: 30 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "policy-sync") {
    void syncPolicy();
  }
});

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        logger.error("Message handler error:", err);
        sendResponse(null);
      });
    return true; // keep channel open for async response
  }
);

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case "DETECT": {
      const { text, hostname, pasteDetected } = message.payload;
      const policy = await loadPolicy();
      return detectPrompt(text, policy, hostname, pasteDetected ?? false);
    }

    case "GET_POLICY": {
      return loadPolicy();
    }

    case "TOGGLE_SITE": {
      const { hostname, enabled } = message.payload;
      const policy = await loadPolicy();
      policy.perSite[hostname] = {
        ...(policy.perSite[hostname] ?? {}),
        enabled,
      };
      await savePolicy(policy);
      return { ok: true };
    }

    case "GET_SITE_STATUS": {
      const { hostname } = message.payload;
      const policy = await loadPolicy();
      const site = policy.perSite[hostname];
      return { hostname, enabled: site?.enabled ?? true };
    }

    case "SYNC_NOW": {
      await syncPolicy();
      return { ok: true };
    }

    case "GET_ROLE": {
      return { role: await getRole() };
    }

    case "GET_SUBSCRIPTION_STATUS": {
      const result = await chrome.storage.local.get([
        "subscriptionExpired",
        "subscriptionWarning",
        "tenantName",
      ]) as Record<string, unknown>;
      return {
        expired: result["subscriptionExpired"] === true,
        warning: result["subscriptionWarning"] === true,
        tenantName: typeof result["tenantName"] === "string" ? result["tenantName"] : null,
      };
    }

    default:
      logger.warn("Unknown message type:", (message as Message).type);
      return null;
  }
}
