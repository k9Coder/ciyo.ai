---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - router.ts
  - service.ts
  - apply.ts
  - prompt.ts
  - llm
---

# Assistant Subsystem

The assistant builds an organization snapshot, calls the configured LLM provider, stores sessions/messages, and returns proposed configuration actions. Applying actions changes editable configuration but does not publish policy automatically.

Treat model output as untrusted input. Apply operations must remain tenant-scoped and authorization-protected.
