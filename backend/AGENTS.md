---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - package.json
  - src/app.ts
  - src/auth/middleware.ts
  - src/db/schema.ts
  - playwright.config.ts
  - vitest.config.ts
---

# Backend contributor instructions

The backend is a tenant-scoped Fastify API. Preserve tenant isolation in every query and mutation: authenticated routes obtain `req.tenant` from middleware, and service queries must constrain records by that tenant ID.

## Architecture rules

- Register public API routes under `/v1`, platform-administration routes under `/platform/v1`, and provider webhooks at `/webhooks/*`.
- Use auth pre-handlers from `src/auth/middleware.ts`. Admin CRUD normally requires `requireAdminTokenOrClerkAdmin`; extension ingestion and policy reads normally require `requireOrgTokenOrClerkAuth`.
- Keep token secrets one-way: only bcrypt hashes belong in `tenants`; plaintext tokens are returned only when created or rotated.
- Treat `src/db/schema.ts` as the data-model source of truth. After schema changes, run `pnpm db:generate` and inspect the migration.
- Treat `src/policy/compiler.ts` and `src/policy/resolver.ts` as a shared contract with the browser extension. Policy response changes require cross-package regression coverage.
- Stripe files are dormant reference code. PayPal is the active paid checkout and webhook integration.
- Do not weaken webhook signature verification. `PAYPAL_SKIP_SIG_VERIFY=true` is test-only and throws in production.

## Verification

| Change | Required verification |
|---|---|
| Backend-only route/service change | `pnpm test` from `backend/` |
| Backend API workflow | Seed, run the server, then `pnpm test:e2e` |
| Policy schema, compiler, resolver, or `GET /v1/policy` | Backend tests plus repository cross-service and extension E2E projects when available |
| Auth or token format | `pnpm test`, with focus on Clerk and token tests |
| DB schema or migration | Generate, migrate a test DB, seed E2E, and run affected E2E suites |
| Billing or webhook behavior | Billing, PayPal, Clerk webhook, and E2E billing tests |

Never point E2E seeding or teardown at production. See [testing](docs/testing.md) for exact prerequisites and test locations.

## Documentation rule

Backend current-state documentation lives in `backend/README.md`, `backend/AGENTS.md`, and `backend/docs/`. Keep frontmatter fields `status`, `owner`, `verified_at`, and `sources` current, and make behavioral claims traceable to implementation or tests.
