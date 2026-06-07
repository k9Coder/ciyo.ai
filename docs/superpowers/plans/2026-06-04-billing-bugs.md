# Billing Bugs Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three billing correctness bugs: (1) every self-signup silently gets the non-existent `'pro'` plan, (2) duplicate webhook delivery crashes `activateTenant` due to a unique constraint, (3) `STRIPE_SKIP_SIG_VERIFY` can be set in production code.

**Architecture:** The Clerk `user.created` webhook auto-provisions tenants on a free plan. The `activateTenant` function needs `ON CONFLICT DO NOTHING` on the slug unique constraint to be idempotent. The Stripe skip-verify flag needs an environment guard identical to the PayPal one.

**Tech Stack:** Drizzle ORM (`onConflictDoNothing`), TypeScript, backend Fastify.

---

### Task 1: Fix plan: 'pro' Bug in Clerk Webhook

**Files:**
- Modify: `backend/src/webhooks/clerk.ts`

- [ ] Step 1: Open `backend/src/webhooks/clerk.ts` line 79. The current code:
```typescript
plan: 'pro',
```
This value does not exist in the `Plan` type (`'free' | 'starter' | 'business' | 'enterprise'`). Every auto-provisioned tenant gets an unrecognised plan that silently falls to free limits.

Change line 79 to:
```typescript
plan: 'free',
```

The full `db.insert(tenants).values({...})` block around it (lines 71–80):
```typescript
const [tenant] = await db.insert(tenants).values({
  name:               `${first_name ?? localPart}'s Organization`,
  slug,
  orgTokenHash:       await hashToken(orgSecret),
  adminTokenHash:     await hashToken(adminSecret),
  paymentProvider:    'stripe',
  externalSubId:      `sub_auto_${slug}`,
  subscriptionStatus: 'active',
  plan:               'free',
}).returning({ id: tenants.id })
```

- [ ] Step 2: Verify no TypeScript error.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty — no errors)
```

- [ ] Step 3: Run billing tests.
```bash
cd backend && pnpm test -- --reporter=verbose clerk
# Expected: all tests pass — plan 'pro' is no longer used
```

- [ ] Step 4: Commit.
```bash
git add backend/src/webhooks/clerk.ts
git commit -m "fix(billing): auto-provisioned tenants set plan='free' not non-existent 'pro'

plan:'pro' is not in the Plan type. Every self-signup was silently falling
to free limits while carrying an unrecognised plan value."
```

---

### Task 2: Make activateTenant Idempotent (ON CONFLICT)

**Files:**
- Modify: `backend/src/billing/service.ts`

- [ ] Step 1: Open `backend/src/billing/service.ts`. The `activateTenant` function (line 30–51) does a bare `db.insert(tenants)`. When a duplicate webhook fires, this hits the `slugUniq` unique constraint and throws an unhandled error.

Replace the insert with an idempotent upsert using `onConflictDoNothing`:
```typescript
export async function activateTenant(input: ActivateInput): Promise<ActivateResult> {
  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', input.slug, orgSecret)
  const adminToken  = formatToken('ps_adm',  input.slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name:               input.name,
    slug:               input.slug,
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    input.paymentProvider,
    externalSubId:      input.externalSubId,
    subscriptionStatus: 'active',
    plan:               input.plan,
    seatCount:          input.seatCount,
    trialEndsAt:        input.trialEndsAt ?? null,
    stripeCustomerId:   input.stripeCustomerId ?? null,
  })
  .onConflictDoNothing()
  .returning({ id: tenants.id })

  // If slug already exists (duplicate webhook), return the existing tokens
  // by re-querying. Tokens from the first webhook are already delivered.
  if (!row) {
    const [existing] = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.slug, input.slug))
    if (!existing) throw new Error(`Failed to activate tenant for slug ${input.slug}`)
    // Return placeholder tokens — the real tokens were sent in the first webhook delivery
    return { tenantId: existing.id, orgToken: '', adminToken: '' }
  }

  return { tenantId: row.id, orgToken, adminToken }
}
```

Add the missing import at the top of `backend/src/billing/service.ts`:
```typescript
import { eq } from 'drizzle-orm'
```

- [ ] Step 2: Update the callers that use the returned `orgToken`/`adminToken` to handle the empty-string case. In `backend/src/billing/paypal.ts` line 86 and `backend/src/billing/stripe.ts` line 97, the `sendWelcomeEmail` call should be guarded:

