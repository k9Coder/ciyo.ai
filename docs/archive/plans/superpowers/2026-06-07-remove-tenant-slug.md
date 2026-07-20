# Remove Tenant Slug Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `slug` field in the `tenants` table with the tenant UUID in static token identifiers, simplifying auth and removing dead complexity.

**Architecture:** Token format changes from `ps_live_<slug>_<secret>` to `ps_live_<tenantId>_<secret>`. The `slug` column is dropped from `tenants`. Division/team slugs are unaffected — they serve a different purpose (org structure, UI display). Multi-org Clerk disambiguation switches from `X-Tenant-Slug` header to `X-Tenant-Id`.

**Tech Stack:** TypeScript, Fastify, Drizzle ORM, PostgreSQL, Vitest

---

## Files to Change

| File | Change |
|---|---|
| `backend/src/auth/tokens.ts` | UUID in token regex, `slug` → `tenantId` in `ParsedToken` |
| `backend/src/db/schema.ts` | Drop `slug` column and `slugUniq` constraint from `tenants` |
| `backend/drizzle/0011_remove_tenant_slug.sql` | New migration to drop column |
| `backend/src/tenants/service.ts` | Add `getTenantById`, remove `getTenantBySlug`, update rotate functions |
| `backend/src/auth/middleware.ts` | `resolveOrgToken` uses `getTenantById`, `X-Tenant-Slug` → `X-Tenant-Id` |
| `backend/src/billing/service.ts` | Remove `slug` from `ActivateInput`, format token after INSERT |
| `backend/src/billing/stripe.ts` | Remove `tenantSlug` from checkout metadata |
| `backend/src/billing/paypal.ts` | Update `custom_id` format: drop slug field |
| `backend/src/billing/router.ts` | Remove `slug` / `tenantSlug` from all three endpoints |
| `backend/src/tenants/router.ts` | Remove `slug` from responses, drop slug arg from rotate calls |
| `backend/src/webhooks/clerk.ts` | Remove slug generation in `user.created` handler |
| `backend/src/platform/service.ts` | Remove `slug` from `TenantSummary` |
| `backend/tests/helpers/db.ts` | `buildTestTenant` — INSERT first, use returned ID for token format |
| `backend/tests/tokens.test.ts` | Update token format assertions |
| `backend/tests/tenants.test.ts` | Replace `getTenantBySlug` tests with `getTenantById` |
| `backend/tests/billing-stripe.test.ts` | Remove slug from `activateTenant` calls and regex assertions |
| `backend/tests/platform.test.ts` | Remove slug assertion |
| `backend/tests/policy.router.test.ts` | Remove slug from mock tenant |
| `backend/src/scripts/seed-e2e.ts` | Remove `slug` from tenant INSERT |
| `backend/src/scripts/seed-fintech.ts` | Remove `slug` from tenant INSERT/UPDATE |
| `pretzel-console/src/types.ts` | Remove `slug` from `TenantInfo` type |

---

### Task 1: Update token format — `tokens.ts`

**Files:**
- Modify: `backend/src/auth/tokens.ts`

- [ ] **Step 1: Update `ParsedToken`, regex, `parseToken`, and `formatToken`**

Replace the entire file content:

```typescript
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

export interface ParsedToken {
  prefix:   'ps_live' | 'ps_adm'
  tenantId: string
  secret:   string
}

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const TOKEN_RE = new RegExp(`^(ps_live|ps_adm)_(${UUID_RE})_([A-Za-z0-9_-]{32})$`)

export function parseToken(token: string): ParsedToken | null {
  const m = token.match(TOKEN_RE)
  if (!m) return null
  return { prefix: m[1] as ParsedToken['prefix'], tenantId: m[2]!, secret: m[3]! }
}

/** 24 random bytes → 32 base64url chars (no padding). */
export function generateSecret(): string {
  return randomBytes(24).toString('base64url')
}

export function formatToken(prefix: 'ps_live' | 'ps_adm', tenantId: string, secret: string): string {
  return `${prefix}_${tenantId}_${secret}`
}

export async function hashToken(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10)
}

export async function compareToken(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash)
}
```

- [ ] **Step 2: Update `tests/tokens.test.ts`**

Replace the `parseToken` describe block:

