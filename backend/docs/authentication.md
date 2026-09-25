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
  - ../src/users/jit.ts
  - ../src/me/service.ts
  - ../tests/signup-flows.test.ts
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

- No membership produces `401` ("Not enrolled in any organisation"). No local user row produces `401` only if it cannot be created just-in-time (below).
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

## Just-in-time user provisioning

The `user.created` webhook can lag a brand-new sign-up (and never reaches a local backend). So when a verified Clerk JWT has no `users` row, `requireClerkAuth`, `requireClerkUser` and `GET /v1/me/memberships` create it on the spot (`src/users/jit.ts`): they read the primary email from Clerk's Backend API, create the row, and claim any admin-added pending membership for that email. Without this, a new user's first call (the extension handshake, or the console's memberships fetch) lost the race and they had to sign in a second time.

- It never creates an organisation; that stays console-only (`POST /v1/me/self-serve-org`).
- It is idempotent and safe to race with the webhook (`createUser` is insert-or-return).
- In `APP_ENV=production` the primary email must be verified in Clerk; dev/staging Clerk instances do not verify emails at sign-up, so there an unverified address is accepted, exactly as the webhook does.
- If Clerk cannot be reached, the request keeps its normal `401`.

Emails are compared case-insensitively everywhere a pending membership is matched (webhook, JIT, self-serve), and new member emails are stored lowercase, so an admin typing `Alice@Corp.com` still matches Clerk's `alice@corp.com`.

## Clerk webhook lifecycle

`POST /webhooks/clerk` verifies the raw request body with `CLERK_WEBHOOK_SECRET`.

- `user.created`: creates the global user and claims matching pending memberships. With no pending membership the user is left at zero memberships: the console then calls `POST /v1/me/self-serve-org` to provision a personal tenant and `super_admin` membership, while the extension and desktop never create organisations (their sign-in is rejected until an admin adds the email).
- `user.updated`: updates profile fields.
- `user.deleted`: nulls the stored Clerk ID; it does not delete the user row.

## Isolation requirements

Tenant-scoped services must constrain reads and writes by `tenantId`, including lookups by resource ID. Team assignment explicitly verifies that both member and team belong to the requesting tenant. Cross-tenant behavior is covered by `backend/e2e/cross-tenant.spec.ts`.
