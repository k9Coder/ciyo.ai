# Docker, CI/CD & Release Design

**Date:** 2026-06-02  
**Status:** Approved

---

## Overview

Add lean Docker images, a root `docker-compose.yml` for local dev, GitHub Actions CI/CD pipelines for staging/production deploys, Discord deploy notifications, a semi-automated Chrome extension release workflow, and a phased GCP Cloud Run migration plan.

---

## What Gets Dockerized

| Package | Dockerfile | Production host | Notes |
|---|---|---|---|
| `backend` | Yes — multi-stage | Render Web Service → GCP Cloud Run | Server process, needs a container |
| `pretzel-console` | Yes — nginx static | Render Static Site | Vite SPA; ~25MB final image |
| `ciyo-web` | Yes — Next.js standalone | Vercel (no change) | Dockerfile for local docker-compose only |
| `pretzel` | No | Chrome Web Store | Browser extension, produces a .zip artifact |
| `e2e` | No | GitHub Actions CI | Test runner only |

---

## Docker Image Design

### Strategy: multi-stage builds everywhere

Stage 1 (builder) compiles TypeScript / runs the frontend build. Stage 2 (runtime) copies only the output and prod dependencies. Dev tooling never ends up in the final image.

### backend (~150MB)

```
Stage 1 — node:20-alpine
  - corepack enable, pnpm@9
  - pnpm install --frozen-lockfile  (all deps, including devDeps)
  - tsc compile → dist/

Stage 2 — node:20-alpine
  - corepack enable, pnpm@9
  - pnpm install --frozen-lockfile --prod  (prod deps only)
  - COPY dist/ from stage 1
  - USER node (non-root)
  - EXPOSE 3000
  - CMD ["node", "dist/index.js"]
```

DB migrations are **not** run inside the image. They run as a separate CI step before the deploy API call.

The image also supports a `SERVICE_MODE` environment variable (initially unused, required for Phase 3 microservices split — see GCP Migration Plan).

### pretzel-console (~25MB)

```
Stage 1 — node:20-alpine
  - pnpm install --frozen-lockfile
  - pnpm build:prod  (Vite --mode prod; env vars injected at build time)

Stage 2 — nginx:alpine
  - COPY dist/ → /usr/share/nginx/html
  - Custom nginx.conf: serves index.html for all routes (SPA routing)
  - EXPOSE 80
```

nginx:alpine base is 7MB. Final image is almost entirely static files.

Note: this Dockerfile is used only for local `docker-compose`. Render Static Site builds from source using `pnpm build:staging` or `pnpm build:prod` depending on which deploy hook is triggered — Render handles the mode selection itself.

### ciyo-web (~200MB, local dev only)

```
Stage 1 — node:20-alpine
  - pnpm install --frozen-lockfile
  - pnpm build  (requires next.config.ts: output: 'standalone')

Stage 2 — node:20-alpine
  - COPY .next/standalone/
  - COPY .next/static → .next/static
  - COPY public/
  - EXPOSE 3001
  - CMD ["node", "server.js"]
```

Next.js standalone mode copies only what is needed to run — no node_modules bloat.

### .dockerignore (per package)

Each package gets a `.dockerignore` excluding: `node_modules/`, `dist/`, `.env*`, `tests/`, `e2e/`, `*.md`, `.vscode/`, `.github/`.

---

## docker-compose.yml (root)

Starts the full stack locally with `docker-compose up`.

```
postgres:16-alpine   port 5432  named volume postgres_data
backend              port 3000  waits for postgres healthcheck
pretzel-console      port 5173  nginx serving built SPA
ciyo-web             port 3001  Next.js standalone
```

- Postgres data persists across restarts via named volume.
- Backend receives `DATABASE_URL` pointing at the compose postgres.
- `.env` files are passed via `env_file:` in docker-compose — never baked into images.
- All images are production builds. For daily development, run `pnpm dev` per package. docker-compose is for full-stack demos and manual integration testing.

---

## GitHub Actions Workflows

### Secrets required (one-time setup in GitHub repo settings)

