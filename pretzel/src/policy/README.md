---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - schema.ts
  - sync.ts
  - loader.ts
  - bridge.ts
  - auth.ts
  - ../../docs/policy-sync-and-bridge.md
---

# Policy Subsystem

This subsystem validates backend policy documents, syncs and caches versions, resolves authentication tokens, and bridges the wire contract into the local detection format.

The bridge is lossy and several parsed policy fields are not enforced. See [policy sync and bridge](../../docs/policy-sync-and-bridge.md).
