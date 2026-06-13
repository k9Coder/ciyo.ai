---
status: active
owner: ciyo.ai engineering
verified_at: 2026-06-13
sources:
  - App.tsx
  - main.tsx
  - api.ts
  - lib/api.ts
  - lib/sentry.ts
  - components/layout/RequireAuth.tsx
  - components/layout/AppLayout.tsx
  - components/billing/PlanGate.tsx
  - hooks/usePolicyRealtime.ts
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
| `/unauthorized` | Public | Explains that the active user is not an organization admin. |
| `/onboarding` | Public route; page requires sign-in | Creates a Clerk organization for a signed-in user without one. |
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
| `/audit` | Protected | Filter and paginate warn/block audit events. |
| `/assistant` | Protected + Business feature | Chat, preview proposed actions, and apply assistant changes. |

Protected means `RequireAuth` has confirmed a signed-in user, active Clerk organization, and `org:admin` role.

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
- No active organization: redirect to `/onboarding`.
- Role other than `org:admin`: redirect to `/unauthorized`.

`PlanGate` owns feature entitlements. It currently supports `assistantEnabled` and `advancedAnalytics`, but only `/assistant` uses it. When the feature is unavailable, Stripe-backed tenants get a billing-portal action; other tenants get a link to `https://ciyo.ai/pricing`.

## Realtime and observability

`usePolicyRealtime` subscribes when the protected layout mounts and invalidates policy queries on update. The SSE adapter connects to `/v1/events?token=...`, refreshes the Clerk token after a 401, and reconnects unless unsubscribed.

Known security debt: bearer material is placed in the SSE URL. Keep the source TODO visible until a short-lived ticket replaces it.

Sentry is enabled only when `VITE_SENTRY_DSN` exists. It records tracing and error replays, propagates traces to localhost and `https://api.ciyo.ai`, and drops localhost events. LogRocket currently initializes for every runtime environment.
