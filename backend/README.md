---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - package.json
  - src/app.ts
  - src/index.ts
  - src/db/client.ts
  - src/db/migrate.ts
---

# mykka.ai backend

Fastify 4 REST API written in TypeScript. PostgreSQL persistence is accessed through Drizzle ORM. The service owns tenant administration, compiled browser policies, telemetry, assistant actions, member enrollment (admin-add-by-email + console self-serve; token-invite-links disabled, see `src/invites/`), billing, and provider webhooks.

## Run locally

Prerequisites: Node.js 20 or newer, pnpm, and PostgreSQL.

```powershell
cd backend
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm dev` loads `backend/.env`, checks the database connection, and listens on `0.0.0.0:${PORT}`; `PORT` defaults to `3000`. Verify the process with `GET http://localhost:3000/health`.

`DATABASE_URL` is required. In production, `CORS_ORIGIN` is also required and PostgreSQL connections require TLS. Outside production, CORS defaults to `https://pretzel-console.mykka.ai`; tests allow the requesting origin.

## Commands

| Command | Purpose |
|---|---|
| `pnpm dev` | Run the API with watch mode and `.env` |
| `pnpm build` | Compile TypeScript to `dist/` |
| `pnpm start` | Run compiled output with `.env` |
| `pnpm db:generate` | Generate a Drizzle migration from schema changes |
| `pnpm db:migrate` | Apply migrations from `backend/drizzle/` |
| `pnpm test` | Run Vitest unit and integration tests |
| `pnpm seed:e2e` | Replace test data and write root `e2e/.seed-state.json` |
| `pnpm test:e2e` | Run backend Playwright API specs |
| `pnpm teardown:e2e` | Remove seeded E2E records |
| `pnpm delete:user -- --user-id <uuid>` | Delete one user and any org they're the sole member of (dry-run without `--apply`) |

## Deleting a test account

No foreign key into `users` or `tenants` cascades, so deleting a row from the Neon table UI fails (`members_user_id_users_id_fk`). Use the script instead:

```bash
pnpm delete:user -- --user-id <users.id>           # dry-run: shows the user and orgs it would delete
pnpm delete:user -- --user-id <users.id> --apply
```

It deletes in one transaction, so it either finishes or changes nothing. It refuses if the user is in any org with other members, and it needs `--force` to delete an org that wasn't auto-provisioned. Tables the target DB doesn't have yet are skipped. It uses `DATABASE_URL` from `.env`, so point that at the right database first.

It does not touch Clerk. At the end it prints the Clerk user id: delete that user in the Clerk dashboard (matching instance) **after** the script runs. If the Clerk user is left in place, the next sign-in reuses it and recreates the `users` row, so you won't be testing the sign-up path.

## Documentation

- [API surface](docs/api-reference.md)
- [Authentication and tenant isolation](docs/authentication.md)
- [Data model](docs/data-model.md)
- [Policy contract](docs/policy-contract.md)
- [Billing and webhooks](docs/billing-and-webhooks.md)
- [Testing](docs/testing.md)
- [Contributor instructions](AGENTS.md)
