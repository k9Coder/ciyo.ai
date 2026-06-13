# Auth Decoupling — Clerk for Authn Only, Users Table, Platform Admin

**Date:** 2026-06-01  
**Status:** Approved  
**Motivation:** Clerk's free tier limits orgs to 5 members, which blocks PoC-level demos. The fix is to stop using Clerk Organizations entirely and manage all org structure, membership, and authorization in our own DB. Clerk becomes a pure identity provider: it issues JWTs, we verify them.

---

## 1. Architecture Overview

After this change Clerk is responsible for exactly two things:

1. Presenting sign-in / sign-up UI to users
2. Issuing signed JWTs (one per user session)

Everything else — which org a user belongs to, what their role is, which teams they're on, who is an admin — lives in our Postgres DB and is managed through our own API.

The sole link between Clerk and our DB is `users.clerkId`, which maps a JWT `sub` claim to a DB user row.

**What does not change:** custom `ps_live` / `ps_adm` tokens, the policy engine, division/team/subject/rule CRUD, events, scans, the extension protocol.

---

## 2. Data Model

### 2a. New `users` table

Global identity, not tenant-scoped. One row per human being.

| column | type | constraints |
|---|---|---|
| `id` | uuid | PK, default random |
| `clerkId` | text | unique, nullable (nulled on Clerk account deletion) |
| `email` | text | unique, not null |
| `firstName` | text | nullable |
| `lastName` | text | nullable |
| `avatarUrl` | text | nullable |
| `isPlatformAdmin` | boolean | not null, default false |
| `createdAt` | timestamptz | not null, defaultNow |
| `updatedAt` | timestamptz | not null, defaultNow |

### 2b. `members` table — changes

Remove columns that belong on `users`:
- `clerkId` — moves to `users`
- `firstName`, `lastName`, `avatarUrl` — moves to `users`

