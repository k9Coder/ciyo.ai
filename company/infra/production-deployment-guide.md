# Production Deployment Guide — Missing Keys & Steps

**Date:** 2026-06-10  
**Author:** Ryan Kowalski (DevOps)  
**Purpose:** Everything needed to go from "code is ready" to "production is live"

---

## Overview

Four deployable surfaces:

| Surface | How it deploys | Trigger |
|---|---|---|
| **Backend** | Docker → GHCR → Render | Push to `master` (auto) |
| **pretzel-console** | Render static deploy hook | Push to `master` (auto) |
| **ciyo-web** | Vercel Git integration | Push to `master` (auto) |
| **Pretzel extension** | GitHub Release ZIP → Chrome Web Store | Tag `pretzel-v*` → manual upload |

---

## Part 1 — GitHub Secrets (CI/CD)

Set these at: **GitHub repo → Settings → Secrets and variables → Actions → New repository secret**

### Render secrets (backend + console)

| Secret name | What it is | Where to get it |
|---|---|---|
| `RENDER_API_KEY` | Render API key for triggering backend deploys | render.com → Account Settings → API Keys |
| `RENDER_BACKEND_PROD_SERVICE_ID` | Render service ID for production backend | Render dashboard → backend service → Settings → Service ID |
| `RENDER_BACKEND_STAGING_SERVICE_ID` | Render service ID for staging backend | Render dashboard → staging backend service → Service ID |
| `RENDER_CONSOLE_PROD_DEPLOY_HOOK` | Deploy hook URL for production console | Render dashboard → console service → Settings → Deploy Hook |
| `RENDER_CONSOLE_STAGING_DEPLOY_HOOK` | Deploy hook URL for staging console | Render dashboard → staging console service → Deploy Hook |

### Database secrets

| Secret name | What it is | Where to get it |
|---|---|---|
| `PROD_DATABASE_URL` | Postgres connection string for production | Render dashboard → Postgres instance → Connection → External URL |
| `STAGING_DATABASE_URL` | Postgres connection string for staging | Render dashboard → staging Postgres → External URL |

Format: `postgresql://user:password@host:5432/dbname?sslmode=require`

### Extension build secrets

| Secret name | What it is | Where to get it |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY_PROD` | Clerk publishable key for extension production build | Clerk dashboard → API Keys → Publishable key |
| `VITE_API_BASE_PROD` | Production backend URL (e.g. `https://api.ciyo.ai`) | Your custom domain or Render service URL |

### Notifications

| Secret name | What it is | Where to get it |
|---|---|---|
| `DISCORD_WEBHOOK_URL` | Discord webhook for deploy notifications | Discord server → channel settings → Integrations → Webhooks |

---

## Part 2 — Render Environment Variables (Backend)

Set these at: **Render dashboard → backend service → Environment**

### Required (app will crash without these)

