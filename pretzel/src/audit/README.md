---
status: current
owner: extension
verified_at: 2026-06-13
sources:
  - db.ts
  - log.ts
  - types.ts
  - ../../docs/runtime-and-data-flow.md
---

# Local Audit Log

The audit subsystem stores prompt hashes, lengths, decisions, findings, and matched text in IndexedDB. It does not store complete prompt text.

Audit storage is local to the browser. Do not describe it as containing only aggregate data.
