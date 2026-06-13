---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - ../src/billing/router.ts
  - ../src/billing/service.ts
  - ../src/billing/limits.ts
  - ../src/billing/paypal.ts
  - ../src/billing/stripe.ts
  - ../src/webhooks/clerk.ts
  - ../src/app.ts
---

# Billing and webhooks

PayPal is the active paid-subscription provider. Stripe implementation files remain for reference, but Stripe routes and webhook registration are disabled.

## Plan limits

| Plan | Seats | Monthly scans | Rule kinds | Assistant | Advanced analytics flag |
|---|---:|---:|---|---|---|
| `free` | 3 | 500 | keyword | no | no |
| `starter` | 25 | 50,000 | keyword, pattern | no | no |
| `business` | unlimited | unlimited | all | yes | yes |
| `enterprise` | unlimited | unlimited | all | yes | yes |

Limits use `-1` for unlimited. Member creation enforces seat limits. Scan ingestion enforces monthly scan limits. Rule creation enforces allowed kinds. These checks are not uniformly applied to every alternate mutation path, so callers must not assume plan limits are a complete authorization boundary.

## Signup and checkout

- `POST /v1/billing/free-signup` creates a free tenant, returns its org/admin tokens, and asynchronously attempts a welcome email.
- `POST /v1/billing/paypal/checkout` creates an approval URL. Business requires at least 10 seats.
- `GET /v1/billing/status` reports current usage, limits, provider, subscription status, and feature flags.

Tenant activation is idempotent when an external subscription ID is present. A repeated activation returns the existing tenant ID with empty plaintext tokens, because stored token hashes cannot recover the originals.

## PayPal webhook

`POST /webhooks/paypal` preserves the raw JSON body, verifies PayPal transmission headers through PayPal's verification API, then handles:

| Event | Effect |
|---|---|
| `BILLING.SUBSCRIPTION.ACTIVATED` | Activate tenant and send first welcome email |
| `PAYMENT.SALE.COMPLETED` | Set subscription active |
| `BILLING.SUBSCRIPTION.CANCELLED` | Set subscription cancelled |
| `BILLING.SUBSCRIPTION.PAYMENT.FAILED` | Set subscription past due and start grace period |

`PAYPAL_SKIP_SIG_VERIFY=true` bypasses verification only outside production. Production use throws.

## Clerk webhook

`POST /webhooks/clerk` also requires a raw JSON body and verifies Svix headers. It synchronizes create, update, and delete user lifecycle events. See [authentication](authentication.md).

## Subscription enforcement

Past-due status sets `gracePeriodEndsAt` from the tenant's configured grace days. Reactivation or cancellation clears that timestamp. Policy reads are blocked for cancelled subscriptions and for past-due subscriptions after grace expiry.

## Environment variables

| Area | Variables |
|---|---|
| PayPal | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_STARTER_PLAN_ID`, `PAYPAL_BUSINESS_PLAN_ID`, optional `PAYPAL_SANDBOX`, `PAYPAL_RETURN_URL`, `PAYPAL_CANCEL_URL` |
| Clerk | `CLERK_SECRET_KEY`, `CLERK_WEBHOOK_SECRET` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, optional `SMTP_FROM` |
| Test-only PayPal bypass | `PAYPAL_SKIP_SIG_VERIFY=true` with non-production `NODE_ENV` |

Stripe variables referenced by dormant code are not runtime requirements while Stripe routes remain disabled.