```typescript
describe('parseToken', () => {
  const SECRET   = 'a'.repeat(32)
  const TENANT_ID = '3f2a1b9c-4d5e-6789-abcd-ef0123456789'

  it('parses a valid org token', () => {
    const result = parseToken(`ps_live_${TENANT_ID}_${SECRET}`)
    expect(result).toEqual({ prefix: 'ps_live', tenantId: TENANT_ID, secret: SECRET })
  })

  it('parses a valid admin token', () => {
    expect(parseToken(`ps_adm_${TENANT_ID}_${SECRET}`)?.prefix).toBe('ps_adm')
  })

  it('returns null for wrong prefix', () => {
    expect(parseToken(`ps_test_${TENANT_ID}_${SECRET}`)).toBeNull()
  })

  it('returns null for secret shorter than 32 chars', () => {
    expect(parseToken(`ps_live_${TENANT_ID}_tooshort`)).toBeNull()
  })

  it('returns null for old slug-based token format', () => {
    expect(parseToken(`ps_live_acmelaw_${SECRET}`)).toBeNull()
  })

  it('returns null for malformed string', () => {
    expect(parseToken('invalid')).toBeNull()
  })
})
```

- [ ] **Step 3: Run token tests**

```
cd backend && pnpm test -- tests/tokens.test.ts
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/src/auth/tokens.ts backend/tests/tokens.test.ts
git commit -m "feat(auth): switch static token identifier from slug to tenantId (UUID)"
```

---

### Task 2: Drop slug from DB schema + add migration

**Files:**
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0011_remove_tenant_slug.sql`

- [ ] **Step 1: Remove slug from `tenants` table in schema**

In `backend/src/db/schema.ts`, find the `tenants` pgTable definition. Remove these two lines:

```typescript
  slug:               text('slug').notNull(),
```
and inside the table constraint callback:
```typescript
  slugUniq: unique().on(t.slug),
