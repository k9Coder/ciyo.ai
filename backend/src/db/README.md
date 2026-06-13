---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - client.ts
  - schema.ts
  - migrate.ts
  - ../../docs/data-model.md
---

# Database Subsystem

`schema.ts` is the Drizzle source of truth for the PostgreSQL data model. `client.ts` owns the runtime connection and `migrate.ts` applies SQL migrations from `backend/drizzle/`.

Every tenant-owned query must include tenant scope. Schema changes require a migration and broader regression testing. See [data model](../../docs/data-model.md).
