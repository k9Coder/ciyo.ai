---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - ../src/db/schema.ts
  - ../drizzle/0000_sticky_queen_noir.sql
  - ../src/subjects/snapshot.ts
  - ../src/scans/service.ts
---

# Data model

PostgreSQL schema is declared in `src/db/schema.ts`; generated migrations live in `backend/drizzle/`. UUID primary keys default to random UUIDs. Most business tables are tenant-scoped, while `users` is global.

## Identity and organization

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Global Clerk-linked identity | Unique nullable `clerk_id`; unique email; platform-admin flag |
| `tenants` | Token hashes, plan, and subscription state | Org/admin hashes required; plan defaults to `free`; grace period defaults to 7 days |
| `members` | User enrollment or pre-enrollment by email | Unique `(tenant_id, email)`; nullable `user_id`; three roles |
| `divisions` | Tenant organization unit | Unique `(tenant_id, slug)` |
| `teams` | Division child unit | Unique `(division_id, slug)` |
| `member_teams` | Member-to-team many-to-many mapping | Composite primary key |
| `invites` | Expiring enrollment token | Globally unique token; optional email restriction |

## Policy authoring and publication

| Table | Purpose | Key constraints |
|---|---|---|
| `subjects` | Scoped rule collection | Global, division, or team scope; active defaults true |
| `rules` | Detection and enforcement rule | Four kinds, warn/block actions, report level defaults none |
| `destination_groups` | Reusable domain set | Optional division/team scope |
| `site_configs` | Domain-specific selectors | Unique `(tenant_id, domain)` |
| `policies` | Immutable compiled JSON snapshots | Unique `(tenant_id, version)` |
| `subject_versions` | Assistant revert snapshots | Unique `(subject_id, version)`; `pre_ai_apply` or `rollback` |

## Telemetry and assistant

| Table | Purpose | Notes |
|---|---|---|
| `scans` | Scan usage accounting | Monthly counts drive limits; no retention or purge exists |
| `events` | Reportable warn/block match | References a rule; optional member and matched term |
| `chat_sessions` | Tenant assistant conversation | Optional member attribution |
| `chat_messages` | Messages and proposed actions | `applied_at` prevents applying a message twice |

## Lifecycle behavior

- Most foreign keys do not declare cascading deletion. Services explicitly clean up some joins, but callers must inspect dependencies before deleting parent rows.
- Subject versions cascade on subject deletion; their assistant-message link becomes null when a message is deleted.
- Members can exist before signup with `user_id=null`; the Clerk `user.created` webhook claims matching rows by email.
- Scan rows accumulate indefinitely. The current code notes the need for scheduled retention and member-erasure handling.

## Schema changes

```powershell
cd backend
pnpm db:generate
pnpm db:migrate
```

Inspect generated SQL before applying it. Migration and E2E seed operations must target a test or intended non-production database.