```

The `tenants` table should look like:

```typescript
export const tenants = pgTable('tenants', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  name:               text('name').notNull(),
  orgTokenHash:       text('org_token_hash').notNull(),
  adminTokenHash:     text('admin_token_hash').notNull(),
  paymentProvider:    text('payment_provider'),
  externalSubId:      text('external_sub_id'),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  plan:               text('plan').notNull().default('free'),
  seatCount:          integer('seat_count').notNull().default(1),
  trialEndsAt:        timestamp('trial_ends_at', { withTimezone: true }),
  stripeCustomerId:   text('stripe_customer_id'),
  gracePeriodDays:    integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt:  timestamp('grace_period_ends_at', { withTimezone: true }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
```

- [ ] **Step 2: Create migration file**

Create `backend/drizzle/0011_remove_tenant_slug.sql`:

```sql
ALTER TABLE "tenants" DROP CONSTRAINT IF EXISTS "tenants_slug_unique";
ALTER TABLE "tenants" DROP COLUMN IF EXISTS "slug";
```

- [ ] **Step 3: Update `drizzle/meta/_journal.json`**

Append a new entry to the `entries` array:

```json
{
  "idx": 11,
  "version": "5",
  "when": 1749254400000,
  "tag": "0011_remove_tenant_slug",
  "breakpoints": true
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/0011_remove_tenant_slug.sql backend/drizzle/meta/_journal.json
git commit -m "feat(db): drop slug column from tenants table"
```

---

### Task 3: Update `tenants/service.ts`

**Files:**
- Modify: `backend/src/tenants/service.ts`

- [ ] **Step 1: Replace `getTenantBySlug` with `getTenantById`, update rotate functions**

Replace the entire file:

```typescript
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, type Tenant } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'

export async function getTenantById(id: string): Promise<Tenant | null> {
  const rows = await db.select().from(tenants).where(eq(tenants.id, id))
  return rows[0] ?? null
}

export async function updateSubscriptionStatus(
  tenantId: string,
  status: 'active' | 'past_due' | 'cancelled'
): Promise<void> {
  const updates: Partial<typeof tenants.$inferInsert> = { subscriptionStatus: status }

  if (status === 'past_due') {
    const [tenant] = await db
      .select({ days: tenants.gracePeriodDays })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
    if (tenant) {
      const end = new Date()
      end.setDate(end.getDate() + tenant.days)
      updates.gracePeriodEndsAt = end
    }
  } else {
    updates.gracePeriodEndsAt = null
  }

  await db.update(tenants).set(updates).where(eq(tenants.id, tenantId))
}

export async function updateTenantName(tenantId: string, name: string): Promise<Tenant> {
  const [row] = await db
    .update(tenants)
    .set({ name })
    .where(eq(tenants.id, tenantId))
    .returning()
  return row!
}

export async function rotateOrgToken(tenantId: string): Promise<string> {
  const secret = generateSecret()
  await db.update(tenants).set({ orgTokenHash: await hashToken(secret) }).where(eq(tenants.id, tenantId))
  return formatToken('ps_live', tenantId, secret)
}

export async function rotateAdminToken(tenantId: string): Promise<string> {
  const secret = generateSecret()
  await db.update(tenants).set({ adminTokenHash: await hashToken(secret) }).where(eq(tenants.id, tenantId))
  return formatToken('ps_adm', tenantId, secret)
}
```

- [ ] **Step 2: Update `tests/tenants.test.ts`**

Replace the `getTenantBySlug` describe block with `getTenantById`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { getTenantById, updateSubscriptionStatus } from '../src/tenants/service.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'

beforeEach(async () => { await truncateAll() })

describe('getTenantById', () => {
  it('returns tenant for known id', async () => {
    const { tenantId } = await buildTestTenant()
    const tenant = await getTenantById(tenantId)
    expect(tenant?.id).toBe(tenantId)
  })

  it('returns null for unknown id', async () => {
    expect(await getTenantById('00000000-0000-0000-0000-000000000000')).toBeNull()
  })
})

describe('updateSubscriptionStatus', () => {
  it('sets past_due and computes grace period end from tenant gracePeriodDays', async () => {
    const { tenantId } = await buildTestTenant()
    await updateSubscriptionStatus(tenantId, 'past_due')
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    expect(row!.subscriptionStatus).toBe('past_due')
    expect(row!.gracePeriodEndsAt).not.toBeNull()
    const diffMs = row!.gracePeriodEndsAt!.getTime() - Date.now()
    expect(diffMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000)
    expect(diffMs).toBeLessThan(8 * 24 * 60 * 60 * 1000)
  })

  it('clears grace period end on reactivation', async () => {
    const { tenantId } = await buildTestTenant()
    await updateSubscriptionStatus(tenantId, 'past_due')
    await updateSubscriptionStatus(tenantId, 'active')
    const [row] = await db.select().from(tenants).where(eq(tenants.id, tenantId))
    expect(row!.subscriptionStatus).toBe('active')
    expect(row!.gracePeriodEndsAt).toBeNull()
  })
})
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/tenants/service.ts backend/tests/tenants.test.ts
git commit -m "feat(tenants): replace getTenantBySlug with getTenantById, drop slug from rotate fns"
```

---

### Task 4: Update `auth/middleware.ts`

**Files:**
- Modify: `backend/src/auth/middleware.ts`

- [ ] **Step 1: Update `resolveOrgToken` and `resolveClerkJwt`**

In `resolveOrgToken`, change the tenant lookup:

```typescript
// Before:
import { getTenantBySlug } from '../tenants/service.js'
// ...
const tenant = await getTenantBySlug(parsed.slug)
if (!tenant) {
  return reply.status(401).send({ error: 'Unknown tenant' })
}

// After:
import { getTenantById } from '../tenants/service.js'
// ...
const tenant = await getTenantById(parsed.tenantId)
if (!tenant) {
  return reply.status(401).send({ error: 'Unknown tenant' })
}
```

In `resolveClerkJwt`, change the multi-org disambiguation header from `X-Tenant-Slug` to `X-Tenant-Id`:

```typescript
// Before:
const slugHint = request.headers['x-tenant-slug'] as string | undefined
if (!slugHint) {
  return reply.status(400).send({ error: 'Multiple organisations found — specify X-Tenant-Slug header' })
}
const [t] = await db.select().from(tenants).where(eq(tenants.slug, slugHint))
if (!t) return reply.status(401).send({ error: 'Unknown tenant' })

// After:
const tenantIdHint = request.headers['x-tenant-id'] as string | undefined
if (!tenantIdHint) {
  return reply.status(400).send({ error: 'Multiple organisations found — specify X-Tenant-Id header' })
}
const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantIdHint))
if (!t) return reply.status(401).send({ error: 'Unknown tenant' })
```

Also remove the `getTenantBySlug` import and the `eq(tenants.slug, slugHint)` usage — replace with `eq(tenants.id, tenantIdHint)`.

The full updated `resolveClerkJwt` multi-org branch:

```typescript
let member = memberRows[0]!
if (memberRows.length > 1) {
  const tenantIdHint = request.headers['x-tenant-id'] as string | undefined
  if (!tenantIdHint) {
    return reply.status(400).send({ error: 'Multiple organisations found — specify X-Tenant-Id header' })
  }
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantIdHint))
  if (!t) return reply.status(401).send({ error: 'Unknown tenant' })
  const found = memberRows.find(m => m.tenantId === t.id)
  if (!found) return reply.status(401).send({ error: 'Not a member of that organisation' })
  member = found
  request.tenant = t
} else {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, member.tenantId))
  if (!t) return reply.status(401).send({ error: 'Tenant not found' })
  request.tenant = t
}
```

Also remove unused `requireOrgToken` and `requireAdminToken` exports (nothing uses them after `join.ts` was deleted):

```typescript
// DELETE these two functions entirely:
export async function requireOrgToken(...) { ... }
export async function requireAdminToken(...) { ... }
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/auth/middleware.ts
git commit -m "feat(auth): use tenantId in resolveOrgToken, X-Tenant-Id header for multi-org Clerk"
```

---

### Task 5: Update `billing/service.ts`

**Files:**
- Modify: `backend/src/billing/service.ts`

- [ ] **Step 1: Remove slug from `ActivateInput`, format tokens after INSERT**

Replace the entire file:

```typescript
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { updateSubscriptionStatus } from '../tenants/service.js'
import { sendWelcomeEmail } from './email.js'

export async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export interface ActivateInput {
  name:             string
  paymentProvider:  'stripe' | 'paypal' | null
  externalSubId:    string | null
  plan:             'free' | 'starter' | 'business' | 'enterprise'
  seatCount:        number
  trialEndsAt?:     Date | null
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

  const [row] = await db.insert(tenants).values({
    name:             input.name,
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

  const tenantId  = row!.id
  const orgToken   = formatToken('ps_live', tenantId, orgSecret)
  const adminToken = formatToken('ps_adm',  tenantId, adminSecret)

  return { tenantId, orgToken, adminToken }
}

export async function freeTierSignup(input: {
  name:  string
  email: string
}): Promise<ActivateResult> {
  const result = await activateTenant({
    name:            input.name,
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

- [ ] **Step 2: Update `tests/billing-stripe.test.ts`**

Remove `getTenantBySlug` import and update the `activateTenant` describe block:

```typescript
import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { activateTenant } from '../src/billing/service.js'
import { getTenantById } from '../src/tenants/service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

beforeEach(async () => { await truncateAll() })

describe('activateTenant', () => {
  it('creates tenant row and returns plaintext tokens', async () => {
    const result = await activateTenant({
      name: 'Acme Law LLP',
      paymentProvider: 'stripe',
      externalSubId: 'sub_test_001',
      plan: 'business',
      seatCount: 10,
    })
    const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
    expect(result.orgToken).toMatch(new RegExp(`^ps_live_${UUID_RE}_[A-Za-z0-9_-]{32}$`))
    expect(result.adminToken).toMatch(new RegExp(`^ps_adm_${UUID_RE}_[A-Za-z0-9_-]{32}$`))
  })

  it('persists hashed tokens (not plaintext) in the database', async () => {
    const result = await activateTenant({
      name: 'A',
      paymentProvider: 'stripe',
      externalSubId: 'sub_1',
      plan: 'starter',
      seatCount: 1,
    })
    const tenant = await getTenantById(result.tenantId)
    expect(tenant?.subscriptionStatus).toBe('active')
    expect(tenant?.orgTokenHash).not.toMatch(/^ps_live/)
  })
})
```

Remove the `'throws if slug already exists'` test — there's no unique constraint on any remaining field that would cause a duplicate.

- [ ] **Step 3: Commit**

```bash
git add backend/src/billing/service.ts backend/tests/billing-stripe.test.ts
git commit -m "feat(billing): remove slug from ActivateInput, format token with tenantId after INSERT"
```

---

### Task 6: Update `billing/stripe.ts`

**Files:**
- Modify: `backend/src/billing/stripe.ts`

- [ ] **Step 1: Remove `tenantSlug` from checkout and webhook handler**

In `createCheckoutSession`, remove the `tenantSlug` parameter and all references:

```typescript
export async function createCheckoutSession(opts: {
  plan:       'starter' | 'business'
  seatCount:  number
  tenantName: string
  email:      string
}): Promise<{ url: string }> {
  const stripeClient = stripe()
  const priceId = opts.plan === 'business'
    ? process.env['STRIPE_BUSINESS_PRICE_ID']!
    : process.env['STRIPE_STARTER_PRICE_ID']!
  const trialDays = opts.plan === 'business' ? 14 : 0

  const session = await stripeClient.checkout.sessions.create({
    mode:                      'subscription',
    payment_method_collection: trialDays > 0 ? 'if_required' : 'always',
    customer_email:            opts.email,
    line_items: [{
      price:    priceId,
      quantity: opts.plan === 'business' ? opts.seatCount : 1,
    }],
    subscription_data: {
      trial_period_days: trialDays > 0 ? trialDays : undefined,
      metadata: {
        tenantName: opts.tenantName,
        plan:       opts.plan,
        seatCount:  String(opts.seatCount),
      },
    },
    metadata: {
      tenantName: opts.tenantName,
      plan:       opts.plan,
      seatCount:  String(opts.seatCount),
    },
    success_url: process.env['STRIPE_SUCCESS_URL'] ?? 'https://mykka.ai/welcome',
    cancel_url:  process.env['STRIPE_CANCEL_URL']  ?? 'https://mykka.ai/pricing',
  })

  return { url: session.url! }
}
```

In `handleStripeEvent`, `checkout.session.completed` case — remove the `slug` field from the `activateTenant` call:

```typescript
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session
  const meta    = session.metadata ?? {}
  const email   = session.customer_email ?? ''
  const plan    = (meta['plan'] as 'starter' | 'business') ?? 'business'
  const seats   = parseInt(meta['seatCount'] ?? '10', 10)

  const sub      = typeof session.subscription === 'object' ? session.subscription as Stripe.Subscription : null
  const trialEnd = sub?.trial_end ? new Date(sub.trial_end * 1000) : null

  const result = await activateTenant({
    name:             meta['tenantName'] ?? email,
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
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/billing/stripe.ts
git commit -m "feat(billing): remove tenantSlug from Stripe checkout metadata"
```

---

### Task 7: Update `billing/paypal.ts`

**Files:**
- Modify: `backend/src/billing/paypal.ts`

- [ ] **Step 1: Remove `tenantSlug` from PayPal subscription, update `custom_id` format**

New `custom_id` format: `name|email|plan|seats` (drop slug from position 0).

In `createPayPalSubscriptionUrl`, remove `tenantSlug` from opts and from `customId`:

```typescript
export async function createPayPalSubscriptionUrl(opts: {
  plan:       'starter' | 'business'
  seatCount:  number
  tenantName: string
  email:      string
}): Promise<{ url: string }> {
  const token   = await getAccessToken()
  const planId  = opts.plan === 'business'
    ? process.env['PAYPAL_BUSINESS_PLAN_ID']!
    : process.env['PAYPAL_STARTER_PLAN_ID']!
  const customId = `${opts.tenantName}|${opts.email}|${opts.plan}|${opts.seatCount}`

  const res = await fetch(`${PAYPAL_API}/v1/billing/subscriptions`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      plan_id:   planId,
      quantity:  String(opts.seatCount),
      custom_id: customId,
      subscriber: { email_address: opts.email },
      application_context: {
        return_url: process.env['PAYPAL_RETURN_URL'] ?? 'https://mykka.ai/welcome',
        cancel_url: process.env['PAYPAL_CANCEL_URL'] ?? 'https://mykka.ai/pricing',
        user_action: 'SUBSCRIBE_NOW',
      },
    }),
  })
  const sub = await res.json() as { links: Array<{ rel: string; href: string }> }
  const approvalLink = sub.links.find(link => link.rel === 'approve')
  if (!approvalLink) throw new Error('PayPal did not return an approval link')
  return { url: approvalLink.href }
}
```

Update `parseCustomId` to new format `name|email|plan|seats`:

```typescript
function parseCustomId(raw: string): {
  name: string; email: string
  plan: 'starter' | 'business'; seatCount: number
} | null {
  const [name, email, plan, seats] = raw.split('|')
  if (!name || !email) return null
  return {
    name,
    email,
    plan:      (plan as 'starter' | 'business') ?? 'business',
    seatCount: parseInt(seats ?? '1', 10),
  }
}
```

Update `BILLING.SUBSCRIPTION.ACTIVATED` handler to remove `slug`:

```typescript
case 'BILLING.SUBSCRIPTION.ACTIVATED': {
  const parsed = parseCustomId((resource['custom_id'] as string) ?? '')
  if (!parsed) return
  const result = await activateTenant({
    name:            parsed.name,
    paymentProvider: 'paypal',
    externalSubId:   (resource['id'] as string) ?? '',
    plan:            parsed.plan,
    seatCount:       parsed.seatCount,
  })
  sendWelcomeEmail({ to: parsed.email, tenantName: parsed.name, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})
  break
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/billing/paypal.ts
git commit -m "feat(billing): remove tenantSlug from PayPal custom_id format"
```

---

### Task 8: Update `billing/router.ts`

**Files:**
- Modify: `backend/src/billing/router.ts`

- [ ] **Step 1: Remove slug/tenantSlug from all three billing endpoints**

`POST /billing/free-signup` — remove `slug` from body type, validation, and `freeTierSignup` call:

```typescript
fastify.post<{ Body: { name: string; email: string } }>(
  '/billing/free-signup',
  async (req, reply) => {
    const { name, email } = req.body
    if (!name || !email) {
      return reply.status(400).send({ error: 'name and email are required' })
    }
    try {
      const result = await freeTierSignup({ name, email })
      return reply.status(201).send(result)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create account'
      return reply.status(409).send({ error: msg })
    }
  }
)
```

`POST /billing/stripe/checkout` — remove `tenantSlug` from body type, validation, and `createCheckoutSession` call:

```typescript
fastify.post<{
  Body: { plan: 'starter' | 'business'; seatCount: number; tenantName: string; email: string }
}>('/billing/stripe/checkout', async (req, reply) => {
  const { plan, seatCount, tenantName, email } = req.body
  if (!plan || !tenantName || !email) {
    return reply.status(400).send({ error: 'plan, tenantName, and email are required' })
  }
  if (plan === 'business' && (seatCount ?? 0) < 10) {
    return reply.status(400).send({ error: 'Business plan requires at least 10 seats' })
  }
  try {
    return reply.send(await createCheckoutSession({ plan, seatCount: seatCount ?? 1, tenantName, email }))
  } catch (err: unknown) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : 'Failed to create checkout session' })
  }
})
```

`POST /billing/paypal/checkout` — same: remove `tenantSlug`:

```typescript
fastify.post<{
  Body: { plan: 'starter' | 'business'; seatCount: number; tenantName: string; email: string }
}>('/billing/paypal/checkout', async (req, reply) => {
  const { plan, seatCount, tenantName, email } = req.body
  if (!plan || !tenantName || !email) {
    return reply.status(400).send({ error: 'plan, tenantName, and email are required' })
  }
  if (plan === 'business' && (seatCount ?? 0) < 10) {
    return reply.status(400).send({ error: 'Business plan requires at least 10 seats' })
  }
  try {
    return reply.send(await createPayPalSubscriptionUrl({ plan, seatCount: seatCount ?? 1, tenantName, email }))
  } catch (err: unknown) {
    return reply.status(500).send({ error: err instanceof Error ? err.message : 'Failed to create PayPal subscription' })
  }
})
```

- [ ] **Step 2: Update `backend/e2e/billing.spec.ts`**

Find the free-signup test and remove the `slug` field:

```typescript
// Before:
const slug = `e2efree-${Date.now()}`
const res = await api.post(`${BACKEND}/v1/billing/free-signup`, {
  headers: {},
  data: { name: 'E2E Free Test', slug, email: `${slug}@example.com` },
})

