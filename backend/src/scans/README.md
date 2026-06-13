---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - router.ts
  - service.ts
---

# Scans Subsystem

Scans record aggregate prompt-scan usage used for analytics and plan limits. They are separate from rule-trigger events.

Ingestion must remain tenant-scoped and resistant to duplicate or abusive reporting.
