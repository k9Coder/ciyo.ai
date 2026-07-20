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
  - e2e/playwright.config.ts
---

# mykka.ai

mykka.ai is a browser-based data-loss-prevention product for AI prompts. Administrators configure detection policy in Pretzel Console; the Pretzel Chrome extension enforces the published policy on ChatGPT, Claude, and Gemini.

## Repository

This repository contains five independently installed pnpm projects. It is **not** currently configured as a pnpm workspace.

| Directory | Purpose |
|---|---|
| `backend/` | Fastify API, PostgreSQL/Drizzle data model, policy compiler, billing, analytics, and assistant |
| `pretzel/` | Chrome Manifest V3 extension and local detection engine |
| `pretzel-console/` | React/Vite administration SPA |
| `mykka-web/` | Next.js marketing website |
| `e2e/` | Cross-package Playwright harness |

The root `package.json` is a thin command launcher. Some root recursive/filter commands are currently invalid because no `pnpm-workspace.yaml` exists; see [Known Issues](docs/KNOWN_ISSUES.md).

## Start Here

- [Documentation index](docs/index.md)
- [Current state](docs/CURRENT_STATE.md)
- [Repository topology](docs/reference/repository-topology.md)
- [Verified commands](docs/reference/commands.md)
- [Local development](docs/operations/local-development.md)
- [Known issues](docs/KNOWN_ISSUES.md)

## Basic Setup

Install each project independently:

```powershell
cd backend; pnpm install
cd ..\pretzel; pnpm install
cd ..\pretzel-console; pnpm install
cd ..\mykka-web; pnpm install
cd ..\e2e; pnpm install
```

Then follow [Local Development](docs/operations/local-development.md). Do not use production credentials in committed environment files.

## Documentation Authority

Current code, tests, manifests, migrations, and deployment configuration outrank prose. Active documentation lives in `docs/`, package READMEs, package `AGENTS.md` files, and selected `company/` routing files. Historical plans, reviews, meetings, and scans live under `docs/archive/` and are not current-state references.
