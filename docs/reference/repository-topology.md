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
---

# Repository Topology

| Path | Runtime | Main entry | Ownership |
|---|---|---|---|
| `backend/` | Node.js 20, Fastify | `src/index.ts`, `src/app.ts` | Backend |
| `pretzel/` | Chrome MV3, React/Vite | `manifest.config.ts`, `src/background/service-worker.ts`, `src/content/content-script.ts` | Extension |
| `pretzel-console/` | React/Vite SPA | `src/main.tsx`, `src/App.tsx` | Frontend |
| `mykka-web/` | Next.js App Router | `app/layout.tsx`, `app/page.tsx` | Marketing |
| `e2e/` | Playwright | `playwright.config.ts` | QA |
| `scripts/` | Shell/Node helpers | individual scripts | Platform |
| `company/` | Ownership and process docs | `INDEX.md` | Company operations |
| `docs/` | Canonical current docs and archive | `index.md` | Repository |

Each project has its own `package.json`, dependency installation, and lockfile. There is no pnpm workspace configuration.