// After:
const res = await api.post(`${BACKEND}/v1/billing/free-signup`, {
  headers: {},
  data: { name: 'E2E Free Test', email: `e2efree-${Date.now()}@example.com` },
})
```

Also remove the `'returns 400 on invalid slug'` test — that validation no longer exists.

- [ ] **Step 3: Commit**

```bash
git add backend/src/billing/router.ts backend/e2e/billing.spec.ts
git commit -m "feat(billing): remove slug from free-signup, stripe/paypal checkout endpoints"
```

---

### Task 9: Update `tenants/router.ts` and `webhooks/clerk.ts`

**Files:**
- Modify: `backend/src/tenants/router.ts`
- Modify: `backend/src/webhooks/clerk.ts`

- [ ] **Step 1: Remove slug from tenant router responses and rotate calls**

In `backend/src/tenants/router.ts`, replace all occurrences:

`GET /tenant`:
```typescript
fastify.get('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
  const { id, name, plan, subscriptionStatus } = req.tenant
  return { id, name, plan, subscriptionStatus }
})
```

`PATCH /tenant`:
```typescript
fastify.patch('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
  const { name } = req.body as { name?: string }
  if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
  const tenant = await updateTenantName(req.tenant.id, name.trim())
  const { id, name: n, plan, subscriptionStatus } = tenant
  return { id, name: n, plan, subscriptionStatus }
})
```

`POST /tenant/rotate-org-token`:
```typescript
fastify.post('/tenant/rotate-org-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
  const token = await rotateOrgToken(req.tenant.id)
  return { token }
})
```

`POST /tenant/rotate-admin-token`:
```typescript
fastify.post('/tenant/rotate-admin-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
  const token = await rotateAdminToken(req.tenant.id)
  return { token }
})
```

- [ ] **Step 2: Remove slug generation from `webhooks/clerk.ts`**

In the `user.created` case, find the auto-provision block (lines 62-84) and replace it:

```typescript
// No pre-enrollment — auto-provision a tenant for this user
const localPart = email.split('@')[0] ?? email

