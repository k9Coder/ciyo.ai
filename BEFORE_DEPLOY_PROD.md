# Before Deploy Checklist

Things that must be configured in the hosting environment before going live.
These are NOT in the repo (gitignored or simply not automated) — you must set them manually each time you deploy to a new environment.

---

## 1. Sentry DSNs — Error Monitoring

**What:** Two environment variables that tell the app where to send error reports.
**Why:** Sentry is already wired into the code (`pretzel-console` and the extension), but it only activates when the DSN env var is present. Without it, errors are silently swallowed and you have zero visibility into what's breaking in production.

### pretzel-console (Vite/React app)

Set this wherever `pretzel-console` is hosted (Vercel / Railway / etc.):

```
VITE_SENTRY_DSN=https://755fe72242df5a2ed0ead4188c1b0461@o4511497522380800.ingest.de.sentry.io/4511497738518608
```

> **Why VITE_ prefix?** Vite only exposes env vars to client-side code if they start with `VITE_`. Without this prefix the variable is invisible to the React app.

### pretzel extension (Chrome extension build)

The extension is a static build — it bakes env vars in at build time. So this must be set in your **CI/CD environment** (GitHub Actions secret, or locally in `pretzel/.env`) before running `pnpm build`:

```
VITE_SENTRY_DSN_EXTENSION=https://89fcdcdc836cfd00125cea672b8b6a6e@o4511497522380800.ingest.de.sentry.io/4511497582936144
```

> **Important:** Unlike a server app, the extension doesn't read env vars at runtime — it reads them at build time. If this variable is missing when you run `pnpm build`, the extension will be built without Sentry and errors will be invisible. The code gracefully skips init when the DSN is absent, so it won't crash — it just won't report anything.

### Where to find these DSNs again

Sentry dashboard → select the project → **Settings → Client Keys (DSN)** → copy the value under "DSN".

- `pretzel-console` DSN: project named **pretzel-console** (React)
- Extension DSN: project named **pretzel-extension** (Browser JavaScript)

---

## 2. Microsoft Clarity — Session Replay

**What:** Already hardcoded into `pretzel-console/index.html` — project ID `x0wzdd5nvx`.
**Why:** Clarity's snippet is public (like a Google Analytics tag) and doesn't need to be secret. Nothing to configure — it's already live once the console is deployed.

> If you ever need to replace the Clarity project, change the ID in `pretzel-console/index.html` line 9.

---

## 3. Backend Sentry (future)

The backend (`backend/`) does not yet have Sentry. When you add it, use a **third** Sentry project (Node.js) and set:

```
SENTRY_DSN=<backend-project-dsn>
```

This is a server-side env var (no `VITE_` prefix needed).

---

## 4. Other production env vars (reminder)

These are separate from observability but easy to forget. Each service needs its own copy:

| Service | File to copy from | Where to set |
|---|---|---|
| `pretzel-console` | `pretzel-console/.env.example` | Vercel / Railway environment settings |
| `pretzel` extension | `pretzel/.env.example` | GitHub Actions secrets / local `.env` before build |
| `backend` | `backend/.env.example` | Railway environment settings |

---

## 5. Clerk — activate the production instance and get live keys

**Why:** Clerk gives every app two separate instances: a *development* instance (`pk_test_` / `sk_test_`) used for staging, and a *production* instance (`pk_live_` / `sk_live_`) for real customers. They are completely isolated — separate user databases, separate sessions. The development instance shows a "Development mode" warning banner to users and has some feature restrictions, so your real customers must be on the production instance.

