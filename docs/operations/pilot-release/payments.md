# Pilot Infrastructure & Cost Plan

**Written:** 2026-06-29  
**Author:** Marcus Webb (CTO)  
**Scope:** First-ever production release — all four packages (backend, pretzel, pretzel-console, mykka-web). Pilot duration: 1–3 months. 3 seats per pilot company.

---

## Decision Log

### Backend hosting — Fly.io (free)

Evaluated: Render Starter ($7/mo), AWS EC2 Free Tier, Fly.io, GCP Cloud Run, Railway.

**Choice: Fly.io free tier.**

- 3 shared VMs always-on, no cold starts, no expiry on free tier
- `flyctl deploy` from CI — same DX as Render
- AWS Free Tier (t2.micro, 12 months) is also $0 but requires nginx + PM2 + security groups — ops overhead not worth it for a pilot
- GCP Cloud Run has cold starts unless pinned (then ~$3/mo) — eliminated
- Supabase pauses after 1 week inactivity — eliminated for DB, same concern applies to any serverless option

### LLM — Groq (free)

Already coded in [backend/src/assistant/llm/groq.ts](../../../backend/src/assistant/llm/groq.ts). Ryan sets `LLM_PROVIDER=groq` + `GROQ_API_KEY` on Fly.io. Zero code change.

- Groq free tier: 6,000 requests/day, 30 req/min
- Pilot worst case: 10 companies × 5 prompts/day = 50 req/day — 120× under limit
- Cost: $0

**Risk:** Quality gap vs. Claude Sonnet 4.6 on complex policy reasoning. Monitor in week 1. If pilot users report bad assistant answers, flip `LLM_PROVIDER=anthropic` — 2-minute Fly deploy, no code change. Estimated Anthropic cost if switched: ~$15–40/month.

### Database — Neon (free)

Evaluated: Neon, Supabase, CockroachDB Serverless, ElephantSQL, Render free DB, Fly.io Postgres.

**Choice: Neon free tier.**

- 0.5GB storage, no expiry, native Postgres, built-in pgBouncer connection pooling
- Supabase: paused after 1 week inactivity → eliminated
- CockroachDB: Postgres-compatible but not native — Drizzle ORM edge cases not worth the risk on first prod deploy → eliminated
- ElephantSQL: 20MB limit → too small → eliminated
- Render free DB: **deleted at 90 days** — inside pilot window → eliminated
- Fly.io Postgres: valid if backend is on Fly.io (same network, no egress cost), but requires manual backup setup

**Note if using Fly.io for backend:** consider `fly postgres create` instead of Neon — same free tier, simpler networking between app and DB, no egress charges.

**Neon cold start caveat:** ~100–300ms delay on first query after long idle (connection pool proxy, not VM spin-up). Acceptable at pilot load.

---

## Cost Table

| Service | Purpose | Free tier | Pay? | Cost | Risk if skipped / free tier |
|---|---|---|---|---|---|
| **Domain (mykka.ai)** | Identity | Owned | Already paying | ~$15/yr | N/A |
| **Chrome Web Store** | Extension publish | None | **YES — one-time** | **$5 one-time** | 🔴 BLOCKER — extension can't be installed by anyone |
| **Privacy policy page** | CWS requirement + legal | mykka.ai/privacy (your own site) | No (just work) | $0 | 🔴 BLOCKER — CWS rejects submission without it |
| **LLM (Groq)** | AI assistant | 6K req/day free | **No** | **$0** | 🟡 Quality risk vs. Claude — monitor week 1 |
| **Backend (Fly.io)** | API server | 3 VMs always-on, no expiry | **No** | **$0** | ✅ No cold starts, free tier is production-grade at pilot scale |
| **Database (Neon)** | All persistent data | 0.5GB, no expiry, no pause | **No** | **$0** | 🟡 ~200ms cold start on first query after long idle |
| **Console + mykka-web (Vercel)** | Frontend hosting | Hobby: 100GB BW/mo | **No** | **$0** | ✅ Pilot volume nowhere near limits |
| **Auth (Clerk)** | Sign-in, webhooks, org management | 10,000 MAU free | **No** | **$0** | ✅ Pilot < 100 MAU |
| **Email (Resend)** | Welcome / org token emails | 3,000 emails/mo free | **No** | **$0** | ✅ Pilot sends < 50 emails |
| **Uptime monitor (Better Stack)** | Know when backend goes down | 1 monitor free | **No** | **$0** | 🟡 Low risk — you find out from users, not alerts |

### Summary

| | Amount |
|---|---|
| One-time cost | **$5** (Chrome Web Store developer account) |
| Monthly recurring | **$0** |
| Total for 3-month pilot | **$5** |

---

## Contingency Costs

If any free tier proves inadequate during pilot:

| Trigger | Action | Added cost |
|---|---|---|
| Groq assistant quality complaints | `LLM_PROVIDER=anthropic` on Fly.io | ~$15–40/mo |
| Fly.io reliability issues | Render Starter | +$7/mo |
| Neon 0.5GB storage hit | Neon Launch plan | +$19/mo |
| Clerk MAU > 10,000 | Upgrade Clerk | +$25/mo (very unlikely in pilot) |

All contingency switches are env var changes or plan upgrades — no code changes required.
