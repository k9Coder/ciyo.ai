---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - router.ts
  - service.ts
  - policy-bus.ts
---

# Events Subsystem

This subsystem stores rule-trigger events and hosts the in-process policy update bus used by the console SSE stream. The event bus is process-local and is not a distributed messaging system.

Event payloads may contain matched excerpts depending on rule reporting level. Keep tenant scope and privacy implications explicit.
