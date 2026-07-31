# Manual QA Suite

Scripted Playwright journeys that simulate a human QA hire exercising the
real, deployed product — not the `e2e/` suite's job. See
[`docs/superpowers/specs/2026-07-31-manual-qa-suite-design.md`](../docs/superpowers/specs/2026-07-31-manual-qa-suite-design.md)
for the full design and how this relates to `e2e/` and to gstack's `/qa` /
`/qa-only` skills.

## Current coverage

| Surface | Status |
|---|---|
| `pretzel-console` | Implemented — `journeys/console/` |
| `mykka-web` | Not yet implemented |
| `pretzel` (extension) | Not yet implemented |
| `pretzel-desktop` | Not yet implemented |
| backend API (direct) | Not yet implemented |

## What this is not

- Not a replacement for `e2e/`. `e2e/` truncates and reseeds a disposable
  database and runs against local dev servers as a pre-merge developer gate.
  This suite runs against a real deployed URL you supply, never touches a
  database directly, and is meant for pre-promotion / release-readiness
  checks.
- Not an exploratory bug-hunting agent. For that, use gstack's `/qa-only
  <url>` (report only) or `/qa <url>` (finds and fixes bugs) — both already
  installed globally and write to the same `.gstack/qa-reports/` directory
  this suite's reporter writes to.

## Setup

1. `cd qa; pnpm install; pnpm exec playwright install chromium`
2. Copy `.env.qa.example` to `.env.qa.staging` and fill in real values —
   a real staging console URL and a dedicated QA Clerk test account (ask
   whoever owns the staging Clerk instance; don't reuse a customer account
   or the seeded `e2e/.env.e2e` Clerk user).

## Run

```powershell
# Everything (auth setup, then all journeys)
pnpm test:qa

# Just the console surface
pnpm test:qa -- --project=console

# Reporter unit tests only — no staging credentials needed
pnpm test:qa -- --project=unit

# Prod smoke subset, once you have a .env.qa.prod
$env:QA_ENV_FILE = ".env.qa.prod"
pnpm test:qa
```

Reports land in `.gstack/qa-reports/qa-report-<surface>-<date>.md` — one
report per surface per run, same format whether the findings came from a
scripted journey here or an exploratory `/qa-only` run.

## Full pre-release QA cycle

1. `pnpm test:qa` against staging — fast regression baseline.
2. `/qa-only <staging-console-url>` (and other surfaces as they're added)
   for exploratory bug-hunting.
3. Promote any confirmed bug worth guarding permanently into a new spec
   under `qa/journeys/<surface>/`.
4. Re-run before promoting `staging` → `master`.

## Adding a journey

Each spec under `journeys/<surface>/` is one real, end-to-end business flow
— not an isolated click. It must create and clean up any data it needs
itself; this runs against shared staging state, not a disposable database.
Prefer read-only or self-cancelling actions (like the open-invite journey)
over anything that leaves lasting state when a full cleanup step isn't
practical.

## Known maintenance cost: extension auth (once extension coverage lands)

The extension surface (not yet implemented) will need a persistent,
manually-authenticated Chrome profile for real ChatGPT/Claude/Gemini
sessions, since automating login to those sites is fragile and risks their
terms of service. That profile needs periodic manual re-authentication —
there is no automated fix for this, it's a standing cost of testing against
real third-party sites.