```
RENDER_API_KEY
RENDER_BACKEND_STAGING_SERVICE_ID
RENDER_BACKEND_PROD_SERVICE_ID
RENDER_CONSOLE_STAGING_DEPLOY_HOOK
RENDER_CONSOLE_PROD_DEPLOY_HOOK
DISCORD_WEBHOOK_URL
VITE_CLERK_PUBLISHABLE_KEY_PROD
VITE_API_BASE_PROD
STAGING_DATABASE_URL          ← used by CI to run migrations before staging deploy
PROD_DATABASE_URL             ← used by CI to run migrations before production deploy
```

In workflow YAML, `{repo}` resolves to `${{ github.repository }}` (e.g. `your-org/prompt-saviour`).

---

### backend-deploy.yml

**Trigger:** push to `master` or `staging`, paths `backend/**`

```
job: test
  - pnpm install (backend/)
  - pnpm test (vitest)

job: build-and-deploy (needs: test)
  - docker/login-action → ghcr.io (GITHUB_TOKEN, no extra secret)
  - docker/setup-buildx-action (BuildKit cache)
  - Build + push image:
      ghcr.io/{repo}/backend:{git-sha}
      ghcr.io/{repo}/backend:{branch-name}
      cache: type=gha (fast incremental builds)
  - Run DB migrations against target DB via environment secret
  - POST Render API: deploy service with imageUrl = ghcr.io/{repo}/backend:{git-sha}
      master  → RENDER_BACKEND_PROD_SERVICE_ID
      staging → RENDER_BACKEND_STAGING_SERVICE_ID
  - Discord notification (always, reports success or failure)
```

Images are tagged by git SHA for full traceability — you always know exactly what commit is running.

---

### pretzel-console-deploy.yml

**Trigger:** push to `master` or `staging`, paths `pretzel-console/**`

```
job: test
  - pnpm install (pretzel-console/)
  - pnpm test (vitest)
  - pnpm typecheck

job: deploy (needs: test)
  - curl Render Static Site deploy hook
      master  → RENDER_CONSOLE_PROD_DEPLOY_HOOK
      staging → RENDER_CONSOLE_STAGING_DEPLOY_HOOK
      (Render builds from source on its side — no Docker image needed for static hosting)
  - Discord notification
```

---

### ciyo-web-deploy.yml

**Trigger:** push to `master` or `staging`, paths `ciyo-web/**`

```
job: check
  - pnpm install (ciyo-web/)
  - pnpm lint
  - pnpm build (type-checks Next.js)

  Vercel deploys automatically from its own GitHub integration.
  This workflow is a test gate + Discord notification layer only.

  - Discord notification
```

---

### pretzel-release.yml

**Trigger:** push of tag matching `pretzel-v*` (e.g. `git tag pretzel-v2.1.0 && git push --tags`)

```
job: build-release
  - pnpm install (pretzel/)
  - pnpm build:prod
      env: VITE_CLERK_PUBLISHABLE_KEY_PROD, VITE_API_BASE_PROD from secrets
  - zip -r pretzel-{tag}.zip dist/
  - softprops/action-gh-release: create GitHub Release, attach zip
  - Discord notification: "pretzel-v2.1.0 build ready — upload zip to Chrome Web Store"
```

---

### e2e.yml (update existing)

The existing workflow references `admin/` which no longer exists. Update all references:
- `admin` → `pretzel-console`
- build step uses `pnpm build:staging` with correct env vars

---

## Extension Release Workflow (how to ship a new version)

1. Bump the version in [pretzel/manifest.config.ts](pretzel/manifest.config.ts) (`version: "2.1.0"`)
2. Commit and push to `master`
3. Tag the release: `git tag pretzel-v2.1.0 && git push --tags`
4. GitHub Actions builds the extension and creates a GitHub Release with `pretzel-v2.1.0.zip` attached
5. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
6. Select the Pretzel extension → "Upload new package" → upload the zip from GitHub Releases
7. Fill in release notes → Submit for review (Google reviews in 1-3 business days)

---

## README Updates

Each package README (and root README) gets a **"Deployment & Releases"** section covering:

- **Root README:** overview of all services, links to each package README, how to run the full stack locally with docker-compose
- **backend README:** how staging/prod deploy works, how to run migrations manually, environment variables reference
- **ciyo-web README:** Vercel auto-deploy explanation, how to promote staging → prod
- **pretzel-console README:** Render Static Site deploy, how staging/prod branches map to environments
- **pretzel README:** full step-by-step extension release instructions (the 7-step flow above)

---

## GCP Cloud Run Migration Plan

