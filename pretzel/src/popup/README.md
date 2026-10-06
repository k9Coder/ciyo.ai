---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - Popup.tsx
  - main.tsx
  - ../../docs/runtime-and-data-flow.md
---

# Popup

The popup exposes sign-in state, current host status, and recent local audit events, and the cached policy version with when it was last confirmed current (`cachedPolicyVersion`, `lastCheckedAt` in `chrome.storage.local`). Opening the signed-in popup persists a Clerk session token for the service worker.

It does not currently expose manual policy sync or subscription-expired status.
