import { defineManifest } from "@crxjs/vite-plugin";

const LLM_HOSTS = [
  "https://chatgpt.com/*",
  "https://chat.openai.com/*",
  "https://claude.ai/*",
  "https://gemini.google.com/*",
  // localhost:9876 used by E2E extension tests (fixture pages)
  "http://localhost:9876/*",
];

export default defineManifest({
  manifest_version: 3,
  name: "Pretzel",
  version: "2.0.0",
  description: "Pretzel by ciyo.ai — intercepts AI prompts and blocks sensitive data before it leaves your browser.",
  permissions: ["storage", "scripting", "activeTab", "alarms"],
  host_permissions: LLM_HOSTS,
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
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
      resources: ["src/content/overlay/*"],
      matches: LLM_HOSTS,
    },
  ],
  icons: {
    "16": "public/icons/icon16.png",
    "32": "public/icons/icon32.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png",
  },
});
