# Pilot Release — Pre-Launch Tasks

**Written:** 2026-06-29  
**Author:** Marcus Webb (CTO)  
**Go-live gate:** ALL items below must be ✅ before any pilot company gets access.

See [payments.md](./payments.md) for infrastructure decisions and cost rationale.

---

## Ryan Kowalski (DevOps)

- [ ] Deploy backend to Fly.io — replaces Render. `flyctl launch` from `backend/`, configure `fly.toml`.
- [ ] Provision production database — Neon free tier (preferred) or `fly postgres create` if staying in Fly.io network.
- [ ] Run all Drizzle migrations against production DB before any user touches it.
- [ ] Set all production env vars on Fly.io:
  - `PILOT_MODE=true`
  - `LLM_PROVIDER=groq`
  - `GROQ_API_KEY`
  - `CLERK_WEBHOOK_SECRET`
  - `CLERK_SECRET_KEY`
  - `DATABASE_URL` (Neon or Fly Postgres connection string)
  - Internal service URLs between backend microservices
- [ ] Set Vercel env var: `NEXT_PUBLIC_PILOT_MODE=true` (mykka-web project).
- [ ] Configure Clerk **production** instance — webhook URL must point to Fly.io backend (`https://<prod-domain>/webhooks/clerk`), not localhost or staging.
- [ ] Configure DNS: domain → Vercel (mykka-web), API subdomain → Fly.io backend.
- [ ] Set up uptime monitor — Better Stack free tier (1 monitor). Alert goes to Marcus and Ryan.
- [ ] Create `privacy@mykka.ai` email alias — forwards to Marcus during pilot. Must exist before privacy page goes live.
- [ ] Confirm Neon DB backups enabled, or schedule a manual export before pilot start.
- [ ] Fix pretzel-console deploy job: repo secrets `RENDER_CONSOLE_PROD_DEPLOY_HOOK` (master) and `RENDER_CONSOLE_STAGING_DEPLOY_HOOK` (staging) were never created — the `Deploy pretzel-console` workflow's deploy step has failed on every run since June 2 (test job green as of PR #12, 2026-07-06; step now errors explicitly naming the missing secret). Either create the deploy hooks in the Render dashboard and `gh secret set` them, **or** — since Chloe's plan deploys the console to Vercel — retarget/remove the Render deploy step in `.github/workflows/pretzel-console-deploy.yml` as part of the Vercel migration. Decide one; don't leave CI permanently red.

---

## Arjun Mehta (Backend)

- [ ] Smoke test every production endpoint against the live DB after migrations run.
- [ ] Verify end-to-end in production: Clerk `user.created` fires → tenant auto-provisioned on `pilot` plan → org token returned correctly.
- [ ] Confirm 3-seat enforcement in production — attempt to add seat 4, expect block.
- [ ] Confirm AI 429 fires at prompt 6 for a tenant with 5 prompts used today.
- [ ] Confirm `GET /billing/status` returns `plan: "pilot"` and correct `assistantLimits` shape.
- [ ] Audit git history for any committed secrets (`ANTHROPIC_API_KEY`, `CLERK_*`, `DATABASE_URL`). If found, rotate immediately before go-live.

---

## Yuki Tanaka (Chrome Extension)

