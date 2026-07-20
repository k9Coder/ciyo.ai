# mykka.ai — Production Readiness & Launch Cost Review
### Meeting Transcript — June 11, 2026
**Attendees:** Ethan Cole (CEO), Marcus Webb (CTO), Ryan Kowalski (DevOps), Linda Park (CFO), Ben Cho (PM), Sofia Reyes (VP Sales), Priya Nair (Marketing)
**Recorded by:** Nina Schulz (Finance & Ops)
**Context:** Owner proposed specific infra setup. Team reviews whether it works, what it costs, and whether we can ship tomorrow.

---

**ETHAN:** Quick context before we start. I want to go lean on launch infra. Here's what I'm thinking: GoDaddy domain I already own, Render free tier for the backend, cheapest Postgres available, Cloudflare free tier for mykka.ai and the console at pretzel.mykka.ai, and the $5 Chrome Web Store registration. Can we ship on that setup? Marcus, you and Ryan are the ones who'll shoot this down if it doesn't work.

---

**MARCUS:** I'll let Ryan go first since he wrote the cost report, but I already know the answer on one of those.

---

**RYAN:** The Render free tier for the backend. That's a no. Full stop. The free tier — and the Starter tier at $7/month, same issue — those services spin down after 15 minutes of inactivity. When someone installs the extension and submits their first prompt to ChatGPT, the extension makes an API call to our backend to run the scan. If the backend is sleeping, that call blocks for 30 to 60 seconds while Render cold-starts the container. The user sees nothing happening. They assume the extension is broken. They uninstall. We never get that customer back.

---

**ETHAN:** Is there any way around that?

---

**RYAN:** Technically you could run a ping job every 10 minutes to keep the server awake. Some people do that. I'd rather not ship that. It's a hack that breaks the moment the interval drifts, and Render has explicitly said they're aware of it and may block it. The real answer is Standard tier — $25/month, always on, no sleeping. That's the minimum for a product that actually works.

---

**MARCUS:** Agreed. $25/month is non-negotiable. The entire product is API calls from the extension. If those fail or time out, we have no product.

---

**ETHAN:** Fine. $25 it is. What about Postgres?

---

**RYAN:** Render doesn't have a free Postgres tier anymore — they killed it in 2024. Cheapest Render option is $7/month, 256MB RAM, 1GB storage, which is fine for launch. BUT — if you want $0 for Postgres, there's Neon. Free tier: 512MB storage, no sleeping on the database side. I've used it. It's solid for early-stage. Downside is it's a separate vendor from Render, so the connection string management is slightly more manual. My recommendation: Neon free tier to start, migrate to Render Postgres at $7 when Neon's limits get close. Saves $7/month until you need it.

---

**LINDA:** So minimum monthly spend: $25 backend, $0 database on Neon, $0 everything else at launch. That's $25/month to run the product. Compare that to the $32–47 I had in the cost report — we shave it further by using Neon. Good.

---

**ETHAN:** What about Cloudflare for the two web surfaces?

---

**MARCUS:** Let me be precise here because it depends on which surface. The marketing site — mykka-web — is a Next.js app. Our deployment guide has it on Vercel because Vercel and Next.js are the same company. It just works, zero config. Cloudflare Pages does support Next.js but with one caveat: if we're using any server-side Next.js features — API routes, server components that hit external services — Cloudflare Pages handles those differently via Workers, and there can be edge cases. Ryan, do you know what we're using in mykka-web?

---

**RYAN:** Checked before this meeting. mykka-web is basically a static marketing site. No API routes, no dynamic server components that matter. It's Next.js used mostly as a static site generator with some styling. Cloudflare Pages would be fine. But Vercel Hobby tier is also free and zero-risk. My call: keep mykka-web on Vercel free. No cost, no migration risk, no edge cases to debug on launch day.

---

**MARCUS:** Agreed. Don't touch what's already configured to work.

---

**ETHAN:** And the console — pretzel.mykka.ai?

---

**RYAN:** pretzel-console is a React SPA. Pure client-side. Cloudflare Pages is perfect for this — it's literally what Cloudflare Pages is built for. Currently it's set up as a Render static site which is also free. Either works. I'd leave it on Render since it's already configured. One less vendor to manage at launch.

---

