# Production Readiness & Launch Cost Review — Summary
**Date:** June 11, 2026
**Attendees:** Ethan Cole (CEO), Marcus Webb (CTO), Ryan Kowalski (DevOps), Linda Park (CFO), Ben Cho (PM), Sofia Reyes (VP Sales), Priya Nair (Head of Marketing)
**Recorded by:** Nina Schulz (Finance & Ops)
**Full transcript:** [production-readiness-review_2026-06-11_full_transcript.md](production-readiness-review_2026-06-11_full_transcript.md)

---

## Can we deploy tomorrow?
- **Backend + Console + Marketing site:** YES — one day of configuration work
- **Extension:** SUBMIT tomorrow, LIVE in 1–5 business days (Google review timeline, not in our control)

## Infra decision

| Surface | Platform | Cost |
|---|---|---|
| Backend API | Render **Standard** (free tier sleeps — unusable) | **$25/month** |
| Database | Neon free tier (Render has no free Postgres) | **$0** |
| mykka.ai marketing | Vercel Hobby (keep as-is) | **$0** |
| console.mykka.ai | Render static (keep as-is) | **$0** |
| DNS | Cloudflare free — GoDaddy nameservers → Cloudflare | **$0** |
| Chrome Web Store | One-time, already paid | **$5 done** |
| **Total at launch** | | **$25/month** |

## Costs that appear later
- Month 4: Mailgun $15/month after free trial expires
- At 10K MAU: Clerk Growth $25/month
- When needed: Render Postgres Starter $7/month

## Pre-launch setup required
1. Cloudflare DNS (GoDaddy nameservers → Cloudflare; route all subdomains)
2. Stripe live account → create Starter + Business products → get `price_...` IDs
3. Mailgun account → get SMTP credentials
4. Clerk live keys → brand email templates → set webhook to `https://api.mykka.ai/webhooks/clerk`
5. Anthropic API key
6. Sentry 2 projects → get DSNs
7. All env vars in Render (backend) + Vercel (marketing) — see `production-deployment-guide.md`
8. Run DB migrations after first deploy
9. PayPal: set up after launch, don't block on it

## Key decisions
- Launch sequence: web stack first → extension submitted same day → marketing push when Chrome approves
- A, B, C, D from previous meeting: R&D roadmap; not launch blockers
- PayPal verification can take 24–48h; launch Stripe-only first

## Action items
| Owner | Item |
|---|---|
| Ryan Kowalski | Execute full launch checklist; set up Cloudflare DNS |
| Marcus Webb | Sign off on deploy |
| Priya Nair | Marketing push on standby pending Chrome extension approval |
| Nina Schulz | Calendar reminder for Mailgun $15/month budget item in month 4 |
