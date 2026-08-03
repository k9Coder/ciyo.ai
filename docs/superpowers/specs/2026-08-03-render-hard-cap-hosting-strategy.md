---
status: active
owner: repository
verified_at: 2026-08-03
sources:
  - docs/CURRENT_STATE.md
  - docs/ENVIRONMENT_AND_SECRETS.md
  - docs/superpowers/specs/2026-08-02-gcp-migration-design.md (deferred — see there for why)
---

# Hosting Strategy: Render Hard Cap, With Triggers For When to Outgrow It

## Why this instead of the GCP migration

No usage-metered cloud (GCP, AWS, Azure, Fly.io) has an enforceable hard spending cap — only after-the-fact budget alerts, which can lag hours behind an actual spike. The requirement here is a **guaranteed** ceiling, not a probable one. Render's per-service pricing is flat-rate, not metered by traffic — the bill can't spike from a burst of requests or a bug, only from deliberately adding or upgrading a service yourself. That's a real guarantee, not a mitigated risk.

Trade-off, stated plainly: Render at low traffic isn't necessarily cheaper than a well-configured GCP setup, and it won't scale as gracefully or as cheaply at high traffic. This is the right choice for right now — pilot-stage, cost-certainty-over-elasticity — not a permanent architecture decision. The triggers section below defines when that trade-off flips.

## Target state (the actual $7/mo mapping)

| Service | Plan | Cost | Why |
|---|---|---|---|
| `backend`, production | Render **Starter** | $7/mo | Only service that needs always-on (no cold start on auth/API calls) and has a public production audience |
| `backend`, staging | Render **Free** | $0 | Cold start on 15-min idle is fine — not customer-facing |
| `pretzel-console`, prod + staging | Render **static site** | $0 | Static sites never spin down on Render regardless of plan — no reason to pay here at all |
| Postgres | Neon **Free tier** | $0 | Already the case, already external to Render — unaffected either way |
| `mykka-web`, prod + staging | Vercel — **plan TBD, see below** | $0 or more | Needs verification, see Task 1 |

**Total guaranteed floor: $7/month**, assuming `mykka-web` stays on a plan with no metered overage exposure (see Task 1).

## The open question: Vercel

This plan only re-examined Render. `mykka-web` is still on Vercel, and Vercel's *Hobby* tier has the same hard-cap character as Render's free tier — no card on file, hard resource ceilings, throttles instead of billing. But Hobby's terms disallow commercial use, and if `mykka-web` is already on **Pro** ($20/mo base + metered overage), that alone blows the $10 total budget and reintroduces the exact "no guaranteed ceiling" problem this whole pivot was about avoiding — just on Vercel instead of GCP. Task 1 below checks this before anything else, because it changes the target total.

## Setup tasks

### Task 1: Audit current spend on both platforms (do this first — it determines everything else) — ✅ done 2026-08-03