**ETHAN:** So to summarize the infra: $25/month Standard Render backend, Neon free Postgres, Vercel free for marketing, Render free static for console. GoDaddy domain I already own. One thing I want to confirm — the domain routing. How does api.mykka.ai point to Render? Does GoDaddy handle that directly or do I need Cloudflare?

---

**RYAN:** You have two options. GoDaddy DNS directly — you add a CNAME record pointing api.mykka.ai to the Render service hostname. That works. OR you point GoDaddy nameservers to Cloudflare (free), and let Cloudflare manage all DNS. I strongly recommend the Cloudflare option. Cloudflare DNS is faster, their proxy adds DDoS protection and hides your origin IP for free, and managing all subdomains in one place is cleaner. You'd set:
- `mykka.ai` → Vercel
- `console.mykka.ai` → Render console service  
- `api.mykka.ai` → Render backend service

All in Cloudflare DNS. GoDaddy just holds the registrar — nameservers point to Cloudflare. That's a 15-minute setup.

---

**ETHAN:** Do that. GoDaddy nameservers → Cloudflare DNS. Marcus, that's part of the launch checklist. Ryan owns it.

---

**RYAN:** Got it.

---

**ETHAN:** Okay. Now the real question. Code is done — or close enough. Infra costs are solved. Can I push a button tomorrow and have this live?

---

**MARCUS:** Technically the code can deploy tomorrow. The deployment pipeline is automated — push to master, Render deploys the backend and console, Vercel deploys the marketing site. That part is a non-issue. What's NOT automated and takes real time is external service configuration. Let me hand that to Ryan.

---

**RYAN:** I have a full deployment checklist in the production deployment guide. Here's the honest answer on timing. There are eight areas that need manual setup before anything is live and functional:

One — **GitHub Secrets**. Five secrets: Render API key, two service IDs, two console deploy hooks. Ten minutes once you have the Render dashboard open.

Two — **Render backend env vars**. This is the long list. Twenty env vars including Clerk live keys, Stripe live keys and price IDs, PayPal live credentials, Anthropic API key, SMTP credentials. If every account is already set up and you have every credential in front of you, this is an hour. If you need to create Stripe products and PayPal plans from scratch, add another hour.

Three — **Stripe**. Need to switch from test mode to live mode. Create Starter and Business subscription products. Get the `price_...` IDs. Configure the webhook endpoint pointing to `https://api.mykka.ai/billing/stripe/webhook`. Customer portal needs to be enabled.

Four — **PayPal**. Create a live app (not sandbox). Create Starter and Business subscription plans. Get the `P-...` plan IDs. Configure webhook. Set `PAYPAL_SANDBOX=false`.

Five — **Clerk**. Switch to live keys. Brand the email templates — right now they say "Clerk" not "mykka.ai." Set the webhook endpoint to `https://api.mykka.ai/webhooks/clerk`.

Six — **Mailgun**. You're on a free trial for 3 months, 5,000 emails/month. Need an account, need to get SMTP credentials. The welcome email, invite emails — none of those send without this. This is ten minutes to set up.

Seven — **DB migrations**. After the first deploy, someone needs to run `pnpm exec tsx src/db/migrate.ts` against the production database. If you skip this, the app crashes immediately because the tables don't exist.

Eight — **Sentry**. Two projects — one for the console, one for the extension. Get the DSNs. Not critical for launch but you want error tracking live before real users hit it.

---

**ETHAN:** How long total, assuming I clear a full day for it?

---

**RYAN:** If every account already exists and you have access to all dashboards: four to six hours for a careful first launch. If you're creating Stripe and PayPal accounts from scratch and going through their verification steps — those can take 24-48 hours for PayPal business verification specifically. Stripe is usually same-day.

---

**ETHAN:** Does PayPal verification actually block us?

---

**RYAN:** Only if a customer tries to pay via PayPal. Stripe works independently. You could launch Stripe-only and add PayPal after verification completes. Our billing code supports both but they're independent.

---

**MARCUS:** That's the right call. Launch Stripe, add PayPal when it's ready. No reason to block on PayPal verification.

---

**ETHAN:** Agreed. Stripe first, PayPal second. Ben — product side. Is the code actually ready to ship?

---

**BEN:** Backend is in good shape. The recent security fixes are solid — tenant isolation, webhook auth, all that work from the last sprint. One thing I want Marcus to confirm: the E2E suite. Does it pass clean?

