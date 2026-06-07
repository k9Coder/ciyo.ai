# ciyo.ai — Monorepo Root

pnpm workspaces. Four packages: `backend/`, `pretzel/` (extension), `pretzel-console/` (admin web app), `ciyo-web/`.

## Cross-cutting E2E suite

The root `e2e/` folder contains the cross-package integration tests. The root `playwright.config.ts` runs all four projects from one place:

| Project flag | What it tests | Spec location |
|---|---|---|
| `--project=api` | Backend REST API | `backend/e2e/**/*.spec.ts` |
| `--project=extension` | Extension detection end-to-end | `pretzel/e2e/**/*.spec.ts` (via `extension/e2e/`) |
| `--project=cross-service` | AI rule → policy publish → extension enforces | `e2e/extension/**/*.spec.ts` |
| `--project=admin` | Admin web app UI flows | `pretzel-console/e2e/**/*.spec.ts` (via `admin/e2e/`) |

Run the full suite:
```
npx playwright test                          # all projects
npx playwright test --project=api            # API only
npx playwright test --project=cross-service  # AI full-flow only
```

## Regression rule

**Any change that touches logic shared across packages (policy schema, token format, DB schema, API contract) must pass the full cross-cutting E2E suite before merging.**

- Changed DB schema or migrations? → `pnpm seed:e2e` in `backend/`, then `npx playwright test`
- Changed `GET /v1/policy` response shape? → `--project=api` + `--project=cross-service` + `--project=extension`
- Changed assistant apply flow? → `--project=api --grep "assistant"` + `--project=cross-service`
- Changed token format or auth middleware? → `--project=api`

Each package also has its own `pnpm test` (vitest) and `pnpm test:e2e` — see the CLAUDE.md in each package for scope.

## Prerequisites to run the full suite

1. `backend/.env` — `DATABASE_URL` pointing to the **test** DB
2. `e2e/.env.e2e` — Clerk credentials, `E2E_DATABASE_URL`, `E2E_CLERK_ORG_ID`, etc. (gitignored)
3. `pnpm build` in `pretzel/` — extension must be built to `pretzel/dist/`
4. Backend server running: `cd backend && pnpm dev`
5. Admin app running (for admin project): `cd pretzel-console && pnpm dev`
6. Seed the test DB: `cd backend && pnpm seed:e2e`

`e2e/.env.e2e` is gitignored and must never contain production credentials.