const orgSecret   = generateSecret()
const adminSecret = generateSecret()

const [tenant] = await db.insert(tenants).values({
  name:           `${first_name ?? localPart}'s Organization`,
  orgTokenHash:   await hashToken(orgSecret),
  adminTokenHash: await hashToken(adminSecret),
  plan:           'free',
}).returning({ id: tenants.id })

await db.insert(members).values({
  tenantId: tenant!.id,
  userId:   user.id,
  email,
  role:     'super_admin',
})
```

Remove the slug-related lines (no more `base`, `suffix`, `slug` variables).

- [ ] **Step 3: Commit**

```bash
git add backend/src/tenants/router.ts backend/src/webhooks/clerk.ts
git commit -m "feat(tenants,webhooks): remove slug from tenant responses and auto-provision flow"
```

---

### Task 10: Update `platform/service.ts`, test helper, and remaining tests

**Files:**
- Modify: `backend/src/platform/service.ts`
- Modify: `backend/tests/helpers/db.ts`
- Modify: `backend/tests/platform.test.ts`
- Modify: `backend/tests/policy.router.test.ts`

- [ ] **Step 1: Remove slug from `platform/service.ts`**

```typescript
export interface TenantSummary {
  id:          string
  name:        string
  plan:        string
  memberCount: number
  createdAt:   Date
}

