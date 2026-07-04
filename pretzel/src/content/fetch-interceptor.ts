/**
 * Fetch/XHR interceptor — runs in the MAIN world at document_start.
 *
 * Overrides window.fetch to intercept outbound requests on monitored AI hosts.
 * For file uploads (multipart/form-data bodies), extracts file content and
 * sends it to the ISOLATED world content script for detection via postMessage.
 *
 * Message protocol (window.postMessage, same origin):
 *   MAIN → ISOLATED  { type: "CIYO_INTERCEPT", id, payload }
 *   ISOLATED → MAIN  { type: "CIYO_DECISION",  id, proceed }
 *   ISOLATED → MAIN  { type: "CIYO_UNLOCK_FETCH" }  (button-click pre-approval)
 *
 * Fail-open: if the ISOLATED world does not respond within 5 s, the request proceeds.
 */

import { extractFile } from "./file-extract";
import { MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH } from "./intercept-messages";

export { MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH };

const DECISION_TIMEOUT_MS = 5_000;

// ─── Button-click pre-approval flag ──────────────────────────────────────────
// When the ISOLATED world button-click handler approves a send, it posts
// CIYO_UNLOCK_FETCH. The next fetch that fires is allowed through immediately
// (it was already detected by the button-click path).

let nextFetchApproved = false;

window.addEventListener("message", (e: MessageEvent) => {
  if (e.source !== window) return;
  if ((e.data as { type?: string })?.type === MSG_UNLOCK_FETCH) {
    nextFetchApproved = true;
  }
});

// ─── Detection request ────────────────────────────────────────────────────────

interface InterceptPayload {
  text: string;
  inputType: "prompt" | "file";
  hostname: string;
  filename?: string;
  mimeType?: string;
}

function requestDetection(payload: InterceptPayload): Promise<boolean> {
  return new Promise((resolve) => {
    const id = crypto.randomUUID();

    const handler = (e: MessageEvent) => {
      if (e.source !== window) return;
      const data = e.data as { type?: string; id?: string; proceed?: boolean };
      if (data?.type !== MSG_DECISION || data?.id !== id) return;
      window.removeEventListener("message", handler);
      clearTimeout(timer);
      resolve(data.proceed ?? true);
    };

    const timer = setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(true); // fail open on timeout
    }, DECISION_TIMEOUT_MS);

    window.addEventListener("message", handler);
    window.postMessage({ type: MSG_INTERCEPT, id, payload }, "*");
  });
}

// ─── File body extraction ─────────────────────────────────────────────────────

async function inspectFormData(body: FormData): Promise<InterceptPayload | null> {
  const hostname = location.hostname;

  for (const [, value] of body.entries()) {
    if (!(value instanceof File)) continue;

    const extracted = await extractFile(value);
    if (!extracted) continue; // image / unsupported binary — skip

    return {
      text:      extracted.text,
      inputType: "file",
      hostname,
      filename:  extracted.filename,
      mimeType:  extracted.mimeType,
    };
  }
  return null;
}

// ─── fetch override ───────────────────────────────────────────────────────────

const originalFetch = window.fetch.bind(window);

window.fetch = async function ciyoFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  // Button-click path already ran detection — pass through and clear flag.
  if (nextFetchApproved) {
    nextFetchApproved = false;
    return originalFetch(input, init);
  }

  try {
    const body = init?.body;

    if (body instanceof FormData) {
      const payload = await inspectFormData(body);
      if (payload) {
        const proceed = await requestDetection(payload);
        if (!proceed) {
          throw new DOMException("Blocked by Pretzel policy", "AbortError");
        }
      }
    }

    // Non-file (JSON prompt) sends are handled by the button-click path for now.
    // Future: parse JSON body here to fully replace button-click detection.
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // Any extraction/detection error → fail open
  }

  return originalFetch(input, init);
};

// ─── XMLHttpRequest override ──────────────────────────────────────────────────
// Covers sites that use XHR instead of fetch for file uploads.

const OriginalXHR = window.XMLHttpRequest;

class CiyoXHR extends OriginalXHR {
  private _ciyoBody: FormData | null = null;

  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    if (nextFetchApproved) {
      nextFetchApproved = false;
      super.send(body ?? undefined);
      return;
    }

    if (body instanceof FormData) {
      this._ciyoBody = body;
      inspectFormData(body).then(async (payload) => {
        if (payload) {
          const proceed = await requestDetection(payload);
          if (!proceed) {
            // Simulate a network error to the caller
            this.dispatchEvent(new ProgressEvent("error"));
            return;
          }
        }
        super.send(this._ciyoBody ?? undefined);
      }).catch(() => {
        super.send(this._ciyoBody ?? undefined); // fail open
      });
      return;
    }

    super.send(body ?? undefined);
  }
}

// Only replace XHR if the site actually uses it (check avoids unnecessary patching).
if (typeof window.XMLHttpRequest !== "undefined") {
  window.XMLHttpRequest = CiyoXHR as typeof XMLHttpRequest;
}
