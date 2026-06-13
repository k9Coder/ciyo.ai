---
status: current
owner: QA
verified_at: 2026-06-13
sources:
  - e2e/playwright.config.ts
  - e2e/global-setup.ts
  - backend/package.json
  - pretzel/package.json
  - pretzel-console/package.json
---

# Testing

Each application package owns unit/component tests. The `e2e/` project owns the cross-package Playwright configuration.

## Unified E2E Projects

| Project | Specs |
|---|---|
| `api` | `backend/e2e/**/*.spec.ts` |
| `extension` | `pretzel/e2e/**/*.spec.ts` |
| `cross-service` | `e2e/extension/**/*.spec.ts` |
| `admin-setup` | Clerk auth setup |
| `admin` | `pretzel-console/e2e/**/*.spec.ts` |

Run from `e2e/`. The commands below forward project arguments through the
`test:e2e` package script. The equivalent direct form is
`pnpm exec playwright test --config playwright.config.ts --project=<name>`.

```powershell
pnpm test:e2e
pnpm test:e2e -- --project=api
pnpm test:e2e -- --project=extension
pnpm test:e2e -- --project=cross-service
pnpm test:e2e -- --project=admin
```

The extension must be built, backend must be available, admin must be available for admin tests, and `e2e/.env.e2e` must contain test-only credentials. Global setup seeds the database.

The current GitHub Actions E2E workflow has known command/install defects; see [Known Issues](../KNOWN_ISSUES.md).
