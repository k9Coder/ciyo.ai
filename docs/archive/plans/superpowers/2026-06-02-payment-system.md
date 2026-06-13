# Payment System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up monetization end-to-end — four pricing tiers (Free / Starter / Business / Enterprise), hard scan-limit enforcement, per-seat billing, Stripe + PayPal checkout flows, 14-day free trial on Business (no CC required), and in-app upgrade prompts in the Console.

**Architecture:** All enforcement lives in the backend — the API returns 402 when a scan limit is hit; the extension caches the blocked flag in chrome.storage and prevents the next submission. Checkout is handled by Stripe Checkout and PayPal Subscriptions (public endpoints, no auth required yet). The Console gains a billing status hook, an upgrade banner wired into AppLayout, plan-gated feature wrappers, and a Billing section in Settings.

**Tech Stack:** Drizzle ORM + Postgres, Fastify, Stripe Node SDK, PayPal REST API (fetch), React Query, Vite/React admin, Chrome Extension MV3 service worker.

---

## Tier Definitions

| Tier | Price | Seats | Monthly Scans | Rule kinds | AI Assistant | Advanced Analytics |
|------|-------|-------|---------------|------------|-------------|-------------------|
| **Free** | $0 | 3 | 500 | keyword only | ✗ | ✗ |
| **Starter** | $49/mo flat | 25 | 50 000 | keyword + pattern | ✗ | ✗ |
| **Business** | $15/seat/mo (min 10) | unlimited | unlimited | all | ✓ | ✓ |
| **Enterprise** | Custom | unlimited | unlimited | all | ✓ | ✓ |

Business tier: 14-day free trial, no credit card required.

---

## File Map

