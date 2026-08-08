---
status: active
owner: mykka.ai engineering
verified_at: 2026-07-27
sources:
  - App.tsx
  - main.tsx
  - api.ts
  - lib/api.ts
  - lib/sentry.ts
  - components/layout/RequireAuth.tsx
  - components/layout/TenantBootstrap.tsx
  - components/layout/AppLayout.tsx
  - components/billing/PlanGate.tsx
  - hooks/usePolicyRealtime.ts
  - hooks/useWireAuthToken.ts
  - hooks/useMemberships.ts
  - hooks/useTenant.ts
  - realtime/sse.adapter.ts
---

# Console Source Architecture

## Runtime composition

`main.tsx` initializes optional Sentry, initializes LogRocket, restores the theme, mounts Clerk, and renders `App`. `App.tsx` provides one TanStack Query client and the React Router route tree inside a Sentry error boundary.

The query client retries queries once, treats results as fresh for 30 seconds, and disables refetch on window focus and mount. `AppLayout` subscribes to policy-update events and invalidates policy queries through the realtime hook.

## Route reference

| Route | Access | Purpose |
|---|---|---|
| `/login` | Public | Opens Clerk sign-in and honors a `redirect` query parameter. |
| `/onboarding/profile` | Public route; page wires its own Clerk token | Lets a lone `super_admin` on a freshly auto-provisioned tenant apply or skip a recommended DLP policy template. `TenantBootstrap` redirects here automatically when needed. |
| `/invite/:token` | Public | Previews and accepts a single invite token. |
| `/accessibility` | Public | Console accessibility statement. |
| `/` | Protected | Redirects to `/dashboard`. |
| `/dashboard` | Protected | Analytics summary, incidents, sites, subjects, and policy status. |
| `/subjects` | Protected | CRUD for policy subjects and their rules. |
| `/org` | Protected | CRUD for divisions and teams, plus team membership. |
| `/destinations` | Protected | CRUD for destination groups and domains. |
| `/sites` | Protected | CRUD for site domains and CSS selectors. |
| `/publish` | Protected | Publish, inspect history, and roll back policy versions. |
| `/settings` | Protected | Tenant name, billing status/portal, and token rotation. |
| `/members` | Protected | Generate invites, change roles, and remove members. |
| `/audit-log` | Protected | Filter and paginate warn/block audit events. Matches the backend's `/v1/audit-log` naming; `/audit` redirects here for old bookmarks. |
| `/assistant` | Protected + Business feature | Chat, preview proposed actions, and apply assistant changes. |

Protected means `RequireAuth` has confirmed a signed-in Clerk user; `TenantBootstrap` (inside it) then resolves which backend tenant/membership applies from `/v1/me/memberships` and redirects to `/onboarding/profile` when the sole membership is a `super_admin` on a tenant that hasn't completed onboarding. Clerk is identity-only here — organization, tenant, and role data live entirely in our own backend (`tenants`/`members` tables), never in Clerk Organizations.

## State and API flow

Pages consume hooks in `hooks/`. Those hooks use TanStack Query and the shared client in `api.ts`.

```text
page/component
  -> query or mutation hook
  -> api.ts request helper
  -> VITE_API_BASE + /v1/*
  -> Bearer token from Clerk getToken()
```

`lib/api.ts` defines the backend origin and defaults it to `http://localhost:3000`. The request helper adds JSON headers when a body exists, adds the Clerk bearer token when available, maps non-2xx responses to `AdminApiError`, and returns `undefined` for HTTP 204.

The public API groups are subjects, rules, divisions, teams, members, destination groups, site configs, policy, tenant, audit log, analytics, assistant, invites, and billing.

## Gates and entitlements

`RequireAuth` owns the global access gate:

- Clerk loading: show an authentication loader.
- Signed out: redirect to `/login`.

`TenantBootstrap` resolves the active backend tenant from `/v1/me/memberships` and, for a lone `super_admin` membership on a tenant that hasn't completed onboarding, redirects to `/onboarding/profile`. Every sensitive backend endpoint independently re-checks `member.role === 'super_admin'` server-side (`requireAdminTokenOrClerkAdmin`), so the frontend gate is UX only, not the security boundary.

`PlanGate` owns feature entitlements. It currently supports `assistantEnabled` and `advancedAnalytics`, but only `/assistant` uses it. When the feature is unavailable, Stripe-backed tenants get a billing-portal action; other tenants get a link to `https://mykka.ai/pricing`.

## Realtime and observability

`usePolicyRealtime` subscribes when the protected layout mounts and invalidates policy queries on update. The SSE adapter connects to `/v1/events?token=...`, refreshes the Clerk token after a 401, and reconnects unless unsubscribed.

Known security debt: bearer material is placed in the SSE URL. Keep the source TODO visible until a short-lived ticket replaces it.

Sentry is enabled only when `VITE_SENTRY_DSN` exists. It records tracing and error replays, propagates traces to localhost and `https://api.mykka.ai`, and drops localhost events. LogRocket currently initializes for every runtime environment.
