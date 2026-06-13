---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - ../src/auth/middleware.ts
  - ../src/auth/tokens.ts
  - ../src/types.ts
  - ../src/webhooks/clerk.ts
  - ../src/members/service.ts
---

# Authentication and tenant isolation

The backend supports deployment tokens and Clerk JWTs. Successful middleware attaches the resolved tenant to `request.tenant`; Clerk flows can also attach `request.user` and `request.member`.

## Deployment tokens

```text
ps_live_<tenant-uuid>_<32-character-base64url-secret>
ps_adm_<tenant-uuid>_<32-character-base64url-secret>
```

`ps_live` is the organization token for policy reads and telemetry ingestion. `ps_adm` is the administrative token and can also access organization-token routes. Only bcrypt hashes of secrets are stored. Rotation immediately replaces the stored hash and returns the new plaintext token once.

## Clerk JWTs

Clerk JWT verification uses `CLERK_SECRET_KEY`, then resolves the global `users` row by Clerk ID and a tenant `members` row by user ID.

- No local user or membership produces `401`.
- A user in one tenant is assigned that tenant automatically.
- A user in multiple tenants must send `X-Tenant-Id`; it must match one of the user's memberships.
- Admin routes require member role `super_admin`. `division_admin` does not satisfy backend admin middleware.
- Platform routes require global `users.isPlatformAdmin=true` and do not use tenant member roles.

The SSE route is the bearer-header exception: `GET /v1/events` accepts a Clerk JWT in the `token` query parameter because browser `EventSource` cannot set authorization headers.

## Middleware matrix

| Middleware | Accepted identity | Effective access |
|---|---|---|
| `requireClerkAuth` | Clerk JWT | Enrolled member |
| `requireOrgTokenOrClerkAuth` | `ps_live`, `ps_adm`, or Clerk JWT | Policy and ingestion |
| `requireAdminTokenOrClerkAdmin` | `ps_adm` or Clerk `super_admin` | Tenant administration |
| `requirePlatformAdmin` | Clerk JWT with platform flag | Cross-tenant platform administration |
| `requireActiveSubscription` | Runs after tenant resolution | Rejects cancelled and expired past-due tenants with `402` |

## Clerk webhook lifecycle

`POST /webhooks/clerk` verifies the raw request body with `CLERK_WEBHOOK_SECRET`.

- `user.created`: creates the global user, claims matching pending memberships, or auto-provisions a free tenant and `super_admin` membership.
- `user.updated`: updates profile fields.
- `user.deleted`: nulls the stored Clerk ID; it does not delete the user row.

## Isolation requirements

Tenant-scoped services must constrain reads and writes by `tenantId`, including lookups by resource ID. Team assignment explicitly verifies that both member and team belong to the requesting tenant. Cross-tenant behavior is covered by `backend/e2e/cross-tenant.spec.ts`.
