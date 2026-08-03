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

`scripts/local-env.sh up` brings up an isolated stack via `docker-compose.yml`: `postgres`, `backend`, `pretzel-console`, `mykka-web`. It waits for `backend`'s `/health` to report ready, then prints each service's local URL. `scripts/local-env.sh down` tears it back down (the `postgres_data` volume persists across runs by design).

| Service | URL |
|---|---|
| backend | `http://localhost:3000` |
| pretzel-console | `http://localhost:5173` |
| mykka-web | `http://localhost:3001` |
| postgres | `localhost:5432` |

`pretzel-desktop` (Electron) and `pretzel` (browser extension) are not containerized — GUI/extension automation doesn't containerize sanely for interactive QA. Run them natively against the dockerized backend instead:

```powershell
cd pretzel-desktop; $env:PRETZEL_API_URL = "http://localhost:3000"; pnpm dev
cd pretzel; $env:VITE_API_BASE = "http://localhost:3000"; pnpm dev
```

Known remaining gap: the containerized console's CSP still doesn't allowlist Clerk's domains, so Clerk-backed sign-in fails in that container even though it can now reach the local backend; see [Known Issues](../KNOWN_ISSUES.md).

Use `/qa-env local` to bring the stack up and QA against it in one step; see `.claude/skills/qa-env/SKILL.md`.
