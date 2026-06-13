---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - ../package.json
  - ../vitest.config.ts
  - ../playwright.config.ts
  - ../src/scripts/seed-e2e.ts
  - ../src/scripts/teardown-e2e.ts
  - ../tests/
  - ../e2e/
---

# Testing

The backend has Vitest unit/integration coverage and a serial Playwright API E2E suite.

## Vitest

```powershell
cd backend
pnpm test
```

Vitest loads environment values from `backend/.env.test`, runs `tests/**/*.test.ts` and `src/**/*.test.ts`, disables file parallelism, and uses a 30-second test timeout. The suite covers routes, services, auth, token parsing, tenant isolation, policy compilation/resolution, assistant apply/revert behavior, billing limits, provider webhooks, analytics, and logging.

Target a file while developing:

```powershell
pnpm exec vitest run tests/policy-resolver.test.ts
pnpm exec vitest run tests/billing-paypal.test.ts
```

## Backend API E2E

Prerequisites:

1. Configure `backend/.env` with a test `DATABASE_URL`.
2. Configure the E2E environment expected by the seed script, including Clerk test-user values.
3. Seed the test database.
4. Start the backend on `http://localhost:3000`, or set `E2E_BACKEND_URL`.

```powershell
cd backend
pnpm seed:e2e
pnpm dev
```

In another terminal:

```powershell
cd backend
pnpm test:e2e
pnpm teardown:e2e
```

The backend Playwright config runs one worker and reads auth/tenant state from root `e2e/.seed-state.json`, written by `seed:e2e`. Current specs cover policy, assistant, analytics, billing, member import, and cross-tenant isolation.

## Change-to-test map

| Change | Focused tests | Broader verification |
|---|---|---|
| Auth, Clerk, tokens | `tests/clerk-auth.test.ts`, `tests/clerk-webhook.test.ts`, `tests/tokens.test.ts` | Backend E2E cross-tenant spec |
| Policy compiler/resolver/response | `tests/policy*.test.ts`, `tests/sse-events.test.ts` | Backend policy E2E plus repository cross-service/extension E2E when available |
| Assistant apply/revert | `tests/assistant*.test.ts`, `tests/subjects/snapshot.test.ts` | Backend assistant E2E and cross-service assistant flow |
| Billing, limits, PayPal | `tests/billing*.test.ts`, `tests/billing/limits.test.ts` | Backend billing E2E |
| Schema/migrations/seeds | Relevant Vitest suite | Migrate test DB, reseed, then affected E2E suites |

## Safety

`seed:e2e` deletes and recreates broad application data before writing seed state. `teardown:e2e` deletes seeded application records. Confirm `DATABASE_URL` is a disposable test database before running either command.
