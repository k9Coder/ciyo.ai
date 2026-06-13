---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - service-worker.ts
  - update-check.ts
  - ../../docs/runtime-and-data-flow.md
---

# Background Service Worker

The service worker handles detection messages, policy sync, scan/event dispatch, and the two-minute update alarm. Detection and message-handler failures currently fail open.

See [runtime and data flow](../../docs/runtime-and-data-flow.md).
