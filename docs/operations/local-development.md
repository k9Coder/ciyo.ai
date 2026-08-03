---
status: current
owner: platform
verified_at: 2026-06-13
sources:
  - scripts/set-env.mjs
  - backend/package.json
  - pretzel/package.json
  - pretzel-console/package.json
  - mykka-web/package.json
  - docker-compose.yml
  - scripts/local-env.sh
---

# Local Development

## Install

Install dependencies independently in `backend`, `pretzel`, `pretzel-console`, `mykka-web`, and `e2e`.

## Environment

From the repository root, `node scripts/set-env.mjs staging` copies staging files for backend and mykka-web. Pretzel and Pretzel Console use Vite modes directly.

## Start The Main Surfaces

```powershell
cd backend; pnpm dev
cd pretzel-console; pnpm dev:staging
cd mykka-web; pnpm dev
cd pretzel; pnpm build:staging
```

- Backend: `http://localhost:3000`
- Console: normally `http://localhost:5173`
- Website: `http://localhost:4000`
- Extension: load `pretzel/dist/` as an unpacked Chrome extension.

## Full Local Stack (Docker)

`scripts/local-env.sh up` brings up an isolated stack via `docker-compose.yml`: `postgres`, `backend`, `pretzel-console`, `mykka-web`. It waits for `backend`'s `/health` to report ready, runs DB migrations, then seeds a real logged-in-able console test org (skip with `up --no-seed`) before printing each service's local URL. `scripts/local-env.sh down` tears it back down (the `postgres_data` volume persists across runs by design).

| Service | URL |
|---|---|
| backend | `http://localhost:3000` |
| pretzel-console | `http://localhost:5173` — sign in with `testuser@gmail.com` / `TESTuser` |
| mykka-web | `http://localhost:3001` |
| postgres | `localhost:5432` |

Console auth works end-to-end in the container: real Clerk dev-instance key baked in (`docker-compose.yml`), CSP allowlists Clerk's frontend API (`pretzel-console/nginx.conf.template`), and the seeded test identity (`pretzel-console/e2e/.env.e2e`) matches an org the `up` step creates in the local DB — the same `testuser@gmail.com` identity `e2e/` uses. Seeding truncates the local DB, so don't run `pnpm seed:e2e` locally if you're relying on other local data.

`pretzel-desktop` (Electron) and `pretzel` (browser extension) are not containerized — GUI/extension automation doesn't containerize sanely for interactive QA. Run them natively against the dockerized backend instead:

```powershell
cd pretzel-desktop; $env:PRETZEL_API_URL = "http://localhost:3000"; pnpm dev
cd pretzel; $env:VITE_API_BASE = "http://localhost:3000"; pnpm dev
```

Use `/qa-env local` to bring the stack up and QA against it in one step; see `.claude/skills/qa-env/SKILL.md`.