**What to do:**
1. [clerk.com](https://clerk.com) → your app → switch to **Production** at the top-left
2. Clerk will ask you to configure a custom domain (e.g. `accounts.ciyo.ai`) and add a DNS record — follow the on-screen wizard to activate it
3. Once active, go to **API Keys** and copy:
   - **Publishable key** (`pk_live_...`) → paste into `pretzel/.env.prod` and `pretzel-console/.env.prod`
   - **Secret key** (`sk_live_...`) → paste into `backend/.env.prod` as `CLERK_SECRET_KEY`

---

## 6. Clerk — register the production webhook endpoint

**Why:** The backend listens for Clerk webhooks to keep its `users` table in sync with Clerk (user created, deleted, org membership changed, etc.). The webhook request is signed by Clerk so the backend can verify it's genuine. In staging this points at your local server. In production it must point at the live backend URL with a separate signing secret — reusing the staging secret would be a security hole (anyone with the staging secret could spoof events to your production backend).

**What to do:**
1. Clerk dashboard → **Production instance** → Webhooks → **Add endpoint**
2. URL: `https://api.ciyo.ai/webhooks/clerk` (replace with your actual backend domain)
3. Select these events at minimum: `user.created`, `user.deleted`, `organizationMembership.created`, `organizationMembership.deleted`
4. Save → copy the **Signing secret** (`whsec_...`)
5. Paste it into `backend/.env.prod` as `CLERK_WEBHOOK_SECRET`

---

## 7. Fill in `backend/.env.prod` completely

**Why:** `backend/.env.prod` is gitignored — it never enters version control because it contains real secrets. It exists on disk as a template with `FILL_IN` placeholders. You must populate it before running `pnpm set-env:prod` or deploying.

Open `backend/.env.prod` and fill in every placeholder:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Hosting provider (Render / Railway / Supabase) → Postgres service → connection string |
| `CLERK_SECRET_KEY` | Clerk → Production instance → API Keys → Secret key (`sk_live_...`) |
| `CLERK_WEBHOOK_SECRET` | From step 6 above (`whsec_...`) |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys → Secret key (live mode) |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → create endpoint → signing secret |
| `SMTP_HOST / USER / PASS` | Your email provider (Mailgun / Postmark / SES) |
| `GROQ_API_KEY` | [console.groq.com](https://console.groq.com) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) |

Also fill in the Vite packages:

**`pretzel/.env.prod`** and **`pretzel-console/.env.prod`:**

| Variable | Value |
|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_...` from Clerk production instance |
| `VITE_API_BASE` | `https://api.ciyo.ai` (your production backend URL) |

> **Security reminder:** The `.env.prod` files are gitignored for good reason. Never paste live secrets into `.env.staging` (which is committed). If you accidentally commit a secret, rotate it immediately in the relevant dashboard.

---

## 8. Run production DB migrations (first deploy only)

**Why:** The production database starts empty. Drizzle migrations must be applied to create all tables before the backend can serve requests. After the first deploy, the CI pipeline runs migrations automatically on every subsequent deploy.

```bash
# From monorepo root — copies backend/.env.prod to backend/.env
pnpm set-env:prod

# Apply all pending migrations to the production DB
cd backend && pnpm db:migrate
```

Run this from your local machine for the first deploy only.

---

## 9. Clerk — register the production extension ID (after Chrome Web Store publish)

**Why:** `@clerk/chrome-extension` uses the extension's Chrome ID as part of its auth flow. Clerk's production instance will refuse to issue tokens to an unrecognised extension ID — this prevents a malicious extension from impersonating yours. The extension only gets a permanent, stable ID once it is published to the Chrome Web Store.

**What to do — after the extension is published:**
1. Open the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) → find your extension → note the **Extension ID** (the 32-character string, e.g. `abcdefghijklmnopqrstuvwxyzabcdef`)
2. Clerk dashboard → **Production instance** → Configure → **Allowed origins**
3. Add: `chrome-extension://abcdefghijklmnopqrstuvwxyzabcdef`

Without this, users who install the extension from the Web Store will hit a Clerk auth error when signing in.

---

## Production checklist summary

- [ ] Sentry DSNs set in hosting environment (steps 1–3)
- [ ] Clarity already live (step 2, no action needed)
- [ ] Clerk production instance activated — custom domain DNS configured (step 5)
- [ ] `pk_live_` and `sk_live_` keys copied into all three `.env.prod` files (step 5)
- [ ] Clerk webhook endpoint created for production → `CLERK_WEBHOOK_SECRET` filled in (step 6)
- [ ] `backend/.env.prod` fully populated — DB, Stripe, SMTP, LLM keys (step 7)
- [ ] `pretzel/.env.prod` and `pretzel-console/.env.prod` filled in (step 7)
- [ ] Production DB migrations run (step 8)
- [ ] Extension published to Chrome Web Store → production extension ID added to Clerk allowed origins (step 9)