export async function listAllTenants(): Promise<TenantSummary[]> {
  const rows = await db
    .select({
      id:          tenants.id,
      name:        tenants.name,
      plan:        tenants.plan,
      createdAt:   tenants.createdAt,
      memberCount: sql<number>`count(${members.id})::int`,
    })
    .from(tenants)
    .leftJoin(members, eq(members.tenantId, tenants.id))
    .groupBy(tenants.id)
  return rows
}
```

- [ ] **Step 2: Update `tests/helpers/db.ts` — INSERT first, then format tokens with returned ID**

```typescript
export async function buildTestTenant(): Promise<TestTenantResult> {
  const orgSecret   = generateSecret()
  const adminSecret = generateSecret()

  const [row] = await db.insert(tenants).values({
    name:               'Test Firm LLP',
    orgTokenHash:       await hashToken(orgSecret),
    adminTokenHash:     await hashToken(adminSecret),
    paymentProvider:    'stripe',
    externalSubId:      'sub_test_fixture',
    subscriptionStatus: 'active',
    plan:               'business',
    seatCount:          10,
  }).returning({ id: tenants.id })

  const tenantId  = row!.id
  const orgToken   = formatToken('ps_live', tenantId, orgSecret)
  const adminToken = formatToken('ps_adm',  tenantId, adminSecret)

  return { tenantId, orgToken, adminToken }
}
```

Note: `buildTestTenant` no longer accepts a `slug` argument. Any test that called `buildTestTenant('some-slug')` just calls `buildTestTenant()` now.

- [ ] **Step 3: Fix `tests/platform.test.ts`**

Remove the `expect(res.body[0].slug).toBe('acme')` assertion — slug is no longer in the response.

- [ ] **Step 4: Fix `tests/policy.router.test.ts`**

Find the mock tenant object (around line 44):
```typescript
id: 't1', name: 'Acme', slug: 'acme', plan: 'pro',
```
Remove `slug: 'acme',`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/platform/service.ts backend/tests/helpers/db.ts backend/tests/platform.test.ts backend/tests/policy.router.test.ts
git commit -m "feat(platform): remove slug from TenantSummary; update test helper and mocks"
```

