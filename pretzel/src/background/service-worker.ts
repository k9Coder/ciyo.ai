import * as Sentry from "@sentry/browser";
import { detectPrompt } from "@/detection/engine";
import { loadPolicy } from "@/policy/loader";
import { dispatchEvents } from "@/events/dispatch";
import { dispatchScan, isScanLimitReached } from "@/scans/dispatch";
import type { DetectionResult } from "@/detection/types";
import { syncPolicy } from "@/policy/sync";
import { checkForUpdates } from "@/background/update-check";
import { getRole } from "@/policy/role";
import type { Message } from "@/shared/messages";
import { STORAGE_SITE_OVERRIDES_KEY } from "@/shared/constants";
import { logger } from "@/shared/logger";

if (import.meta.env['VITE_SENTRY_DSN_EXTENSION']) {
  Sentry.init({
    dsn: import.meta.env['VITE_SENTRY_DSN_EXTENSION'] as string,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    integrations: [],
  })
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  logger.info("ciyo installed. Reason:", reason);
  void syncPolicy();                                            // full sync on first install
  chrome.alarms.create("policy-sync", { periodInMinutes: 2 }); // reduced from 30
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "policy-sync") {
    void checkForUpdates(); // lightweight timestamp check; falls back to syncPolicy internally
  }
});

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (message: Message, _sender, sendResponse) => {
    handleMessage(message)
      .then(sendResponse)
      .catch((err) => {
        logger.error("Message handler error:", err);
        Sentry.captureException(err, { extra: { messageType: (message as Message)?.type } });
        sendResponse(null);
      });
    return true; // keep channel open for async response
  }
);

// isAuthenticated mirrors the priority order in getAuthToken() (auth.ts):
// MDM managed → local orgToken → Clerk JWT.
async function isAuthenticated(): Promise<boolean> {
  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>;
  if (typeof managed["orgToken"] === "string") return true;
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  if (typeof local["orgToken"] === "string") return true;
  const clerk = await chrome.storage.local.get("clerkSessionToken") as Record<string, unknown>;
  return typeof clerk["clerkSessionToken"] === "string";
}

const NUDGE_EVERY = 10;

async function unauthResult(): Promise<DetectionResult> {
  const stored = await chrome.storage.local.get("unauthPromptCount") as Record<string, unknown>;
  const count = (typeof stored["unauthPromptCount"] === "number" ? stored["unauthPromptCount"] : 0) + 1;
  await chrome.storage.local.set({ unauthPromptCount: count });
  return {
    findings: [],
    highestAction: "log",
    promptHash: "",
    detectedAtMs: Date.now(),
    durationMs: 0,
    signInNudge: count % NUDGE_EVERY === 1 ? true : undefined,
  };
}

async function getDisabledSites(): Promise<string[]> {
  const result = await chrome.storage.local.get(STORAGE_SITE_OVERRIDES_KEY) as Record<string, unknown>;
  const raw = result[STORAGE_SITE_OVERRIDES_KEY];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case "DETECT": {
      const { text, hostname, pasteDetected } = message.payload;
      if (!await isAuthenticated()) return unauthResult();
      const policy = await loadPolicy();
      const result = await detectPrompt(text, policy, hostname, pasteDetected ?? false);
      void dispatchEvents(result, hostname);
      const limitReached = await isScanLimitReached();
      if (!limitReached) void dispatchScan();
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

    case "GET_SCAN_LIMIT_STATUS": {
      const result = await chrome.storage.local.get("scanLimitReached") as Record<string, unknown>;
      return { scanLimitReached: result["scanLimitReached"] === true };
    }

    case "GET_ROLE": {
      // Returns the display role derived from stored tokens. This is a
      // UI-gating role only — the backend independently authorises all API calls.
      return getRole();
    }

    default:
      logger.warn("Unknown message type:", (message as Message).type);
      return null;
  }
}
