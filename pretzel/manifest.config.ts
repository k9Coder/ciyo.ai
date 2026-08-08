import { defineManifest } from "@crxjs/vite-plugin";
import { loadEnv } from "vite";
import packageJson from "./package.json";

// Single source of truth: version comes from package.json, not hardcoded here.
const { version } = packageJson;

/** Production LLM hosts — no localhost. */
const PRODUCTION_LLM_HOSTS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
];

/**
 * localhost:9876 is only needed during E2E tests (fixtures-server.mjs).
 * It is excluded from production builds to avoid a superfluous host_permission
 * that would look suspicious in Chrome Web Store review.
 */
const DEV_EXTRA_HOSTS = ["http://localhost:9876/*"];

// The backend API host must be a host_permission: the service worker fetches
// the tenant policy from it, and without host access that cross-origin fetch is
// CORS-gated (the backend only allow-lists the console origin).
function apiHostPattern(base: string): string {
  const { protocol, host } = new URL(base);
  return `${protocol}//${host}/*`;
}

export default defineManifest(async ({ mode }) => {
  const isDev = mode === "development" || mode === "test";
  const LLM_HOSTS = isDev
    ? [...PRODUCTION_LLM_HOSTS, ...DEV_EXTRA_HOSTS]
    : PRODUCTION_LLM_HOSTS;
  // Derive the API host from the SAME VITE_API_BASE the extension code reads.
  // The code reads it via import.meta.env (Vite injects .env there); this
  // manifest must read the same .env via loadEnv. Previously it used
  // process.env.VITE_API_BASE, which Vite does NOT populate from .env — so a
  // plain `pnpm build:e2e` silently defaulted the manifest to prod
  // (api.mykka.ai) while the code targeted localhost, leaving the service
  // worker's policy fetch blocked by host_permissions on every dev/e2e build.
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const apiBase = env.VITE_API_BASE ?? process.env.VITE_API_BASE ?? "https://api.mykka.ai";
  // API host goes in host_permissions only — NOT content_scripts/matches (we
  // never inject into the API) or web_accessible_resources.
  const HOST_PERMISSIONS = [...LLM_HOSTS, apiHostPattern(apiBase)];

  return {
    manifest_version: 3,
    name: "Pretzel",
    version,
    description: "Pretzel by mykka.ai — intercepts AI prompts and blocks sensitive data before it leaves your browser.",
    permissions: ["storage", "scripting", "activeTab", "alarms"],
    host_permissions: HOST_PERMISSIONS,
    background: {
      service_worker: "src/background/service-worker.ts",
      type: "module",
    },
    content_scripts: [
      {
        // MAIN world: runs before any page script, overrides fetch/XHR for file upload interception.
        matches: LLM_HOSTS,
        js: ["src/content/fetch-interceptor.ts"],
        run_at: "document_start",
        world: "MAIN",
      },
      {
        // ISOLATED world: chrome API access, detection bridge, button-click handler, overlay.
        matches: LLM_HOSTS,
        js: ["src/content/content-script.ts"],
        run_at: "document_idle",
        world: "ISOLATED",
      },
    ],
    action: {
      default_popup: "src/popup/index.html",
      default_icon: {
        "16": "public/icons/icon16.png",
        "32": "public/icons/icon32.png",
        "48": "public/icons/icon48.png",
        "128": "public/icons/icon128.png",
      },
    },
    options_page: "src/options/index.html",
    web_accessible_resources: [
      {
        resources: ["src/content/overlay/*", "logo-dark.png", "logo-light.png"],
        matches: LLM_HOSTS,
      },
    ],
    icons: {
      "16": "public/icons/icon16.png",
      "32": "public/icons/icon32.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png",
    },
  };
});
