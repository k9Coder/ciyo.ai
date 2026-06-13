---
status: current
owner: repository
verified_at: 2026-06-13
sources:
  - backend/src
  - pretzel/src/shared/constants.ts
  - pretzel-console/src
  - ciyo-web/lib/config.ts
---

# Configuration

## Backend

Required core values: `DATABASE_URL`, `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET`. Production also requires `CORS_ORIGIN`. Optional/feature-specific values include `DB_POOL_MAX`, `PORT`, `APP_ENV`, PayPal credentials/plans/webhook ID, SMTP credentials, `ADMIN_BASE_URL`, `LLM_PROVIDER`, and provider API keys.

Stripe environment variables are referenced by dormant Stripe modules, but Stripe routes and webhook registration are disabled.

## Pretzel Extension

- `VITE_API_BASE`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SENTRY_DSN_EXTENSION`

These are baked into the extension at build time.

## Pretzel Console

- `VITE_API_BASE`
- `VITE_CLERK_PUBLISHABLE_KEY`
- `VITE_SENTRY_DSN`
- `VITE_APP_ENV`

## ciyo-web

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_ENV`

`NEXT_PUBLIC_API_BASE` is passed by some deployment configuration but is not consumed by application code.

Never commit production credentials. Use package examples and hosting-provider environment settings.
