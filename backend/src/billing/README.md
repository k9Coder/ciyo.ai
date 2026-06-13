---
status: current
owner: backend
verified_at: 2026-06-13
sources:
  - router.ts
  - service.ts
  - limits.ts
  - paypal.ts
  - stripe.ts
  - ../../docs/billing-and-webhooks.md
---

# Billing Subsystem

Billing routes expose free signup, PayPal checkout, subscription status, and plan limits. PayPal webhook signatures are verified before event processing.

Stripe integration code remains present, but Stripe routes and webhook registration are disabled in `app.ts`. See [billing and webhooks](../../docs/billing-and-webhooks.md).
