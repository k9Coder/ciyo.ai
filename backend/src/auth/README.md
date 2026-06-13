---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - middleware.ts
  - tokens.ts
  - ../../docs/authentication.md
---

# Authentication Subsystem

`middleware.ts` resolves Clerk JWTs and internal `ps_live` / `ps_adm` tokens into request tenant, member, and user context. `tokens.ts` parses, formats, hashes, and compares internal tokens.

Tenant isolation is the primary invariant. Management routes require admin authorization; platform routes use separate platform-admin checks. See [backend authentication](../../docs/authentication.md).
