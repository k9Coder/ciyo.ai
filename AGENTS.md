---
status: current
owner: repository
verified_at: 2026-06-17
sources:
  - package.json
  - .github/workflows/e2e.yml
  - company/INDEX.md
  - docs/index.md
---

# Repository Instructions For LLMs

## Read Order

1. Read [docs/index.md](docs/index.md).
2. Read [docs/CURRENT_STATE.md](docs/CURRENT_STATE.md) and [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md).
3. Read the target package's `AGENTS.md` and `README.md`.
4. Read relevant code, tests, manifests, migrations, and workflows before making claims or edits.
5. Use [company/INDEX.md](company/INDEX.md) only to route specialist ownership.

## Authority Rules

1. Current executable code/config/tests outrank all Markdown.
2. Current operations docs outrank package summaries for commands and deployment.
3. Current architecture/reference docs describe implemented behavior.
4. `docs/ROADMAP.md` describes planned behavior only.
5. `docs/archive/` is historical and non-authoritative.
6. `company/staff/` defines ownership and review lenses, never technical reality.
7. If active documentation conflicts with code, update the documentation and record material defects in `docs/KNOWN_ISSUES.md`.

## Repository Shape

The repository has five independently installed pnpm projects: `backend`, `pretzel`, `pretzel-console`, `ciyo-web`, and `e2e`. There is no `pnpm-workspace.yaml`.

Primary E2E ownership is package-local:

```powershell
cd backend
pnpm test:e2e

cd ../pretzel
pnpm test:e2e

cd ../pretzel-console
pnpm test:e2e

cd ../e2e
pnpm test:e2e -- --project=cross-service
```

`e2e/playwright.config.ts` still contains a legacy multi-project config for
local compatibility, but CI uses the package-local runners above.

```powershell
cd e2e
pnpm test:e2e -- --project=cross-service
```

## Regression Rules

- DB schema/migration changes: run backend tests and relevant seeded E2E.
- Policy contract/compiler/resolver changes: run API, extension, and cross-service E2E.
- Auth/token changes: run backend auth/API tests and cross-service flows.
- Extension detection/adapters: run extension unit/E2E and document fail-open implications.
- Console route/API changes: run console tests and admin E2E.
- Documentation changes: run `pnpm docs:check` from the repository root.

## Editing Rules

- Preserve unrelated dirty-worktree changes.
- Do not treat archived plans or reviews as acceptance criteria.
- Keep current-state docs factual; put intended work in `docs/ROADMAP.md`.
- Add meaningful implementation gaps to `docs/KNOWN_ISSUES.md`.
- Package-specific instructions live in each package's `AGENTS.md`.
