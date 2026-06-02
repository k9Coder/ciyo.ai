# ciyo.ai — Monorepo

Browser-based AI prompt DLP. Detects secrets and PII before they leave the browser, enforced by an admin-configurable policy.

**Four packages:**

| Package | What it is |
|---|---|
| `backend/` | Fastify REST API, Drizzle ORM, PostgreSQL |
| `pretzel/` | Chrome extension (MV3) — intercepts prompts, enforces policy |
| `pretzel-console/` | Admin web app — manage policy, members, billing |
| `ciyo-web/` | Marketing / landing site (Next.js) |

---

## Environments

| | Staging | Production |
|---|---|---|
| **Who** | Developers & testers | Real customers |
| **Clerk instance** | Development (`pk_test_` / `sk_test_`) | Production (`pk_live_` / `sk_live_`) |
| **Database** | `promptshield_staging` | `promptshield` |
| **Backend URL** | `http://localhost:3000` | `https://api.ciyo.ai` |

---

## Switching environments

Run once from the monorepo root before starting any package:

```bash
pnpm set-env:staging   # backend + ciyo-web point at staging
pnpm set-env:prod      # backend + ciyo-web point at prod
```

`pretzel` and `pretzel-console` use `--mode` flags in their scripts directly — no copy needed.

---

## Running in staging

```bash
# Step 0 — switch (only needed once, or after switching from prod)
pnpm set-env:staging

# Terminal 1 — API
cd backend && pnpm dev

# Terminal 2 — admin console
cd pretzel-console && pnpm dev:staging

# Terminal 3 — marketing site
cd ciyo-web && pnpm dev

# Extension — build once, load in Chrome as unpacked
cd pretzel && pnpm build:staging
# Then: Chrome → chrome://extensions → Developer mode → Load unpacked → select pretzel/dist/
```

## Running in production (deploy)

```bash
pnpm set-env:prod

# API
cd backend && pnpm build && pnpm start

# Admin console (static build → deploy to hosting)
cd pretzel-console && pnpm build:prod

# Extension (submit dist/ to Chrome Web Store)
cd pretzel && pnpm build:prod

# Marketing site
cd ciyo-web && pnpm build && pnpm start
```

---

## First-time setup

### Install dependencies

```bash
cd backend        && pnpm install
cd pretzel        && pnpm install
cd pretzel-console && pnpm install
cd ciyo-web       && pnpm install
```

### Create the staging database (one-time)

```bash
psql -U postgres -c "CREATE DATABASE promptshield_staging;"
pnpm set-env:staging
cd backend && pnpm db:migrate
```

### Fill in production secrets (when ready to deploy)

These files are gitignored — create them locally and fill in real values:

- `backend/.env.prod` — prod DB URL, `sk_live_` Clerk key, Stripe live keys, LLM keys
- `pretzel/.env.prod` — `pk_live_` Clerk publishable key, prod API base URL
- `pretzel-console/.env.prod` — `pk_live_` Clerk publishable key, prod API base URL

See `backend/.env.example` for all required variable names.

---

## Env file reference

| File | Committed | Contains |
|---|---|---|
| `*/.env.staging` | Yes | Test keys — safe to share |
| `*/.env.prod` | No (gitignored) | Real secrets — fill in locally |

---

## Tests

```bash
# Unit tests — run inside each package
pnpm test

# API E2E (backend must be running)
cd backend && pnpm test:e2e

# Extension E2E (requires a build first)
cd pretzel && pnpm build && pnpm test:e2e

# Admin E2E (backend + console must be running)
cd pretzel-console && pnpm test:e2e

# Full cross-cutting suite (from root)
npx playwright test
npx playwright test --project=api
npx playwright test --project=cross-service
```

See root `CLAUDE.md` for the full E2E prerequisites and regression rules.

---

## Running the full stack with Docker

One command starts everything — postgres, backend, pretzel-console, and ciyo-web:

```bash
# First time only
cp backend/.env.example backend/.env
# Fill in backend/.env with Clerk, Stripe, and LLM keys

docker-compose up --build
```

| Service | URL |
|---|---|
| Backend API | http://localhost:3000 |
| pretzel-console | http://localhost:5173 |
| ciyo-web | http://localhost:3001 |
| Postgres | localhost:5432 |

> For daily development, run `pnpm dev` per package instead — Docker is for full-stack demos and integration testing.

---

## CI/CD & Releases

| What | How |
|---|---|
| Backend deploy | Push to `staging` or `master` → `.github/workflows/backend-deploy.yml` |
| pretzel-console deploy | Push to `staging` or `master` → `.github/workflows/pretzel-console-deploy.yml` |
| ciyo-web deploy | Push to `staging` or `master` → Vercel auto-deploys (workflow adds lint gate + Discord) |
| Extension release | `git tag pretzel-vX.Y.Z && git push --tags` → zip attached to GitHub Release |

See each package README for full deployment details and required GitHub Secrets.
