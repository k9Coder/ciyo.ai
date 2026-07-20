/**
 * Fetch/XHR interceptor — runs in the MAIN world at document_start.
 *
 * Overrides window.fetch to intercept outbound requests on monitored AI hosts.
 * For file uploads (multipart/form-data bodies), extracts file content and
 * sends it to the ISOLATED world content script for detection via postMessage.
 *
 * Message protocol (window.postMessage, same origin):
 *   MAIN → ISOLATED  { type: "MYKKA_INTERCEPT", id, payload }
 *   ISOLATED → MAIN  { type: "MYKKA_DECISION",  id, proceed }
 *   ISOLATED → MAIN  { type: "MYKKA_UNLOCK_FETCH" }  (button-click pre-approval)
 *
 * Fail-open: if the ISOLATED world does not respond within 5 s, the request proceeds.
 */

import { extractFile } from "./file-extract";
import { extractPromptFromRequest } from "./request-extract";
import { MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH, MSG_DEGRADED } from "./intercept-messages";

export { MSG_INTERCEPT, MSG_DECISION, MSG_UNLOCK_FETCH, MSG_DEGRADED };

const DECISION_TIMEOUT_MS = 5_000;

// ─── Button-click pre-approval flag ──────────────────────────────────────────
// When the ISOLATED world button-click handler approves a send, it posts
// MYKKA_UNLOCK_FETCH. The next fetch that fires is allowed through immediately
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
      // Enforcement degraded: detection didn't answer in time. Signal the ISOLATED
      // world (which has chrome APIs) to report it, then fail open.
      window.postMessage({ type: MSG_DEGRADED, reason: "decision_timeout" }, "*");
      resolve(true); // fail open on timeout
    }, DECISION_TIMEOUT_MS);

    window.addEventListener("message", handler);
    window.postMessage({ type: MSG_INTERCEPT, id, payload }, "*");
  });
}

// ─── File body extraction ─────────────────────────────────────────────────────

/** Resolve the request URL from fetch args. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

/**
 * Read a string request body for JSON prompt inspection.
 * Only string bodies (the common `fetch(url, { body: JSON.stringify(...) })`
 * shape) and Request objects are read; anything else returns null.
 */
async function readBodyText(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<string | null> {
  const body = init?.body;
  if (typeof body === "string") return body;
  if (!body && input instanceof Request) {
    try { return await input.clone().text(); } catch { return null; }
  }
  return null;
}

/** Inspect a JSON prompt body; returns a detection payload or null if not a prompt send. */
function inspectPromptBody(url: string, bodyText: string): InterceptPayload | null {
  const hostname = location.hostname;
  const text = extractPromptFromRequest(hostname, url, bodyText);
  if (!text) return null;
  return { text, inputType: "prompt", hostname };
}

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

window.fetch = async function mykkaFetch(
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
    } else {
      // JSON prompt sends — the network backstop. Runs only when the button-click
      // path did NOT pre-approve this fetch (nextFetchApproved handled above), so a
      // DOM/selector change can't silently disable enforcement.
      const bodyText = await readBodyText(input, init);
      if (bodyText) {
        const payload = inspectPromptBody(requestUrl(input), bodyText);
        if (payload) {
          const proceed = await requestDetection(payload);
          if (!proceed) {
            throw new DOMException("Blocked by Pretzel policy", "AbortError");
          }
        }
      }
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    // Any extraction/detection error → fail open
  }

  return originalFetch(input, init);
};

// ─── XMLHttpRequest override ──────────────────────────────────────────────────
// Covers sites that use XHR instead of fetch for file uploads.

const OriginalXHR = window.XMLHttpRequest;

class MykkaXHR extends OriginalXHR {
  private _mykkaBody: FormData | null = null;
  private _mykkaUrl = "";

  open(method: string, url: string | URL, ...rest: unknown[]): void {
    this._mykkaUrl = typeof url === "string" ? url : url.toString();
    // @ts-expect-error — forwarding the full native open signature
    super.open(method, url, ...rest);
  }

  send(body?: Document | XMLHttpRequestBodyInit | null): void {
    if (nextFetchApproved) {
      nextFetchApproved = false;
      super.send(body ?? undefined);
      return;
    }

    if (body instanceof FormData) {
      this._mykkaBody = body;
      inspectFormData(body).then(async (payload) => {
        if (payload) {
          const proceed = await requestDetection(payload);
          if (!proceed) {
            // Simulate a network error to the caller
            this.dispatchEvent(new ProgressEvent("error"));
            return;
          }
        }
        super.send(this._mykkaBody ?? undefined);
      }).catch(() => {
        super.send(this._mykkaBody ?? undefined); // fail open
      });
      return;
    }

    // JSON prompt body — network backstop (mirrors the fetch path).
    if (typeof body === "string") {
      const payload = inspectPromptBody(this._mykkaUrl, body);
      if (payload) {
        requestDetection(payload).then((proceed) => {
          if (!proceed) { this.dispatchEvent(new ProgressEvent("error")); return; }
          super.send(body);
        }).catch(() => super.send(body)); // fail open
        return;
      }
    }

    super.send(body ?? undefined);
  }
}

// Only replace XHR if the site actually uses it (check avoids unnecessary patching).
if (typeof window.XMLHttpRequest !== "undefined") {
  window.XMLHttpRequest = MykkaXHR as typeof XMLHttpRequest;
}
