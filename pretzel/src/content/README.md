---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - content-script.ts
  - adapters
  - overlay
  - ../../docs/runtime-and-data-flow.md
---

# Content Runtime

The content script selects a host adapter, observes click and Enter send intent, reads the prompt, asks the service worker to detect, and renders warning/block overlays.

Missing composers, empty prompts, unauthenticated users, and runtime failures proceed without blocking.
