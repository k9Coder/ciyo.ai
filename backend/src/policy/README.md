---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - compiler.ts
  - resolver.ts
  - router.ts
  - service.ts
  - ../../docs/policy-contract.md
---

# Policy Subsystem

The compiler creates immutable tenant policy snapshots from subjects, rules, and site configs. The resolver scopes a snapshot to a Clerk member's team/division memberships and expands destination groups.

The router exposes fetch, version, update timestamp, publish, history, rollback, and SSE behavior. See [policy contract](../../docs/policy-contract.md).
