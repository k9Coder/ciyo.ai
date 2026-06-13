---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - backend/src/auth/middleware.ts
  - backend/src/auth/tokens.ts
  - pretzel/src/policy/auth.ts
  - pretzel-console/src/components/layout/RequireAuth.tsx
---

# Authentication

## Authentication Families

- Clerk JWTs authenticate human users in Pretzel Console and signed-in extension sessions.
- `ps_live_<tenant UUID>_<32-char secret>` authenticates organization/extension access.
- `ps_adm_<tenant UUID>_<32-char secret>` authenticates administrative API access.
- Platform routes require a Clerk-backed user marked as platform admin.

Internal token secrets are bcrypt-hashed in the database. The token embeds the tenant UUID so middleware can select the tenant before comparing the secret.

When a Clerk user belongs to multiple tenants, requests require `X-Tenant-Id`. Administrative management routes require an admin token or a Clerk member with `super_admin`.

The extension checks managed org token, local org token, then cached Clerk session token. See the extension package docs for current limitations.
