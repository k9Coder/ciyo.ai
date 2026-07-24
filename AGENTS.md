---
status: current
owner: repository
verified_at: 2026-06-13
sources:
  - package.json
  - e2e/playwright.config.ts
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

The repository has five independently installed pnpm projects: `backend`, `pretzel`, `pretzel-console`, `mykka-web`, and `e2e`. There is no `pnpm-workspace.yaml`.

The unified Playwright configuration is `e2e/playwright.config.ts`. Run it from
`e2e/`. These script forms forward project arguments to Playwright:

```powershell
cd e2e
pnpm test:e2e
pnpm test:e2e -- --project=api
pnpm test:e2e -- --project=extension
pnpm test:e2e -- --project=cross-service
pnpm test:e2e -- --project=admin
```

## Regression Rules

- DB schema/migration changes: run backend tests and relevant seeded E2E.
- Policy contract/compiler/resolver changes: run API, extension, and cross-service E2E.
- Auth/token changes: run backend auth/API tests and cross-service flows.
- Extension detection/adapters: run extension unit/E2E and document fail-open implications.
- Console route/API changes: run console tests and admin E2E.
- Documentation changes: run `pnpm docs:check` from the repository root.

## Branch & Deploy Workflow

- `staging` is the default integration branch. Every fix, feature, or code change — unless the user explicitly says otherwise — starts on a new branch cut from `staging` and is merged via a PR whose base is `staging`.
- `master` is production. Do not target `master` with feature PRs. Periodically, `staging` is aligned into `master` via a promotion PR (`staging` → `master`); only the user decides when.
- Pushes to `staging` deploy backend and console to the Render staging environment; pushes to `master` deploy production. Tagged releases build the extension and desktop app (tag-triggered, works from whichever branch the tag's commit is reachable from — not restricted to `master`).
- Releasing pretzel-desktop (bump version → build → publish to Vercel Blob so `mykka.ai/download` updates): see [docs/operations/release-process.md](docs/operations/release-process.md). Two GitHub Actions workflows (`pretzel-desktop-full-release.yml`, `publish-desktop-blob-production.yml`) automate this — trigger manually from the Actions tab.
- CI secrets are environment-scoped (GitHub Environments `production`/`staging`); see [docs/ENVIRONMENT_AND_SECRETS.md](docs/ENVIRONMENT_AND_SECRETS.md).

## Editing Rules

- Preserve unrelated dirty-worktree changes.
- Do not treat archived plans or reviews as acceptance criteria.
- Keep current-state docs factual; put intended work in `docs/ROADMAP.md`.
- Add meaningful implementation gaps to `docs/KNOWN_ISSUES.md`.
- Package-specific instructions live in each package's `AGENTS.md`.
