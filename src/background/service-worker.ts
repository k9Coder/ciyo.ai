import { detectPrompt } from "@/detection/engine";
import { loadPolicy } from "@/policy/loader";
import { dispatchEvents } from "@/events/dispatch";
import { dispatchScan } from "@/scans/dispatch";
import { syncPolicy } from "@/policy/sync";
import type { Message } from "@/shared/messages";
import { STORAGE_SITE_OVERRIDES_KEY } from "@/shared/constants";
import { logger } from "@/shared/logger";

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  logger.info("ciyo installed. Reason:", reason);
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

async function getDisabledSites(): Promise<string[]> {
  const result = await chrome.storage.local.get(STORAGE_SITE_OVERRIDES_KEY) as Record<string, unknown>;
  const raw = result[STORAGE_SITE_OVERRIDES_KEY];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case "DETECT": {
      const { text, hostname, pasteDetected } = message.payload;
      const policy = await loadPolicy();
      const result = await detectPrompt(text, policy, hostname, pasteDetected ?? false);
      void dispatchEvents(result, hostname);
      void dispatchScan();
      return result;
    }

    case "GET_POLICY": {
      return loadPolicy();
    }

    case "TOGGLE_SITE": {
      const { hostname, enabled } = message.payload;
      const disabled = await getDisabledSites();
      const updated = enabled
        ? disabled.filter((h) => h !== hostname)
        : [...new Set([...disabled, hostname])];
      await chrome.storage.local.set({ [STORAGE_SITE_OVERRIDES_KEY]: updated });
      return { ok: true };
    }

    case "GET_SITE_STATUS": {
      const { hostname } = message.payload;
      const disabled = await getDisabledSites();
      return { hostname, enabled: !disabled.includes(hostname) };
    }

    case "SYNC_NOW": {
      await syncPolicy();
      return { ok: true };
    }

    case "GET_SUBSCRIPTION_STATUS": {
      const result = await chrome.storage.local.get("subscriptionExpired") as Record<string, unknown>;
      return { expired: result["subscriptionExpired"] === true };
    }

    default:
      logger.warn("Unknown message type:", (message as Message).type);
      return null;
  }
}