| Var | Value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | Enables production guards (CORS check, PayPal sig enforcement) |
| `DATABASE_URL` | `postgresql://...` | Same as `PROD_DATABASE_URL` above — Render can inject this automatically if you use Render Postgres |
| `CORS_ORIGIN` | `https://console.ciyo.ai` | Or comma-separated: `https://console.ciyo.ai,https://ciyo.ai`. Must match pretzel-console domain. |
| `CLERK_SECRET_KEY` | `sk_live_...` | Clerk dashboard → API Keys → Secret key (use **live** key, not test) |
| `CLERK_WEBHOOK_SECRET` | `whsec_...` | Clerk dashboard → Webhooks → your webhook endpoint → Signing Secret |
| `STRIPE_SECRET_KEY` | DISABLED — Stripe commented out | — |
| `STRIPE_WEBHOOK_SECRET` | DISABLED — Stripe commented out | — |
| `STRIPE_STARTER_PRICE_ID` | DISABLED — Stripe commented out | — |
| `STRIPE_BUSINESS_PRICE_ID` | DISABLED — Stripe commented out | — |
| `PAYPAL_CLIENT_ID` | 🔴 Required | PayPal developer dashboard → My Apps → your app → Client ID |
| `PAYPAL_CLIENT_SECRET` | 🔴 Required | PayPal developer dashboard → My Apps → your app → Secret |
| `PAYPAL_WEBHOOK_ID` | 🔴 Required | PayPal developer dashboard → Webhooks → your webhook → Webhook ID |
| `PAYPAL_STARTER_PLAN_ID` | 🔴 Required | PayPal dashboard → Subscriptions → Plans → Starter plan ID |
| `PAYPAL_BUSINESS_PLAN_ID` | 🔴 Required | PayPal dashboard → Subscriptions → Plans → Business plan ID |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | console.anthropic.com → API Keys |
| `SMTP_HOST` | e.g. `smtp.mailgun.org` | Your SMTP provider |
| `SMTP_PORT` | `587` | Standard TLS port |
| `SMTP_USER` | e.g. `postmaster@mg.ciyo.ai` | SMTP provider username |
| `SMTP_PASS` | `...` | SMTP provider password/API key |
| `ADMIN_BASE_URL` | `https://console.ciyo.ai` | Used to build invite links sent to members |

### Optional (have defaults, set if you want to override)

| Var | Default | Set if... |
|---|---|---|
| `DB_POOL_MAX` | `5` | High traffic — raise to 10–20 |
| `SMTP_FROM` | `noreply@ciyo.ai` | You want a different sender address |
| `STRIPE_SUCCESS_URL` | `https://ciyo.ai/welcome` | You build a custom post-checkout page |
| `STRIPE_CANCEL_URL` | `https://ciyo.ai/pricing` | You build a custom cancel page |
| `PAYPAL_RETURN_URL` | `https://ciyo.ai/welcome` | Custom post-subscription page |
| `PAYPAL_CANCEL_URL` | `https://ciyo.ai/pricing` | Custom cancel page |
| `LLM_PROVIDER` | `anthropic` | Set to `openai` or `groq` to switch assistant model |
| `OPENAI_API_KEY` | — | Set if `LLM_PROVIDER=openai` |
| `GROQ_API_KEY` | — | Set if `LLM_PROVIDER=groq` |
| `PAYPAL_SANDBOX` | `false` | Set to `true` for staging only |

---

## Part 3 — Render Environment Variables (pretzel-console)

Set these at: **Render dashboard → pretzel-console service → Environment**

| Var | Value | Notes |
|---|---|---|
| `VITE_API_BASE` | `https://api.ciyo.ai` | Your production backend URL |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Clerk dashboard → API Keys → Publishable key (live) |
| `VITE_APP_ENV` | `production` | Removes the staging banner |
| `VITE_SENTRY_DSN` | `https://...@sentry.io/...` | Sentry dashboard → pretzel-console project → Settings → Client Keys → DSN |

---

## Part 4 — Vercel Environment Variables (ciyo-web)

Set these at: **Vercel dashboard → ciyo-web project → Settings → Environment Variables**

| Var | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `https://api.ciyo.ai` | Production backend URL |
| `NEXT_PUBLIC_ENV` | `production` | — |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_live_...` | Clerk publishable key |

---

## Part 5 — Extension Build (pretzel)

The extension is NOT auto-deployed. Process:

```bash
# 1. Tag the release (this triggers the pretzel-release.yml CI workflow)
git tag pretzel-v1.0.0
git push origin pretzel-v1.0.0

# CI will:
# - Build the extension with production keys
# - Zip it
# - Create a GitHub Release with the ZIP attached
```

Then **manually**:
1. Go to GitHub → Releases → `pretzel-v1.0.0` → download `pretzel-v1.0.0.zip`
2. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Click your extension → Package → Upload new package → upload the ZIP
4. Fill in store listing if first upload:
   - Short description (132 chars max)
   - Detailed description
   - Screenshots (1280×800 or 640×400, at least 1 required)
   - Privacy policy URL: `https://ciyo.ai/privacy`