---

### Task 11: Update seed scripts and pretzel-console types

**Files:**
- Modify: `backend/src/scripts/seed-e2e.ts`
- Modify: `backend/src/scripts/seed-fintech.ts`
- Modify: `pretzel-console/src/types.ts`

- [ ] **Step 1: Fix `seed-e2e.ts`**

Replace the tenant token formatting and INSERT block:

```typescript
const orgSecret   = generateSecret()
const adminSecret = generateSecret()

const [tenant] = await db.insert(tenants).values({
  name:               'E2E Test Org',
  orgTokenHash:       await hashToken(orgSecret),
  adminTokenHash:     await hashToken(adminSecret),
  paymentProvider:    'stripe',
  externalSubId:      'sub_e2e_test',
  subscriptionStatus: 'active',
  plan:               'business',
  seatCount:          10,
}).returning({ id: tenants.id })

const tenantId = tenant!.id
const orgToken   = formatToken('ps_live', tenantId, orgSecret)
const adminToken = formatToken('ps_adm',  tenantId, adminSecret)
```

Also remove the `slug: 'e2efree'` from the free tenant seed section further down in the same file (apply the same pattern).

- [ ] **Step 2: Fix `seed-fintech.ts`**

Find the tenant INSERT and UPDATE and remove the `slug` field:

