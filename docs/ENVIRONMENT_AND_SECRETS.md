# Environments & Secrets

Convention for GitHub secrets, GitHub Environments, and `.env` files across all packages. Design spec: [superpowers/specs/2026-07-11-env-and-secrets-standardization-design.md](superpowers/specs/2026-07-11-env-and-secrets-standardization-design.md).

## Naming convention

GitHub secrets are named `<APP>_<NAME>` — no environment suffix; the GitHub **Environment** (`production` / `staging`) supplies the env dimension. Truly shared secrets get `SHARED_`. The secret name is **not** the runtime env var name; workflows map explicitly:

```yaml
jobs:
  deploy:
    environment: ${{ github.ref_name == 'master' && 'production' || 'staging' }}
    steps:
      - env:
          DATABASE_URL: ${{ secrets.BACKEND_DATABASE_URL }}
```

Runtime var names inside packages, `.env` files, and the Render/Vercel dashboards are unchanged — the prefix exists only on the GitHub secrets page.

## Two-axis taxonomy

Deploy environments and test environments are orthogonal:

| Axis | Values | Files | Secrets live in |
|---|---|---|---|
| Deploy | `staging`, `production` | `.env.staging`, `.env.prod` | GitHub Environments + Render/Vercel dashboards |
| Test | unit, e2e | `.env.test`, `.env.e2e` | Nowhere — ephemeral CI service containers with throwaway creds, committed dummy keys. Exception: e2e Clerk dev-instance secrets live in the `staging` GitHub environment. |

CI test databases (`postgres://e2e:e2e@localhost`, `promptshield_test`) and dummy values (`test-secret`, `sk_test_dummy_for_tests`) are hardcoded in workflows on purpose — the containers die with the job and the values secure nothing.

## Secrets inventory

**Environment-scoped** — same name exists in both `production` and `staging` with different values:

| Secret | Used by | Runtime var |
|---|---|---|
| `BACKEND_DATABASE_URL` | backend-deploy (migrations, seed) | `DATABASE_URL` |
| `BACKEND_RENDER_SERVICE_ID` | backend-deploy | `SERVICE_ID` |
| `CONSOLE_RENDER_DEPLOY_HOOK` | pretzel-console-deploy | `DEPLOY_HOOK` |
| `PRETZEL_CLERK_PUBLISHABLE_KEY` | pretzel-release, pretzel-desktop-release (production); e2e builds (staging) | `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_PUBLISHABLE_KEY` |
| `PRETZEL_API_BASE` | pretzel-release | `VITE_API_BASE` |
| `PRETZEL_DESKTOP_API_URL` | pretzel-desktop-release | `CIYO_API_URL` |

**`staging` environment only** (Clerk dev instance for e2e):

| Secret | Runtime var |
|---|---|
| `E2E_CLERK_SECRET_KEY` | `CLERK_SECRET_KEY` |
| `E2E_CLERK_WEBHOOK_SECRET` | `CLERK_WEBHOOK_SECRET` |
| `E2E_CLERK_USER_ID` / `E2E_CLERK_ORG_ID` / `E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD` | same names |

There is deliberately no `E2E_CLERK_PUBLISHABLE_KEY` — e2e builds read `PRETZEL_CLERK_PUBLISHABLE_KEY` from `staging` (same Clerk dev instance; one value, one name).

**Repo-level** (environment-independent):

| Secret | Notes |
|---|---|
| `SHARED_DISCORD_WEBHOOK_URL` | all workflows' notify steps |
| `SHARED_RENDER_API_KEY` | backend-deploy Render API |

`GITHUB_TOKEN` is built-in. ciyo-web deploys via Vercel: its runtime env lives in the Vercel dashboard; the workflow consumes only the Discord webhook.

### Old → new rename map

