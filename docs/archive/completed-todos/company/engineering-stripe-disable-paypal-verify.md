# Disable Stripe, Verify & Harden PayPal

**Author:** Marcus Webb (CTO)  
**Owner:** Arjun Mehta (Backend)  
**Priority:** 🔴 Pre-launch blocker  
**Effort:** ~6–8 hours  
**Reason:** Stripe is not reliably available from the company's operating country. PayPal already exists in the codebase and works. Goal: comment out Stripe cleanly (preserve code, do not delete), verify PayPal end-to-end, close test gaps.

---

## Context

The codebase currently has two payment providers fully wired:
- `billing/stripe.ts` — checkout session, portal session, webhook handler
- `billing/paypal.ts` — subscription URL creation, webhook handler with signature verification

Stripe routes: `/billing/stripe/checkout`, `/billing/stripe/portal`, `/webhooks/stripe`  
PayPal routes: `/billing/paypal/checkout`, `/webhooks/paypal`

**What changes:**
1. Stripe is commented out (not deleted) across all layers
2. PayPal unit tests get two missing event coverage gaps filled
3. E2E suite adds PayPal webhook smoke test and confirms Stripe endpoints are disabled
4. Deployment guide updated — Stripe env vars marked disabled, PayPal vars marked required

**What does NOT change:**
- `billing/service.ts` — untouched, `activateTenant` is provider-agnostic
- `billing/limits.ts` — untouched
- DB schema `paymentProvider` column — keeps `'stripe' | 'paypal' | null` type (existing data, no migration needed)
- Free-tier signup — untouched
- `/billing/status` — untouched

---

## Step 1 — Comment out Stripe in `app.ts`

**File:** `backend/src/app.ts`

Three changes:

```ts
// Comment out this import:
// import { handleStripeEvent } from './billing/stripe.js'

// Comment out the entire /webhooks/stripe route handler:
// app.post('/webhooks/stripe', async (request, reply) => {
//   await handleStripeEvent(request.body as string, ...)
//   return reply.status(200).send({ received: true })
// })

// In the content type parser, remove the Stripe branch:
// Before:
if (req.url?.startsWith('/webhooks/stripe') || req.url?.startsWith('/webhooks/clerk') || req.url?.startsWith('/webhooks/paypal')) {
// After:
if (req.url?.startsWith('/webhooks/clerk') || req.url?.startsWith('/webhooks/paypal')) {
```

---

## Step 2 — Comment out Stripe in `billing/router.ts`

**File:** `backend/src/billing/router.ts`

```ts
// Comment out this import:
// import { createCheckoutSession, createPortalSession } from './stripe.js'

// Comment out the entire /billing/stripe/checkout route

// Comment out the entire /billing/stripe/portal route
```

The PayPal checkout route (`/billing/paypal/checkout`) and free-signup route stay exactly as-is.

---

## Step 3 — Mark `billing/stripe.ts` as disabled

**File:** `backend/src/billing/stripe.ts`

Add a banner comment at the very top of the file. Do NOT delete any code:

```ts
// ─────────────────────────────────────────────────────────────────
// STRIPE DISABLED
// Stripe is not available in the company's operating country.
// This file is preserved for future reference or re-enablement.
// No code in this file is currently imported or executed.
// To re-enable: uncomment the imports in app.ts and billing/router.ts
// ─────────────────────────────────────────────────────────────────
```

---

## Step 4 — Update unit tests: `billing-stripe.test.ts`

**File:** `backend/tests/billing-stripe.test.ts`

The existing tests (`activateTenant`, `updateSubscriptionStatus`) test the **service layer**, not Stripe itself. They use `paymentProvider: 'stripe'` as a string — this is fine, no Stripe SDK is called. The tests remain valid.

Two changes only:
1. Rename the file to `billing-service.test.ts` to reflect what it actually tests
2. Rename the describe block `'Stripe billing service functions'` → `'billing service functions'`