```typescript
// In the UPDATE:
.set({ name: 'FinCorp', plan: 'business', seatCount: 50 })

// In the INSERT alternatives:
{ name: 'FinCorp', plan: 'business', ... }  // no slug field
```

And apply the same INSERT-first-then-format-token pattern if the seed creates tokens.

- [ ] **Step 3: Remove slug from `pretzel-console/src/types.ts`**

Find `TenantInfo` type and remove the `slug: string` line:

```typescript
export interface TenantInfo {
  id:                 string
  name:               string
  plan:               string
  subscriptionStatus: string
}
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/scripts/seed-e2e.ts backend/src/scripts/seed-fintech.ts pretzel-console/src/types.ts
git commit -m "feat(seed,console): remove tenant slug from seed scripts and pretzel-console types"
```

---

### Task 12: Run full test suite and fix failures

- [ ] **Step 1: Run unit/integration tests**

```
cd backend && pnpm test
```

Expected: all pass. If failures occur:
- TypeScript compile errors → a file still references `slug` on tenant — find with `grep -r "tenant\.slug\|\.slug\b" backend/src backend/tests` and fix
- Test assertion failures with `slug` → that test still has a slug assertion — remove it
- `getTenantBySlug is not a function` → a file still imports it — replace with `getTenantById`

- [ ] **Step 2: Run E2E API tests**

```
cd backend && pnpm test:e2e --project=api
```

Fix any failures using the same approach: grep for remaining `slug` references.

- [ ] **Step 3: Run migrations against test DB**

```
cd backend && pnpm db:migrate
```

Expected: `Migrations complete`. This drops the `slug` column from the test DB.

- [ ] **Step 4: Re-seed and re-run E2E**

```
cd backend && pnpm seed:e2e && pnpm test:e2e
```

- [ ] **Step 5: Final commit if any fixup changes were needed**

```bash
git add -p
git commit -m "fix: remaining slug references after tenant slug removal"
```