| Action | File | What changes |
|--------|------|-------------|
| Create | `backend/drizzle/0008_billing_v2.sql` | New columns: seat_count, trial_ends_at, stripe_customer_id; make external_sub_id nullable; migrate plan='pro'→'business'; change plan default |
| Modify | `backend/src/db/schema.ts` | Add seatCount, trialEndsAt, stripeCustomerId to tenants; make externalSubId nullable |
| Create | `backend/src/billing/limits.ts` | Plan limits constants + enforcement helpers |
| Modify | `backend/src/scans/service.ts` | countMonthlyScans(); recordScan returns {blocked,remaining} |
| Modify | `backend/src/scans/router.ts` | Return 402 on blocked, 200 with body on ok |
| Modify | `backend/src/members/service.ts` | Seat limit check before insert |
| Modify | `backend/src/rules/router.ts` | 403 when rule kind not allowed for plan |
| Modify | `backend/src/billing/service.ts` | activateTenant accepts plan+seatCount; free-signup helper |
| Modify | `backend/src/billing/stripe.ts` | createCheckoutSession; createPortalSession; webhook stores customerId/plan |
| Modify | `backend/src/billing/paypal.ts` | createPayPalSubscriptionUrl; webhook stores plan |
| Create | `backend/src/billing/router.ts` | /billing/* HTTP endpoints |
| Modify | `backend/src/app.ts` | Register billingRouter |
| Modify | `admin/src/types.ts` | Add BillingStatus type |
| Modify | `admin/src/api.ts` | Add api.billing.* methods |
| Create | `admin/src/hooks/useBilling.ts` | useQuery wrapping GET /v1/billing/status |
| Create | `admin/src/components/billing/UpgradeBanner.tsx` | Banner for scan limit / approaching limit |
| Create | `admin/src/components/billing/PlanGate.tsx` | Feature-gate wrapper for Business-only features |
| Modify | `admin/src/pages/SettingsPage.tsx` | Add Billing section |
| Modify | `admin/src/components/layout/AppLayout.tsx` | Render UpgradeBanner, plan badge |
| Modify | `src/scans/dispatch.ts` | Await response; set scanLimitReached in chrome.storage |
| Modify | `src/background/service-worker.ts` | Check scanLimitReached before DETECT; handle GET_BILLING_STATUS message |

---

### Task 1: Database Migration

**Files:**
- Create: `backend/drizzle/0008_billing_v2.sql`
- Modify: `backend/src/db/schema.ts:27-42`

- [ ] **Step 1: Write the migration SQL**

```sql
-- backend/drizzle/0008_billing_v2.sql

-- Make external_sub_id nullable (free tier has no payment)
ALTER TABLE "tenants" ALTER COLUMN "external_sub_id" DROP NOT NULL;

-- Add new billing columns
ALTER TABLE "tenants"
  ADD COLUMN "seat_count"        integer   NOT NULL DEFAULT 1,
  ADD COLUMN "trial_ends_at"     timestamptz,
  ADD COLUMN "stripe_customer_id" text;

-- Migrate existing tenants that were on 'pro' plan to 'business'
UPDATE "tenants" SET "plan" = 'business' WHERE "plan" = 'pro';

-- Change the column default
ALTER TABLE "tenants" ALTER COLUMN "plan" SET DEFAULT 'free';
```

- [ ] **Step 2: Run the migration**

```bash
cd backend
npx drizzle-kit push
# or, if using migrate.ts:
npx tsx src/db/migrate.ts
```

Expected: migration applies without error.

- [ ] **Step 3: Update schema.ts**

Replace the `tenants` table definition in `backend/src/db/schema.ts:27-42`:

```typescript
export const tenants = pgTable('tenants', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  name:               text('name').notNull(),
  slug:               text('slug').notNull(),
  orgTokenHash:       text('org_token_hash').notNull(),
  adminTokenHash:     text('admin_token_hash').notNull(),
  paymentProvider:    text('payment_provider'),          // nullable — free tier has no provider
  externalSubId:      text('external_sub_id'),           // nullable — free tier has no sub
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  plan:               text('plan').notNull().default('free'),
  seatCount:          integer('seat_count').notNull().default(1),
  trialEndsAt:        timestamp('trial_ends_at', { withTimezone: true }),
  stripeCustomerId:   text('stripe_customer_id'),
  gracePeriodDays:    integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt:  timestamp('grace_period_ends_at', { withTimezone: true }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq: unique().on(t.slug),
}))
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/drizzle/0008_billing_v2.sql backend/src/db/schema.ts
git commit -m "feat(billing): add seat_count, trial_ends_at, stripe_customer_id; make external_sub_id nullable"
```

---

### Task 2: Plan Limits Config

**Files:**
- Create: `backend/src/billing/limits.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/billing/limits.test.ts
import { describe, it, expect } from 'vitest'
import { PLAN_LIMITS, isOverScanLimit, isOverSeatLimit, isRuleKindAllowed } from './limits.js'

describe('PLAN_LIMITS', () => {
  it('free plan allows only keyword rules', () => {
    expect(PLAN_LIMITS.free.allowedRuleKinds).toEqual(['keyword'])
  })
  it('business plan allows all rule kinds', () => {
    expect(PLAN_LIMITS.business.allowedRuleKinds).toContain('entropy')
    expect(PLAN_LIMITS.business.allowedRuleKinds).toContain('score')
  })
})

describe('isOverScanLimit', () => {
  it('blocks free plan at 500', () => {
    expect(isOverScanLimit('free', 500)).toBe(true)
  })
  it('allows free plan at 499', () => {
    expect(isOverScanLimit('free', 499)).toBe(false)
  })
  it('business plan is never blocked (-1 = unlimited)', () => {
    expect(isOverScanLimit('business', 9_999_999)).toBe(false)
  })
})

describe('isOverSeatLimit', () => {
  it('blocks free plan at 3 seats', () => {
    expect(isOverSeatLimit('free', 3)).toBe(true)
  })
  it('allows free plan with 2 seats', () => {
    expect(isOverSeatLimit('free', 2)).toBe(false)
  })
})

describe('isRuleKindAllowed', () => {
  it('free plan cannot use entropy rules', () => {
    expect(isRuleKindAllowed('free', 'entropy')).toBe(false)
  })
  it('starter plan can use pattern rules', () => {
    expect(isRuleKindAllowed('starter', 'pattern')).toBe(true)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && npx vitest run src/billing/limits.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement limits.ts**

```typescript
// backend/src/billing/limits.ts

export type Plan = 'free' | 'starter' | 'business' | 'enterprise'

export interface PlanLimits {
  maxSeats:          number    // -1 = unlimited
  monthlyScans:      number    // -1 = unlimited
  allowedRuleKinds:  ReadonlyArray<'keyword' | 'pattern' | 'entropy' | 'score'>
  assistantEnabled:  boolean
  advancedAnalytics: boolean
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    maxSeats:          3,
    monthlyScans:      500,
    allowedRuleKinds:  ['keyword'],
    assistantEnabled:  false,
    advancedAnalytics: false,
  },
  starter: {
    maxSeats:          25,
    monthlyScans:      50_000,
    allowedRuleKinds:  ['keyword', 'pattern'],
    assistantEnabled:  false,
    advancedAnalytics: false,
  },
  business: {
    maxSeats:          -1,
    monthlyScans:      -1,
    allowedRuleKinds:  ['keyword', 'pattern', 'entropy', 'score'],
    assistantEnabled:  true,
    advancedAnalytics: true,
  },
  enterprise: {
    maxSeats:          -1,
    monthlyScans:      -1,
    allowedRuleKinds:  ['keyword', 'pattern', 'entropy', 'score'],
    assistantEnabled:  true,
    advancedAnalytics: true,
  },
}

export function isOverScanLimit(plan: Plan, monthlyScans: number): boolean {
  const limit = PLAN_LIMITS[plan as Plan]?.monthlyScans ?? 500
  return limit !== -1 && monthlyScans >= limit
}

export function isOverSeatLimit(plan: Plan, currentSeats: number): boolean {
  const limit = PLAN_LIMITS[plan as Plan]?.maxSeats ?? 3
  return limit !== -1 && currentSeats >= limit
}

export function isRuleKindAllowed(plan: Plan, kind: string): boolean {
  const kinds = PLAN_LIMITS[plan as Plan]?.allowedRuleKinds ?? ['keyword']
  return (kinds as string[]).includes(kind)
}

export function getScanLimit(plan: Plan): number {
  return PLAN_LIMITS[plan as Plan]?.monthlyScans ?? 500
}

export function getSeatLimit(plan: Plan): number {
  return PLAN_LIMITS[plan as Plan]?.maxSeats ?? 3
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd backend && npx vitest run src/billing/limits.test.ts
```

Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/limits.ts backend/src/billing/limits.test.ts
git commit -m "feat(billing): add plan limits config with enforcement helpers"
```

---

### Task 3: Backend Scan Enforcement

**Files:**
- Modify: `backend/src/scans/service.ts`
- Modify: `backend/src/scans/router.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/scans/service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/client.js', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
  },
}))

import { countMonthlyScans } from './service.js'
import { db } from '../db/client.js'

describe('countMonthlyScans', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns count from db', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb['select'].mockReturnValue({
      from: () => ({ where: () => Promise.resolve([{ n: 42 }]) }),
    })
    const result = await countMonthlyScans('tenant-1')
    expect(result).toBe(42)
  })

  it('returns 0 when no rows returned', async () => {
    const mockDb = db as unknown as Record<string, ReturnType<typeof vi.fn>>
    mockDb['select'].mockReturnValue({
      from: () => ({ where: () => Promise.resolve([]) }),
    })
    const result = await countMonthlyScans('tenant-1')
    expect(result).toBe(0)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && npx vitest run src/scans/service.test.ts
```

Expected: FAIL — `countMonthlyScans` not exported.

- [ ] **Step 3: Update scans/service.ts**

Replace the entire file `backend/src/scans/service.ts`:

```typescript
import { and, eq, gte, count } from 'drizzle-orm'
import { db } from '../db/client.js'
import { scans, tenants } from '../db/schema.js'
import { isOverScanLimit, getScanLimit, type Plan } from '../billing/limits.js'

export async function countMonthlyScans(tenantId: string): Promise<number> {
  const start = new Date()
  start.setUTCDate(1)
  start.setUTCHours(0, 0, 0, 0)
  const [row] = await db
    .select({ n: count() })
    .from(scans)
    .where(and(eq(scans.tenantId, tenantId), gte(scans.occurredAt, start)))
  return row?.n ?? 0
}

export async function recordScan(
  tenantId: string,
  memberId: string | null
): Promise<{ blocked: boolean; remaining: number }> {
  const [tenant] = await db
    .select({ plan: tenants.plan, subscriptionStatus: tenants.subscriptionStatus })
    .from(tenants)
    .where(eq(tenants.id, tenantId))

  if (!tenant) return { blocked: false, remaining: -1 }

  const plan = tenant.plan as Plan
  const limit = getScanLimit(plan)

  if (limit !== -1) {
    const monthly = await countMonthlyScans(tenantId)
    if (isOverScanLimit(plan, monthly)) {
      return { blocked: true, remaining: 0 }
    }
    await db.insert(scans).values({ tenantId, memberId })
    const remaining = Math.max(0, limit - monthly - 1)
    return { blocked: false, remaining }
  }

  await db.insert(scans).values({ tenantId, memberId })
  return { blocked: false, remaining: -1 }
}
```

- [ ] **Step 4: Update scans/router.ts**

Replace `backend/src/scans/router.ts`:

```typescript
import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { recordScan } from './service.js'

export async function scansRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/scans', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const memberId = req.member?.id ?? null
    const result = await recordScan(req.tenant.id, memberId)

    if (result.blocked) {
      return reply.status(402).send({
        error:     'scan_limit_reached',
        blocked:   true,
        remaining: 0,
      })
    }

    return reply.status(200).send({ ok: true, remaining: result.remaining })
  })
}
```

- [ ] **Step 5: Run tests**

```bash
cd backend && npx vitest run src/scans/service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/scans/service.ts backend/src/scans/router.ts backend/src/scans/service.test.ts
git commit -m "feat(billing): scan limit enforcement — 402 when monthly limit reached"
```

---

### Task 4: Seat and Rule Kind Enforcement

**Files:**
- Modify: `backend/src/members/service.ts`
- Modify: `backend/src/rules/router.ts`

- [ ] **Step 1: Update createMember with seat limit check**

In `backend/src/members/service.ts`, replace the `createMember` function:

```typescript
import { and, count, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { members, users, memberTeams, tenants, type Member, type NewMember, type User } from '../db/schema.js'
import { isOverSeatLimit, getSeatLimit, type Plan } from '../billing/limits.js'

// (keep all existing functions above createMember unchanged)

export async function createMember(
  tenantId: string,
  data: Pick<NewMember, 'email' | 'displayName' | 'role'>
): Promise<Member> {
  const [tenant] = await db
    .select({ plan: tenants.plan })
    .from(tenants)
    .where(eq(tenants.id, tenantId))

  if (tenant) {
    const plan = tenant.plan as Plan
    const [countRow] = await db
      .select({ n: count() })
      .from(members)
      .where(eq(members.tenantId, tenantId))
    const currentSeats = countRow?.n ?? 0
    if (isOverSeatLimit(plan, currentSeats)) {
      const limit = getSeatLimit(plan)
      throw Object.assign(
        new Error(`Seat limit reached (${limit} seats on ${plan} plan). Upgrade to add more members.`),
        { statusCode: 402 }
      )
    }
  }

  const [row] = await db.insert(members).values({ tenantId, ...data }).returning()
  return row!
}
```

- [ ] **Step 2: Add rule kind check in rules router**

In `backend/src/rules/router.ts`, find the `POST /subjects/:subjectId/rules` handler and add a plan check before `createRule`. Open the file to find the exact line, then add before the `createRule` call:

```typescript
// Add at top of rules/router.ts:
import { isRuleKindAllowed, type Plan } from '../billing/limits.js'

// Inside the POST handler, before calling createRule:
const plan = req.tenant.plan as Plan
if (!isRuleKindAllowed(plan, body.kind)) {
  return reply.status(402).send({
    error: `Rule kind '${body.kind}' is not available on the ${plan} plan. Upgrade to unlock pattern, entropy, and score rules.`,
  })
}
```

- [ ] **Step 3: Also gate AI assistant router**

In `backend/src/assistant/router.ts`, find the POST `/assistant/chat` handler and add at the start:

```typescript
import { PLAN_LIMITS, type Plan } from '../billing/limits.js'

// Inside the POST handler, before processing:
const plan = req.tenant.plan as Plan
if (!PLAN_LIMITS[plan]?.assistantEnabled) {
  return reply.status(402).send({
    error: 'The AI Assistant is available on the Business plan. Upgrade to access it.',
  })
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/members/service.ts backend/src/rules/router.ts backend/src/assistant/router.ts
git commit -m "feat(billing): seat limit + rule kind + assistant gating by plan"
```

---

### Task 5: Billing Service — Free Signup + activateTenant Update

**Files:**
- Modify: `backend/src/billing/service.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// backend/src/billing/service.test.ts
import { describe, it, expect, vi } from 'vitest'

vi.mock('../db/client.js', () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([{ id: 'tenant-1' }])) })),
    })),
  },
}))
vi.mock('../auth/tokens.js', () => ({
  generateSecret: vi.fn(() => 'fakesecret'),
  formatToken: vi.fn((prefix: string, slug: string) => `${prefix}_${slug}_fakesecret`),
  hashToken: vi.fn(() => Promise.resolve('$bcrypt$hash')),
}))
vi.mock('./email.js', () => ({ sendWelcomeEmail: vi.fn() }))
vi.mock('../tenants/service.js', () => ({ updateSubscriptionStatus: vi.fn() }))

import { activateTenant, freeTierSignup } from './service.js'

describe('activateTenant', () => {
  it('returns tenantId and tokens', async () => {
    const result = await activateTenant({
      name: 'Acme', slug: 'acme', paymentProvider: 'stripe',
      externalSubId: 'sub_123', plan: 'business', seatCount: 10,
    })
    expect(result.tenantId).toBe('tenant-1')
    expect(result.orgToken).toContain('ps_live_acme')
    expect(result.adminToken).toContain('ps_adm_acme')
  })
})

describe('freeTierSignup', () => {
  it('creates a free tenant with no payment provider', async () => {
    const result = await freeTierSignup({ name: 'Startup', slug: 'startup', email: 'a@b.com' })
    expect(result.tenantId).toBe('tenant-1')
    expect(result.orgToken).toBeDefined()
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && npx vitest run src/billing/service.test.ts
```

Expected: FAIL — `freeTierSignup` not exported, `activateTenant` missing plan/seatCount.

- [ ] **Step 3: Rewrite billing/service.ts**

```typescript
// backend/src/billing/service.ts
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { updateSubscriptionStatus } from '../tenants/service.js'
import { sendWelcomeEmail } from './email.js'

export interface ActivateInput {
  name:            string
  slug:            string
  paymentProvider: 'stripe' | 'paypal' | null
  externalSubId:   string | null
  plan:            'free' | 'starter' | 'business' | 'enterprise'
  seatCount:       number
  trialEndsAt?:    Date | null
  stripeCustomerId?: string | null
}

export interface ActivateResult {
  tenantId:   string
  orgToken:   string
  adminToken: string
}

export async function activateTenant(input: ActivateInput): Promise<ActivateResult> {
  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()
  const orgToken    = formatToken('ps_live', input.slug, orgSecret)
  const adminToken  = formatToken('ps_adm',  input.slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name:             input.name,
    slug:             input.slug,
    orgTokenHash:     await hashToken(orgSecret),
    adminTokenHash:   await hashToken(adminSecret),
    paymentProvider:  input.paymentProvider,
    externalSubId:    input.externalSubId,
    subscriptionStatus: 'active',
    plan:             input.plan,
    seatCount:        input.seatCount,
    trialEndsAt:      input.trialEndsAt ?? null,
    stripeCustomerId: input.stripeCustomerId ?? null,
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}

export async function freeTierSignup(input: {
  name:  string
  slug:  string
  email: string
}): Promise<ActivateResult> {
  const result = await activateTenant({
    name:            input.name,
    slug:            input.slug,
    paymentProvider: null,
    externalSubId:   null,
    plan:            'free',
    seatCount:       1,
  })
  sendWelcomeEmail({
    to:         input.email,
    tenantName: input.name,
    orgToken:   result.orgToken,
    adminToken: result.adminToken,
  }).catch(() => {})
  return result
}

export { updateSubscriptionStatus }
```

- [ ] **Step 4: Run tests**

```bash
cd backend && npx vitest run src/billing/service.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/service.ts backend/src/billing/service.test.ts
git commit -m "feat(billing): activateTenant accepts plan/seatCount; add freeTierSignup"
```

---

### Task 6: Stripe — Checkout Session, Customer Portal, Webhook Updates

**Files:**
- Modify: `backend/src/billing/stripe.ts`

Stripe environment variables required:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_BUSINESS_PRICE_ID` — price ID for $15/seat/month recurring
- `STRIPE_STARTER_PRICE_ID` — price ID for $49/month flat recurring
- `STRIPE_SUCCESS_URL` — e.g. `https://console.ciyo.ai/onboarding?session_id={CHECKOUT_SESSION_ID}`
- `STRIPE_CANCEL_URL` — e.g. `https://ciyo.ai/pricing`

- [ ] **Step 1: Rewrite stripe.ts**

```typescript
// backend/src/billing/stripe.ts
import Stripe from 'stripe'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { activateTenant, updateSubscriptionStatus } from './service.js'
import { sendWelcomeEmail } from './email.js'

function stripe(): Stripe {
  return new Stripe(process.env['STRIPE_SECRET_KEY']!)
}

async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export async function createCheckoutSession(opts: {
  plan:          'starter' | 'business'
  seatCount:     number
  tenantName:    string
  tenantSlug:    string
  email:         string
}): Promise<{ url: string }> {
  const s = stripe()
  const priceId = opts.plan === 'business'
    ? process.env['STRIPE_BUSINESS_PRICE_ID']!
    : process.env['STRIPE_STARTER_PRICE_ID']!

  const trialDays = opts.plan === 'business' ? 14 : 0

  const session = await s.checkout.sessions.create({
    mode:                    'subscription',
    payment_method_collection: trialDays > 0 ? 'if_required' : 'always',
    customer_email:          opts.email,
    line_items: [{
      price:    priceId,
      quantity: opts.plan === 'business' ? opts.seatCount : 1,
    }],
    subscription_data: {
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: {
        tenantName: opts.tenantName,
        tenantSlug: opts.tenantSlug,
        plan:       opts.plan,
        seatCount:  String(opts.seatCount),
      },
    },
    metadata: {
      tenantName: opts.tenantName,
      tenantSlug: opts.tenantSlug,
      plan:       opts.plan,
      seatCount:  String(opts.seatCount),
    },
    success_url: process.env['STRIPE_SUCCESS_URL'] ?? 'https://ciyo.ai/welcome',
    cancel_url:  process.env['STRIPE_CANCEL_URL']  ?? 'https://ciyo.ai/pricing',
  })

  return { url: session.url! }
}

export async function createPortalSession(opts: {
  stripeCustomerId: string
  returnUrl:        string
}): Promise<{ url: string }> {
  const s = stripe()
  const session = await s.billingPortal.sessions.create({
    customer:   opts.stripeCustomerId,
    return_url: opts.returnUrl,
  })
  return { url: session.url }
}

export async function handleStripeEvent(rawBody: string, sig: string): Promise<void> {
  let event: Stripe.Event
  if (process.env['STRIPE_SKIP_SIG_VERIFY'] === 'true') {
    event = JSON.parse(rawBody) as Stripe.Event
  } else {
    const s = stripe()
    event = s.webhooks.constructEvent(rawBody, sig, process.env['STRIPE_WEBHOOK_SECRET']!)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const meta    = session.metadata ?? {}
      const email   = session.customer_email ?? ''
      const plan    = (meta['plan'] as 'starter' | 'business') ?? 'business'
      const seats   = parseInt(meta['seatCount'] ?? '1', 10)

      const trialEnd = (session.subscription as Stripe.Subscription | undefined)?.trial_end
        ? new Date(((session.subscription as Stripe.Subscription).trial_end!) * 1000)
        : null

      const result = await activateTenant({
        name:             meta['tenantName'] ?? email,
        slug:             meta['tenantSlug'] ?? email.split('@')[0]!.replace(/[^a-z0-9]/gi, '').toLowerCase(),
        paymentProvider:  'stripe',
        externalSubId:    (session.subscription as string) ?? '',
        plan,
        seatCount:        seats,
        trialEndsAt:      trialEnd,
        stripeCustomerId: session.customer as string | null,
      })
      sendWelcomeEmail({ to: email, tenantName: meta['tenantName'] ?? email, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
      break
    }

    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice
      const id  = await tenantIdBySubId((inv.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'active')
      break
    }

    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice
      const id  = await tenantIdBySubId((inv.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'past_due')
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const id  = await tenantIdBySubId(sub.id)
      if (id) await updateSubscriptionStatus(id, 'cancelled')
      break
    }

    case 'customer.subscription.updated': {
      const sub      = event.data.object as Stripe.Subscription
      const tenantId = await tenantIdBySubId(sub.id)
      if (!tenantId) break
      // sync trial end and seat count if subscription was updated
      const updates: Partial<{ trialEndsAt: Date | null; seatCount: number }> = {}
      if (sub.trial_end) updates.trialEndsAt = new Date(sub.trial_end * 1000)
      const qty = sub.items.data[0]?.quantity
      if (qty) updates.seatCount = qty
      if (Object.keys(updates).length) {
        await db.update(tenants).set(updates).where(eq(tenants.id, tenantId))
      }
      break
    }
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/billing/stripe.ts
git commit -m "feat(billing): Stripe checkout session, portal, trial, and subscription sync"
```

---

### Task 7: PayPal — Subscription Approval URL

**Files:**
- Modify: `backend/src/billing/paypal.ts`

PayPal environment variables required:
- `PAYPAL_CLIENT_ID`
- `PAYPAL_CLIENT_SECRET`
- `PAYPAL_BUSINESS_PLAN_ID` — PayPal Plan ID that has 14-day trial + $15/unit/month
- `PAYPAL_STARTER_PLAN_ID` — PayPal Plan ID for $49/month flat
- `PAYPAL_RETURN_URL` — e.g. `https://ciyo.ai/welcome`
- `PAYPAL_CANCEL_URL` — e.g. `https://ciyo.ai/pricing`

**Note:** PayPal Plans (with trial periods baked in) must be created once in the PayPal dashboard or via the PayPal API setup script. The trial is defined at the Plan level as a `TRIAL` billing cycle of 14 days at $0.

- [ ] **Step 1: Rewrite paypal.ts**

```typescript
// backend/src/billing/paypal.ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { activateTenant, updateSubscriptionStatus } from './service.js'
import { sendWelcomeEmail } from './email.js'

const PAYPAL_API = process.env['PAYPAL_SANDBOX'] === 'true'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com'

async function getAccessToken(): Promise<string> {
  const creds = Buffer.from(
    `${process.env['PAYPAL_CLIENT_ID']}:${process.env['PAYPAL_CLIENT_SECRET']}`
  ).toString('base64')
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method:  'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    'grant_type=client_credentials',
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function createPayPalSubscriptionUrl(opts: {
  plan:       'starter' | 'business'
  seatCount:  number
  tenantName: string
  tenantSlug: string
  email:      string
}): Promise<{ url: string }> {
  const token   = await getAccessToken()
  const planId  = opts.plan === 'business'
    ? process.env['PAYPAL_BUSINESS_PLAN_ID']!
    : process.env['PAYPAL_STARTER_PLAN_ID']!
  const customId = `${opts.tenantSlug}|${opts.tenantName}|${opts.email}|${opts.plan}|${opts.seatCount}`

  const res = await fetch(`${PAYPAL_API}/v1/billing/subscriptions`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id:   planId,
      quantity:  String(opts.seatCount),
      custom_id: customId,
      subscriber: { email_address: opts.email },
      application_context: {
        return_url: process.env['PAYPAL_RETURN_URL'] ?? 'https://ciyo.ai/welcome',
        cancel_url: process.env['PAYPAL_CANCEL_URL'] ?? 'https://ciyo.ai/pricing',
        user_action: 'SUBSCRIBE_NOW',
      },
    }),
  })
  const sub = await res.json() as { links: Array<{ rel: string; href: string }> }
  const approvalLink = sub.links.find(l => l.rel === 'approve')
  if (!approvalLink) throw new Error('PayPal did not return an approval link')
  return { url: approvalLink.href }
}

function parseCustomId(raw: string): {
  slug: string; name: string; email: string
  plan: 'starter' | 'business'; seatCount: number
} | null {
  const [slug, name, email, plan, seats] = raw.split('|')
  if (!slug || !name || !email) return null
  return {
    slug,
    name,
    email,
    plan:      (plan as 'starter' | 'business') ?? 'business',
    seatCount: parseInt(seats ?? '1', 10),
  }
}

async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export async function handlePayPalEvent(body: Record<string, unknown>): Promise<void> {
  const eventType = body['event_type'] as string
  const resource  = body['resource'] as Record<string, unknown>

  switch (eventType) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED': {
      const parsed = parseCustomId((resource['custom_id'] as string) ?? '')
      if (!parsed) return
      const result = await activateTenant({
        name:            parsed.name,
        slug:            parsed.slug,
        paymentProvider: 'paypal',
        externalSubId:   (resource['id'] as string) ?? '',
        plan:            parsed.plan,
        seatCount:       parsed.seatCount,
      })
      sendWelcomeEmail({ to: parsed.email, tenantName: parsed.name, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
      break
    }

    case 'PAYMENT.SALE.COMPLETED': {
      const id = await tenantIdBySubId((resource['billing_agreement_id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'active')
      break
    }

    case 'BILLING.SUBSCRIPTION.CANCELLED': {
      const id = await tenantIdBySubId((resource['id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'cancelled')
      break
    }

    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
      const id = await tenantIdBySubId((resource['id'] as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'past_due')
      break
    }
  }
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/billing/paypal.ts
git commit -m "feat(billing): PayPal subscription creation and webhook updates"
```

---

### Task 8: Billing Router + Registration

**Files:**
- Create: `backend/src/billing/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create billing router**

```typescript
// backend/src/billing/router.ts
import type { FastifyInstance } from 'fastify'
import { eq, and, count, gte } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, members, scans } from '../db/schema.js'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { freeTierSignup } from './service.js'
import { createCheckoutSession, createPortalSession } from './stripe.js'
import { createPayPalSubscriptionUrl } from './paypal.js'
import { PLAN_LIMITS, getScanLimit, getSeatLimit, isOverScanLimit, type Plan } from '../billing/limits.js'

export async function billingRouter(fastify: FastifyInstance): Promise<void> {

  // ── Free-tier self-signup ─────────────────────────────────────────────────
  fastify.post<{
    Body: { name: string; slug: string; email: string }
  }>('/billing/free-signup', async (req, reply) => {
    const { name, slug, email } = req.body
    if (!name || !slug || !email) {
      return reply.status(400).send({ error: 'name, slug, and email are required' })
    }
    const slugOk = /^[a-z0-9-]{2,40}$/.test(slug)
    if (!slugOk) {
      return reply.status(400).send({ error: 'slug must be 2-40 lowercase alphanumeric/hyphen characters' })
    }
    try {
      const result = await freeTierSignup({ name, slug, email })
      return reply.status(201).send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account'
      return reply.status(409).send({ error: msg })
    }
  })

  // ── Stripe checkout session ───────────────────────────────────────────────
  fastify.post<{
    Body: { plan: 'starter' | 'business'; seatCount: number; tenantName: string; tenantSlug: string; email: string }
  }>('/billing/stripe/checkout', async (req, reply) => {
    const { plan, seatCount, tenantName, tenantSlug, email } = req.body
    if (!plan || !tenantName || !tenantSlug || !email) {
      return reply.status(400).send({ error: 'plan, tenantName, tenantSlug, and email are required' })
    }
    if (plan === 'business' && seatCount < 10) {
      return reply.status(400).send({ error: 'Business plan requires at least 10 seats' })
    }
    try {
      const result = await createCheckoutSession({ plan, seatCount: seatCount ?? 1, tenantName, tenantSlug, email })
      return reply.status(200).send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create checkout session'
      return reply.status(500).send({ error: msg })
    }
  })

  // ── Stripe customer portal ────────────────────────────────────────────────
  fastify.post<{
    Body: { returnUrl?: string }
  }>('/billing/stripe/portal', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const customerId = req.tenant.stripeCustomerId
    if (!customerId) {
      return reply.status(400).send({ error: 'No Stripe customer associated with this account' })
    }
    const returnUrl = (req.body as { returnUrl?: string }).returnUrl
      ?? `${process.env['CONSOLE_URL'] ?? 'https://console.ciyo.ai'}/settings`
    try {
      const result = await createPortalSession({ stripeCustomerId: customerId, returnUrl })
      return reply.status(200).send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create portal session'
      return reply.status(500).send({ error: msg })
    }
  })

  // ── PayPal subscription checkout ──────────────────────────────────────────
  fastify.post<{
    Body: { plan: 'starter' | 'business'; seatCount: number; tenantName: string; tenantSlug: string; email: string }
  }>('/billing/paypal/checkout', async (req, reply) => {
    const { plan, seatCount, tenantName, tenantSlug, email } = req.body
    if (!plan || !tenantName || !tenantSlug || !email) {
      return reply.status(400).send({ error: 'plan, tenantName, tenantSlug, and email are required' })
    }
    if (plan === 'business' && seatCount < 10) {
      return reply.status(400).send({ error: 'Business plan requires at least 10 seats' })
    }
    try {
      const result = await createPayPalSubscriptionUrl({ plan, seatCount: seatCount ?? 1, tenantName, tenantSlug, email })
      return reply.status(200).send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create PayPal subscription'
      return reply.status(500).send({ error: msg })
    }
  })

  // ── Billing status (for Console) ──────────────────────────────────────────
  fastify.get('/billing/status', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const tenant = req.tenant
    const plan   = tenant.plan as Plan

    const start = new Date()
    start.setUTCDate(1)
    start.setUTCHours(0, 0, 0, 0)
    const [scanRow] = await db
      .select({ n: count() })
      .from(scans)
      .where(and(eq(scans.tenantId, tenant.id), gte(scans.occurredAt, start)))
    const monthlyScans = scanRow?.n ?? 0

    const [seatRow] = await db
      .select({ n: count() })
      .from(members)
      .where(eq(members.tenantId, tenant.id))
    const currentSeats = seatRow?.n ?? 0

    const scanLimit   = getScanLimit(plan)
    const seatLimit   = getSeatLimit(plan)
    const scanBlocked = isOverScanLimit(plan, monthlyScans)

    return reply.send({
      plan,
      subscriptionStatus: tenant.subscriptionStatus,
      trialEndsAt:        tenant.trialEndsAt?.toISOString() ?? null,
      seatCount:          currentSeats,
      seatLimit,
      monthlyScans,
      scanLimit,
      scanBlocked,
      paymentProvider:    tenant.paymentProvider ?? null,
      features: {
        assistantEnabled:  PLAN_LIMITS[plan]?.assistantEnabled ?? false,
        advancedAnalytics: PLAN_LIMITS[plan]?.advancedAnalytics ?? false,
      },
    })
  })
}
```

- [ ] **Step 2: Register billing router in app.ts**

In `backend/src/app.ts`, add after the last `void app.register(...)` call and before `app.setErrorHandler`:

```typescript
// Add import at top of app.ts with other router imports:
import { billingRouter } from './billing/router.js'

// Add registration (before setErrorHandler):
void app.register(billingRouter, { prefix: '/v1' })
```

- [ ] **Step 3: TypeScript check + run tests**

```bash
cd backend && npx tsc --noEmit && npx vitest run
```

Expected: no TS errors, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/billing/router.ts backend/src/app.ts
git commit -m "feat(billing): billing router — free signup, Stripe/PayPal checkout, status endpoint"
```

---

### Task 9: Admin Console — Types, API Methods, useBilling Hook

**Files:**
- Modify: `admin/src/types.ts`
- Modify: `admin/src/api.ts`
- Create: `admin/src/hooks/useBilling.ts`

- [ ] **Step 1: Add BillingStatus to types.ts**

Open `admin/src/types.ts` and add at the end of the file:

```typescript
export interface BillingStatus {
  plan:               'free' | 'starter' | 'business' | 'enterprise'
  subscriptionStatus: 'active' | 'past_due' | 'cancelled'
  trialEndsAt:        string | null
  seatCount:          number
  seatLimit:          number   // -1 = unlimited
  monthlyScans:       number
  scanLimit:          number   // -1 = unlimited
  scanBlocked:        boolean
  paymentProvider:    'stripe' | 'paypal' | null
  features: {
    assistantEnabled:  boolean
    advancedAnalytics: boolean
  }
}
```

- [ ] **Step 2: Add billing methods to api.ts**

In `admin/src/api.ts`, add at the top of the import list:

```typescript
import type { ..., BillingStatus } from './types'
```

Then add to the `api` object after the `assistant:` block:

```typescript
  billing: {
    status: () =>
      request<BillingStatus>('GET', '/v1/billing/status'),
    stripePortal: (returnUrl?: string) =>
      request<{ url: string }>('POST', '/v1/billing/stripe/portal', { returnUrl }),
  },
```

- [ ] **Step 3: Create useBilling.ts**

```typescript
// admin/src/hooks/useBilling.ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import type { BillingStatus } from '../types'

export function useBilling() {
  return useQuery<BillingStatus>({
    queryKey:         ['billing-status'],
    queryFn:          api.billing.status,
    staleTime:        60_000,
    refetchOnMount:   false,
    refetchInterval:  5 * 60_000, // refresh every 5 min
  })
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd admin && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add admin/src/types.ts admin/src/api.ts admin/src/hooks/useBilling.ts
git commit -m "feat(billing): BillingStatus type, api.billing methods, useBilling hook"
```

---

### Task 10: Admin Console — UpgradeBanner + PlanGate Components

**Files:**
- Create: `admin/src/components/billing/UpgradeBanner.tsx`
- Create: `admin/src/components/billing/PlanGate.tsx`
- Modify: `admin/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Create UpgradeBanner.tsx**

```tsx
// admin/src/components/billing/UpgradeBanner.tsx
import type { BillingStatus } from '../../types'

interface Props {
  billing: BillingStatus
}

function upgradeUrl(billing: BillingStatus): string {
  return billing.paymentProvider === 'paypal'
    ? 'https://ciyo.ai/pricing?provider=paypal'
    : 'https://ciyo.ai/pricing'
}

function scanPercent(billing: BillingStatus): number {
  if (billing.scanLimit === -1) return 0
  return Math.round((billing.monthlyScans / billing.scanLimit) * 100)
}

export function UpgradeBanner({ billing }: Props) {
  if (billing.plan === 'business' || billing.plan === 'enterprise') return null

  const pct     = scanPercent(billing)
  const nearLim = pct >= 80 && !billing.scanBlocked
  const blocked = billing.scanBlocked

  if (!nearLim && !blocked) return null

  const href = upgradeUrl(billing)

  return (
    <div style={{
      background: blocked
        ? 'linear-gradient(90deg, rgba(220,53,69,0.12), rgba(220,53,69,0.06))'
        : 'linear-gradient(90deg, rgba(124,106,255,0.12), rgba(124,106,255,0.06))',
      borderBottom: `1px solid ${blocked ? 'rgba(220,53,69,0.3)' : 'color-mix(in srgb, var(--brand-primary) 25%, transparent)'}`,
      padding: '9px 24px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      fontSize: 12, flexShrink: 0,
    }}>
      <span style={{ color: blocked ? 'var(--status-danger)' : 'var(--text-primary)' }}>
        {blocked
          ? `Scan limit reached — extension is blocking submissions. ${billing.monthlyScans.toLocaleString()} / ${billing.scanLimit.toLocaleString()} scans used this month.`
          : `Approaching scan limit — ${pct}% used (${billing.monthlyScans.toLocaleString()} / ${billing.scanLimit.toLocaleString()}).`}
      </span>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        style={{
          background: 'var(--brand-primary)', color: '#fff',
          borderRadius: 6, padding: '4px 12px', fontSize: 11,
          fontWeight: 600, textDecoration: 'none', flexShrink: 0, marginLeft: 16,
        }}
      >
        Upgrade plan
      </a>
    </div>
  )
}
```

- [ ] **Step 2: Create PlanGate.tsx**

```tsx
// admin/src/components/billing/PlanGate.tsx
import type { ReactNode } from 'react'
import { useBilling } from '../../hooks/useBilling'

interface Props {
  feature: 'assistant' | 'advancedAnalytics'
  children: ReactNode
  fallback?: ReactNode
}

export function PlanGate({ feature, children, fallback }: Props) {
  const { data: billing } = useBilling()

  const allowed = billing?.features?.[
    feature === 'assistant' ? 'assistantEnabled' : 'advancedAnalytics'
  ] ?? true // fail open — don't gate if billing isn't loaded yet

  if (allowed) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', height: '100%', gap: 16, padding: 40,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 32 }}>✦</div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
        {feature === 'assistant' ? 'AI Assistant' : 'Advanced Analytics'} is a Business feature
      </h2>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 380, margin: 0 }}>
        Upgrade to Business to unlock {feature === 'assistant'
          ? 'the AI-powered policy assistant that can read your org\'s data and suggest changes'
          : 'historical analytics, incident trends, and per-user breakdowns'}.
      </p>
      <a
        href="https://ciyo.ai/pricing"
        target="_blank"
        rel="noreferrer"
        style={{
          background: 'var(--brand-primary)', color: '#fff', borderRadius: 8,
          padding: '10px 24px', fontSize: 14, fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        View pricing
      </a>
    </div>
  )
}
```

- [ ] **Step 3: Wire UpgradeBanner into AppLayout.tsx**

In `admin/src/components/layout/AppLayout.tsx`:

Add import at top:
```typescript
import { UpgradeBanner } from '../billing/UpgradeBanner'
import { useBilling } from '../../hooks/useBilling'
```

Add `useBilling()` call inside `AppLayout` component (after `useUser`):
```typescript
const { data: billing } = useBilling()
```

Add plan badge in the org section of the sidebar (after the org name div, around line 93):
```tsx
{billing && (
  <div style={{
    display: 'inline-block',
    fontSize: 9, fontWeight: 700, letterSpacing: '0.5px',
    color: billing.plan === 'business' ? 'var(--status-safe)' : 'var(--text-muted)',
    background: billing.plan === 'business'
      ? 'rgba(0,200,100,0.12)'
      : 'var(--bg-surface-raised)',
    border: `1px solid ${billing.plan === 'business' ? 'rgba(0,200,100,0.25)' : 'var(--border)'}`,
    borderRadius: 4, padding: '1px 5px', marginTop: 4,
    textTransform: 'uppercase',
  }}>
    {billing.plan}
  </div>
)}
```

Replace the existing top bar `<div>` (lines ~162-168) to include the UpgradeBanner:
```tsx
{/* Main */}
<div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
  {/* Upgrade banner */}
  {billing && <UpgradeBanner billing={billing} />}

  {/* Top bar */}
  <div style={{
    padding: '21px 24px', borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)', display: 'flex',
    justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexShrink: 0,
  }}>
    <ThemeToggle />
  </div>

  {/* Page content */}
  <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)' }}>
    <Outlet />
  </div>
  {/* footer unchanged */}