- [ ] **Register Chrome Web Store developer account — $5 one-time.** Do this today. CWS review takes 3–7 days; it's the longest lead-time item.
- [ ] Production build: verify `VITE_API_URL` (or equivalent) points to production backend, not localhost.
- [ ] Production Clerk publishable key baked into extension build.
- [ ] Prepare CWS listing: name, description, screenshots (min 1), category, privacy policy URL (`https://mykka.ai/privacy`).
- [ ] Submit extension to CWS only after privacy policy page is live at that URL (see Chloe's tasks below).
- [ ] Full end-to-end install test in production: install extension → sign in → paste something on ChatGPT → scan fires → event appears in console.

---

## Chloe Dubois (Frontend)

### Privacy policy page — complete before CWS submission

- [x] ~~Fix Section 7: remove "AWS eu-west-1", replace with accurate Fly.io/Neon/Vercel description~~ ✅ done 2026-06-29
- [x] ~~Remove Sentry from sub-processor table (not wired up for pilot)~~ ✅ done 2026-06-29
- [x] ~~Add note to Stripe row: "paid plans only; not active during the pilot period"~~ ✅ done 2026-06-29
- [ ] Add pilot plan retention note to Section 5: *"During the pilot program, scan event data is retained for the full duration of the pilot period."*
- [ ] After David Horowitz approves content: deploy mykka-web to Vercel **production** (not preview). Verify `https://mykka.ai/privacy` resolves and renders correctly.

### Console

- [ ] Deploy pretzel-console to Vercel with production Clerk publishable key and production API base URL.
- [ ] Verify full happy path in production: sign in → see org token → invite member → member accepts → member shows up in console → scan events appear.
- [ ] Confirm Settings page hides Billing section for pilot tenants (`billing.plan === 'pilot'`).
- [ ] Confirm pricing page on mykka-web shows pilot banner (not pricing tiers).

---

## Omar Hassan (Detection)

- [ ] Verify scan pipeline fires and records events correctly in production (real DB, real extension, real browser).
- [ ] Confirm keyword, pattern, and entropy rule types all work end-to-end in production.
- [ ] Confirm pilot tenants have a usable default state — either seed default rules or document clearly what the CISO must configure first. Pilot users should not open the console to an empty, confusing screen.

---

## Natasha Ivanova (QA)

- [ ] **Full E2E suite passes on staging before go-live.** Marcus will not approve launch without this sign-off.
- [ ] Manual smoke test in production — full happy path:
  1. CISO signs up
  2. Receives org token
  3. Installs Chrome extension manually (MDM not required for smoke test)
  4. Triggers a scan (paste sensitive text on ChatGPT)
  5. Event appears in console
  6. Sends 5 AI assistant prompts
  7. 6th prompt returns 429 with correct error message
- [ ] Test invite flow: CISO invites employee → employee signs up via invite link → employee appears as member in console.
- [ ] File any P0/P1 bugs to Ben Cho immediately. No pilot company gets access until all P0s are resolved.

---

## Ben Cho (PM)

- [ ] Draft pilot onboarding doc (1 page): how to get org token, how to install extension, what to do when something breaks, who to contact. Every pilot company gets this on day 1.
- [ ] Set up feedback channel — Slack shared channel or email alias that all pilot companies can reach.
- [ ] Agree on pilot participant list with Ethan before Ryan flips `PILOT_MODE=true`.
- [ ] Agree on what "pilot success" looks like before it starts — without criteria, we won't know when to convert to paid or extend.

---

## Marcus Webb (CTO)

- [ ] Name on-call person for week 1 of pilot. Someone reachable for production outages — not a full rotation, just a named person.
- [ ] Final read-through of privacy policy against what the product actually does. Approve for publish.
- [ ] Confirm `privacy@mykka.ai` is reachable (Ryan's task, but Marcus verifies it by sending a test email).
- [ ] No production secret in any git commit — run `git log -p | grep -iE "api_key|secret|password|token"` before go-live.

---

## David Horowitz (GC) — Legal Review

- [ ] Review privacy policy content (not implementation). Specifically:
  - GDPR/CCPA rights section enforceable given current team capacity to respond in 30 days
  - Data transfer mechanism (SCCs) correctly described for Fly.io/Neon/Vercel/Clerk/Groq mix
  - SOC 2 Q3 2026 language — confirm it's aspirational, not a contractual commitment
  - Overall policy consistent with what the product actually does
- [ ] Sign off before Chloe deploys the page to production.

Allow 2–3 business days for David's review. **This is on the critical path for CWS submission.**

---

## Go / No-Go Checklist (Marcus signs off)

Do not open pilot to any company until every item is checked:

- [ ] E2E suite passed on staging (Natasha signed off)
- [ ] Extension submitted to Chrome Web Store (can be in review, but submitted)
- [ ] Privacy policy live at `https://mykka.ai/privacy` (David approved, Chloe deployed)
- [ ] `privacy@mykka.ai` inbox works (Ryan created, Marcus tested)
- [ ] Production DB confirmed not on Render free tier
- [ ] All production env vars verified on Fly.io and Vercel
- [ ] On-call person named for week 1
- [ ] Full happy-path smoke test passed in production (Natasha signed off)
- [ ] Pilot participant list agreed with Ethan
- [ ] Onboarding doc ready (Ben)

---

## Critical Path (longest lead time first)

1. **Chrome Web Store registration + review** — Yuki registers today, submits once privacy policy is live. Review takes 3–7 days. **This determines the earliest possible pilot start date.**
2. **David Horowitz legal review** — 2–3 business days. Unblocks privacy policy deploy, which unblocks CWS submission.
3. **Fly.io deploy + DB + env vars** — Ryan. 1 day of work, can run in parallel with legal review.
4. **E2E suite on staging** — Natasha. Depends on Fly.io deploy being stable.
5. **Everything else** — parallel.
