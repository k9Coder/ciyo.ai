---
status: draft
owner: QA
verified_at: 2026-07-31
sources:
  - AGENTS.md
  - e2e/README.md
  - docs/operations/testing.md
  - docs/CURRENT_STATE.md
  - pretzel-desktop/playwright.config.ts
  - pretzel-console/e2e/auth.setup.ts
  - ~/.claude/skills/gstack/qa/SKILL.md
  - ~/.claude/skills/gstack/qa/templates/qa-report-template.md
---

# Manual QA Suite Design

## Problem

The repository has one Playwright configuration, `e2e/`, which is a developer
regression gate: it truncates and reseeds a disposable database, spins up
local dev servers, and asserts narrow, deterministic behavior before a PR
merges. There is no suite that simulates a human QA hire exercising the whole
deployed product — console, marketing site, browser extension on real AI
sites, desktop app, and backend API — against a real staging or production
URL, the way a company would run manual QA before promoting a release.

## Goals

- Cover all five product surfaces: `pretzel-console`, `mykka-web`, `pretzel`
  (extension, tested against real ChatGPT/Claude/Gemini), `pretzel-desktop`,
  and the backend API.
- Run against real deployed environments (staging, and a prod smoke subset),
  never against a database the suite is allowed to truncate.
- Combine two testing modes: repeatable scripted journeys for regression
  coverage, and agent-driven exploratory bug-hunting for judgment-based
  coverage neither of us thought to script.
- Produce QA-report output (health score, severity-tagged issues,
  screenshots) rather than bare pass/fail — a document readable by a human
  deciding whether to ship.
- Reuse existing infrastructure instead of duplicating it.

## Non-goals

- Replacing `e2e/`. That suite keeps its job: fast, deterministic, pre-merge,
  local, seeded-DB regression testing.
- Building a new browser-automation agent. gstack's `/qa` and `/qa-only`
  skills already do URL-driven exploratory testing with health scoring and
  structured reports; this design wires into them instead of re-implementing
  that engine.
- CI wiring. Per `AGENTS.md`, CI test runs are currently disabled repo-wide;
  this suite is invoked manually (by a human or an agent) the same way `e2e/`
  currently is.

## Existing infrastructure this builds on

- **`e2e/`** (`e2e/playwright.config.ts`, `e2e/README.md`): unified
  multi-project Playwright pattern (one config, one project per surface),
  `.env.e2e` convention, `pretzel-console/e2e/auth.setup.ts` Clerk
  storageState pattern. `qa/` follows the same project-per-surface shape but
  targets external URLs instead of spinning up local servers or seeding a DB.
- **`pretzel-desktop/playwright.config.ts` + `pretzel-desktop/tests/e2e/`**:
  existing `_electron.launch()` pattern for testing the Electron app
  directly, no URL involved. `qa/journeys/desktop/` reuses this pattern
  rather than inventing a new one.
- **gstack `/qa` and `/qa-only` skills** (`~/.claude/skills/gstack/qa/`):
  general-purpose, project-agnostic agent-driven QA. Given a URL, they
  browse like a real user, compute a per-category health score, and write a
  structured markdown report (`qa-report-template.md`) to
  `.gstack/qa-reports/`, including a "Regression Tests" section for
  promoting a confirmed bug into a permanent test file. This design treats
  that as the exploratory half of manual QA and does not reimplement it.

## Architecture

New top-level folder `qa/`, sibling to `e2e/`.

```
qa/
  playwright.config.ts        # one config, one project per surface
  .env.qa.example             # committed template
  .env.qa.staging             # gitignored — real URLs + test creds
  .env.qa.prod                # gitignored — prod smoke subset only
  journeys/
    web/         *.spec.ts    # marketing site: nav, forms, links, responsive
    console/     *.spec.ts    # admin UI: policy editor, members, billing, publish
    extension/   *.spec.ts    # loaded into a persistent Chrome profile, real AI sites
    desktop/     *.spec.ts    # Electron _electron.launch(), local build
    api/         *.spec.ts    # backend endpoints hit directly: contracts, error shapes
  support/
    auth/                     # storageState / persistent-profile helpers per surface
    reporter/                 # custom Playwright reporter -> QA report doc
  README.md
```