```

- [ ] **Step 4: Wrap AssistantPage with PlanGate in the route config**

Find where the `<AssistantPage />` route is rendered in the router (check `admin/src/App.tsx` or similar) and wrap it:

```tsx
import { PlanGate } from './components/billing/PlanGate'

// In router config:
<Route path="assistant" element={
  <PlanGate feature="assistant">
    <AssistantPage />
  </PlanGate>
} />
```

- [ ] **Step 5: TypeScript check + build**

```bash
cd admin && npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Expected: no errors, build succeeds.

- [ ] **Step 6: Commit**

```bash
git add admin/src/components/billing/ admin/src/components/layout/AppLayout.tsx
git commit -m "feat(billing): UpgradeBanner, PlanGate components; plan badge in sidebar"
```

---

### Task 11: Admin Console — Settings Billing Section

**Files:**
- Modify: `admin/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add billing section to SettingsPage**

Open `admin/src/pages/SettingsPage.tsx`. Add at the top of the file:

```typescript
import { useBilling } from '../hooks/useBilling'
import { api } from '../api'
```

Add `useBilling()` call in the `SettingsPage` component after the existing hooks:

```typescript
const { data: billing, isLoading: billingLoading } = useBilling()
```

Add a helper function for trial countdown (below the component, above `TokenCard`):

```typescript
function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const diff = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)))
}
```

Add a new `BillingCard` component at the bottom of the file:

```tsx
function BillingCard({ billing, isLoading }: {
  billing: import('../types').BillingStatus | undefined
  isLoading: boolean
}) {
  const [portalLoading, setPortalLoading] = useState(false)

  async function openPortal() {
    setPortalLoading(true)
    try {
      const { url } = await api.billing.stripePortal()
      window.open(url, '_blank')
    } catch {
      alert('Could not open billing portal. Please contact support.')
    } finally {
      setPortalLoading(false)
    }
  }

  const trialDays = daysUntil(billing?.trialEndsAt ?? null)
  const scanPct   = billing && billing.scanLimit !== -1
    ? Math.round((billing.monthlyScans / billing.scanLimit) * 100)
    : null

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 24, maxWidth: 560,
    display: 'flex', flexDirection: 'column', gap: 16,
  }
  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
  }

  return (
    <div style={sectionStyle}>
      <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Billing</h2>

      {isLoading && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading…</p>}

      {billing && (
        <>
          {/* Plan row */}
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Plan</span>
            <span style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
              color: billing.plan === 'business' ? 'var(--status-safe)' : 'var(--brand-primary)',
              background: billing.plan === 'business' ? 'rgba(0,200,100,0.1)' : 'color-mix(in srgb, var(--brand-primary) 10%, transparent)',
              border: `1px solid ${billing.plan === 'business' ? 'rgba(0,200,100,0.25)' : 'color-mix(in srgb, var(--brand-primary) 25%, transparent)'}`,
              borderRadius: 4, padding: '2px 8px',
            }}>
              {billing.plan}
            </span>
          </div>

          {/* Subscription status */}
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Status</span>
            <span style={{
              color: billing.subscriptionStatus === 'active'   ? 'var(--status-safe)'   :
                     billing.subscriptionStatus === 'past_due' ? 'var(--status-warn)'   : 'var(--status-danger)',
              fontWeight: 600, textTransform: 'capitalize', fontSize: 13,
            }}>
              {billing.subscriptionStatus.replace('_', ' ')}
            </span>
          </div>

          {/* Trial countdown */}
          {trialDays !== null && (
            <div style={{
              background: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
              border: '1px solid color-mix(in srgb, var(--brand-primary) 20%, transparent)',
              borderRadius: 8, padding: '10px 14px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                {trialDays > 0
                  ? `Free trial — ${trialDays} day${trialDays !== 1 ? 's' : ''} remaining`
                  : 'Trial ended — add payment to continue'}
              </span>
            </div>
          )}

          {/* Monthly scans */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={rowStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>Monthly scans</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                {billing.monthlyScans.toLocaleString()}
                {billing.scanLimit !== -1 ? ` / ${billing.scanLimit.toLocaleString()}` : ' (unlimited)'}
              </span>
            </div>
            {scanPct !== null && (
              <div style={{
                height: 4, borderRadius: 4,
                background: 'var(--border)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 4,
                  width: `${Math.min(scanPct, 100)}%`,
                  background: scanPct >= 100 ? 'var(--status-danger)' :
                               scanPct >= 80  ? 'var(--status-warn)'   : 'var(--brand-primary)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
            )}
          </div>

          {/* Seats */}
          <div style={rowStyle}>
            <span style={{ color: 'var(--text-secondary)' }}>Active seats</span>
            <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
              {billing.seatCount}
              {billing.seatLimit !== -1 ? ` / ${billing.seatLimit}` : ' (unlimited)'}
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {billing.plan === 'free' || billing.plan === 'starter' ? (
              <a
                href="https://ciyo.ai/pricing"
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'var(--brand-primary)', color: '#fff',
                  borderRadius: 7, padding: '8px 20px', fontSize: 13,
                  fontWeight: 600, textDecoration: 'none',
                }}
              >
                Upgrade plan
              </a>
            ) : billing.paymentProvider === 'stripe' ? (
              <button
                onClick={() => void openPortal()}
                disabled={portalLoading}
                style={{
                  background: 'var(--bg-surface-raised)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 7,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', opacity: portalLoading ? 0.6 : 1,
                }}
              >
                {portalLoading ? 'Opening…' : 'Manage subscription'}
              </button>
            ) : billing.paymentProvider === 'paypal' ? (
              <a
                href="https://www.paypal.com/myaccount/autopay/"
                target="_blank"
                rel="noreferrer"
                style={{
                  background: 'var(--bg-surface-raised)', color: 'var(--text-primary)',
                  border: '1px solid var(--border)', borderRadius: 7,
                  padding: '8px 20px', fontSize: 13, fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Manage on PayPal
              </a>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
```

Add the `<BillingCard>` in the `SettingsPage` render, between the Organisation section and the API Tokens section:

```tsx
<BillingCard billing={billing} isLoading={billingLoading} />
```

- [ ] **Step 2: TypeScript check + build**

```bash
cd admin && npx tsc --noEmit && npm run build 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/SettingsPage.tsx
git commit -m "feat(billing): Settings > Billing section — plan badge, scan usage bar, trial countdown, portal link"
```

---

### Task 12: Extension — Handle Scan Limit (402)

**Files:**
- Modify: `src/scans/dispatch.ts`
- Modify: `src/background/service-worker.ts`
- Modify: `src/content/content-script.ts`

The extension currently fires scan recording as fire-and-forget. With limits enforced, the service worker now:
1. Checks `chrome.storage.local.scanLimitReached` before allowing detection
2. Awaits `dispatchScan()` response; if 402, sets `scanLimitReached = true` in storage

- [ ] **Step 1: Update src/scans/dispatch.ts**

Replace the entire file:

```typescript
// src/scans/dispatch.ts
import { API_BASE } from "@/shared/constants";

async function getAuthToken(): Promise<string | null> {
  const clerkResult = await chrome.storage.local.get("clerkSessionToken") as Record<string, unknown>;
  if (typeof clerkResult["clerkSessionToken"] === "string") return clerkResult["clerkSessionToken"];
  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>;
  if (typeof managed["orgToken"] === "string") return managed["orgToken"];
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>;
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null;
}

export async function dispatchScan(): Promise<{ blocked: boolean }> {
  const token = await getAuthToken();
  if (!token) return { blocked: false };

  try {
    const res = await Promise.race([
      fetch(`${API_BASE}/v1/scans`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
      }),
      // timeout: if backend is unreachable, fail open
      new Promise<Response>((resolve) =>
        setTimeout(() => resolve(new Response(null, { status: 200 })), 3000)
      ),
    ]);

    if (res.status === 402) {
      await chrome.storage.local.set({ scanLimitReached: true });
      return { blocked: true };
    }
  } catch {
    // network error — fail open
  }

  return { blocked: false };
}
```

- [ ] **Step 2: Update service-worker.ts DETECT handler**

In `src/background/service-worker.ts`, replace the `case "DETECT":` block:

```typescript
case "DETECT": {
  const { text, hostname, pasteDetected } = message.payload;
  if (!await isAuthenticated()) return unauthResult();

  // Check cached scan limit status — updated after each scan
  const stored = await chrome.storage.local.get("scanLimitReached") as Record<string, unknown>;
  if (stored["scanLimitReached"] === true) {
    return {
      findings:       [],
      highestAction:  "block",
      promptHash:     "",
      detectedAtMs:   Date.now(),
      durationMs:     0,
      scanLimitReached: true,
    } satisfies DetectionResult & { scanLimitReached: boolean };
  }

  const policy = await loadPolicy();
  const result = await detectPrompt(text, policy, hostname, pasteDetected ?? false);
  void dispatchEvents(result, hostname);

  // Await scan — if 402, next detection will be blocked
  dispatchScan().then(({ blocked }) => {
    if (blocked) {
      chrome.storage.local.set({ scanLimitReached: true }).catch(() => {});
    }
  }).catch(() => {});

  return result;
}
```

- [ ] **Step 3: Update content-script.ts to show scan limit overlay**

In `src/content/content-script.ts`, update the `adapter.onSendIntent` callback to handle `scanLimitReached`:

```typescript
adapter.onSendIntent(async (_e: Event) => {
  try {
    const composer = adapter.findComposer();
    if (!composer) return { proceed: true };

    const promptText = adapter.readPromptText(composer);
    if (!promptText.trim()) return { proceed: true };

    const result = await sendMessage({
      type: "DETECT",
      payload: { text: promptText, hostname, pasteDetected: wasPasteRecent() },
    }) as DetectionResult & { scanLimitReached?: boolean };

    logger.debug("Detection result:", result);

    // Scan limit reached — show upgrade overlay, block all submissions
    if (result.scanLimitReached) {
      showScanLimitOverlay();
      return { proceed: false };
    }

    await writeAuditEvent(result, promptText, hostname, "sent");

    if (result.signInNudge) {
      showSignInNudge();
    }

    if (result.highestAction === "log") {
      return { proceed: true };
    }

    const decision = await showWarningModal(result, promptText);

    switch (decision.type) {
      case "edit":
        await writeAuditEvent(result, promptText, hostname, "edited");
        composer.focus();
        return { proceed: false };

      case "send_anyway":
        await writeAuditEvent(result, promptText, hostname, "sent_with_reason", decision.reason);
        return { proceed: true };
    }
  } catch (err) {
    logger.error("Send-intent handler error:", err);
    return { proceed: true };
  }
});
```

Add `showScanLimitOverlay` function in `content-script.ts` (below `showSignInNudge`):

```typescript
function showScanLimitOverlay(): void {
  if (document.getElementById("pretzel-scan-limit")) return;

  const banner = document.createElement("div");
  banner.id = "pretzel-scan-limit";
  Object.assign(banner.style, {
    position: "fixed",
    bottom: "24px",
    right: "24px",
    zIndex: "2147483647",
    background: "#1a0f2e",
    color: "#f0f0f0",
    borderRadius: "10px",
    padding: "14px 16px",
    fontSize: "13px",
    lineHeight: "1.5",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
    border: "1px solid rgba(220,53,69,0.4)",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    maxWidth: "320px",
    fontFamily: "system-ui, -apple-system, sans-serif",
  });

  const msg = document.createElement("p");
  msg.style.cssText = "margin:0;";
  msg.innerHTML = '<strong style="color:#ff6b6b">Monthly scan limit reached.</strong><br>Prompts are being blocked. Upgrade your Pretzel plan to continue.';

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;";

  const upgrade = document.createElement("a");
  upgrade.href = "https://ciyo.ai/pricing";
  upgrade.target = "_blank";
  upgrade.textContent = "Upgrade plan";
  upgrade.style.cssText = "background:#7c6aff;color:#fff;border-radius:6px;padding:6px 14px;font-size:12px;font-weight:600;text-decoration:none;";

  const dismiss = document.createElement("button");
  dismiss.textContent = "Dismiss";
  dismiss.style.cssText = "background:none;border:1px solid rgba(255,255,255,0.2);color:rgba(255,255,255,0.6);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;";
  dismiss.addEventListener("click", () => banner.remove());

  actions.appendChild(upgrade);
  actions.appendChild(dismiss);
  banner.appendChild(msg);
  banner.appendChild(actions);
  document.body.appendChild(banner);
}
```

- [ ] **Step 4: Build the extension**

```bash
npm run build 2>&1 | tail -10
```

Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Manual smoke test**

1. Load the extension in Chrome (unpacked)
2. Open ChatGPT
3. Using the Chrome devtools Application > Local Storage, set `scanLimitReached: true` in chrome.storage.local (via the extension's service worker console)
4. Try submitting a prompt — expect the scan limit overlay to appear and block

- [ ] **Step 6: Commit**

```bash
git add src/scans/dispatch.ts src/background/service-worker.ts src/content/content-script.ts
git commit -m "feat(billing): extension handles 402 scan limit — overlay blocks submissions until upgrade"
```

---

### Task 13: Verification

**Files:** No new files — integration tests and smoke checks.

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx vitest run
```

Expected: all tests pass (look for the limits, service, and scan tests from Tasks 2-5).

- [ ] **Step 2: Start backend + run manual checks**

```bash
cd backend && npm run dev
```

Check free-tier signup:
```bash
curl -s -X POST http://localhost:3000/v1/billing/free-signup \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Corp","slug":"test-corp","email":"test@example.com"}' | jq .
```

Expected: `{ tenantId: "...", orgToken: "ps_live_test-corp_...", adminToken: "ps_adm_test-corp_..." }`

Check billing status with that token:
```bash
curl -s http://localhost:3000/v1/billing/status \
  -H "Authorization: Bearer <adminToken from above>" | jq .
```

Expected:
```json
{
  "plan": "free",
  "subscriptionStatus": "active",
  "trialEndsAt": null,
  "seatCount": 0,
  "seatLimit": 3,
  "monthlyScans": 0,
  "scanLimit": 500,
  "scanBlocked": false,
  "paymentProvider": null,
  "features": { "assistantEnabled": false, "advancedAnalytics": false }
}
```

- [ ] **Step 3: Start Admin Console and verify Settings page**

```bash
cd admin && npm run dev
```

Open `http://localhost:5173/settings` — verify:
- Billing section appears with plan badge, scan usage bar, seat count
- "Upgrade plan" button links to ciyo.ai/pricing for free-tier tenants
- No console errors

- [ ] **Step 4: Verify AI Assistant is gated**

Navigate to `/assistant` in the Console when on the free plan — expect the PlanGate upgrade prompt to appear, not the chat UI.

- [ ] **Step 5: E2E test pass**

```bash
cd backend && npx vitest run --reporter verbose 2>&1 | tail -20
```

Expected: all existing E2E tests still pass (billing changes should not break existing test suite).

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore(billing): verification pass — all tests green, smoke checks pass"
```

---

---

### Task 14: E2E Tests — Billing API

**Files:**
- Modify: `backend/src/scripts/seed-e2e.ts`
- Create: `e2e/api/billing.spec.ts`

**Why seed changes are needed first:** The E2E tenant is currently seeded without an explicit `plan`, so it would fall back to the new default `'free'` after the schema migration — breaking all existing tests that depend on unrestricted behaviour. We also need a second "scan-capped" free tenant pre-loaded with 500 scans to test the hard-block path without making 500 HTTP calls in a test.

- [ ] **Step 1: Update seed-e2e.ts — explicit plan on main tenant**

In `backend/src/scripts/seed-e2e.ts`, find the `db.insert(tenants).values({...})` call and add `plan` and `seatCount`:

```typescript
const [tenant] = await db.insert(tenants).values({
  name:               'E2E Test Org',
  slug:               'e2etenant',
  orgTokenHash:       await hashToken(orgSecret),
  adminTokenHash:     await hashToken(adminSecret),
  paymentProvider:    'stripe',
  externalSubId:      'sub_e2e_test',
  subscriptionStatus: 'active',
  plan:               'business',   // explicit — keeps all existing tests working
  seatCount:          20,
}).returning({ id: tenants.id })
```

- [ ] **Step 2: Add a scan-capped free tenant to seed-e2e.ts**

After the main tenant block (after the `writeFileSync` call but before `process.exit(0)`), add:

```typescript
// ── Scan-capped free tenant (for billing limit E2E tests) ──────────────────
const freeOrgSecret   = generateSecret()
const freeAdminSecret = generateSecret()
const freeOrgToken    = formatToken('ps_live', 'e2efree', freeOrgSecret)
const freeAdminToken  = formatToken('ps_adm',  'e2efree', freeAdminSecret)

const [freeTenant] = await db.insert(tenants).values({
  name:               'E2E Free Org',
  slug:               'e2efree',
  orgTokenHash:       await hashToken(freeOrgSecret),
  adminTokenHash:     await hashToken(freeAdminSecret),
  paymentProvider:    null,
  externalSubId:      null,
  subscriptionStatus: 'active',
  plan:               'free',
  seatCount:          1,
}).returning({ id: tenants.id })

const freeTenantId = freeTenant!.id

// Pre-insert 500 scans — fills the monthly limit
const scanRows = Array.from({ length: 500 }, () => ({
  tenantId: freeTenantId,
  memberId: null as string | null,
  occurredAt: new Date(),
}))
await db.insert(scans).values(scanRows)

// Add 3 members to the free tenant (at seat cap)
await db.insert(members).values([
  { tenantId: freeTenantId, email: 'free-member-1@e2e.test', role: 'member' as const },
  { tenantId: freeTenantId, email: 'free-member-2@e2e.test', role: 'member' as const },
  { tenantId: freeTenantId, email: 'free-member-3@e2e.test', role: 'member' as const },
])
```

Update the `seedState` object and `writeFileSync` call to include the free tenant tokens:

```typescript
const seedState = {
  tenantId,
  orgToken,
  adminToken,
  assistantSessionId:     chatSession1!.id,
  assistantMessageId:     chatMessage1!.id,
  assistantFlowMessageId: chatMessage2!.id,
  // Billing limit test fixtures
  freeTenantId,
  freeOrgToken,
  freeAdminToken,
}
writeFileSync(SEED_STATE_PATH, JSON.stringify(seedState, null, 2))
```

- [ ] **Step 3: Update seed-state.ts helper**

In `e2e/helpers/seed-state.ts`, add the new fields to the `SeedState` interface:

```typescript
interface SeedState {
  tenantId:               string
  orgToken:               string
  adminToken:             string
  assistantSessionId:     string
  assistantMessageId:     string
  assistantFlowMessageId: string
  // Billing limit test fixtures
  freeTenantId:   string
  freeOrgToken:   string
  freeAdminToken: string
}
```

- [ ] **Step 4: Run test to confirm it fails before writing spec**

```bash
npx playwright test e2e/api/billing.spec.ts 2>&1 | tail -5
```

Expected: FAIL — file not found.

- [ ] **Step 5: Write e2e/api/billing.spec.ts**

```typescript
// e2e/api/billing.spec.ts
import { test, expect, request as playwrightRequest } from '@playwright/test'
import { getSeedState } from '../helpers/seed-state.js'
import { adminHeaders } from '../helpers/admin-headers.js'

const BACKEND = process.env.E2E_BACKEND_URL ?? 'http://localhost:3000'

// ── GET /v1/billing/status ────────────────────────────────────────────────────

test.describe('GET /v1/billing/status', () => {
  test('returns correct shape for business-plan tenant', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/billing/status`, {
      headers: adminHeaders(),
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body['plan']).toBe('business')
    expect(body['subscriptionStatus']).toBe('active')
    expect(typeof body['monthlyScans']).toBe('number')
    expect(typeof body['scanLimit']).toBe('number')
    expect(body['scanLimit']).toBe(-1)          // unlimited on business
    expect(body['scanBlocked']).toBe(false)
    expect(body['seatLimit']).toBe(-1)          // unlimited on business
    expect((body['features'] as Record<string, unknown>)['assistantEnabled']).toBe(true)
    expect((body['features'] as Record<string, unknown>)['advancedAnalytics']).toBe(true)
    await api.dispose()
  })

  test('returns correct shape for free-plan tenant', async () => {
    const { freeAdminToken } = getSeedState()
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/billing/status`, {
      headers: { Authorization: `Bearer ${freeAdminToken}` },
    })
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body['plan']).toBe('free')
    expect(body['scanLimit']).toBe(500)
    expect(body['seatLimit']).toBe(3)
    expect(body['scanBlocked']).toBe(true)       // seeded with 500 scans
    expect((body['features'] as Record<string, unknown>)['assistantEnabled']).toBe(false)
    await api.dispose()
  })

  test('returns 401 without auth', async () => {
    const api = await playwrightRequest.newContext()
    const res  = await api.get(`${BACKEND}/v1/billing/status`)
    expect(res.status()).toBe(401)
    await api.dispose()
  })
})

// ── POST /v1/billing/free-signup ──────────────────────────────────────────────

test.describe('POST /v1/billing/free-signup', () => {
  test('creates a free tenant and returns tokens', async () => {
    const api  = await playwrightRequest.newContext()
    const slug = `e2e-free-${Date.now()}`
    const res  = await api.post(`${BACKEND}/v1/billing/free-signup`, {
      data: { name: 'E2E Billing Free', slug, email: `billing-free-${Date.now()}@e2e.test` },
    })
    expect(res.status()).toBe(201)
    const body = await res.json() as Record<string, unknown>
    expect(typeof body['tenantId']).toBe('string')
    expect(typeof body['orgToken']).toBe('string')
    expect(typeof body['adminToken']).toBe('string')
    expect((body['orgToken'] as string).startsWith('ps_live_')).toBe(true)
    expect((body['adminToken'] as string).startsWith('ps_adm_')).toBe(true)
    await api.dispose()
  })

  test('returns 409 for duplicate slug', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/billing/free-signup`, {
      data: { name: 'E2E Dup', slug: 'e2efree', email: 'dup@e2e.test' },
    })
    expect(res.status()).toBe(409)
    await api.dispose()
  })

  test('returns 400 for invalid slug format', async () => {
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/billing/free-signup`, {
      data: { name: 'Bad', slug: 'UPPERCASE-NOT-OK', email: 'x@x.com' },
    })
    expect(res.status()).toBe(400)
    await api.dispose()
  })
})

// ── POST /v1/scans — limit enforcement ───────────────────────────────────────

test.describe('POST /v1/scans — plan enforcement', () => {
  test('business tenant can record scans freely (200 ok)', async () => {
    const { orgToken } = getSeedState()
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/scans`, {
      headers: { Authorization: `Bearer ${orgToken}` },
    })
    // business plan is unlimited — always 200
    expect(res.status()).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body['ok']).toBe(true)
    expect(body['remaining']).toBe(-1)
    await api.dispose()
  })

  test('free tenant at 500 scans gets 402 on next scan', async () => {
    const { freeOrgToken } = getSeedState()
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/scans`, {
      headers: { Authorization: `Bearer ${freeOrgToken}` },
    })
    // seeded with 500 scans — next one should be blocked
    expect(res.status()).toBe(402)
    const body = await res.json() as Record<string, unknown>
    expect(body['error']).toBe('scan_limit_reached')
    expect(body['blocked']).toBe(true)
    await api.dispose()
  })
})

// ── Rule kind gating ─────────────────────────────────────────────────────────

test.describe('Rule kind gating by plan', () => {
  test('free tenant cannot create entropy rules — returns 402', async () => {
    const { freeAdminToken, freeTenantId } = getSeedState()
    const api = await playwrightRequest.newContext()

    // First create a subject to attach the rule to
    const subRes = await api.post(`${BACKEND}/v1/subjects`, {
      headers: { Authorization: `Bearer ${freeAdminToken}` },
      data: { name: 'E2E Free Subject', active: true },
    })
    expect(subRes.status()).toBe(201)
    const sub = await subRes.json() as { id: string }

    const ruleRes = await api.post(`${BACKEND}/v1/subjects/${sub.id}/rules`, {
      headers: { Authorization: `Bearer ${freeAdminToken}` },
      data: { kind: 'entropy', action: 'block', reportLevel: 'none' },
    })
    expect(ruleRes.status()).toBe(402)
    const body = await ruleRes.json() as Record<string, unknown>
    expect((body['error'] as string).toLowerCase()).toMatch(/plan|upgrade|entropy/)

    await api.dispose()
  })

  test('business tenant can create entropy rules', async () => {
    const api = await playwrightRequest.newContext()

    const subRes = await api.post(`${BACKEND}/v1/subjects`, {
      headers: adminHeaders(),
      data: { name: 'E2E Business Entropy Subject' },
    })
    expect(subRes.status()).toBe(201)
    const sub = await subRes.json() as { id: string }

    const ruleRes = await api.post(`${BACKEND}/v1/subjects/${sub.id}/rules`, {
      headers: adminHeaders(),
      data: { kind: 'entropy', action: 'block', reportLevel: 'none' },
    })
    expect(ruleRes.status()).toBe(201)

    // Cleanup
    const rule = await ruleRes.json() as { id: string }
    await api.delete(`${BACKEND}/v1/rules/${rule.id}`, { headers: adminHeaders() })
    await api.delete(`${BACKEND}/v1/subjects/${sub.id}`, { headers: adminHeaders() })
    await api.dispose()
  })
})

// ── Seat limit enforcement ────────────────────────────────────────────────────

test.describe('Seat limit enforcement', () => {
  test('free tenant at 3 seats cannot add a 4th member — returns 402', async () => {
    const { freeAdminToken } = getSeedState()
    const api = await playwrightRequest.newContext()

    const res = await api.post(`${BACKEND}/v1/members`, {
      headers: { Authorization: `Bearer ${freeAdminToken}` },
      data: { email: `seat-limit-${Date.now()}@e2e.test`, role: 'member' },
    })
    expect(res.status()).toBe(402)
    const body = await res.json() as Record<string, unknown>
    expect((body['error'] as string).toLowerCase()).toMatch(/seat|upgrade|plan/)
    await api.dispose()
  })
})

// ── AI assistant gating ───────────────────────────────────────────────────────

test.describe('AI assistant plan gating', () => {
  test('free tenant cannot use assistant — returns 402', async () => {
    const { freeAdminToken } = getSeedState()
    const api = await playwrightRequest.newContext()
    const res = await api.post(`${BACKEND}/v1/assistant/chat`, {
      headers: { Authorization: `Bearer ${freeAdminToken}` },
      data: { message: 'hello' },
    })
    expect(res.status()).toBe(402)
    await api.dispose()
  })
})
```

- [ ] **Step 6: Run the new billing spec**

```bash
npx playwright test e2e/api/billing.spec.ts --reporter=line
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/scripts/seed-e2e.ts e2e/helpers/seed-state.ts e2e/api/billing.spec.ts
git commit -m "test(e2e): billing API — free-signup, scan limit 402, rule kind gate, seat limit, assistant gate"
```

---

### Task 15: E2E Tests — Admin Console Billing UI + Full Suite Regression

**Files:**
- Create: `e2e/admin/billing.spec.ts`

- [ ] **Step 1: Write e2e/admin/billing.spec.ts**

```typescript
// e2e/admin/billing.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Settings > Billing section', () => {
  test('Billing section is visible on Settings page', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText('Billing')).toBeVisible()
  })

  test('shows plan badge for the E2E tenant', async ({ page }) => {
    await page.goto('/settings')
    // E2E tenant is on 'business' plan
    await expect(page.getByText(/business/i).first()).toBeVisible()
  })

  test('shows subscription status as Active', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/active/i)).toBeVisible()
  })

  test('shows monthly scans row', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/monthly scans/i)).toBeVisible()
  })

  test('shows active seats row', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByText(/active seats/i)).toBeVisible()
  })

  test('business plan does not show Upgrade button', async ({ page }) => {
    await page.goto('/settings')
    // The "Upgrade plan" link only appears on free/starter
    const upgradeBtn = page.getByRole('link', { name: /upgrade plan/i })
    await expect(upgradeBtn).not.toBeVisible()
  })
})

