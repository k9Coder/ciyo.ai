---
status: draft
owner: QA
verified_at: 2026-08-01
sources:
  - qa/ manual smoke run against staging.mykka.ai, pretzel-console-staging.onrender.com, backend-staging-hejs.onrender.com (2026-07-31)
  - mykka-web/components/layout/Header.tsx
  - mykka-web/components/layout/Footer.tsx
  - mykka-web/lib/config.ts
  - mykka-web/lib/env.ts
  - docs/KNOWN_ISSUES.md
---

# QA Findings — Action Items (2026-08-01)

Punch list from the first manual QA pass against the three staging URLs
(`staging.mykka.ai`, `pretzel-console-staging.onrender.com`,
`backend-staging-hejs.onrender.com`). Each task lists exactly how to do it
and who can actually do it — some of this needs dashboard/secret access
neither of us can substitute for.

| # | Task | Who | Why them |
|---|---|---|---|
| 1 | Fix broken staging sign-in/start-free CTA | **Yarin** | Needs Vercel dashboard access |
| 2 | Remove or build `/changelog` | **Claude** | Code-only fix, no secrets needed |
| 3 | Provision `qa/.env.qa.staging` | **Yarin** | Needs Clerk dashboard + staging secrets |
| 4 | Run console journeys for real | **Either** | Just needs #3 done first |
| 5 | Backend cold-start on first hit | **Split** | Retry = code; plan upgrade = money |
| 6 | Build remaining `qa/` surfaces (web, extension, desktop, api) | **Claude** | Implementation work, same pattern as console |
| 7 | Periodic `/qa-only` spot checks | **Either** | No setup needed, run anytime |

---

## 1. Fix broken staging sign-in / start-free CTA

**Who: Yarin.** Root cause is a Vercel project environment variable, not
anything in the repo — I can't change it.

Confirmed root cause: `mykka-web/components/layout/Header.tsx:58` and `:62`
build the "Sign in" and "Start Free" links from `APP_URL`
(`mykka-web/lib/config.ts:3`), which reads `NEXT_PUBLIC_APP_URL`
(`mykka-web/lib/env.ts:5,15`). That env var is set in the mykka-web Vercel
project's **staging** environment to `https://www.staging.mykka.ai`, which
doesn't resolve. It isn't set anywhere in this repo (`mykka-web/.env.staging`
holds an unrelated local-dev value) — it lives in the Vercel dashboard.

**How:**
1. Vercel dashboard → mykka-web project → Settings → Environment Variables → Preview/Staging environment.
2. Change `NEXT_PUBLIC_APP_URL` from `https://www.staging.mykka.ai` to `https://staging-console.mykka.ai` (matches the naming pattern used elsewhere: `qa/.env.qa.example`, `backend/src/env.ts:15`, `backend/src/app.ts:76`).
3. Redeploy the staging environment (or wait for the next push to trigger it).
4. Verify: `curl -sI https://staging-console.mykka.ai` should resolve, and clicking "Sign in" on `staging.mykka.ai` should land there instead of a DNS error.

## 2. Remove or build `/changelog`

**Who: Claude.** Pure code fix, no external access needed — say the word and I'll do it.

Confirmed: `mykka-web/components/layout/Footer.tsx:4` links `Changelog` to
`/changelog`, but no such route exists under `mykka-web/app` (confirmed via
search, zero matches). This isn't just a dead footer link — Next.js
prefetches it in the background on other pages too, so it throws a 404
network error on pages that have nothing to do with the changelog
(reproduced on `/`, `/pricing`, `/about` during this run).

**How (minimal, until there's real changelog content):** delete the
`['Changelog', '/changelog']` entry from `LINKS.Product` in
`Footer.tsx:4`.

**How (full fix, if changelog content exists or is wanted):** add
`mykka-web/app/changelog/page.tsx`.

This is also already tracked as a known issue in
[`docs/KNOWN_ISSUES.md`](KNOWN_ISSUES.md) (Low / Website links/assets row) —
closing this task should remove that row.

## 3. Provision `qa/.env.qa.staging`

**Who: Yarin.** Needs access to the staging Clerk dashboard and a decision
on which account is the dedicated QA tester — I have neither.

**How:**
1. `cd qa; copy .env.qa.example .env.qa.staging` (Windows) — file is gitignored, safe to fill in.
2. `QA_CONSOLE_URL=https://pretzel-console-staging.onrender.com`
3. `QA_CLERK_PUBLISHABLE_KEY` — from the Clerk dashboard for the staging instance (same one `pretzel-console-staging.onrender.com` uses), or from wherever that deployment's env vars are set.
4. `QA_CLERK_USER_EMAIL` / `QA_CLERK_USER_PASSWORD` — create (or designate) one dedicated QA test account in that Clerk instance. Don't reuse a real customer account, don't reuse the seeded `e2e/.env.e2e` Clerk user (that one belongs to the truncate-and-reseed `e2e/` suite, different Clerk instance/purpose).

## 4. Run console journeys for real

**Who: either of us**, once #3 is filled in. I can run it myself once the
file has real values — just tell me it's ready, or hand me the values
directly and I'll write the file (careful: don't paste real credentials
into chat if you'd rather I not see them — filling the file yourself is
fine too).

**How:**
```powershell
cd qa
pnpm exec playwright test --config playwright.config.ts --project=console-setup
pnpm exec playwright test --config playwright.config.ts --project=console
```
(Use the direct `pnpm exec` form, not `pnpm test:qa -- --project=...` — that
`--` passthrough silently drops the filter on this shell, see `qa/README.md`.)

Expected on a healthy staging deploy: both journeys pass,
`.gstack/qa-reports/qa-report-console-<date>.md` gets written with a
100/100 functional score.

## 5. Backend cold-start on first hit

**Split.**

- **Claude** can add a warm-up retry (hit `/health` once, retry on 5xx,
  before running real checks) when the `api` surface of `qa/` gets built —
  that's a follow-up plan, not done yet, folded into task 6.
- **Yarin** decides whether to upgrade the Render plan for
  `backend-staging-hejs` to avoid spin-down entirely — that's a cost
  tradeoff (Render's paid tiers don't idle-sleep), not something I should
  decide unilaterally.

Not urgent — this only matters once something runs against the backend
unattended (a person retrying manually barely notices a 503-then-200).

## 6. Build remaining `qa/` surfaces (web, extension, desktop, api)

**Who: Claude**, same way console got built — a design/spec pass, then a
plan, then implementation. `staging.mykka.ai` and
`backend-staging-hejs.onrender.com` are both confirmed reachable now, so web
and api are unblocked whenever you want to start one. Extension needs the
persistent-profile auth approach from the original design doc; desktop
needs a packaged build to launch against.

**How to start:** say which surface next (web is the natural next one — no
auth to design around, and today's run found real bugs on it) and I'll run
the same brainstorm → design → plan → execute cycle.

## 7. Periodic `/qa-only` spot checks

**Who: either**, no setup, no dependency on the rest of this list.

**How:**
```
/qa-only https://staging.mykka.ai quick
/qa-only https://pretzel-console-staging.onrender.com quick
```
(Backend isn't a good `/qa-only` target — it's a bare JSON API, not
browsable. Direct `curl` checks or the future `api` surface cover it
instead.)