---

**MARCUS:** The cross-cutting E2E suite passes. The extension E2E, API E2E, and admin E2E all pass as of the last commit. I signed off on the last PR specifically because the full suite was green. From a code quality standpoint, we're in a launchable state.

---

**ETHAN:** Extension. The Chrome Web Store. What's the timeline?

---

**RYAN:** This is the honest blocker on "launch tomorrow." You can submit the extension tomorrow. Google's review for first-time submissions takes 1 to 3 business days minimum. I've seen first submissions take up to a week if the reviewer has questions about permissions. We request some sensitive permissions — accessing page content on AI sites. That might trigger a manual review. You cannot control that timeline.

---

**MARCUS:** This means you have an asymmetry at launch. Backend, console, and marketing site can be live and functional tomorrow. The extension — the thing users actually install — takes a few days minimum after submission. Plan around that. Soft launch the web presence first, submit the extension at the same time, then do your real marketing push when the extension is approved and live in the store.

---

**PRIYA:** That's actually a better launch sequence anyway. We get a few days to have the website live and indexed before the extension drops. I can do a preview page, a waitlist, whatever — while the extension is in review. It's not a loss.

---

**ETHAN:** Good framing. We launch the web stack on day one, extension hits the store after Google's review. What about costs the owner hasn't accounted for that will surprise us?

---

**LINDA:** Three things. First: Anthropic API. The assistant feature — which is Business and Enterprise tier only — calls Claude Sonnet 4-6 every time an admin uses the AI policy assistant. Ryan's numbers put this under $2/month per Business tenant at normal usage. At launch with zero paying customers it's zero. It scales but stays under 1% of Business plan revenue. Not a surprise, just account for it.

Second: Mailgun after month three. The free trial covers 5,000 emails for 90 days. After that it's $15/month for the Flex plan. Low-cost, but it's a cost that appears in month four if you don't budget for it.

Third: Clerk at scale. Free up to 10,000 monthly active users. At 10,001 you're on their Growth plan at $25/month. That's a good problem to have — it means we have 10K active users — but it's a cliff, not a ramp.

---

**RYAN:** One more non-obvious one: GitHub Actions minutes. Our free plan gives 2,000 minutes/month. Our CI pipeline is about 5 minutes per deploy, and we deploy on every push to master. 2,000 / 5 = 400 deploys before we exceed the limit. That's fine unless we're pushing 20 times a day. Pre-launch, we won't hit it.

---

**ETHAN:** Sofia, from a sales perspective — does our launch setup affect what we can tell customers?

---

**SOFIA:** Two things matter to enterprise buyers. One: uptime guarantee. If we're on Render Standard, what's their SLA?

---

**RYAN:** Render Standard tier advertises 99.5% uptime. No SLA with penalty clauses — they're not an enterprise hosting provider. If a CISO asks for a 99.9% uptime SLA, we can't back that with Render Standard today.

---

**SOFIA:** So I can't promise SLAs to enterprise. That's fine for SMB and mid-market. Enterprise deals I'll route through the POC and custom contract phase anyway, by which time we'd have upgraded infra if needed. Second thing: data residency. We're on Render US East. If a European customer asks where their data lives, the answer is US.

---

**MARCUS:** Correct. European customers would need us to deploy to a Render EU region. That's a configuration change, not a rearchitecture. But it's not something we can promise on launch day.

---

**ETHAN:** Both of those are real but they're not launch blockers for our target market, which is US-based SMB and mid-market. We note them as constraints and handle them in Enterprise deals individually.

---

**MARCUS:** One last thing I want to make sure is on the checklist. The `CORS_ORIGIN` env var on the backend must be set to `https://console.mykka.ai` before launch. If that's wrong, the console can't talk to the API and everything 403s immediately. It's the kind of thing that's obvious in theory and takes 20 minutes to debug at 11pm on launch night. Ryan — that goes in the top of the checklist.

---

**RYAN:** Already there. It's in the deployment guide under required env vars. I'll add a big red flag to it.

---

**ETHAN:** Summary. Can we launch tomorrow?

---

**MARCUS:** Web stack: yes, if you spend the day on configuration. Extension: submitted tomorrow, live in 1 to 5 business days pending Google's review. Backend code is launch-ready.

---

