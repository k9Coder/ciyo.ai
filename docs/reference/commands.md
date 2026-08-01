---
status: current
owner: repository
verified_at: 2026-06-13
sources:
  - package.json
  - backend/package.json
  - pretzel/package.json
  - pretzel-console/package.json
  - mykka-web/package.json
  - e2e/package.json
  - qa/package.json
---

# Manifest-Backed Commands

These commands match current package manifests and configuration. They are not
all proven healthy: known runtime and CI failures are recorded in
[Known Issues](../KNOWN_ISSUES.md). Run package commands from the package directory.

| Task | Command |
|---|---|
| Backend dev | `cd backend; pnpm dev` |
| Backend tests | `cd backend; pnpm test` |
| Backend build | `cd backend; pnpm build` |
| DB migration | `cd backend; pnpm db:migrate` |
| Seed E2E | `cd backend; pnpm seed:e2e` |
| Extension staging build | `cd pretzel; pnpm build:staging` |
| Extension production build | `cd pretzel; pnpm build:prod` |
| Extension tests/typecheck | `cd pretzel; pnpm test; pnpm typecheck` |
| Console staging dev | `cd pretzel-console; pnpm dev:staging` |
| Console tests/typecheck | `cd pretzel-console; pnpm test; pnpm typecheck` |
| Website dev | `cd mykka-web; pnpm dev` |
| Website lint/build | `cd mykka-web; pnpm lint; pnpm build` |
| Unified E2E | `cd e2e; pnpm test:e2e` |
| E2E project | `cd e2e; pnpm test:e2e -- --project=api` |
| Manual QA suite (staging) | `cd qa; $env:QA_ENV_FILE=".env.qa.staging"; pnpm test:qa` |
| Manual QA project | `cd qa; pnpm test:qa -- --project=console` |
| Docs validation | `pnpm docs:check` |

Root recursive/filter scripts were previously listed as a known issue for lacking workspace configuration. A `pnpm-workspace.yaml` now exists at the repository root, but the root scripts' reliability under it has not been re-verified — see `docs/KNOWN_ISSUES.md`.

`pnpm test:e2e -- --project=api` forwards arguments through the package script.
The longer equivalent is
`pnpm exec playwright test --config playwright.config.ts --project=api`.
