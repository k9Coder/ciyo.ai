import type { SiteAdapter } from "./types";
import { chatGPTAdapter } from "./chatgpt";
import { claudeAdapter } from "./claude";
import { geminiAdapter } from "./gemini";
import { createGenericAdapter } from "./generic";

const NAMED_ADAPTERS: SiteAdapter[] = [chatGPTAdapter, claudeAdapter, geminiAdapter];

export function getAdapter(hostname: string): SiteAdapter {
  for (const adapter of NAMED_ADAPTERS) {
    if (typeof adapter.hostname === "string") {
      if (adapter.hostname === hostname) return adapter;
    } else {
      if (adapter.hostname.test(hostname)) return adapter;
    }
  }
  return createGenericAdapter(hostname);
}
