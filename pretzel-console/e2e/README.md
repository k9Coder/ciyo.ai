---
status: active
owner: mykka.ai engineering
verified_at: 2026-06-13
sources:
  - ../playwright.config.ts
  - auth.setup.ts
  - dashboard.spec.ts
  - subjects.spec.ts
  - org.spec.ts
  - members.spec.ts
  - destinations.spec.ts
  - sites.spec.ts
  - publish.spec.ts
  - settings.spec.ts
  - audit.spec.ts
  - billing.spec.ts
  - assistant.spec.ts
  - signup-flows.spec.ts
  - helpers/signup.ts
---

# Console E2E Suite

The package Playwright suite exercises authenticated admin flows against a running console and backend. It uses one worker because several specs mutate shared seeded state.

## Prerequisites

1. Point the backend at the E2E database and seed it with `pnpm seed:e2e` from `backend/`.
2. Start the backend, normally at `http://localhost:3000`.
3. Start the console, normally at `http://localhost:5173`.
4. Provide `e2e/.env.e2e` with the Clerk and E2E environment values required by `auth.setup.ts` and the specs.

Never point the E2E database or Clerk setup at production.

## Run

```bash
pnpm test:e2e
pnpm test:e2e --grep "Billing"
pnpm test:e2e --grep "assistant"
```

`admin-setup` signs in through Clerk and writes `.auth/admin.json`. The dependent `admin` project reuses that storage state. `auth.setup.ts` requires `E2E_ADMIN_URL`; the dependent admin project's Playwright `baseURL` falls back to `http://localhost:5173`. Specs that call the backend directly default `E2E_BACKEND_URL` to `http://localhost:3000`.

## Coverage

| Spec | Main coverage |
|---|---|
| `dashboard.spec.ts` | Overview metrics load and unauthenticated redirect. |
| `subjects.spec.ts` | Subject and rule create/edit validation flows. |
| `org.spec.ts` | Divisions, teams, and team-member columns. |
| `members.spec.ts` | Add member by email (stored lowercase), remove, and role changes. |
| `destinations.spec.ts` | Destination-group create and rename. |
| `sites.spec.ts` | Site selector edit and site creation. |
| `publish.spec.ts` | Publish, history, and rollback. |
| `settings.spec.ts` | Tenant name and token-rotation confirmations. |
| `audit.spec.ts` | Activity (audit log) event rows, filters, and pagination. |
| `billing.spec.ts` | Settings billing UI, upgrade banner, and assistant plan gate. |
| `assistant.spec.ts` | Chat, proposals, discard/apply, and sessions with assistant APIs mocked. |
| `signup-flows.spec.ts` | Brand-new user signs up through Clerk's form: no org -> onboarding; existing org (admin-added email) -> Overview / "You're all set"; `/extension-login` relay hands a new user their code on the first pass. Creates and deletes its own Clerk users. |

`signup-flows.spec.ts` uses real Clerk sign-up (with `@clerk/testing`'s bot-protection bypass), so it needs `CLERK_SECRET_KEY` and `CLERK_PUBLISHABLE_KEY` and only ever touches `+clerk_test@example.com` accounts it creates itself. The Clerk `user.created` webhook cannot reach a local backend, which is intentional: the backend provisions the user just-in-time, and that is what the spec proves.

These tests do not replace the monorepo cross-service suite. Shared policy, auth, token, database, API, or assistant-apply changes require the root regression commands.
