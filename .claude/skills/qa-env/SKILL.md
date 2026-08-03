---
name: qa-env
description: Resolve a target environment (local | staging | prod) to a URL, stand up the local Docker stack if needed, then hand off to /qa or /qa-only.
allowed-tools:
  - Bash
  - Read
  - AskUserQuestion
  - Skill
triggers:
  - qa-env
  - qa local
  - qa staging
  - qa prod
---

# /qa-env: Environment-aware QA launcher

Thin wrapper around the existing `/qa` and `/qa-only` skills. It does not test
or fix anything itself — it only resolves **which environment** to point
those skills at, and (for `local`) makes sure that environment is actually
running first.

## Parse the request

`/qa-env <local|staging|prod> [console|web|backend] [--report-only]`

- Environment: `local`, `staging`, or `prod`. If missing, ask via
  `AskUserQuestion` (options: Local Docker stack / Staging / Production).
- Surface: which service to point `/qa` at. Default `web` (mykka-web) for
  `local`; default `console` for `staging`/`prod` (matches existing
  `qa/` package convention — see `qa/README.md`, `qa/.env.qa.example`).
- `--report-only`: use `/qa-only` instead of `/qa` (never fixes code). Prod
  QA where testing is not explicitly "fix mode" should default to
  `--report-only` unless the user says otherwise.

## Resolve the target URL

### local

1. Run `scripts/local-env.sh status` (`docker compose ps`). If the stack
   isn't up, run `scripts/local-env.sh up` — this builds/starts
   `postgres`, `backend`, `pretzel-console`, `mykka-web`, and waits for
   `backend`'s `/health` to respond before returning.
2. Resolve the target URL from the requested surface:
   - `web` → `http://localhost:3001`
   - `console` → `http://localhost:5173`
   - `backend` → `http://localhost:3000`
3. Note for the user: `pretzel-desktop` and the `pretzel` extension aren't
   part of this stack. If asked to QA either, tell the user to run them
   natively first (`PRETZEL_API_URL` / `VITE_API_BASE` =
   `http://localhost:3000`) — see `docs/operations/local-development.md`.
4. Console auth works end-to-end: `scripts/local-env.sh up` seeds a real
   test org, so `/qa`'s auth parameter can sign in with
   `testuser@gmail.com` / `TESTuser` and reach authed pages (dashboard,
   policies, etc). Ignore CSP-blocked `clarity.ms` / `cdn.logr-in.com` /
   `clerk-telemetry.com` console errors — pre-existing analytics-only gaps
   tracked in `docs/KNOWN_ISSUES.md`, not real defects.

### staging / prod

Mirrors the existing `qa/` package's environment convention
(`qa/.env.qa.example`, `qa/README.md`) instead of hardcoding URLs that drift:

1. Look for `qa/.env.qa.staging` (or `qa/.env.qa.prod` for prod). If present,
   read `QA_CONSOLE_URL` from it — that's the console target.
2. If the file doesn't exist or the surface requested isn't `console`, ask
   the user for the URL via `AskUserQuestion` rather than guessing — this
   repo's docs disagree with each other on exact staging hostnames
   (`docs/superpowers/specs/2026-07-23-desktop-auth-design.md` says
   `pretzel-console-staging.onrender.com`; `qa/.env.qa.example` says
   `staging-console.mykka.ai`), so do not silently pick one.
3. For `prod`, the production web/API domains are consistent across the
   codebase (`mykka-web/lib/env.ts`, READMEs): `https://mykka.ai` (web),
   `https://app.mykka.ai` (console), `https://api.mykka.ai` (backend). Safe
   to use these as defaults, but still confirm with the user before running
   fix-mode `/qa` (not `/qa-only`) against prod — that's a live-site
   mutation risk.

## Hand off

Once the URL is resolved, invoke the `Skill` tool:

- `qa` with the resolved URL as the target, if fixing.
- `qa-only` with the resolved URL as the target, if `--report-only` (or
  environment is `prod` and the user hasn't explicitly asked to fix).

Do not duplicate `/qa`'s own setup, tiering, or fix logic here — this skill's
only job is picking the right URL and, for `local`, making sure it's alive.