No test logic changes. All assertions stay identical.

---

## Step 5 — Fill PayPal unit test gaps

**File:** `backend/tests/billing-paypal.test.ts`

Two event handlers in `paypal.ts` have no unit test coverage:

**Add test: `PAYMENT.SALE.COMPLETED` sets status to `active`**
```ts
it('sets active status on PAYMENT.SALE.COMPLETED', async () => {
  const { tenantId } = await buildTestTenant()
  await db.update(tenants).set({ externalSubId: 'I-SALE001', subscriptionStatus: 'past_due' }).where(eq(tenants.id, tenantId))
  const body = JSON.stringify({
    event_type: 'PAYMENT.SALE.COMPLETED',
    resource: { billing_agreement_id: 'I-SALE001' },
  })
  const res = await supertest(app.server)
    .post('/webhooks/paypal')
    .set('Content-Type', 'application/json')
    .set('paypal-transmission-id',   'test-id')
    .set('paypal-transmission-time', '2026-01-01T00:00:00Z')
    .set('paypal-cert-url',          'https://api.paypal.com/v1/notifications/certs/test')
    .set('paypal-transmission-sig',  'test-sig')
    .send(body)
  expect(res.status).toBe(200)
  expect((await getTenantById(tenantId))?.subscriptionStatus).toBe('active')
})
```

**Add test: `BILLING.SUBSCRIPTION.PAYMENT.FAILED` sets status to `past_due`**
```ts
it('sets past_due status on BILLING.SUBSCRIPTION.PAYMENT.FAILED', async () => {
  const { tenantId } = await buildTestTenant()
  await db.update(tenants).set({ externalSubId: 'I-FAIL001' }).where(eq(tenants.id, tenantId))
  const body = JSON.stringify({
    event_type: 'BILLING.SUBSCRIPTION.PAYMENT.FAILED',
    resource: { id: 'I-FAIL001' },
  })
  const res = await supertest(app.server)
    .post('/webhooks/paypal')
    .set('Content-Type', 'application/json')
    .set('paypal-transmission-id',   'test-id')
    .set('paypal-transmission-time', '2026-01-01T00:00:00Z')
    .set('paypal-cert-url',          'https://api.paypal.com/v1/notifications/certs/test')
    .set('paypal-transmission-sig',  'test-sig')
    .send(body)
  expect(res.status).toBe(200)
  expect((await getTenantById(tenantId))?.subscriptionStatus).toBe('past_due')
})
```

---

## Step 6 — Update E2E billing spec

**File:** `backend/e2e/billing.spec.ts`

Add two tests at the end of the `'Billing API'` describe block:

**Test 1: Stripe endpoints return 404 (disabled)**
```ts
test('POST /v1/billing/stripe/checkout returns 404 (Stripe disabled)', async () => {
  const api = await playwrightRequest.newContext()
  const res = await api.post(`${BACKEND}/v1/billing/stripe/checkout`, {
    data: { plan: 'starter', seatCount: 1, tenantName: 'Test', email: 'test@test.com' },
  })
  expect(res.status()).toBe(404)
  await api.dispose()
})
```

**Test 2: PayPal checkout returns a URL**

Note: this test requires `PAYPAL_CLIENT_ID` + `PAYPAL_CLIENT_SECRET` + `PAYPAL_STARTER_PLAN_ID` to be set in `e2e/.env.e2e`. If they are not set, mark test as `.skip` with a note.

```ts
test('POST /v1/billing/paypal/checkout returns approval URL for starter plan', async () => {
  // Requires PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_STARTER_PLAN_ID in e2e env
  // Skip if not configured (CI/local without PayPal sandbox credentials)
  if (!process.env['PAYPAL_CLIENT_ID']) {
    test.skip()
    return
  }
  const api = await playwrightRequest.newContext()
  const res = await api.post(`${BACKEND}/v1/billing/paypal/checkout`, {
    data: { plan: 'starter', seatCount: 1, tenantName: 'E2E PayPal Test', email: 'e2e@mykka.ai' },
  })
  expect(res.status()).toBe(200)
  const body = await res.json() as { url: string }
  expect(body.url).toMatch(/^https:\/\/www\.sandbox\.paypal\.com|^https:\/\/www\.paypal\.com/)
  await api.dispose()
})
```