In `backend/src/billing/paypal.ts`:
```typescript
const result = await activateTenant({ ... })
// Only send welcome email if this is a fresh activation (not a duplicate webhook)
if (result.orgToken) {
  sendWelcomeEmail({ to: parsed.email, tenantName: parsed.name, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
}
```

Apply the same guard in `backend/src/billing/stripe.ts` around line 97.

- [ ] Step 3: Build and run tests.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
cd backend && pnpm test -- --reporter=verbose billing
# Expected: no TS errors, all billing tests pass
```

- [ ] Step 4: Commit.
```bash
git add backend/src/billing/service.ts backend/src/billing/paypal.ts backend/src/billing/stripe.ts
git commit -m "fix(billing): make activateTenant idempotent with ON CONFLICT DO NOTHING

Duplicate webhook deliveries previously hit the slugUniq constraint and
threw an unhandled exception. Now returns existing tenant on conflict."
```

---

### Task 3: Guard STRIPE_SKIP_SIG_VERIFY Against Production/Staging Use

**Files:**
- Modify: `backend/src/billing/stripe.ts`

- [ ] Step 1: Open `backend/src/billing/stripe.ts` lines 68–74. Current code:
```typescript
export async function handleStripeEvent(rawBody: string, sig: string): Promise<void> {
  let event: Stripe.Event
  if (process.env['STRIPE_SKIP_SIG_VERIFY'] === 'true') {
    event = JSON.parse(rawBody) as Stripe.Event
  } else {
    ...
  }
```

Replace with:
```typescript
export async function handleStripeEvent(rawBody: string, sig: string): Promise<void> {
  let event: Stripe.Event
  if (process.env['STRIPE_SKIP_SIG_VERIFY'] === 'true') {
    if (process.env['NODE_ENV'] === 'production' || process.env['APP_ENV'] === 'staging') {
      throw new Error('STRIPE_SKIP_SIG_VERIFY must not be enabled in staging or production')
    }
    event = JSON.parse(rawBody) as Stripe.Event
  } else {
    const stripeClient = stripe()
    event = stripeClient.webhooks.constructEvent(rawBody, sig, process.env['STRIPE_WEBHOOK_SECRET']!)
  }
```

- [ ] Step 2: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 3: Add a test that asserts the guard fires in staging.
In `backend/tests/billing/stripe-webhook.test.ts` (add a new test case):
```typescript
it('throws when STRIPE_SKIP_SIG_VERIFY is set in staging', async () => {
  process.env['STRIPE_SKIP_SIG_VERIFY'] = 'true'
  process.env['APP_ENV'] = 'staging'

  await expect(
    handleStripeEvent('{}', '')
  ).rejects.toThrow('must not be enabled in staging or production')

  delete process.env['STRIPE_SKIP_SIG_VERIFY']
  delete process.env['APP_ENV']
})
```

- [ ] Step 4: Run tests.
```bash
cd backend && pnpm test -- --reporter=verbose stripe
# Expected: all stripe tests pass including the new guard test
```

- [ ] Step 5: Commit.
```bash
git add backend/src/billing/stripe.ts backend/tests/billing/stripe-webhook.test.ts
git commit -m "fix(security): STRIPE_SKIP_SIG_VERIFY throws in staging/production

Prevents accidental deployment with signature verification disabled.
Matches pattern used for PayPal skip-verify guard."
```

---

### Task 4: Verify Existing Tenant Plans in Database

**Files:**
- No source changes — data migration script only.

- [ ] Step 1: Check how many tenants have `plan = 'pro'` in the database.
```bash
# Run against staging database
psql "$DATABASE_URL" -c "SELECT count(*) FROM tenants WHERE plan = 'pro';"
# Note the count
```

- [ ] Step 2: If count > 0, migrate those tenants to `'free'` (they were auto-provisioned via self-signup and should be on free).
```bash
psql "$DATABASE_URL" -c "
UPDATE tenants
SET plan = 'free'
WHERE plan = 'pro';
"
# Expected: UPDATE N (whatever count was from step 1)
```

- [ ] Step 3: Confirm zero tenants remain on `'pro'`.
```bash
psql "$DATABASE_URL" -c "SELECT count(*) FROM tenants WHERE plan = 'pro';"
# Expected: count = 0
```

- [ ] Step 4: Commit a migration note.
```bash
git add .  # nothing to add, this is a DB-only fix
# Document in commit that the DB was manually updated
echo "2026-06-04: migrated pro→free plan values in staging DB" >> backend/src/db/migration-notes.txt
git add backend/src/db/migration-notes.txt
git commit -m "fix(billing): document DB plan migration from pro→free for staging"
```