Add:
- `userId` — uuid FK → `users.id`, **nullable** (null = pre-enrolled, user hasn't signed up yet)

Keep:
- `email` — still needed for pre-enrollment lookup before `userId` is set
- `tenantId`, `displayName`, `role`, `adminDivisionId`, `createdAt`

### 2c. `tenants` table — changes

Remove:
- `clerkOrgId` column
- `clerkOrgUniq` unique constraint

No other tenant columns change.

### 2d. Pre-enrollment invariant

A member row with `userId = null` is a pending enrollment. The email is the join key. When a matching `users` row is created (via `user.created` webhook), the member row's `userId` is stamped automatically.

---

## 3. Auth Middleware (`src/auth/middleware.ts`)

### Current flow (Clerk JWT path)

```
JWT.sub + JWT.org_id
  → tenant (by clerkOrgId)
  → member (by clerkId)
```

### New flow

```
JWT.sub
  → users (by clerkId)
  → members (by userId)   — if exactly one tenant, use it
  → tenants (by member.tenantId)
```

**Specific changes to `resolveClerkJwt`:**
- Drop `clerkOrgId` extraction from the JWT payload
- Drop the `if (!clerkOrgId) return 401` guard — users just need to be signed in, no active org session required
- Look up `users` by `clerkId` first; 401 if not found ("User not found — sign up first")
- Look up `members` by `userId`; 401 if no member row ("Not enrolled in any organisation — contact your admin")
- Resolve `tenant` via `member.tenantId`
- Attach `request.user`, `request.tenant`, `request.member` to the request

**Multi-tenant edge case (rare in PoC):** If a user has member rows in multiple tenants, require a `X-Tenant-Slug` header to disambiguate. Return 400 "Multiple organisations found — specify X-Tenant-Slug" if the header is absent.

**Custom token path (`ps_live` / `ps_adm`):** Unchanged.

---

## 4. Webhooks (`src/webhooks/clerk.ts`)

### Remove these handlers

- `organization.created` — we no longer use Clerk orgs to provision tenants
- `organizationMembership.created` — membership is managed via our admin API
- `organizationMembership.deleted` — same

### Keep

- `user.updated` — sync name and avatar to the `users` table (not `members`)

### Add: `user.created`

Fired when someone signs up via Clerk. Logic:

1. Create a `users` row from the Clerk payload (`clerkId`, `email`, `firstName`, `lastName`, `avatarUrl`)
2. Find any `members` rows with `email = user.email` and `userId = null` (pre-enrolled by an admin)
   - If found: set `userId` on each of those member rows → user is now active in their pre-assigned tenant(s). **Stop here.**
   - If not found: auto-provision → create a new tenant (see below) + create a `super_admin` member row linking to the new `users` row

**Auto-provision tenant fields:**
- `name`: `"<firstName>'s Organization"` (fallback: email local-part)
- `slug`: derived from email local-part, slugified, truncated to 50 chars, suffixed with short random string to ensure uniqueness
- `orgTokenHash`, `adminTokenHash`: freshly generated
- `paymentProvider`: `'stripe'`, `subscriptionStatus`: `'active'`, `plan`: `'pro'`

### Add: `user.deleted`

Null out `users.clerkId` (so the unique constraint allows multiple deleted users). The `users` row and any `members` rows are retained — tenant data history stays intact. A user with `clerkId = null` cannot sign in (JWT lookup fails gracefully with 401).

---

## 5. Seed Scripts

### `seed-fintech.ts` — changes

**Tenant creation block (currently lines 82–137):**
- Remove all `clerk.organizations.*` calls (`getOrganizationMembershipList`, `createOrganizationMembership`)
- Remove the Clerk org lookup path entirely
- New logic: check if a `users` row exists for `ADMIN_EMAIL`; if yes, get `tenantId` from their member row; if no, create tenant directly in DB (no Clerk org needed) and create a `users` row + `super_admin` member row

**Dummy members loop (currently lines 226–270):**
- Keep `clerk.users.createUser` (so dummy users can sign in via the extension)
- Remove `clerk.organizations.getOrganizationMembershipList`
- Remove `clerk.organizations.createOrganizationMembership`
- Insert `users` row with the returned `clerkId`
- Insert `members` row referencing `users.id` (not `clerkId` directly)

**Net effect:** The seed no longer requires a Clerk org to exist, has no org member quota, and runs cleanly on a fresh Clerk app with just one user.

---

## 6. Platform Admin Role

### Role flag

`users.isPlatformAdmin: boolean` — set to `true` manually via a script for Ciyo internal staff. No self-service. Checked at the DB level on every platform-admin request.

### New middleware: `requirePlatformAdmin`

1. Verify Clerk JWT → `sub`
2. Look up `users` by `clerkId`
3. Check `user.isPlatformAdmin === true`; 403 otherwise
4. Attach `request.platformUser` (the users row)
5. If `:tenantId` param is present in the URL, resolve and attach `request.tenant` (no member row required — platform admin acts as super_admin for any tenant)

### New API namespace: `GET|PATCH|DELETE /platform/v1/...`

All routes protected by `requirePlatformAdmin`.

| method | route | purpose |
|---|---|---|
| GET | `/platform/v1/tenants` | List all tenants (name, slug, plan, memberCount, createdAt) |
| GET | `/platform/v1/tenants/:id` | Org summary |
| GET | `/platform/v1/tenants/:id/members` | Org members list |
| GET | `/platform/v1/tenants/:id/divisions` | Divisions + teams tree |
| GET | `/platform/v1/tenants/:id/subjects` | Subjects + rules |
| PATCH | `/platform/v1/tenants/:id/members/:memberId` | Change member role |
| DELETE | `/platform/v1/tenants/:id/members/:memberId` | Remove member |
| POST | `/platform/v1/tenants/:id/members` | Add member to org |

Route handlers call the same service functions used by the existing `/v1/` org-admin routes. No duplicate business logic — just a different auth gate and tenant-resolution path.

### Admin web app

New "Platform" section visible only when `isPlatformAdmin` is true:

- **Org list page** (`/platform`): table of all organisations with name, plan, member count, created date. Clickable rows.
- **Org detail page** (`/platform/orgs/:id`): renders the standard org-admin views (members, divisions, subjects, rules) scoped to the selected org via `/platform/v1/tenants/:id/...` routes.
- Breadcrumb: `Platform > [Org Name] > [Section]`

The org detail page reuses existing admin UI components — it just hits the `/platform/v1/` API namespace instead of `/v1/`.

---

## 7. Advantages and Disadvantages

### Advantages

- **No Clerk org member limit** — completely bypassed; members table is the only constraint
- **Simpler JWT requirements** — users just need to be signed in, no active org session in Clerk required
- **Single source of truth** — your DB owns org structure, roles, teams, membership
- **Seed scripts are simpler** — no org API calls, no quota dependency
- **Lower Clerk lock-in** — swapping Clerk for another identity provider later only requires changing `clerkId` references and the `verifyToken` call
- **Platform admin is first-class** — internal staff can manage any org without being enrolled as a tenant member

### Disadvantages

- **No Clerk org dashboard** — Clerk's dashboard shows users but not org groupings; org membership is only visible in your own admin UI
- **No Clerk invitation emails** — you need to build (or bolt on) your own member invite flow; the pre-enrollment pattern (admin adds email, user signs up later) is the replacement
- **No Clerk org-level SSO/SAML** — not relevant now, but enterprise SSO would need a different approach if/when needed

---

## 8. Out of Scope

- Frontend Clerk component changes (OrganizationProvider removal — tracked separately)
- Member invitation email system (pre-enrollment pattern covers the PoC; email invites are future work)
- Multi-tenant user switching UI (covered by the `X-Tenant-Slug` header fallback for now)
- E2E test updates (will be addressed as part of implementation)
