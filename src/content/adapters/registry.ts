import type { SiteAdapter } from "./types";
import { chatGPTAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";

const ADAPTERS: SiteAdapter[] = [chatGPTAdapter, claudeAdapter, geminiAdapter];

/**
 * Returns the first adapter whose hostname pattern matches the given hostname.
 * Returns null if no adapter is registered for this site.
 */
export function getAdapter(hostname: string): SiteAdapter | null {
  for (const adapter of ADAPTERS) {
    if (typeof adapter.hostname === "string") {
      if (adapter.hostname === hostname) return adapter;
    } else {
      if (adapter.hostname.test(hostname)) return adapter;
    }
  }
  return null;
}
