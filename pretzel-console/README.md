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

---

## Deployment

Pushes to `staging` or `master` trigger `.github/workflows/pretzel-console-deploy.yml` automatically.

| Branch | Environment | Build command |
|---|---|---|
| `staging` | Render Static Site (staging) | `pnpm build:staging` |
| `master` | Render Static Site (production) | `pnpm build:prod` |

**Pipeline:** run tests + typecheck → trigger Render deploy hook → Render builds from source → Discord notification.

Environment variables (`VITE_CLERK_PUBLISHABLE_KEY`, `VITE_API_BASE`) are set in the Render dashboard per environment.

### GitHub Secrets required

| Secret | Where to get it |
|---|---|
| `RENDER_CONSOLE_STAGING_DEPLOY_HOOK` | Render staging Static Site → Settings → Deploy Hooks |
| `RENDER_CONSOLE_PROD_DEPLOY_HOOK` | Render prod Static Site → Settings → Deploy Hooks |
| `DISCORD_WEBHOOK_URL` | Discord channel → Integrations → Webhooks |
