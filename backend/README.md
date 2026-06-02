# backend

Fastify REST API. TypeScript, Drizzle ORM, PostgreSQL, Clerk auth.

## Prerequisites

- Node.js ≥ 20
- pnpm
- PostgreSQL running locally (or a hosted connection string)

## Running

### Staging (developers & testers)

Uses `promptshield_staging` DB and Clerk's development instance keys.

```bash
# From monorepo root — sets backend/.env to staging values
pnpm set-env:staging

# Then start the server
cd backend && pnpm dev
```

Server runs at `http://localhost:3000`.

### Production

```bash
# From monorepo root
pnpm set-env:prod

cd backend && pnpm build && pnpm start
```

## Environment files

| File | Purpose |
|---|---|
| `.env.staging` | Staging config — committed, test keys only |
| `.env.prod` | Prod config — **gitignored**, fill in real secrets locally |
| `.env.example` | Template showing all required variables |
| `.env` | Active config — written by `pnpm set-env:*`, gitignored |
| `.env.test` | Used by the E2E test suite only — do not edit |

Copy `.env.example` to understand what each variable does.

## Database

```bash
# Generate a new migration after schema changes
pnpm db:generate

# Apply pending migrations (runs against whatever DB is in .env)
pnpm db:migrate

# One-time: create the staging DB locally
psql -U postgres -c "CREATE DATABASE promptshield_staging;"
pnpm set-env:staging && pnpm db:migrate
```

## Tests

```bash
pnpm test           # unit + integration (Vitest)
pnpm test:watch     # watch mode

# E2E — requires server running on localhost:3000 and seeded DB
pnpm seed:e2e
pnpm test:e2e
pnpm teardown:e2e
```

See `CLAUDE.md` for the full regression rules.