test.describe('Upgrade banner — business plan', () => {
  test('upgrade banner is NOT shown for business tenant at low scan usage', async ({ page }) => {
    await page.goto('/dashboard')
    // Banner only shows at ≥80% usage or blocked — business has unlimited scans
    const banner = page.getByText(/scan limit|approaching scan/i)
    await expect(banner).not.toBeVisible()
  })
})

test.describe('AI Assistant — plan gating UI', () => {
  test('AI Assistant page is accessible on business plan', async ({ page }) => {
    await page.goto('/assistant')
    // Business plan — PlanGate passes through, chat UI renders
    await expect(page.getByText(/upgrade|business feature/i)).not.toBeVisible()
    // The assistant input or empty state should be visible
    await expect(page.locator('[data-testid="assistant-input"], textarea, input[placeholder]').first()).toBeVisible()
  })
})

test.describe('Sidebar plan badge', () => {
  test('plan badge appears in sidebar for logged-in user', async ({ page }) => {
    await page.goto('/dashboard')
    // Sidebar should show the plan badge ('business')
    const sidebar = page.locator('aside')
    await expect(sidebar.getByText(/business/i)).toBeVisible()
  })
})
```

- [ ] **Step 2: Run the admin billing spec**

```bash
npx playwright test e2e/admin/billing.spec.ts --reporter=line
```

Expected: all tests PASS.

- [ ] **Step 3: Commit the admin billing spec**

```bash
git add e2e/admin/billing.spec.ts
git commit -m "test(e2e): admin billing UI — settings section, plan badge, banner, assistant gate"
```

- [ ] **Step 4: Run the FULL E2E suite**

```bash
npx playwright test --reporter=line 2>&1 | tail -30
```

Expected output (34+ tests, all passing):
```
✓  e2e/admin/auth.setup.ts
✓  e2e/admin/dashboard.spec.ts
✓  e2e/admin/destinations.spec.ts
✓  e2e/admin/sites.spec.ts
✓  e2e/admin/settings.spec.ts      ← existing tests still pass
✓  e2e/admin/audit.spec.ts
✓  e2e/admin/org.spec.ts
✓  e2e/admin/subjects.spec.ts
✓  e2e/admin/members.spec.ts
✓  e2e/admin/publish.spec.ts
✓  e2e/admin/assistant.spec.ts
✓  e2e/admin/billing.spec.ts       ← new
✓  e2e/api/members-import.spec.ts
✓  e2e/api/analytics.spec.ts
✓  e2e/api/join.spec.ts
✓  e2e/api/policy.spec.ts
✓  e2e/api/assistant.spec.ts
✓  e2e/api/billing.spec.ts         ← new
✓  e2e/extension/options.spec.ts
✓  e2e/extension/detection.spec.ts
✓  e2e/extension/warn.spec.ts
✓  e2e/extension/policy-sync.spec.ts
✓  e2e/extension/ai-full-flow.spec.ts