- [x] Render dashboard → checked `backend` (prod), `backend` (staging), `pretzel-console` (prod), `pretzel-console` (staging). **Findings:** everything is on Free tier today, no payment method on file at all (Render's own UI: "enter your payment information to select an instance type with higher limits"). Both `pretzel-console` services are static sites (free by nature, not a "plan" to right-size). No Render Postgres add-on found — confirmed Neon-only. Real current spend: **$0**, and literally un-billable with no card attached.
- [x] Vercel dashboard → `mykka.ai` and `staging.mykka.ai` confirmed on **Hobby** (free, no card, hard-capped by nature). Nothing to change here.
- [x] Reported back — since prod backend is Free (not Starter), the actual open item isn't "reduce cost," it's "prod backend cold-starts after 15min idle (30-60s first-request delay) — worth $7/mo to fix?" User chose yes. That's Task 2 below.

### Task 2: Right-size Render to the target state

- [ ] Render dashboard → `backend:master` (production) service → click **"enter your payment information"** (shown next to the greyed-out "Update" button on the Instance Type row) or the **Upgrade** button top-right → add a card.
- [ ] Back on `backend:master` → Settings → General → Instance Type → select **Starter** (0.5 CPU / 512MB) → click **Update**.
- [ ] Confirm the "Free" badge next to the service name at the top of the page now reads **"Starter"**.
- [ ] Leave `backend:staging` and both `pretzel-console` services untouched — they stay on Free, no card needed for them specifically (the card is now on the account, but these services aren't upgraded).
- [ ] Verify: Render's account billing page should show a predictable **$7/mo**, one line item.

### Task 3: Resolve the Vercel question

Depends on Task 1's finding:
- **If Hobby already:** nothing to do, this is already a $0 hard-capped service. Move on.
- **If Pro and not load-bearing:** downgrade to Hobby.
- **If Pro and load-bearing:** two options — (a) accept Vercel Pro's $20/mo base as a known flat cost, which pushes the realistic total to ~$27/mo (still bounded and predictable, just over the original $10 target — worth an explicit conversation about whether $10 was a hard ceiling or a starting aspiration), or (b) configure Vercel's **Spend Management** feature (pauses/limits resource usage once a configured spend threshold is hit) to put a real ceiling on the metered-overage portion specifically. Vercel's Spend Management is the Vercel-side equivalent of what GCP's budget-guard was trying to approximate — check whether it's available on your current plan tier before assuming it solves this.

### Task 4: Fix the known stale config while we're touching deploy config anyway

`pretzel-console/.env.prod` has `VITE_API_BASE=https://api.ciyo.ai` — a pre-rebrand domain that predates the current `api.mykka.ai`. This was already flagged in the deferred GCP spec and applies regardless of hosting platform — fix it before the next production console build:
- [ ] Edit `pretzel-console/.env.prod` (gitignored, local-only file): change `VITE_API_BASE` to `https://api.mykka.ai`.

## Triggers: when to upgrade Render, and when to actually migrate

Two different decisions here — don't conflate them. Upgrading the Render plan is a five-minute dashboard change. Migrating to GCP/AWS/elsewhere is the multi-week effort already scoped in the deferred plan. Move up one step at a time; don't jump straight to a cloud migration because one metric looks scary.

| Signal | Threshold | Action |
|---|---|---|
| Backend response latency or Render's own CPU/memory graphs | Sustained >80% memory or CPU utilization on the Starter plan, or visible request queuing under normal (non-attack) load | Upgrade `backend` prod to Render **Standard** ($25/mo, 2GB/1vCPU) |
| Concurrent traffic | Rough proxy: sustained tens of requests/second, or enough real signed-up users that a single 0.5vCPU instance is the bottleneck, not the database or external APIs | Same — Standard tier first, before considering anything more drastic |
| Total Render spend across all services | Approaching or exceeding ~$50-100/mo because multiple services each need Standard-or-higher tiers | This is the point where a pay-per-use, autoscaling cloud setup (the deferred GCP plan, or AWS/Railway) starts being genuinely more cost-effective *and* the traffic level justifies the engineering time to build it properly |
| Infrastructure needs beyond what Render's simple plans offer | Need multi-region deployment, custom networking/VPC, managed autoscaling beyond "pick a bigger box," GPU workloads, or fine-grained IAM | Migrate — Render doesn't offer these at any tier; this is a capability gap, not a cost one |
| Business/compliance requirements | A specific enterprise customer or compliance framework (SOC2 infra attestations, data residency) requires a named cloud vendor | Migrate — driven by the requirement, not by cost math |
| Revenue reality check | Before spending real engineering time on any migration: is there enough paying-customer traffic to justify it, or is this pre-revenue/pre-PMF speculative infra work? | If the latter, stay on Render regardless of what the other signals say — the deferred GCP plan will still be there when it's actually needed |

When a migration trigger fires: `docs/superpowers/specs/2026-08-02-gcp-migration-design.md` and `docs/superpowers/plans/2026-08-02-gcp-migration.md` are still fully valid starting points (status: deferred, not stale) — re-read them, confirm the specifics (traffic assumptions, budget ceiling) still match reality at that point, and resume from there rather than redesigning from scratch. `deploy/gcp/` already has working Cloud Run YAMLs and a budget-guard Cloud Function ready to extend.
