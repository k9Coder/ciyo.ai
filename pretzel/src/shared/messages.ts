import type { DetectionResult, InputType } from "@ciyo/detect";
import type { Policy } from "@ciyo/detect";

/** Typed message bus for runtime.sendMessage / onMessage. */

export type Message =
  | { type: "DETECT"; payload: { text: string; hostname: string; pasteDetected?: boolean; inputType?: InputType; filename?: string; mimeType?: string } }
  | { type: "DETECT_RESULT"; payload: DetectionResult }
  | { type: "GET_POLICY"; payload?: never }
  | { type: "POLICY_UPDATED"; payload: Policy }
  | { type: "TOGGLE_SITE"; payload: { hostname: string; enabled: boolean } }
  | { type: "GET_SITE_STATUS"; payload: { hostname: string } }
  | { type: "SITE_STATUS"; payload: { hostname: string; enabled: boolean } }
  | { type: "SYNC_NOW"; payload?: never }
  | { type: "GET_ROLE"; payload?: never }
  | { type: "GET_SUBSCRIPTION_STATUS"; payload?: never }
  | { type: "GET_SCAN_LIMIT_STATUS"; payload?: never }
  | { type: "REPORT_DEGRADED"; payload: { hostname: string; reason: EnforcementReason } };

/** Reasons the extension can report degraded enforcement (no prompt content). */
export type EnforcementReason = "decision_timeout" | "bridge_error" | "adapter_miss";

/** Send a message to the background service worker from a content script or popup. */
export function sendMessage<T>(message: Message): Promise<T> {
  return chrome.runtime.sendMessage(message) as Promise<T>;
}

/** Type-safe wrapper for chrome.runtime.onMessage.addListener. */
export function onMessage(
  handler: (
    message: Message,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void
  ) => boolean | void
): void {
  chrome.runtime.onMessage.addListener(handler);
}
