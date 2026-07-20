# Design: Isolate Monorepo Packages (Option A)

**Date:** 2026-06-02  
**Status:** Done

## Goal

Remove all root-level package management artifacts (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `node_modules`). Each of the five inner packages becomes a fully self-contained pnpm project. Tests and scripts remain runnable from root via `pnpm --dir <package> <script>`.

---

## Root After Migration

**Keep:**
- `.gitignore`
- `README.md`
- `docs/`
- `tsconfig.json` — simplified to compiler options only (remove `include`/`exclude` that reference specific packages)
- `.github/`
- `.superpowers/`

**Delete:**
- `package.json`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `playwright.config.ts` (root mega-config)
- `node_modules/`
- `.env` + `.env.example` (duplicate of `pretzel-console/.env.example`)
- `scripts/` (moved to `backend/scripts/`)

---

## Per-Package Changes

### backend
- Delete `package-lock.json` → run `pnpm install` to generate `pnpm-lock.yaml`
- Move root `scripts/db-setup.mjs` and `scripts/check-db.mjs` into `backend/scripts/`
- Add `db:setup` and `check-db` scripts to `backend/package.json` pointing to the local `scripts/` paths
- Tests: `pnpm test` (vitest) — no config changes needed

### mykka-web
- Already has its own `pnpm-lock.yaml` — no changes needed
- No test suite to verify

### pretzel
- No lock file present → run `pnpm install` to generate `pnpm-lock.yaml`
- Scripts and configs already correct
- Tests: `pnpm test` (vitest)

### pretzel-console
- Delete `package-lock.json` → run `pnpm install` to generate `pnpm-lock.yaml`
- Scripts and configs already correct
- Tests: `pnpm test` (vitest + testing-library)

### e2e
- Create `playwright.config.ts` extracted from root mega-config, cross-service project only
  - `DIST_PATH`: `../pretzel/dist`
  - `webServer.command`: `node ../pretzel/e2e/fixtures-server.mjs`
  - `globalSetup`: `./global-setup.ts` (already in `e2e/`)
  - `globalTeardown`: `./global-teardown.ts` (already in `e2e/`)
  - `testMatch`: `extension/**/*.spec.ts` (relative to `e2e/`)
  - `outputDir`: `test-results` (local)
  - `.env.e2e` loaded via dotenv with local path
- Update `package.json` script: `playwright test --config playwright.config.ts` (drop `--project=cross-service` — it's the only project now)
- Run `pnpm install` to generate `pnpm-lock.yaml`
- Tests: `pnpm test:e2e` (playwright)

---

## Running from Root (no workspace needed)

```sh
pnpm --dir backend test
pnpm --dir pretzel test
pnpm --dir pretzel-console test
pnpm --dir e2e test:e2e

# backend db scripts
pnpm --dir backend db:setup
pnpm --dir backend check-db
```

---

## What Is Not Changing

- Each package's internal source, configs (`vite.config.ts`, `tsconfig.json`, `vitest.config.ts`, `drizzle.config.ts`), and dependencies
- The per-package playwright configs in `backend/`, `pretzel/`, and `pretzel-console/`
- The `e2e/` folder structure (`global-setup.ts`, `global-teardown.ts`, `extension/` tests, `.env.e2e`)
