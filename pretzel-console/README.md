# pretzel-console

Admin web app. Manage policy, members, and billing. Built with React, TypeScript, Vite, TanStack Query, Clerk auth.

## Prerequisites

- Node.js ≥ 20
- pnpm
- Backend running (`cd backend && pnpm dev`)

## Running

### Staging (developers & testers)

Uses the Clerk development instance and points at `localhost:3000`.

```bash
cd pretzel-console && pnpm dev:staging
```

App runs at `http://localhost:5173`.

Sign in with a staging account (created in Clerk's development instance at `pk_test_...`).

### Production (deploy)

```bash
cd pretzel-console && pnpm build:prod
```

Produces `dist/` — deploy to any static host (Vercel, Netlify, S3, etc.).

To preview the production build locally:
```bash
pnpm build:prod && pnpm preview
```

## Environment files

| File | Purpose |
|---|---|
| `.env.staging` | Staging vars — committed, test keys only |
| `.env.prod` | Prod vars — **gitignored**, fill in `pk_live_` key + prod API URL locally |
| `.env` | Used by plain `pnpm dev` (no `--mode`) — gitignored |

### What goes in `.env.prod`

```dotenv
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...   # from Clerk dashboard → Production instance
VITE_API_BASE=https://api.ciyo.ai
```

## Tests

```bash
pnpm test            # unit + component tests (Vitest + Testing Library)
pnpm test:watch      # watch mode

# E2E — requires backend running + DB seeded
cd backend && pnpm seed:e2e
cd pretzel-console && pnpm test:e2e
```

See `CLAUDE.md` for full E2E prerequisites.
