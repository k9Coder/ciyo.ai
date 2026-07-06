/**
 * Network-level prompt extraction — the enforcement backstop.
 *
 * The DOM adapters (button/Enter interception) are the primary path and give
 * pre-send UX. But if a site changes its DOM, or the user submits by a path the
 * adapter doesn't hook, the button-click detection silently never fires. This
 * module extracts the prompt from the actual outbound request body so detection
 * runs at the network layer regardless of how the send was triggered.
 *
 * Contract: given a request's host, URL, and body text, return the user's
 * prompt string, or null if this request is not a recognized prompt send (in
 * which case the interceptor does nothing extra and the DOM path still applies).
 *
 * Every parser is defensive — any parse failure returns null (fail-open). We
 * never throw into the fetch path.
 */

/** Max body we will JSON-parse for inspection. Larger → skip (DOM path still active). */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

type Extractor = (url: string, body: unknown) => string | null;

// ─── ChatGPT ────────────────────────────────────────────────────────────────
// POST https://chatgpt.com/backend-api/(f/)conversation
// { action, messages: [{ author:{role:'user'}, content:{ content_type:'text', parts:['...'] } }] }
function extractChatGPT(url: string, body: unknown): string | null {
  if (!/\/backend-api\/(f\/)?conversation\b/.test(url)) return null;
  const b = body as { messages?: Array<{ author?: { role?: string }; content?: { parts?: unknown[] } }> };
  if (!Array.isArray(b?.messages)) return null;

  const userParts: string[] = [];
  for (const msg of b.messages) {
    if (msg?.author?.role && msg.author.role !== "user") continue;
    const parts = msg?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const p of parts) {
      if (typeof p === "string") userParts.push(p);
    }
  }
  const text = userParts.join("\n").trim();
  return text.length > 0 ? text : null;
}

// ─── Claude ─────────────────────────────────────────────────────────────────
// POST https://claude.ai/api/.../completion (also append_message / retry_completion)
// { prompt: '...', ... }  or older  { completion: { prompt: '...' } }
function extractClaude(url: string, body: unknown): string | null {
  if (!/\/(completion|append_message|retry_completion)\b/.test(url)) return null;
  const b = body as { prompt?: unknown; completion?: { prompt?: unknown } };
  const prompt =
    typeof b?.prompt === "string" ? b.prompt
    : typeof b?.completion?.prompt === "string" ? b.completion.prompt
    : null;
  const text = prompt?.trim() ?? "";
  return text.length > 0 ? text : null;
}

// ─── Gemini ─────────────────────────────────────────────────────────────────
// Gemini uses batchexecute RPC with a form-encoded `f.req` payload whose prompt
// is buried in deeply nested JSON-in-a-string. Parsing it reliably is brittle,
// so we deliberately return null and let the DOM adapter cover Gemini. Tracked
// as a follow-up if a stable request shape is confirmed.
function extractGemini(): string | null {
  return null;
}

const EXTRACTORS: Array<{ match: RegExp; extract: Extractor }> = [
  { match: /(^|\.)chatgpt\.com$/i,        extract: extractChatGPT },
  { match: /(^|\.)chat\.openai\.com$/i,   extract: extractChatGPT },
  { match: /(^|\.)claude\.ai$/i,          extract: extractClaude },
  { match: /(^|\.)gemini\.google\.com$/i, extract: extractGemini },
];

/**
 * Extract the prompt text from an outbound request body, or null if this is not
 * a recognized prompt send for the given host.
 */
export function extractPromptFromRequest(
  hostname: string,
  url: string,
  bodyText: string,
): string | null {
  if (!bodyText || bodyText.length > MAX_BODY_BYTES) return null;

  const entry = EXTRACTORS.find((e) => e.match.test(hostname));
  if (!entry) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null; // not JSON (e.g. Gemini form body) — nothing to inspect here
  }

  try {
    return entry.extract(url, parsed);
  } catch {
    return null;
  }
}