| Old (repo-level) | New | Where |
|---|---|---|
| `PROD_DATABASE_URL` / `STAGING_DATABASE_URL` | `BACKEND_DATABASE_URL` | production / staging env |
| `RENDER_BACKEND_PROD_SERVICE_ID` / `RENDER_BACKEND_STAGING_SERVICE_ID` | `BACKEND_RENDER_SERVICE_ID` | production / staging env |
| `RENDER_CONSOLE_PROD_DEPLOY_HOOK` / `RENDER_CONSOLE_STAGING_DEPLOY_HOOK` | `CONSOLE_RENDER_DEPLOY_HOOK` | production / staging env |
| `VITE_CLERK_PUBLISHABLE_KEY_PROD` / `VITE_CLERK_PUBLISHABLE_KEY` | `PRETZEL_CLERK_PUBLISHABLE_KEY` | production / staging env |
| `VITE_API_BASE_PROD` | `PRETZEL_API_BASE` | production env (+ staging value) |
| `CIYO_API_URL_PROD` | `PRETZEL_DESKTOP_API_URL` | production env (+ staging value) |
| `CLERK_SECRET_KEY` | `E2E_CLERK_SECRET_KEY` | staging env |
| `CLERK_WEBHOOK_SECRET` | `E2E_CLERK_WEBHOOK_SECRET` | staging env |
| `E2E_CLERK_USER_ID` / `_ORG_ID` / `_USER_EMAIL` / `_USER_PASSWORD` | unchanged names | move to staging env |
| `DISCORD_WEBHOOK_URL` | `SHARED_DISCORD_WEBHOOK_URL` | repo-level |
| `RENDER_API_KEY` | `SHARED_RENDER_API_KEY` | repo-level |

## `.env` file matrix

Standard trio per package: `.env.example` (committed, placeholders) / `.env.staging` (committed, test keys only) / `.env.prod` (gitignored via `**/.env.prod`, local only). Active file is framework-native:

| Package | Active file | Loader | Env access in code |
|---|---|---|---|
| backend | `.env` | `node --env-file=.env` | `src/env.ts` (zod, fail-fast at boot, live getters) |
| ciyo-web | `.env.local` | Next.js | `lib/env.ts` (literal `NEXT_PUBLIC_*` refs — Next inlines at build) |
| pretzel | `.env` or `--mode staging\|prod` | Vite | `src/env.ts` (literal `import.meta.env` refs) |
| pretzel-console | `.env` or `--mode` | Vite | `src/env.ts` (live getters — tests stub env) |
| pretzel-desktop | `.env` | electron-vite `define` + `loadEnv` — values are **baked into the main-process bundle at build time**; rebuild after changing `.env` | `electron/env.ts` |
| e2e | `.env.e2e` (test axis) | dotenv inside `env.ts` | `env.ts` (fail-fast with per-var messages) |

`pnpm set-env:staging | set-env:prod` (root) copies the right file into place for backend, ciyo-web, and pretzel-desktop.

Rules: no raw `process.env.X` / `import.meta.env.X` reads outside the env modules. Allowlisted exceptions: backend `src/db/client.ts`, `src/db/migrate.ts`, `src/db/seeds/**`, `src/scripts/**` (standalone scripts that run with partial env — CI provides only `DATABASE_URL`), `NODE_ENV` checks in desktop main/build files, `process.env.CI` in test tooling, and test files.

## Rotation

A deploy-env value lives in up to three places — rotate all that apply:

1. GitHub environment secret (`production` and/or `staging`).
2. Runtime host: Render dashboard (backend, console) / Vercel dashboard (ciyo-web).
3. Local `.env.prod` files on Yarin's machine (kept deliberately).

Baked-at-build values (`PRETZEL_*`) additionally require a new release/tag to take effect.

## Manual migration checklist (Yarin — GitHub/Render dashboard access)

Do 1-2 **before** merging the standardization PR; deploy jobs fail loudly on missing secrets otherwise (old and new secrets coexisting is harmless).

1. Repo Settings → Environments: create `production` and `staging` (no protection rules for now — approval gates can be enabled later with zero workflow changes).
2. Add every secret from the inventory above to its environment(s), values copied from the old repo-level secrets. Notes:
   - `CONSOLE_RENDER_DEPLOY_HOOK`: the deploy hooks still need to be created in the Render dashboard first (known open item).
   - `PRETZEL_API_BASE` / `PRETZEL_DESKTOP_API_URL` staging values: the staging API URL.
   - Create `pretzel-desktop/.env.prod` locally (prod `CIYO_API_URL` + prod Clerk publishable key).
3. Merge the PR.
4. Verify green: e2e on the PR; backend + console deploys on the next merge; one tagged pretzel + desktop release when convenient.
5. Delete the old repo-level secrets (left column of the rename map).