### Journeys, not clicks

Each spec under `qa/journeys/<surface>/` is one real, end-to-end business
flow a human QA would run by hand — e.g. "sign up, create a policy, publish
it, confirm the extension blocks a matching prompt on real chatgpt.com" — not
an isolated assertion. Journeys are self-contained: each creates whatever
tenant/policy/test data it needs through the product's own UI or API and
cleans up after itself, because this runs against shared staging state, not
a disposable seeded database.

### Per-surface specifics

- **web / console / api**: standard Playwright page/APIRequestContext usage
  against base URLs read from `.env.qa.<target>`.
- **console auth**: a `qa/support/auth/` setup project writes a Clerk
  storageState once per run, same pattern as
  `pretzel-console/e2e/auth.setup.ts`, using a test account's credentials
  from the env file — not the seeded E2E test tenant.
- **extension**: `launchPersistentContext` against a real, persistent Chrome
  profile that a human logs into by hand once (ChatGPT, Claude, Gemini).
  The unpacked `pretzel/dist` build loads into that profile. This is the one
  piece of the suite that needs periodic manual re-authentication —
  documented as a known maintenance cost in `qa/README.md`, not solved by
  automation (real-site login automation is fragile and risks ToS issues).
- **desktop**: no URL. `_electron.launch()` runs a local build, matching
  `pretzel-desktop/tests/e2e/`. The "link" supplied for this surface is the
  update-feed/download URL, consumed by exactly one journey that verifies
  update-check behavior; all other desktop journeys exercise the local
  build directly.

### Environment configuration

`.env.qa.<target>` (staging, prod) holds, per surface: base URL and test
account credentials. Copied from a committed `.env.qa.example`. No global
setup/teardown that seeds or truncates a database — each journey owns its
own data lifecycle. This mirrors "a new QA hire is handed a set of links and
logins for the environment under test," which is the operating assumption
requested for this suite.

## Reporting

Scripted journeys keep Playwright's normal failure artifacts (trace,
screenshot, video) for local debugging. In addition, a custom reporter under
`qa/support/reporter/` composes a QA report using the same structure as
gstack's `qa-report-template.md` (health-score categories, severity-tagged
issue list) and writes it to `.gstack/qa-reports/` — the same directory
`/qa` and `/qa-only` already use. One report format and one location
regardless of whether a finding came from a scripted journey or an
exploratory run.

## Full pre-release QA cycle

1. Run scripted journeys against staging: `pnpm test:qa` from `qa/` (or
   `--project=console`, `--project=extension`, etc.) — fast regression
   baseline, pass/fail plus a QA-report rollup.
2. Run `/qa-only <staging-url>` per surface for exploratory bug-hunting —
   catches issues nobody scripted yet.
3. Any confirmed bug from step 2 worth guarding permanently gets promoted
   into a new spec under `qa/journeys/<surface>/`, using the same
   "Regression Tests" promotion path already built into the gstack report
   template.
4. Both scripted and exploratory reports land in `.gstack/qa-reports/`, one
   index.

`e2e/` is untouched by this design and keeps its existing job as the
pre-merge developer regression gate.

## Open items for the implementation plan

- Exact custom-reporter implementation (Playwright reporter API mapping
  results to the QA-report template's health-score rubric).
- Which specific journeys constitute the initial scripted set per surface
  (to be enumerated during planning, not in this design).
- Extension persistent-profile re-authentication runbook (how often, who
  does it, where the profile directory lives).
- Prod-smoke subset selection criteria (which staging journeys are safe to
  also run, read-only, against production).
