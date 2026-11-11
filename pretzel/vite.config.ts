import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "path";
import { readFileSync } from "fs";
import { createRequire } from "module";
import type { Plugin } from "vite";
import manifest from "./manifest.config";

// onnxruntime-web's WASM runtime for the judge v2 shadow runner, emitted as
// ort/* so the offscreen document can load it from the extension itself
// (the extension CSP blocks CDN fetches).
function ortWasmAssets(): Plugin {
  const dist = path.dirname(createRequire(import.meta.url).resolve("onnxruntime-web/wasm"));
  const files = ["ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];
  return {
    name: "ort-wasm-assets",
    generateBundle() {
      for (const f of files) this.emitFile({ type: "asset", fileName: `ort/${f}`, source: readFileSync(path.join(dist, f)) });
    },
  };
}

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [react(), crx({ manifest }), ortWasmAssets()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: "src/popup/index.html",
        options: "src/options/index.html",
        // spike/local-judge-poc — offscreen document hosting the local judge.
        offscreen: "src/offscreen/index.html",
      },
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 10000, // increased from 5000 — service-worker dynamic import can be slow under load
  },
});
