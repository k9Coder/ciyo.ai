# Env & Secrets Standardization — Design

**Date:** 2026-07-11
**Status:** Approved (pending spec review)

## Context

The monorepo holds six deployable packages (`backend`, `mykka-web`, `pretzel`, `pretzel-console`, `pretzel-desktop`, `e2e`) sharing one GitHub repository and therefore one secrets page. Secret names are currently inconsistent (`PROD_DATABASE_URL`, `RENDER_BACKEND_PROD_SERVICE_ID`, `VITE_CLERK_PUBLISHABLE_KEY` vs `VITE_CLERK_PUBLISHABLE_KEY_PROD`, `MYKKA_API_URL_PROD`), which makes collisions and wrong-key wiring easy — the Clerk test/prod publishable keys already differ only by suffix. All secrets are repo-level, so every workflow can read every secret.

`.env` file handling is partially standardized: most packages have `.env.example` / `.env.staging` (committed) / `.env.prod` (gitignored), a root `scripts/set-env.mjs` copies files for backend + mykka-web, and Vite packages use `--mode`. Gaps: `pretzel-desktop` has no `.env` files at all (env comes only from CI or the developer's shell), `mykka-web` has no `.env.example`, and env reads are scattered raw `process.env.X` / `import.meta.env.X` accesses with no validation.

## Goals

1. Prefixed, collision-proof GitHub secret names.
2. Real secret isolation via GitHub Environments (`production`, `staging`) instead of repo-level-only secrets, removing per-secret branch ternaries from workflows.
3. Consistent `.env` file set across all inner repos, framework-native active file.
4. One validated, typed env access module (`env.ts`) per package; no scattered raw env reads.
5. Documentation: naming convention, environment/secret tables, and a manual GitHub UI migration checklist.

## Non-goals

- No renaming of runtime env var names inside packages, `.env` files, or Render/Vercel dashboards (prefix exists **only** at the GitHub secrets layer).
- No changes to unit-test / e2e database wiring (already isolated; see Two-Axis Taxonomy).
- No production deploy approval gate (can be enabled later in repo settings with zero workflow changes).
- No shared `packages/env` workspace package (Vite's static replacement of `import.meta.env` makes shared env code fight the bundler).

## Decisions (locked with Yarin, 2026-07-11)

| Question | Decision |
|---|---|
| Local `.env.prod` files | **Keep** (gitignored, as today). GitHub Environments hold CI copies; both must be updated on rotation. |
| GitHub Environments | `production` + `staging` only. e2e workflow uses `staging`. |
| Prefix depth | GitHub secrets layer only. Code keeps plain names (`process.env.DATABASE_URL`). |
| `.env` file layout | Framework-native active file + standard trio (`.env.example` / `.env.staging` / `.env.prod`) everywhere. |
| Env access in code | Central `env.ts` per repo, zod-validated, fail-fast at startup. |
| Prod approval gate | Off for now. |
| Test-env files (`.env.test`, `.env.e2e`) | Keep as-is — separate axis, unchanged names, CI test DBs stay hardcoded ephemeral containers. |

## Two-Axis Taxonomy

Deploy environments and test environments are orthogonal; the design treats them separately.

| Axis | Values | Files | Secrets live in |
|---|---|---|---|
| Deploy | `staging`, `production` | `.env.staging`, `.env.prod` | GitHub Environments + Render/Vercel dashboards |
| Test | unit, e2e | `.env.test`, `.env.e2e` | Nowhere — ephemeral CI service containers with throwaway creds, committed dummy keys. Exception: e2e Clerk dev-instance secrets live in the `staging` GitHub environment. |

## 1. GitHub secret naming convention

`<APP>_<NAME>` — no environment suffix; the GitHub Environment supplies the env dimension. Truly shared secrets get `SHARED_`. Secret name ≠ runtime env var name; workflows map explicitly:

```yaml
env:
  DATABASE_URL: ${{ secrets.BACKEND_DATABASE_URL }}
```

### Rename map

**Environment-scoped (same name in `production` and `staging`, different values):**

| New name | Old name(s) | Used by |
|---|---|---|
| `BACKEND_DATABASE_URL` | `PROD_DATABASE_URL` / `STAGING_DATABASE_URL` | backend-deploy (migrations, seed) |
| `BACKEND_RENDER_SERVICE_ID` | `RENDER_BACKEND_PROD_SERVICE_ID` / `RENDER_BACKEND_STAGING_SERVICE_ID` | backend-deploy |
| `CONSOLE_RENDER_DEPLOY_HOOK` | `RENDER_CONSOLE_PROD_DEPLOY_HOOK` / `RENDER_CONSOLE_STAGING_DEPLOY_HOOK` | pretzel-console-deploy |
| `PRETZEL_CLERK_PUBLISHABLE_KEY` | `VITE_CLERK_PUBLISHABLE_KEY_PROD` (prod) / `VITE_CLERK_PUBLISHABLE_KEY` (staging/test) | pretzel-release, pretzel-desktop-release, e2e (builds) |
| `PRETZEL_API_BASE` | `VITE_API_BASE_PROD` | pretzel-release |
| `PRETZEL_DESKTOP_API_URL` | `MYKKA_API_URL_PROD` | pretzel-desktop-release |

**`staging` environment only (e2e Clerk dev instance):**

| New name | Old name | Used by |
|---|---|---|
| `E2E_CLERK_SECRET_KEY` | `CLERK_SECRET_KEY` | e2e (backend startup, seed) |
| `E2E_CLERK_WEBHOOK_SECRET` | `CLERK_WEBHOOK_SECRET` | e2e (backend startup) |
| `E2E_CLERK_USER_ID` / `E2E_CLERK_ORG_ID` / `E2E_CLERK_USER_EMAIL` / `E2E_CLERK_USER_PASSWORD` | same names (move repo-level → `staging` env) | e2e |

There is **no** separate `E2E_CLERK_PUBLISHABLE_KEY`: the e2e workflow's extension/console builds read `PRETZEL_CLERK_PUBLISHABLE_KEY` from the `staging` environment (same Clerk dev instance, one value, one name).

**Repo-level (shared, environment-independent):**

| New name | Old name |
|---|---|
| `SHARED_DISCORD_WEBHOOK_URL` | `DISCORD_WEBHOOK_URL` |
| `SHARED_RENDER_API_KEY` | `RENDER_API_KEY` |

`GITHUB_TOKEN` is built-in and unchanged. mykka-web deploys via Vercel; its runtime env lives in the Vercel dashboard and it consumes no GitHub secrets beyond the shared Discord webhook.

## 2. Workflow changes (6 files in `.github/workflows/`)

Common pattern: the job that consumes deploy secrets declares `environment:`; per-secret branch ternaries are deleted; secret references renamed per the map; runtime env var names unchanged.

| Workflow | `environment:` | Changes |
|---|---|---|
| `backend-deploy.yml` | deploy job: `${{ github.ref_name == 'master' && 'production' \|\| 'staging' }}` | `BACKEND_DATABASE_URL`, `BACKEND_RENDER_SERVICE_ID`, `SHARED_RENDER_API_KEY`, `SHARED_DISCORD_WEBHOOK_URL`. Test job untouched (local postgres, dummy keys). |
| `pretzel-console-deploy.yml` | deploy job: same ternary | `CONSOLE_RENDER_DEPLOY_HOOK` (ternary in `DEPLOY_HOOK` env deleted), `SHARED_DISCORD_WEBHOOK_URL`. Error message text updated to new secret name. Test job untouched. |
| `mykka-web-deploy.yml` | none (no deploy secrets) | `SHARED_DISCORD_WEBHOOK_URL` only. |
| `pretzel-release.yml` | build-release job: `production` (tag-triggered) | `PRETZEL_CLERK_PUBLISHABLE_KEY`, `PRETZEL_API_BASE`, `SHARED_DISCORD_WEBHOOK_URL`. |
| `pretzel-desktop-release.yml` | all three build/package jobs: `production` | `PRETZEL_DESKTOP_API_URL`, `PRETZEL_CLERK_PUBLISHABLE_KEY`, `SHARED_DISCORD_WEBHOOK_URL`. |
| `e2e.yml` | e2e job: `staging` | `PRETZEL_CLERK_PUBLISHABLE_KEY` (builds + `CLERK_PUBLISHABLE_KEY` runtime var), `E2E_CLERK_SECRET_KEY`, `E2E_CLERK_WEBHOOK_SECRET`, `E2E_CLERK_USER_*`, `SHARED_DISCORD_WEBHOOK_URL`. Postgres service container, hardcoded `E2E_DATABASE_URL`, and `INTERNAL_SECRET` literal stay as-is. |

Constraint accepted: one job = one environment. No current job needs secrets from both environments.

## 3. `.env` file matrix

Standard trio in every inner repo: `.env.example` (committed, documented placeholders), `.env.staging` (committed, test keys only), `.env.prod` (gitignored — covered by existing `**/.env.prod` rule). Active file is framework-native:

| Package | Active file | Loader | New files needed |
|---|---|---|---|
| backend | `.env` | `node --env-file=.env` | — (complete) |
| mykka-web | `.env.local` | Next.js convention | `.env.example` |
| pretzel | `.env` or `--mode staging\|prod` | Vite | — (complete) |
| pretzel-console | `.env` or `--mode` | Vite | — (complete) |
| pretzel-desktop | `.env` | electron-vite / dotenv (verify exact mechanism during implementation) | **all four**: `.env.example`, `.env`, `.env.staging`, `.env.prod` — vars: `MYKKA_API_URL`, `CLERK_PUBLISHABLE_KEY` |
| e2e | `.env.e2e` (test axis — unchanged) | dotenv in global-setup | fix stale "create in Railway" comment in `.env.e2e.example` (infra is Render + Neon) |

`scripts/set-env.mjs`: add `pretzel-desktop` to the copy list (`.env.<env>` → `.env`). Console output updated.

Test-axis files unchanged: `backend/.env.test` (committed, dummy keys, loaded by vitest), `e2e/.env.e2e` (gitignored, local only).

## 4. `env.ts` per package (zod-validated, fail-fast)

One module per package owns all env access. It parses at import time and throws a clear aggregated error listing every missing/invalid var (fail-fast beats `undefined` surfacing deep in runtime). All scattered `process.env.X` / `import.meta.env.X` reads across `src/` migrate to import from it. zod added as a dependency to `mykka-web` and `e2e`; other packages already have it (backend v3, console v4 — versions stay as they are, schemas are package-local).

| Package | File(s) | Source | Notes |
|---|---|---|---|
| backend | `src/env.ts` | `process.env` | Required: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`, `INTERNAL_SECRET`. Optional with defaults: `PORT`, `CORS_ORIGIN`, `LLM_PROVIDER`, SMTP/Stripe/LLM keys, `APP_ENV`, `RATE_LIMIT_DISABLED`, `PAYPAL_SKIP_SIG_VERIFY`. Exact required/optional split decided during implementation from actual usage. |
| mykka-web | `src/env.ts` | `process.env.NEXT_PUBLIC_*` | Next.js inlines at build: each var must be referenced literally (`process.env.NEXT_PUBLIC_API_BASE`), never via dynamic key. |
| pretzel | `src/env.ts` | `import.meta.env.VITE_*` | Same literal-reference constraint (Vite static replacement). |
| pretzel-console | `src/env.ts` | `import.meta.env.VITE_*` | Same. |
| pretzel-desktop | main-process `env.ts`; renderer `env.ts` only if renderer reads env directly | `process.env` (main) | Currently reads `MYKKA_API_URL`, `CLERK_PUBLISHABLE_KEY`, `NODE_ENV`. Build-time vs runtime injection verified during implementation. |
| e2e | `env.ts` | `process.env` (after dotenv) | Replaces the hand-rolled required-var loop in `global-setup.ts`. |

Validation failure modes: server-side (backend, e2e, desktop main) throws on startup; client bundles (Vite, Next) fail at build/dev-server start when the schema module is first evaluated.

## 5. Documentation & manual migration checklist

New doc `docs/ENVIRONMENT_AND_SECRETS.md` (linked from `docs/index.md`): naming convention, rename map, environment tables, two-axis taxonomy, `.env` file matrix, rotation notes (rotate in both GitHub Environments **and** local `.env.prod` / Render / Vercel).

Manual steps (Yarin only — GitHub/Render dashboard access), performed in this order to avoid breaking CI:

1. Create `production` and `staging` environments in repo settings (no protection rules).
2. Add all new-name secrets with correct values per the rename map (values copied from old secrets; `RENDER_CONSOLE_*_DEPLOY_HOOK` values still need to be created in the Render dashboard first — known open item).
3. Merge the workflow/code changes (PR).
4. Confirm green runs: e2e on the PR, backend + console deploys on merge, one tagged release each for pretzel and desktop when next convenient.
5. Delete old repo-level secrets.

## Cutover risk

Between step 2 and step 3, old and new secrets coexist — harmless. If step 3 merges before step 2 completes, deploy jobs fail loudly (missing secret), nothing deploys with wrong values. Rollback = revert the PR; old secrets still exist until step 5.

## Testing / verification

- CI itself is the test for workflow changes (e2e runs on PR; deploys on merge).
- `env.ts` modules: unit tests where a test setup exists (backend, console) covering missing-var failure and defaults; other packages verified by dev-server / build starting successfully.
- `set-env.mjs`: run `pnpm set-env:staging` and confirm desktop copy works.
- Grep gate: no raw `process.env.` / `import.meta.env.` reads outside `env.ts` files (allowlist: `NODE_ENV` checks in build configs, test files if pragmatic).