5. Submit for review (Google review takes 1–3 business days for first submission)

---

## Part 6 — Clerk Configuration (External)

Things to configure in Clerk dashboard before launch:

| Item | Where | Why |
|---|---|---|
| Email templates | Clerk → Customization → Emails | Replace default "Clerk" branding with ciyo.ai / Pretzel branding |
| Allowed domains | Clerk → Settings → Restrictions | Optional: restrict sign-up to company email domains for early beta |
| Webhook endpoint | Clerk → Webhooks | Must point to `https://api.ciyo.ai/webhooks/clerk` and have `user.created`, `user.updated`, `organization.created` events enabled |
| Redirect URLs | Clerk → Settings | Set production redirect URLs for OAuth flows |

---

## Part 7 — Stripe Configuration (External) — DISABLED

> **Stripe is currently commented out.** Routes `/billing/stripe/checkout`, `/billing/stripe/portal`, and `/webhooks/stripe` return 404.
> To re-enable: uncomment imports in `backend/src/app.ts` and `backend/src/billing/router.ts`, then configure below.

| Item | Where | Why |
|---|---|---|
| Webhook endpoint | Stripe → Developers → Webhooks | Must point to `https://api.ciyo.ai/billing/stripe/webhook`. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted` |
| Products + prices | Stripe → Products | Create Starter and Business subscription products. Copy the `price_...` IDs into env vars. |
| Customer portal | Stripe → Settings → Billing → Customer portal | Enable and configure so customers can manage their subscription |
| Live mode | Stripe → Dashboard | Switch from test to live mode before launch |

---

## Part 8 — PayPal Configuration (External)

| Item | Where | Why |
|---|---|---|
| Live app | PayPal Developer → My Apps | Create a Live app (not sandbox). Copy Client ID + Secret. |
| Subscription plans | PayPal → Subscriptions → Plans | Create Starter and Business plans. Copy `P-...` plan IDs into env vars. |
| Webhook | PayPal → Developer → Webhooks | Point to `https://api.ciyo.ai/billing/paypal/webhook`. Events: `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.CANCELLED` |
| Set `PAYPAL_SANDBOX=false` | Render env vars | Ensure production backend uses live PayPal API |

---

## Part 9 — Pre-launch Deploy Checklist

Run through this in order:

```
Infrastructure
[ ] Render backend service created and running
[ ] Render Postgres created, DATABASE_URL injected
[ ] Render console service created and running
[ ] Vercel project connected to GitHub repo, auto-deploy on master
[ ] All GitHub Secrets set (Part 1)
[ ] All Render backend env vars set (Part 2)
[ ] All Render console env vars set (Part 3)
[ ] All Vercel env vars set (Part 4)

External services
[ ] Clerk: live keys, branded emails, webhook endpoint set
[ ] Stripe: DISABLED — skip (re-enable in app.ts + router.ts if needed)
[ ] PayPal: live app, plans created, webhook endpoint set
[ ] Mailgun (or SendGrid): account created, SMTP credentials set in Render
[ ] Sentry: two projects created (console + extension), DSNs in env vars

Deployment smoke test
[ ] Push to master → check Render deploy succeeds (backend + console)
[ ] Check Vercel deploy succeeds (ciyo-web)
[ ] Hit https://api.ciyo.ai/health → expect { "ok": true }
[ ] Open console.ciyo.ai → sign in → dashboard loads
[ ] Open ciyo.ai → marketing site loads
[ ] Run DB migrations: pnpm exec tsx src/db/migrate.ts (with PROD DATABASE_URL)

Extension
[ ] Tag pretzel-v1.0.0
[ ] Wait for GitHub Release CI to complete
[ ] Download ZIP from GitHub Release
[ ] Upload to Chrome Web Store
[ ] Submit for review

Monitoring
[ ] Sentry receiving events (throw a test error)
[ ] Discord webhook receiving deploy notifications
[ ] Logger outputting structured JSON (check Render logs)
```
