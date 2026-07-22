---
status: current
owner: mykka.ai engineering
verified_at: 2026-06-13
sources:
  - package.json
  - src/App.tsx
  - src/components/layout/RequireAuth.tsx
  - src/components/billing/PlanGate.tsx
  - src/lib/api.ts
  - vite.config.ts
  - playwright.config.ts
  - Dockerfile
  - ../.github/workflows/pretzel-console-deploy.yml
---

# Pretzel Console

`pretzel-console` is the React/Vite administration SPA for Pretzel. Organization administrators use it to inspect analytics, manage policy subjects and rules, organize members, publish policy versions, review audit events, and manage billing.

## Run locally

Requirements: Node.js 20+, pnpm, a Clerk publishable key, and the backend API.

```bash
pnpm install
pnpm dev
```

Vite serves the console at `http://localhost:5173`. Unless `VITE_API_BASE` is set, API calls target `http://localhost:3000`.

Use the committed staging configuration with:

```bash
pnpm dev:staging
```

## Environment

| Variable | Required | Behavior |
|---|---:|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | Yes | Passed to `ClerkProvider`; authentication cannot initialize correctly without it. |
| `VITE_API_BASE` | No | Backend origin. Defaults to `http://localhost:3000`. |
| `VITE_APP_ENV` | No | Shows a `STAGING` badge when its value is `staging`. |
| `VITE_SENTRY_DSN` | No | Enables Sentry browser tracing and error replay. Localhost events are discarded. |

Start from `.env.example`. Vite modes load `.env.staging` for `dev:staging`/`build:staging` and `.env.prod` for `dev:prod`/`build:prod`. Do not put secrets in `VITE_*` variables; Vite embeds them in the browser bundle.

## Access gates

Public routes are `/login`, `/unauthorized`, `/onboarding`, `/invite/:token`, and `/accessibility`.

Every application route requires:

1. a signed-in Clerk user;
2. an active Clerk organization; and
3. Clerk role `org:admin`.

Users failing those checks are redirected to `/login`, `/onboarding`, or `/unauthorized`. `/assistant` has an additional billing-feature gate and renders only when `/v1/billing/status` reports `features.assistantEnabled`.

See [src/README.md](src/README.md) for the complete route and subsystem map.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Start Vite using normal environment loading. |
| `pnpm dev:staging` | Start Vite in `staging` mode. |
| `pnpm build` | Build the default Vite mode. |
| `pnpm build:staging` | Build the staging bundle. |
| `pnpm build:prod` | Build the production bundle. |
| `pnpm preview` | Serve `dist/` locally. |
| `pnpm typecheck` | Run TypeScript without emitting files. |
| `pnpm test` | Run Vitest unit and component tests once. |
| `pnpm test:watch` | Run Vitest in watch mode. |
| `pnpm test:e2e` | Run the package Playwright suite. |

## Tests

Run the minimum local verification:

```bash
pnpm test
pnpm typecheck
```

Admin E2E requires a running backend, a running console, seeded E2E data, and `e2e/.env.e2e` credentials. See [e2e/README.md](e2e/README.md).

Changes to shared policy, auth, token, database, or API contracts must also follow the monorepo cross-cutting E2E rule.

## Deployment

The production build is a static SPA in `dist/`.

- `Dockerfile` builds with Node 20 and serves the output through unprivileged nginx on port `8080`.
- `nginx.conf` falls back to `index.html` for client-side routes.
- Pushes affecting this package on `staging` or `master` run unit tests and typecheck, then trigger the corresponding Render deploy hook.
- Render must provide the public `VITE_*` build variables for the target environment.

## Known issues

- The SSE realtime adapter puts a Clerk token in the `/v1/events?token=...` query string. The source contains a security TODO to replace this with a short-lived SSE ticket.
- LogRocket initializes unconditionally in `src/main.tsx`; there is no environment switch in this package.
- The route table has no explicit catch-all/not-found route.

## Documentation

- [src/README.md](src/README.md): routes, gates, state, API, and realtime architecture
- [e2e/README.md](e2e/README.md): Playwright prerequisites and coverage
- [AGENTS.md](AGENTS.md): package-specific instructions for coding agents
