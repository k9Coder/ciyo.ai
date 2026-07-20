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

Fastify 4 REST API written in TypeScript. PostgreSQL persistence is accessed through Drizzle ORM. The service owns tenant administration, compiled browser policies, telemetry, assistant actions, invites, billing, and provider webhooks.

## Run locally

Prerequisites: Node.js 20 or newer, pnpm, and PostgreSQL.

```powershell
cd backend
pnpm install
pnpm db:migrate
pnpm dev
```

`pnpm dev` loads `backend/.env`, checks the database connection, and listens on `0.0.0.0:${PORT}`; `PORT` defaults to `3000`. Verify the process with `GET http://localhost:3000/health`.

`DATABASE_URL` is required. In production, `CORS_ORIGIN` is also required and PostgreSQL connections require TLS. Outside production, CORS defaults to `https://console.mykka.ai`; tests allow the requesting origin.

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

## Documentation

- [API surface](docs/api-reference.md)
- [Authentication and tenant isolation](docs/authentication.md)
- [Data model](docs/data-model.md)
- [Policy contract](docs/policy-contract.md)
- [Billing and webhooks](docs/billing-and-webhooks.md)
- [Testing](docs/testing.md)
- [Contributor instructions](AGENTS.md)
