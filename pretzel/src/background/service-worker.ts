import { initSentry, Sentry } from "@/lib/sentry";
import { detectPrompt, DEFAULT_POLICY } from "@mykka/detect";
import { loadPolicy } from "@/policy/loader";
import { dispatchEvents } from "@/events/dispatch";
import { dispatchScan, isScanLimitReached } from "@/scans/dispatch";
import type { DetectionResult } from "@mykka/detect";
import { syncPolicy } from "@/policy/sync";
import { checkForUpdates } from "@/background/update-check";
import { getRole } from "@/policy/role";
import { reportDegraded } from "@/telemetry/dispatch";
import { appendAuditEvent } from "@/audit/log";
import type { Message } from "@/shared/messages";
import { STORAGE_SITE_OVERRIDES_KEY } from "@/shared/constants";
import { logger } from "@/shared/logger";

initSentry();

// ─── Lifecycle ────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  logger.info("mykka installed. Reason:", reason);
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

async function shouldNudge(): Promise<boolean> {
  const stored = await chrome.storage.local.get("unauthPromptCount") as Record<string, unknown>;
  const count = (typeof stored["unauthPromptCount"] === "number" ? stored["unauthPromptCount"] : 0) + 1;
  await chrome.storage.local.set({ unauthPromptCount: count });
  return count % NUDGE_EVERY === 1;
}

async function getDisabledSites(): Promise<string[]> {
  const result = await chrome.storage.local.get(STORAGE_SITE_OVERRIDES_KEY) as Record<string, unknown>;
  const raw = result[STORAGE_SITE_OVERRIDES_KEY];
  return Array.isArray(raw) ? (raw as string[]) : [];
}

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case "DETECT": {
      const { text, hostname, pasteDetected, inputType, filename, mimeType } = message.payload;
      const detectInput = { text, hostname, pasteDetected, inputType: inputType ?? "prompt" as const, filename, mimeType };

      if (!await isAuthenticated()) {
        // Signed-out users still get the built-in baseline ruleset — matches
        // the desktop app's own documented behavior ("Without authentication,
        // only default rules apply"). This used to skip detectPrompt()
        // entirely and return empty findings unconditionally, meaning
        // signed-out users got zero protection despite the extension's own
        // About copy promising detection regardless of sign-in state.
        // Event/scan dispatch stays gated on auth — there's no org/tenant to
        // attribute them to without a signed-in account.
        const result = await detectPrompt(detectInput, DEFAULT_POLICY);
        return { ...result, signInNudge: (await shouldNudge()) ? true : undefined };
      }

      const policy = await loadPolicy();
      const result = await detectPrompt(detectInput, policy);
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

    case "REPORT_DEGRADED": {
      const { hostname, reason } = message.payload;
      void reportDegraded(hostname, reason);
      return { ok: true };
    }

    case "APPEND_AUDIT_EVENT": {
      // Content scripts run in the injected page's origin, so `indexedDB`
      // there resolves to that page's storage, not the extension's — the
      // options page (which reads via the same @/audit/log module but from
      // the chrome-extension:// origin) would never see events written from
      // a content script directly. Route through here instead, since the
      // service worker runs at the extension's own origin.
      await appendAuditEvent(message.payload);
      return { ok: true };
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