---

## Step 7 — Update deployment guide

**File:** `company/infra/production-deployment-guide.md`

In Part 2 (Render backend env vars), mark Stripe vars as disabled:

```
| STRIPE_SECRET_KEY        | DISABLED — Stripe commented out | — |
| STRIPE_WEBHOOK_SECRET    | DISABLED — Stripe commented out | — |
| STRIPE_STARTER_PRICE_ID  | DISABLED — Stripe commented out | — |
| STRIPE_BUSINESS_PRICE_ID | DISABLED — Stripe commented out | — |
```

Mark PayPal vars as required (they already exist in the guide but add a 🔴 marker):

```
| PAYPAL_CLIENT_ID         | 🔴 Required | PayPal developer dashboard |
| PAYPAL_CLIENT_SECRET     | 🔴 Required | PayPal developer dashboard |
| PAYPAL_WEBHOOK_ID        | 🔴 Required | PayPal developer dashboard |
| PAYPAL_STARTER_PLAN_ID   | 🔴 Required | PayPal Subscriptions > Plans |
| PAYPAL_BUSINESS_PLAN_ID  | 🔴 Required | PayPal Subscriptions > Plans |
```

---

## Acceptance Criteria

- [ ] `/webhooks/stripe` returns 404 (route removed from app.ts)
- [ ] `/billing/stripe/checkout` returns 404 (route removed from router.ts)
- [ ] `/billing/stripe/portal` returns 404 (route removed from router.ts)
- [ ] `billing/stripe.ts` still exists in the repo with disabled banner — NOT deleted
- [ ] `billing/paypal.ts` unchanged
- [ ] `billing/service.ts` unchanged
- [ ] `billing-service.test.ts` (renamed) passes: all existing activateTenant + updateSubscriptionStatus tests green
- [ ] New PayPal unit tests pass: PAYMENT.SALE.COMPLETED and BILLING.SUBSCRIPTION.PAYMENT.FAILED
- [ ] E2E: Stripe 404 test passes
- [ ] E2E: PayPal checkout test passes (or skips cleanly when credentials not set)
- [ ] `pnpm test` passes (all unit/integration tests)
- [ ] `pnpm test:e2e --project=api` passes

---

## Files Changed Summary

| Action | File |
|---|---|
| Modify | `backend/src/app.ts` |
| Modify | `backend/src/billing/router.ts` |
| Modify (banner only) | `backend/src/billing/stripe.ts` |
| Rename + minor edit | `backend/tests/billing-stripe.test.ts` → `billing-service.test.ts` |
| Modify (add 2 tests) | `backend/tests/billing-paypal.test.ts` |
| Modify (add 2 tests) | `backend/e2e/billing.spec.ts` |
| Modify | `company/infra/production-deployment-guide.md` |

---

## Run Order

```bash
# After changes:
cd backend
pnpm test                          # all unit tests — must pass
pnpm seed:e2e                      # reseed test DB
pnpm test:e2e --project=api        # API E2E — must pass
```

---

## Prompt to Arjun (copy-paste to staff:arjun-mehta)

> **Task: disable Stripe, verify PayPal**
>
> Comment out Stripe across the backend — preserve the file, do not delete. Wire and verify PayPal as the sole payment path. Close two missing PayPal unit test gaps. Add E2E tests confirming Stripe is disabled and PayPal checkout works.
>
> Full spec: `company/todos/engineering-stripe-disable-paypal-verify.md`
>
> After changes: `pnpm test` (all green) + `pnpm test:e2e --project=api` (all green). Do not ship until both pass.