### Phase 1 — Render (now, pre-customers)

Current state after this spec is implemented. Free tier. Cold starts (~30s after 15 min idle) are acceptable.

**Move to Phase 2 when:** paying customers exist, cold starts hurt demos, or you need guaranteed uptime.

---

### Phase 2 — GCP Cloud Run, monolith (~$35-50/mo)

Same Docker image, new destination. Half-day migration:

1. Create GCP project. Enable APIs: Cloud Run, Cloud SQL, Artifact Registry.
2. Create Cloud SQL Postgres (db-g1-small, ~$25/mo). Managed backups included.
3. One-time data migration: `pg_dump` current DB → `pg_restore` to Cloud SQL.
4. Add step to `backend-deploy.yml`: also push image to `gcr.io/{project}/backend:{sha}` (Artifact Registry). ghcr.io image stays, both registries get the same SHA.
5. Deploy Cloud Run service pointing at the image SHA. Cloud Run provides a free HTTPS URL instantly.
6. Point custom domain DNS at Cloud Run.
7. `pretzel-console` → Cloud Storage bucket (website hosting) + Cloud CDN. Cost: ~$0 at low traffic.
8. `ciyo-web` stays on Vercel.

**Cost:** Cloud SQL ~$25/mo + Cloud Run ~$0-5/mo = **~$30-35/mo total.**

**Move to Phase 3 when:** one part of the backend uses significantly more resources than others, or the team grows and independent deployments become necessary.

---

### Phase 3 — GCP Cloud Run, microservices

**The key insight: one Docker image, multiple services, controlled by `SERVICE_MODE` env var.**

The same image runs as different Cloud Run services. The Fastify app reads `SERVICE_MODE` and only registers the relevant plugins/routes:

```
SERVICE_MODE=auth     → /api/auth/*, /webhooks/clerk     (256MB, 1 CPU — tiny)
SERVICE_MODE=billing  → /api/billing/*, /webhooks/stripe  (256MB, 1 CPU — tiny)
SERVICE_MODE=scans    → /api/scans/*, /api/prompts/*      (1GB, 2 CPU — LLM calls are heavy)
SERVICE_MODE=all      → everything (local dev + staging)
```

**GCP Load Balancer URL map:**
```
/api/auth/*       → auth-service      Cloud Run
/webhooks/clerk   → auth-service      Cloud Run
/api/billing/*    → billing-service   Cloud Run
/webhooks/stripe  → billing-service   Cloud Run
/api/scans/*      → scans-service     Cloud Run
/api/prompts/*    → scans-service     Cloud Run
/*                → scans-service     Cloud Run (default)
```

Each service scales independently based on its own traffic. LLM/scan calls are expensive — that service gets more memory. Auth is lightweight — it stays tiny and cheap.

**Code change needed:** add `SERVICE_MODE` support to Fastify plugin registration (one file). Dockerfile does not change. CI pipeline change: deploy 3-4 Cloud Run services instead of 1.

**Cost at small scale:**
- Cloud Run (4 services, scale-to-zero): ~$0-10/mo
- Cloud SQL (shared): ~$25-50/mo
- Cloud Load Balancer: ~$18/mo
- Artifact Registry: ~$1/mo
- **Total: ~$45-80/mo** — scales efficiently, you pay for actual requests

---

## File Checklist

Files to create:
- `backend/Dockerfile`
- `backend/.dockerignore`
- `ciyo-web/Dockerfile`
- `ciyo-web/.dockerignore`
- `pretzel-console/Dockerfile`
- `pretzel-console/.dockerignore`
- `pretzel-console/nginx.conf`
- `docker-compose.yml` (root)
- `.dockerignore` (root)
- `.github/workflows/backend-deploy.yml`
- `.github/workflows/pretzel-console-deploy.yml`
- `.github/workflows/ciyo-web-deploy.yml`
- `.github/workflows/pretzel-release.yml`

Files to update:
- `ciyo-web/next.config.ts` — add `output: 'standalone'`
- `.github/workflows/e2e.yml` — replace `admin/` references with `pretzel-console/`
- `README.md` (root) — deployment overview
- `backend/README.md` — deploy + migration docs
- `ciyo-web/README.md` — Vercel deploy docs
- `pretzel-console/README.md` — Render Static Site docs
- `pretzel/README.md` — extension release step-by-step