X passed, 0 failed
```

If any pre-existing tests fail (not in the billing specs), investigate before proceeding — the most likely cause is the E2E tenant no longer having `plan: 'business'` explicitly set (Task 14, Step 1 must be applied first).

- [ ] **Step 5: Final commit**

```bash
git add .
git commit -m "test(e2e): full suite passes — billing tests added, no regressions"
```

---

## Appendix: Environment Variables Reference

Add these to `backend/.env` and `backend/.env.test` (as stubs):

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_BUSINESS_PRICE_ID=price_...
STRIPE_STARTER_PRICE_ID=price_...
STRIPE_SUCCESS_URL=http://localhost:5173/onboarding
STRIPE_CANCEL_URL=http://localhost:5173/pricing

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_BUSINESS_PLAN_ID=P-...
PAYPAL_STARTER_PLAN_ID=P-...
PAYPAL_RETURN_URL=http://localhost:5173/welcome
PAYPAL_CANCEL_URL=http://localhost:5173/pricing
PAYPAL_SANDBOX=true

# Console URL (for Stripe portal return URL)
CONSOLE_URL=http://localhost:5173
```

## Appendix: PayPal Plan Setup (One-Time)

Before the PayPal checkout flow works, you must create two PayPal billing Plans (once) in the PayPal dashboard or via API:

**Starter Plan** (`PAYPAL_STARTER_PLAN_ID`):
- Product: "Pretzel by ciyo.ai"
- Billing cycle: REGULAR, MONTHLY, $49.00, unlimited cycles

**Business Plan** (`PAYPAL_BUSINESS_PLAN_ID`):
- Product: "Pretzel by ciyo.ai"
- Billing cycle 1: TRIAL, 1 cycle, 14 days, $0.00
- Billing cycle 2: REGULAR, MONTHLY, $15.00 × quantity (seats), unlimited cycles
- quantity: set `quantity_supported: true` in the plan

These Plan IDs go into env vars. The subscription creation endpoint handles per-seat quantity via the `quantity` field on the subscription POST.
