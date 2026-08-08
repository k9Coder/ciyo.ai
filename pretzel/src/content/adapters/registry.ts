import type { SiteAdapter } from "./types";
import { chatGPTAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { createGenericAdapter } from "./generic";

const NAMED_ADAPTERS: SiteAdapter[] = [chatGPTAdapter, claudeAdapter, geminiAdapter];

export function getAdapter(hostname: string): SiteAdapter {
  // Local/e2e builds only: the QA fixtures server (localhost:9876) serves
  // *-mock.html pages that replicate each real host's composer/send DOM. Route
  // them to the matching real adapter so send-interception + the warn/block
  // overlay can be exercised in QA (PX-04/05) without automating a real AI host.
  // Guarded on a localhost VITE_API_BASE — a build-time constant that is only
  // true for dev/e2e builds (staging/prod point at real backends), so this whole
  // branch is dead-code-eliminated from staging and production bundles. `DEV` is
  // unusable here: it is false in every `vite build`, and MODE would leak into
  // the staging build.
  const isLocalBuild = (import.meta.env.VITE_API_BASE ?? "").includes("localhost")
  if (isLocalBuild && (hostname === "localhost" || hostname === "127.0.0.1")) {
    const path = typeof location !== "undefined" ? location.pathname : "";
    if (/chatgpt|openai/i.test(path)) return chatGPTAdapter;
    if (/claude/i.test(path)) return claudeAdapter;
    if (/gemini/i.test(path)) return geminiAdapter;
  }
  for (const adapter of NAMED_ADAPTERS) {
    if (typeof adapter.hostname === "string") {
      if (adapter.hostname === hostname) return adapter;
    } else {
      if (adapter.hostname.test(hostname)) return adapter;
    }
  }
  return createGenericAdapter(hostname);
}
