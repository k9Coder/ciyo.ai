# Production Cost Report

**Date:** 2026-06-10  
**Author:** Ryan Kowalski (DevOps)  
**Scope:** All infrastructure costs for running mykka.ai in production

---

## Infrastructure Map

| Component | Hosts on | Deploy method |
|---|---|---|
| Backend API (Fastify + Node.js) | **Render** | Docker image from GHCR, deployed via Render API on every `master` push |
| Admin Console (pretzel-console) | **Render** | Static site via Render deploy hook on every `master` push |
| Marketing site (mykka-web, Next.js) | **Vercel** | Auto-deploy via Vercel Git integration on every `master` push |
| Postgres database | **Render** | Managed Postgres, same region as backend |
| Docker image registry | **GHCR** (GitHub Container Registry) | Free, built in CI |
| Chrome extension | **Chrome Web Store** | Manual ZIP upload after GitHub Release created by tag |
| Auth | **Clerk** | External SaaS |
| Payments | **Stripe + PayPal** | External SaaS |
| Error tracking | **Sentry** | External SaaS (free tier) |
| Deploy notifications | **Discord webhook** | Free |

---

## Current Monthly Costs

### At launch (0 paying customers, ~5 internal users)

| Service | Tier | Cost/month | Notes |
|---|---|---|---|
| Render — Backend | **Standard** | $25 | 512 MB RAM, 0.5 vCPU. Do NOT use Free/Starter — those sleep after 15 min of inactivity, causing cold starts on API calls. |
| Render — Postgres | **Starter** | $7 | 256 MB RAM, 1 GB storage. Fine for < 1M rows. |
| Render — Console | **Free** | $0 | Static sites are free on Render, no sleeping. |
| Vercel — mykka-web | **Hobby** | $0 | Free for personal/small projects. Limits: 100 GB bandwidth, 6,000 build min/month. Fine pre-launch. |
| Clerk — Auth | **Free** | $0 | Free up to 10,000 monthly active users. |
| Sentry | **Developer** | $0 | Free: 5,000 errors/month, 10,000 performance events. More than enough. |
| SMTP (Mailgun) | **Trial** | $0 | Free: 5,000 emails/month for first 3 months. After 3 months: $15/month Flex plan. |
| GitHub Actions | **Free** | $0 | 2,000 min/month on free plan. Our CI uses ~5 min/deploy × ~20 deploys/month = 100 min. Well under limit. |
| Chrome Web Store | **One-time** | $5 once | Developer registration. Already paid or needs paying once. |
| GHCR (image storage) | **Free** | $0 | Free for public packages. Private packages: first 500 MB free. Our backend image is ~200 MB. Fine. |
| **Total** | | **~$32–47/month** | |

---

### Growth projections

| Stage | Orgs | MAU | Est. infra/month | Key driver |
|---|---|---|---|---|
| Launch | 0–10 | < 200 | $32–47 | Current stack |
| Early traction | 10–50 | 200–1,000 | $65–100 | Render backend → Standard ($25), Postgres → Basic ($20) |
| Growth | 50–200 | 1,000–5,000 | $130–200 | Render backend → Pro ($85), Clerk → Growth ($25) |
| Scale | 200–500 | 5,000–15,000 | $250–400 | Render → bigger instance, Clerk MAU charges, Vercel Pro ($20) |
| Enterprise tier | 500+ | 15,000+ | $500+ | Database read replicas, CDN, possibly migrate to AWS ECS |

---

## When to upgrade

| Trigger | Action |
|---|---|
| API response times > 500ms consistently | Upgrade Render backend to next tier ($85/month) |
| DB storage > 800 MB | Upgrade Render Postgres to Basic ($20/month, 10 GB) |
| Bandwidth > 90 GB/month on Vercel | Upgrade to Vercel Pro ($20/month) |
| Clerk MAU > 8,000 | Budget for Clerk Growth ($25/month at 10k MAU) |
| SMTP emails > 4,500/month after 3 months | Budget $15/month Mailgun Flex |
| Railway/Render cost > $100/month total | Evaluate AWS ECS Fargate migration (see `docs/todo/aws-readiness.md`) |

---

## Stripe and PayPal — Transaction Fees

These are NOT monthly charges — they are per-transaction percentages:

| Provider | Fee |
|---|---|
| Stripe | 2.9% + $0.30 per successful card charge |
| Stripe (international) | +1.5% |
| PayPal | 3.49% + $0.49 (fixed fee) |

At $99/month starter plan, Stripe takes ~$3.20 per renewal. At $299/month business plan, ~$9.00 per renewal.  
**This is expected — do not try to avoid these fees.** They are the cost of using Stripe/PayPal.

---

## Cost Control Checklist

- [ ] Confirm Render services are on `Standard` tier (not `Free` — that sleeps)
- [ ] Set a Render spend alert at $75/month to catch unexpected scale
- [ ] Confirm Vercel project is on Hobby, not Pro (no reason to pay until bandwidth limit hit)
- [ ] Set up Mailgun after 3-month trial expires — budget $15/month in month 4
- [ ] Monitor Clerk MAU monthly via Clerk dashboard

---

## One-time Costs to Launch

| Item | Cost | Status |
|---|---|---|
| Chrome Web Store developer registration | $5 | Needed once |
| Domain registration (mykka.ai) | Already paid | — |
| Render account setup | $0 | Account needed |
| Vercel account setup | $0 | Account needed |
| Clerk account setup | $0 | Account needed |
| Sentry account setup (2 projects) | $0 | Account needed |
| Mailgun account setup | $0 | Account needed |
| **One-time total** | **~$5** | |
