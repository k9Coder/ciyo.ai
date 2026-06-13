---
status: current
owner: engineering
verified_at: 2026-06-13
sources:
  - e2e/playwright.config.ts
  - e2e/global-setup.ts
  - e2e/global-teardown.ts
  - e2e/package.json
  - e2e/.env.e2e.example
  - backend/package.json
  - backend/src/scripts/seed-e2e.ts
  - backend/src/scripts/teardown-e2e.ts
  - pretzel-console/e2e/auth.setup.ts
  - .github/workflows/e2e.yml
  - package.json
---

# Cross-Package E2E Tests

This directory owns the Playwright configuration that combines backend API,
extension, cross-service, and admin-console tests. Run this configuration from
`e2e/`; the package-local Playwright configurations are separate runners.

## Projects

| Project | Specs | Runtime and concurrency |
|---|---|---|
| `api` | `backend/e2e/**/*.spec.ts` | API requests against `E2E_BACKEND_URL` or `http://localhost:3000`; 4 workers |
| `extension` | `pretzel/e2e/**/*.spec.ts` | Built extension from `pretzel/dist` loaded into Chromium; 1 worker |
| `cross-service` | `e2e/extension/**/*.spec.ts` | Backend API to published policy to extension enforcement; 1 worker |
| `admin-setup` | `pretzel-console/e2e/**/auth.setup.ts` | Signs in through Clerk and writes `e2e/.auth/admin.json` |
| `admin` | `pretzel-console/e2e/**/*.spec.ts` | Admin UI against `E2E_ADMIN_URL` or `http://localhost:5173`; 2 workers; depends on `admin-setup` |

The extension projects use `headless: false` plus Chromium's `--headless=new`
argument because the older Playwright headless mode breaks Manifest V3 service
workers.

The configuration also starts `pretzel/e2e/fixtures-server.mjs` at
`http://localhost:9876` through Playwright's `webServer` option. It reuses an
existing server on that port. Despite the stale comment in `global-setup.ts`,
you do not need to start the fixture server separately when using this config.

## Prerequisites

- Node.js, pnpm, and Playwright Chromium are installed.
- Dependencies are installed in `e2e/`, `backend/`, `pretzel/`, and
  `pretzel-console/` as needed. This repository is not currently configured as
  a pnpm workspace, so a root `pnpm install` does not install every package.
- `e2e/.env.e2e` exists. Start from `.env.e2e.example`.
- `E2E_DATABASE_URL` points to a disposable test database. Global setup
  truncates and reseeds it, and global teardown removes most seeded test data.
- The backend is already running against the same database at
  `E2E_BACKEND_URL` or `http://localhost:3000`.
- `pretzel/dist` exists before running `extension` or `cross-service`.
- The admin app is already running at `E2E_ADMIN_URL` or
  `http://localhost:5173` before running `admin`.
- Admin authentication additionally needs `CLERK_PUBLISHABLE_KEY` and
  `E2E_CLERK_USER_PASSWORD`. Global setup requires `E2E_CLERK_ORG_ID`,
  `E2E_CLERK_USER_ID`, and `E2E_CLERK_USER_EMAIL`.

Never point `E2E_DATABASE_URL` at production. The seed and teardown scripts
delete data directly.

## Run The Suite

Run package commands from the package directory shown. This avoids accidentally
selecting one of the package-local Playwright configurations.

Install the E2E runner and browser:

```powershell
cd e2e
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cd ..
```

Build the extension:

```powershell
cd pretzel
pnpm build
cd ..
```

Start the backend in a separate terminal after setting its `DATABASE_URL` to
the same value as `E2E_DATABASE_URL`:

```powershell
cd backend
$env:DATABASE_URL = "<same value as E2E_DATABASE_URL>"
pnpm dev
```

For admin tests, start the console in another terminal with its API and Clerk
configuration set:

```powershell
cd pretzel-console
$env:VITE_API_BASE = "http://localhost:3000"
$env:VITE_CLERK_PUBLISHABLE_KEY = "<Clerk publishable key>"
pnpm dev
```

Run all projects:

```powershell
cd e2e
pnpm test:e2e
```

Run selected projects:

```powershell
cd e2e
pnpm exec playwright test --config playwright.config.ts --project=api
pnpm exec playwright test --config playwright.config.ts --project=extension
pnpm exec playwright test --config playwright.config.ts --project=cross-service
pnpm exec playwright test --config playwright.config.ts --project=admin
```

Selecting `admin` also runs its `admin-setup` dependency. Playwright uses no
local retries and the `list` reporter. When `CI` is set, it uses two retries and
the `github` reporter.

## Global Setup And Teardown

Before any selected project runs, `global-setup.ts`:

1. Loads `e2e/.env.e2e`.
2. Requires `E2E_DATABASE_URL` and the three Clerk identity variables.
3. Creates `e2e/.auth/`.
4. Runs `pnpm run seed:e2e` from `backend/`, overriding `DATABASE_URL` with
   `E2E_DATABASE_URL`.
5. The seed truncates test tables, creates deterministic test tenants and data,
   and writes generated IDs and tokens to `e2e/.seed-state.json`.

After the run, `global-teardown.ts`:

1. Runs `pnpm run teardown:e2e` from `backend/` against `E2E_DATABASE_URL`.
   This deletes the seeded tenant-owned records but does not delete rows from
   the `users` table; the next global setup removes those before reseeding.
2. Logs teardown failures without replacing the test result.
3. Replaces `e2e/.seed-state.json` with `{}` so a later partial or stale run
   fails instead of reusing invalid generated credentials.

Global setup already seeds the database. Do not manually run `seed:e2e`
immediately before this runner unless you are debugging the seed itself.

## Known CI Mismatch

The current `.github/workflows/e2e.yml` runs `pnpm run build` and
`pnpm test:e2e` from the repository root. The root `package.json` defines
neither script, so the workflow does not currently invoke this E2E runner as
written. It also installs from the root rather than explicitly installing the
standalone `e2e/` package.

This README records the mismatch only; it does not change the workflow.

## Observed Local Runner Limitation

On the verified checkout, even project discovery from `e2e/` fails with
`Requiring @playwright/test second time`. Cross-package specs resolve their
package-local `@playwright/test` installation while the runner uses the
installation under `e2e/`. The commands above are the correct entry points for
the configured runner, but the dependency-resolution conflict currently
prevents a successful run. This README does not change package dependencies or
the Playwright configuration.