**ETHAN:** What's the minimum we actually pay at launch?

---

**LINDA:** $25/month for Render Standard backend. Everything else is free at launch. If Neon free Postgres works, database is $0. Vercel free for marketing. Render free static for console. Clerk free. Stripe/PayPal pay only on transaction. Mailgun free for 90 days. Total fixed monthly cost to have a live product: **$25/month**.

---

**ETHAN:** That's it?

---

**LINDA:** That's it. Until you hit the Mailgun trial expiry in month four ($15), and until you hit 10K Clerk MAU ($25), and until Postgres needs upgrading. But at launch with zero customers: $25/month.

---

**ETHAN:** Cheaper than my gym membership. Alright. Launch sequence:

1. Ryan sets up Cloudflare DNS — GoDaddy nameservers → Cloudflare. All subdomains routed correctly.
2. Set up Stripe live account, create products, get price IDs. PayPal after — don't block on it.
3. Mailgun account, get SMTP credentials.
4. Clerk live keys, brand the emails, set webhook.
5. Anthropic API key.
6. Sentry two projects, get DSNs.
7. Fill all env vars in Render (backend) and Vercel (marketing).
8. Push to master, watch both Render and Vercel deploy.
9. Run DB migrations.
10. Smoke test: hit `/health`, open the console, open the marketing site.
11. Tag `pretzel-v1.0.0`, download ZIP from GitHub Release, upload to Chrome Web Store, submit.
12. Wait for Google review. When approved: Priya fires the marketing push.

Ryan, that checklist is already in the deployment guide. I want it confirmed line by line before we push. Marcus, you sign off on the deploy.

---

**MARCUS:** I'll be on it.

---

**ETHAN:** Regarding A, B, C, D from yesterday's meeting — SSO enforcement, audit export, seat reconciliation, scan limit tests — those go on the R&D roadmap. They are not launch blockers. They come in when they come in.

One more thing: that free trial on Mailgun runs out in 90 days. Nina, flag that as a $15/month budget item starting month four.

---

**NINA:** Noted. Calendar invite to Ethan and Linda in month three.

---

**ETHAN:** Good. We're done. Ryan owns the launch checklist execution. Marcus signs off on the deploy. Priya, you're on standby for the marketing push the moment the extension is approved.

---

*[End of recording — 41 minutes]*

---

**Distribution:** Ethan Cole, Marcus Webb, Ryan Kowalski, Linda Park, Ben Cho, Sofia Reyes, Priya Nair
**Recorded by:** Nina Schulz

---

## Meeting Summary

**Can we deploy tomorrow?**
- **Backend + Console + Marketing site:** YES — one day of configuration work
- **Extension:** SUBMIT tomorrow, LIVE in 1–5 business days (Google review, not in our control)

**Infra setup that works (not what owner initially proposed):**

| Surface | Platform | Cost |
|---|---|---|
| Backend API | Render **Standard** (NOT free — it sleeps) | **$25/month** |
| Database | Neon free tier (Render has no free Postgres) | **$0** |
| mykka.ai marketing | Vercel Hobby (keep as-is, not Cloudflare) | **$0** |
| console.mykka.ai | Render static (keep as-is) | **$0** |
| DNS | Cloudflare free (GoDaddy nameservers → Cloudflare) | **$0** |
| Chrome Web Store | One-time already paid | **$5 done** |
| **Total at launch** | | **$25/month** |

**Costs that appear later:**
- Month 4: Mailgun $15/month after free trial expires
- At 10K MAU: Clerk Growth $25/month
- When needed: Render Postgres Starter $7/month

**What still needs to be set up (before push to master):**
1. Cloudflare DNS (GoDaddy nameservers → Cloudflare, route all subdomains)
2. Stripe live account → create Starter + Business products → get `price_...` IDs
3. Mailgun account → get SMTP credentials
4. Clerk live keys → brand email templates → set webhook
5. Anthropic API key
6. Sentry 2 projects → get DSNs
7. All env vars in Render (backend) + Vercel (marketing) — see production-deployment-guide.md
8. Run DB migrations after first deploy
9. PayPal: do after launch, don't block on it

**A, B, C, D from previous meeting:** Added to R&D roadmap. Not launch blockers.

**Launch sequence:** Web stack first → extension submission same day → marketing push when Chrome approves.
