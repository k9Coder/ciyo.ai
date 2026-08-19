# QA Test Plans (human + AI readable)

Manual, end-to-end test suites — one file per product surface. Unlike
`qa/journeys/` (executable Playwright specs) these are **plain-language test
plans**: title, description, preconditions, numbered steps, expected result.
They are meant to be run two ways:

1. **By a human QA hire** reading the steps against a real deployed URL.
2. **By gstack `/qa` / `/qa-only`** as a test-plan input — the skill reads the
   affected steps, drives the browser, and reports findings to
   `.gstack/qa-reports/`. Point it at one plan and give it a timebox:

   ```text
   /qa-only https://staging.app.mykka.ai — run qa/plans/pretzel-console-test-plan.md, timebox 20m
   /qa   https://staging.mykka.ai        — run qa/plans/mykka-web-test-plan.md, timebox 10m
   ```

   File names use the `*-test-plan-*.md` shape so gstack's Test Plan Context
   auto-discovery can also pick them up.

## Files

| Plan | Surface | Type | Default timebox |
|---|---|---|---|
| [mykka-web-test-plan.md](mykka-web-test-plan.md) | Marketing site (web) | Browser | 10 min |
| [pretzel-console-test-plan.md](pretzel-console-test-plan.md) | Admin console (web SPA) | Browser + Clerk admin auth | 20 min |
| [pretzel-desktop-test-plan.md](pretzel-desktop-test-plan.md) | Desktop app (Electron) | App + real sign-in | 20 min |
| [pretzel-extension-test-plan.md](pretzel-extension-test-plan.md) | Chrome extension (MV3) | Loaded extension + real AI hosts | 25 min |

All four ultimately exercise the **backend** (policy, auth, billing, audit), so
the backend needs no separate browser plan — a failure in any surface plan that
traces to the API is a backend finding. For direct API checks use `e2e/`
(`--project=api`).

## How to read a case

```
### <ID> — <Title>
**Priority:** critical | high | medium | low   **Timebox:** <n>m   **Auth:** <none|admin|member|device>
**Description:** one line — what real user goal this proves.
**Preconditions:** state the test needs before step 1.
**Steps:**
1. Concrete action (real URL, button label, field).
**Expected:** observable pass condition. Anything else is a finding.
```

## Timebox convention

Each suite has a **default timebox** (frontmatter `timebox_minutes`) and each
case a per-case budget. When `/qa` is told a total timebox, run cases in
priority order (critical → high → medium → low) and stop when the budget is
spent; report which cases were not reached rather than skipping silently.

## Environments

- **mykka-web:** local `http://localhost:4000`, staging, or prod `mykka.ai`.
- **pretzel-console:** local `http://localhost:5173`, or a staging console URL.
  Needs a dedicated QA Clerk admin account (see `qa/README.md` — never a
  customer account).
- **pretzel-desktop / pretzel-extension:** built artifact + the same QA account.
  Desktop and extension automation uses `PRETZEL_E2E=1` and the qa-bridge; see
  the gstack `/qa-desktop` and `/qa-extension` skills.

## Adding or promoting a case

When exploratory `/qa` finds a real bug worth guarding, add a case here first
(cheap, readable), then — if it's worth permanent CI-style coverage — promote it
to an executable spec under `qa/journeys/<surface>/`.
