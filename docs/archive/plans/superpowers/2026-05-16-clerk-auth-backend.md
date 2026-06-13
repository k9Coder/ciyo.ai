# Clerk Auth + siteConfigs — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Clerk webhook handling, Clerk JWT auth middleware, and siteConfigs CRUD to the backend so the extension can authenticate individual members and admins can configure per-domain selectors.

**Architecture:** Clerk webhooks create/update `members` rows automatically. `GET /v1/policy` accepts either an org token (returns full snapshot) or a Clerk JWT (returns member-scoped snapshot). `siteConfigs` are stored in a new table, included in the policy compiler output, and exposed via admin CRUD endpoints.

**Tech Stack:** Fastify 4, Drizzle ORM (PostgreSQL), TypeScript ESM (`.js` imports), `@clerk/backend`, `svix`, Vitest + supertest (integration tests, real DB required).

---

## File Map

| File | Action |
|---|---|
| `backend/src/db/schema.ts` | Add `clerkOrgId` to tenants, Clerk fields to members, add `siteConfigs` table |
| `backend/drizzle/0003_clerk_auth.sql` | Migration: new columns + table |
| `backend/drizzle/meta/_journal.json` | Register migration entry |
| `backend/tests/helpers/db.ts` | Add `siteConfigs` to `truncateAll` |
| `backend/src/webhooks/clerk.ts` | Create: Svix verification + 4 event handlers |
| `backend/src/auth/middleware.ts` | Add `requireClerkAuth` + `requireOrgTokenOrClerkAuth` |
| `backend/src/types.ts` | Add `req.member?: Member` to FastifyRequest |
| `backend/src/policy/router.ts` | Switch `GET /policy` to `requireOrgTokenOrClerkAuth`, drop `X-Member-Id` header |
| `backend/src/site-configs/service.ts` | Create: CRUD for siteConfigs |
| `backend/src/site-configs/router.ts` | Create: admin-only CRUD routes |
| `backend/src/policy/compiler.ts` | Add `siteConfigs` to `PolicyDoc` + include in `compilePolicy` |
| `backend/src/app.ts` | Register clerk webhook route + siteConfigs router, update raw-body parser |
| `backend/tests/clerk-webhook.test.ts` | Create: webhook handler integration tests |
| `backend/tests/clerk-auth.test.ts` | Create: Clerk JWT middleware integration tests |
| `backend/tests/site-configs.test.ts` | Create: siteConfigs CRUD tests |

---

### Task 1: Install dependencies + DB migration

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/db/schema.ts`
- Create: `backend/drizzle/0003_clerk_auth.sql`
- Modify: `backend/drizzle/meta/_journal.json`
- Modify: `backend/tests/helpers/db.ts`

- [ ] **Step 1: Install backend dependencies**

```bash
cd backend && npm install @clerk/backend svix
```

Expected: packages added to `node_modules` and `package.json` dependencies.

- [ ] **Step 2: Update `backend/src/db/schema.ts`**

Add `clerkOrgId` to `tenants`, Clerk identity fields to `members`, and the `siteConfigs` table. Replace the tenants table definition with:

```ts
export const tenants = pgTable('tenants', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  name:               text('name').notNull(),
  slug:               text('slug').notNull(),
  clerkOrgId:         text('clerk_org_id').unique(),
  orgTokenHash:       text('org_token_hash').notNull(),
  adminTokenHash:     text('admin_token_hash').notNull(),
  paymentProvider:    text('payment_provider').notNull(),
  externalSubId:      text('external_sub_id').notNull(),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  plan:               text('plan').notNull().default('pro'),
  gracePeriodDays:    integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt:  timestamp('grace_period_ends_at', { withTimezone: true }),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq:      unique().on(t.slug),
  clerkOrgUniq:  unique().on(t.clerkOrgId),
}))
```

Replace the members table definition with:

```ts
export const members = pgTable('members', {
  id:              uuid('id').primaryKey().defaultRandom(),
  tenantId:        uuid('tenant_id').notNull().references(() => tenants.id),
  email:           text('email').notNull(),
  displayName:     text('display_name'),
  firstName:       text('first_name'),
  lastName:        text('last_name'),
  avatarUrl:       text('avatar_url'),
  clerkId:         text('clerk_id').unique(),
  role:            memberRoleEnum('role').notNull().default('member'),
  adminDivisionId: uuid('admin_division_id').references(() => divisions.id),
  createdAt:       timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantEmailUniq: unique().on(t.tenantId, t.email),
}))
```

Add the `siteConfigs` table and types after `destinationGroups`:

```ts
// ── Site Configs ──────────────────────────────────────────────────────────────
export const siteConfigs = pgTable('site_configs', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  tenantId:            uuid('tenant_id').notNull().references(() => tenants.id),
  domain:              text('domain').notNull(),
  inputSelector:       text('input_selector').notNull(),
  sendButtonSelector:  text('send_button_selector').notNull(),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantDomainUniq: unique().on(t.tenantId, t.domain),
}))

export type SiteConfig    = typeof siteConfigs.$inferSelect
export type NewSiteConfig = typeof siteConfigs.$inferInsert
```

Also add to the types block at the bottom:
```ts
export type SiteConfig    = typeof siteConfigs.$inferSelect
export type NewSiteConfig = typeof siteConfigs.$inferInsert
```

- [ ] **Step 3: Create `backend/drizzle/0003_clerk_auth.sql`**

```sql
ALTER TABLE tenants ADD COLUMN clerk_org_id text UNIQUE;

ALTER TABLE members
  ADD COLUMN clerk_id    text UNIQUE,
  ADD COLUMN first_name  text,
  ADD COLUMN last_name   text,
  ADD COLUMN avatar_url  text;

CREATE TABLE site_configs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL REFERENCES tenants(id),
  domain               text NOT NULL,
  input_selector       text NOT NULL,
  send_button_selector text NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);
```

- [ ] **Step 4: Update `backend/drizzle/meta/_journal.json`**

Add entry at the end of the `"entries"` array:

```json
{
  "idx": 3,
  "version": "6",
  "when": 1778954510000,
  "tag": "0003_clerk_auth",
  "breakpoints": true
}
```

- [ ] **Step 5: Update `backend/tests/helpers/db.ts`**

Add `siteConfigs` to the imports and `truncateAll`:

```ts
import { db } from '../../src/db/client.js'
import { tenants, policies, divisions, teams, members, memberTeams, subjects, rules, destinationGroups, siteConfigs } from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'

export async function truncateAll(): Promise<void> {
  await db.delete(memberTeams)
  await db.delete(rules)
  await db.delete(subjects)
  await db.delete(destinationGroups)
  await db.delete(siteConfigs)
  await db.delete(members)
  await db.delete(teams)
  await db.delete(divisions)
  await db.delete(policies)
  await db.delete(tenants)
}
```

(`buildTestTenant` stays unchanged.)

- [ ] **Step 6: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/schema.ts backend/drizzle/0003_clerk_auth.sql backend/drizzle/meta/_journal.json backend/tests/helpers/db.ts backend/package.json backend/package-lock.json
git commit -m "feat(clerk): schema migration — clerkOrgId, member Clerk fields, siteConfigs table"
```

---

### Task 2: Clerk webhook handler

**Files:**
- Create: `backend/src/webhooks/clerk.ts`
- Modify: `backend/src/app.ts`
- Create: `backend/tests/clerk-webhook.test.ts`

- [ ] **Step 1: Write the failing test in `backend/tests/clerk-webhook.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants, members } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'

vi.mock('svix', () => ({
  Webhook: vi.fn().mockImplementation(() => ({
    verify: vi.fn().mockImplementation((body: string) => JSON.parse(body)),
  })),
}))

let app: FastifyInstance
let tenantId: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const result = await buildTestTenant()
  tenantId = result.tenantId
  // Set clerkOrgId so webhook can find the tenant
  await db.update(tenants).set({ clerkOrgId: 'org_test123' }).where(eq(tenants.id, tenantId))
})
afterAll(async () => { await app.close() })

function makeWebhookRequest(payload: object) {
  return supertest(app.server)
    .post('/webhooks/clerk')
    .set('svix-id', 'msg_test')
    .set('svix-timestamp', String(Math.floor(Date.now() / 1000)))
    .set('svix-signature', 'v1,test_signature')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload))
}

describe('POST /webhooks/clerk', () => {
  it('organization.created creates a new tenant', async () => {
    await truncateAll()
    const res = await makeWebhookRequest({
      type: 'organization.created',
      data: { id: 'org_new999', name: 'New Law Firm', slug: 'new-law-firm', created_by: 'user_admin1' },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(tenants).where(eq(tenants.clerkOrgId, 'org_new999'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.name).toBe('New Law Firm')
  })

  it('organizationMembership.created creates a member row', async () => {
    const res = await makeWebhookRequest({
      type: 'organizationMembership.created',
      data: {
        organization: { id: 'org_test123' },
        public_user_data: {
          user_id: 'user_alice1',
          first_name: 'Alice',
          last_name: 'Smith',
          image_url: 'https://example.com/alice.jpg',
          identifier: 'alice@acme.com',
        },
        role: 'org:member',
      },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(members).where(eq(members.clerkId, 'user_alice1'))
    expect(rows).toHaveLength(1)
    expect(rows[0]!.email).toBe('alice@acme.com')
    expect(rows[0]!.firstName).toBe('Alice')
  })

  it('user.updated syncs name and avatar to member row', async () => {
    await db.insert(members).values({
      tenantId, email: 'bob@acme.com', clerkId: 'user_bob1', firstName: 'Bobby', role: 'member',
    })
    const res = await makeWebhookRequest({
      type: 'user.updated',
      data: {
        id: 'user_bob1',
        first_name: 'Robert',
        last_name: 'Jones',
        image_url: 'https://example.com/bob.jpg',
        email_addresses: [{ email_address: 'bob@acme.com', id: 'idn_1' }],
      },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(members).where(eq(members.clerkId, 'user_bob1'))
    expect(rows[0]!.firstName).toBe('Robert')
    expect(rows[0]!.lastName).toBe('Jones')
  })

  it('organizationMembership.deleted removes the member row', async () => {
    await db.insert(members).values({
      tenantId, email: 'del@acme.com', clerkId: 'user_del1', role: 'member',
    })
    const res = await makeWebhookRequest({
      type: 'organizationMembership.deleted',
      data: {
        organization: { id: 'org_test123' },
        public_user_data: { user_id: 'user_del1', identifier: 'del@acme.com' },
      },
    })
    expect(res.status).toBe(200)
    const rows = await db.select().from(members).where(eq(members.clerkId, 'user_del1'))
    expect(rows).toHaveLength(0)
  })

  it('returns 400 when Svix signature is invalid', async () => {
    const { Webhook } = await import('svix')
    vi.mocked((Webhook as ReturnType<typeof vi.fn>).mock.results[0]!.value.verify).mockImplementationOnce(() => {
      throw new Error('Invalid signature')
    })
    const res = await makeWebhookRequest({ type: 'organization.created', data: {} })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && npx vitest run tests/clerk-webhook.test.ts 2>&1 | tail -10
```

Expected: FAIL — route not found (404) or module not found.

- [ ] **Step 3: Create `backend/src/webhooks/clerk.ts`**

```ts
import { eq } from 'drizzle-orm'
import { Webhook } from 'svix'
import { db } from '../db/client.js'
import { tenants, members } from '../db/schema.js'
import type { FastifyInstance } from 'fastify'

type ClerkWebhookEvent =
  | { type: 'organization.created'; data: { id: string; name: string; slug: string; created_by: string } }
  | { type: 'organizationMembership.created'; data: { organization: { id: string }; public_user_data: { user_id: string; first_name: string | null; last_name: string | null; image_url: string; identifier: string }; role: string } }
  | { type: 'user.updated'; data: { id: string; first_name: string | null; last_name: string | null; image_url: string; email_addresses: Array<{ email_address: string }> } }
  | { type: 'organizationMembership.deleted'; data: { organization: { id: string }; public_user_data: { user_id: string; identifier: string } } }

export async function clerkWebhookRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/webhooks/clerk', async (req, reply) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET
    if (!secret) return reply.status(500).send({ error: 'Webhook secret not configured' })

    let event: ClerkWebhookEvent
    try {
      const wh = new Webhook(secret)
      event = wh.verify(req.body as string, {
        'svix-id':        (req.headers['svix-id'] as string) ?? '',
        'svix-timestamp': (req.headers['svix-timestamp'] as string) ?? '',
        'svix-signature': (req.headers['svix-signature'] as string) ?? '',
      }) as ClerkWebhookEvent
    } catch {
      return reply.status(400).send({ error: 'Invalid webhook signature' })
    }

    switch (event.type) {
      case 'organization.created': {
        const { id, name, slug } = event.data
        await db.insert(tenants).values({
          name,
          slug:               slug.slice(0, 50),
          clerkOrgId:         id,
          orgTokenHash:       '',
          adminTokenHash:     '',
          paymentProvider:    'clerk',
          externalSubId:      id,
          subscriptionStatus: 'active',
          plan:               'pro',
        }).onConflictDoNothing()
        break
      }

      case 'organizationMembership.created': {
        const { organization, public_user_data: u, role } = event.data
        const [tenant] = await db.select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.clerkOrgId, organization.id))
        if (!tenant) break
        await db.insert(members).values({
          tenantId:  tenant.id,
          email:     u.identifier,
          clerkId:   u.user_id,
          firstName: u.first_name ?? undefined,
          lastName:  u.last_name ?? undefined,
          avatarUrl: u.image_url,
          role:      role === 'org:admin' ? 'super_admin' : 'member',
        }).onConflictDoNothing()
        break
      }

      case 'user.updated': {
        const { id, first_name, last_name, image_url } = event.data
        await db.update(members)
          .set({ firstName: first_name ?? undefined, lastName: last_name ?? undefined, avatarUrl: image_url })
          .where(eq(members.clerkId, id))
        break
      }

      case 'organizationMembership.deleted': {
        const { organization, public_user_data: u } = event.data
        const [tenant] = await db.select({ id: tenants.id })
          .from(tenants)
          .where(eq(tenants.clerkOrgId, organization.id))
        if (!tenant) break
        await db.delete(members)
          .where(eq(members.clerkId, u.user_id))
        break
      }
    }

    return reply.status(200).send({ received: true })
  })
}
```

- [ ] **Step 4: Update `backend/src/app.ts` — register webhook route + raw body for Clerk**

Add `clerkWebhookRouter` import and registration, and update the content type parser to pass raw body for Clerk webhooks too:

```ts
import Fastify from 'fastify'
import cors from '@fastify/cors'
import './types.js'
import { policyRouter } from './policy/router.js'
import { divisionsRouter } from './divisions/router.js'
import { teamsRouter } from './teams/router.js'
import { membersRouter } from './members/router.js'
import { subjectsRouter } from './subjects/router.js'
import { rulesRouter } from './rules/router.js'
import { joinRouter } from './auth/join.js'
import { destinationGroupsRouter } from './destination-groups/router.js'
import { siteConfigsRouter } from './site-configs/router.js'
import { clerkWebhookRouter } from './webhooks/clerk.js'
import { handleStripeEvent } from './billing/stripe.js'
import { handlePayPalEvent } from './billing/paypal.js'

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  void app.register(cors)

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (req.url?.startsWith('/webhooks/stripe') || req.url?.startsWith('/webhooks/clerk')) {
      done(null, body)
    } else {
      try { done(null, JSON.parse(body as string)) }
      catch (e) { done(e as Error) }
    }
  })

  app.post('/webhooks/stripe', async (request, reply) => {
    await handleStripeEvent(request.body as string, (request.headers['stripe-signature'] as string) ?? '')
    return reply.status(200).send({ received: true })
  })

  app.post('/webhooks/paypal', async (request, reply) => {
    await handlePayPalEvent(request.body as Record<string, unknown>)
    return reply.status(200).send({ received: true })
  })

  void app.register(clerkWebhookRouter)
  void app.register(policyRouter, { prefix: '/v1' })
  void app.register(divisionsRouter, { prefix: '/v1' })
  void app.register(teamsRouter, { prefix: '/v1' })
  void app.register(membersRouter, { prefix: '/v1' })
  void app.register(subjectsRouter, { prefix: '/v1' })
  void app.register(rulesRouter, { prefix: '/v1' })
  void app.register(joinRouter, { prefix: '/v1' })
  void app.register(destinationGroupsRouter, { prefix: '/v1' })
  void app.register(siteConfigsRouter, { prefix: '/v1' })

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err)
    return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
  })

  app.get('/health', async () => ({ ok: true }))
  return app
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: errors for missing `siteConfigsRouter` (not yet created) — that's fine for now, address in Task 5.

- [ ] **Step 6: Commit**

```bash
git add backend/src/webhooks/clerk.ts backend/src/app.ts backend/tests/clerk-webhook.test.ts
git commit -m "feat(clerk): webhook handler — org + membership + user events"
```

---

### Task 3: Clerk auth middleware + types update

**Files:**
- Modify: `backend/src/auth/middleware.ts`
- Modify: `backend/src/types.ts`
- Create: `backend/tests/clerk-auth.test.ts`

- [ ] **Step 1: Write failing test in `backend/tests/clerk-auth.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { tenants, members } from '../src/db/schema.js'
import { publishPolicy } from '../src/policy/service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_test_alice'
const MOCK_CLERK_ORG_ID  = 'org_test_acme'
const MOCK_CLERK_JWT     = 'eyJhbGciOiJSUzI1NiJ9.mock.signature'

vi.mock('@clerk/backend', () => ({
  createClerkClient: () => ({
    verifyToken: vi.fn().mockResolvedValue({
      sub:    MOCK_CLERK_USER_ID,
      org_id: MOCK_CLERK_ORG_ID,
    }),
  }),
}))

let app: FastifyInstance
let tenantId: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  orgToken = t.orgToken
  await db.update(tenants).set({ clerkOrgId: MOCK_CLERK_ORG_ID }).where(eq(tenants.id, tenantId))
  await db.insert(members).values({
    tenantId,
    email: 'alice@acme.com',
    clerkId: MOCK_CLERK_USER_ID,
    role: 'member',
  })
  await publishPolicy(tenantId, { version: 1 as const, tenantId, subjects: [], siteConfigs: {} })
})
afterAll(async () => { await app.close() })

describe('GET /v1/policy — Clerk JWT auth', () => {
  it('accepts a Clerk JWT and returns 200', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
  })

  it('still accepts an org token (backward compat)', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
  })

  it('returns 401 for unknown Clerk org', async () => {
    const { createClerkClient } = await import('@clerk/backend')
    vi.mocked(createClerkClient().verifyToken).mockResolvedValueOnce({
      sub: 'user_unknown', org_id: 'org_unknown_xyz',
    } as never)
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${MOCK_CLERK_JWT}`)
    expect(res.status).toBe(401)
  })

  it('returns 401 for invalid JWT', async () => {
    const { createClerkClient } = await import('@clerk/backend')
    vi.mocked(createClerkClient().verifyToken).mockRejectedValueOnce(new Error('Invalid JWT'))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer bad.jwt.token`)
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend && npx vitest run tests/clerk-auth.test.ts 2>&1 | tail -10
```

Expected: FAIL — `createClerkClient` not found or middleware not implemented.

- [ ] **Step 3: Update `backend/src/types.ts`**

```ts
import type { Tenant, Member } from './db/schema.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant:      Tenant
    member?:     Member
    tokenPrefix: 'ps_live' | 'ps_adm' | 'clerk'
  }
}
```

- [ ] **Step 4: Update `backend/src/auth/middleware.ts`**

```ts
import type { FastifyRequest, FastifyReply } from 'fastify'
import { eq } from 'drizzle-orm'
import { createClerkClient } from '@clerk/backend'
import { parseToken, compareToken } from './tokens.js'
import { getTenantBySlug } from '../tenants/service.js'
import { db } from '../db/client.js'
import { tenants, members } from '../db/schema.js'

async function resolveOrgToken(
  request: FastifyRequest,
  reply: FastifyReply,
  requireAdmin: boolean
): Promise<void> {
  const auth = request.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const parsed = parseToken(auth.slice(7))
  if (!parsed) {
    return reply.status(401).send({ error: 'Invalid token format' })
  }
  const tenant = await getTenantBySlug(parsed.slug)
  if (!tenant) {
    return reply.status(401).send({ error: 'Unknown tenant' })
  }
  const hash = parsed.prefix === 'ps_adm' ? tenant.adminTokenHash : tenant.orgTokenHash
  if (!(await compareToken(parsed.secret, hash))) {
    return reply.status(401).send({ error: 'Invalid token' })
  }
  if (requireAdmin && parsed.prefix !== 'ps_adm') {
    return reply.status(403).send({ error: 'Admin token required' })
  }
  request.tenant = tenant
  request.tokenPrefix = parsed.prefix as 'ps_live' | 'ps_adm'
}

async function resolveClerkJwt(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) {
    return reply.status(500).send({ error: 'Clerk not configured' })
  }
  let clerkUserId: string
  let clerkOrgId: string
  try {
    const clerk = createClerkClient({ secretKey })
    const payload = await clerk.verifyToken(token)
    clerkUserId = payload.sub
    clerkOrgId  = (payload as Record<string, unknown>)['org_id'] as string
  } catch {
    return reply.status(401).send({ error: 'Invalid Clerk token' })
  }

  if (!clerkOrgId) {
    return reply.status(401).send({ error: 'Token missing org_id' })
  }

  const [tenant] = await db.select().from(tenants).where(eq(tenants.clerkOrgId, clerkOrgId))
  if (!tenant) {
    return reply.status(401).send({ error: 'Unknown organisation' })
  }

  const [member] = await db.select().from(members)
    .where(eq(members.clerkId, clerkUserId))
  if (!member) {
    return reply.status(401).send({ error: 'Member not enrolled — contact your admin' })
  }

  request.tenant      = tenant
  request.member      = member
  request.tokenPrefix = 'clerk'
}

export async function requireOrgToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveOrgToken(req, reply, false)
}

export async function requireAdminToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveOrgToken(req, reply, true)
}

export async function requireClerkAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.headers.authorization?.slice(7) ?? ''
  return resolveClerkJwt(req, reply, token)
}

export async function requireOrgTokenOrClerkAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing bearer token' })
  }
  const token = auth.slice(7)
  if (token.startsWith('ps_')) {
    return resolveOrgToken(req, reply, false)
  }
  return resolveClerkJwt(req, reply, token)
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/middleware.ts backend/src/types.ts backend/tests/clerk-auth.test.ts
git commit -m "feat(clerk): requireClerkAuth + requireOrgTokenOrClerkAuth middleware"
```

---

### Task 4: Update GET /v1/policy to use Clerk auth

**Files:**
- Modify: `backend/src/policy/router.ts`
- Modify: `backend/src/policy/compiler.ts`

- [ ] **Step 1: Update `backend/src/policy/compiler.ts` — add `siteConfigs` to `PolicyDoc`**

```ts
import { eq } from 'drizzle-orm'
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import { db } from '../db/client.js'
import { siteConfigs } from '../db/schema.js'
import type { Rule } from '../db/schema.js'

export interface SiteConfig {
  inputSelector: string
  sendButtonSelector: string
}

export interface RulePolicy {
  id: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  destinationGroupIds: string[]
  action: 'warn' | 'block'
  message: string | null
}

export interface SubjectPolicy {
  id: string
  name: string
  divisionId: string | null
  teamId: string | null
  rules: RulePolicy[]
}

export interface PolicyDoc {
  version: 1
  tenantId: string
  subjects: SubjectPolicy[]
  siteConfigs: Record<string, SiteConfig>
}

function toRulePolicy(r: Rule): RulePolicy {
  return {
    id:                  r.id,
    kind:                r.kind,
    keywords:            r.keywords ?? null,
    pattern:             r.pattern ?? null,
    destinations:        r.destinations ?? [],
    destinationGroupIds: r.destinationGroupIds ?? [],
    action:              r.action,
    message:             r.message ?? null,
  }
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const [allSubjects, allRules, allSiteConfigs] = await Promise.all([
    listSubjects(tenantId),
    listAllActiveRules(tenantId),
    db.select().from(siteConfigs).where(eq(siteConfigs.tenantId, tenantId)),
  ])

  const rulesBySubject = new Map<string, Rule[]>()
  for (const rule of allRules) {
    const arr = rulesBySubject.get(rule.subjectId) ?? []
    arr.push(rule)
    rulesBySubject.set(rule.subjectId, arr)
  }

  const siteConfigsMap: Record<string, SiteConfig> = {}
  for (const sc of allSiteConfigs) {
    siteConfigsMap[sc.domain] = { inputSelector: sc.inputSelector, sendButtonSelector: sc.sendButtonSelector }
  }

  return {
    version: 1,
    tenantId,
    subjects: allSubjects.map(s => ({
      id:         s.id,
      name:       s.name,
      divisionId: s.divisionId ?? null,
      teamId:     s.teamId ?? null,
      rules:      (rulesBySubject.get(s.id) ?? []).map(toRulePolicy),
    })),
    siteConfigs: siteConfigsMap,
  }
}
```

- [ ] **Step 2: Update `backend/src/policy/router.ts`**

Replace the full file:

```ts
import type { FastifyInstance } from 'fastify'
import { requireOrgTokenOrClerkAuth, requireAdminToken } from '../auth/middleware.js'
import { getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback } from './service.js'
import { compilePolicy, type PolicyDoc } from './compiler.js'
import { resolveMemberPolicy } from './resolver.js'

export async function policyRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/policy/version', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const version = await getVersionOnly(req.tenant.id)
    if (version === null) return reply.status(404).send({ error: 'No policy published' })
    return { version }
  })

  fastify.get('/policy', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const tenant = req.tenant

    if (tenant.subscriptionStatus === 'cancelled') {
      return reply.status(402).send({ error: 'subscription_cancelled' })
    }
    if (tenant.subscriptionStatus === 'past_due') {
      const expired = tenant.gracePeriodEndsAt && tenant.gracePeriodEndsAt < new Date()
      if (expired) return reply.status(402).send({ error: 'subscription_expired' })
    }

    const row = await getLatestPolicy(tenant.id)
    if (!row) return reply.status(404).send({ error: 'No policy published' })

    const snapshot = row.policyJson as PolicyDoc
    const policy = req.member
      ? await resolveMemberPolicy(tenant.id, req.member.id, snapshot)
      : snapshot

    const response: Record<string, unknown> = {
      version:    row.version,
      policy,
      tenantName: tenant.name,
      plan:       tenant.plan,
      expiresAt:  tenant.gracePeriodEndsAt?.toISOString() ?? null,
    }
    if (tenant.subscriptionStatus === 'past_due') response['warning'] = 'subscription_expiring'
    return response
  })

  fastify.post('/policy/publish', { preHandler: requireAdminToken }, async (req) => {
    const policy = await compilePolicy(req.tenant.id)
    const version = await publishPolicy(req.tenant.id, policy)
    return { version }
  })

  fastify.get('/policy/history', { preHandler: requireAdminToken }, async (req) => {
    return getHistory(req.tenant.id)
  })

  fastify.post('/policy/rollback/:version', { preHandler: requireAdminToken }, async (req, reply) => {
    const { version } = req.params as { version: string }
    const newVersion = await rollback(req.tenant.id, parseInt(version, 10))
    return { version: newVersion }
  })
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/policy/router.ts backend/src/policy/compiler.ts
git commit -m "feat(clerk): GET /v1/policy accepts Clerk JWT; siteConfigs in PolicyDoc"
```

---

### Task 5: siteConfigs service + router

**Files:**
- Create: `backend/src/site-configs/service.ts`
- Create: `backend/src/site-configs/router.ts`
- Create: `backend/tests/site-configs.test.ts`

- [ ] **Step 1: Write failing tests in `backend/tests/site-configs.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let adminToken: string
let orgToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  adminToken = t.adminToken
  orgToken   = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/site-configs', () => {
  it('creates a site config and returns it', async () => {
    const res = await supertest(app.server)
      .post('/v1/site-configs')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'app.acme.com', inputSelector: '#chat-input', sendButtonSelector: '#send-btn' })
    expect(res.status).toBe(201)
    expect(res.body.domain).toBe('app.acme.com')
    expect(res.body.inputSelector).toBe('#chat-input')
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/site-configs')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ domain: 'app.acme.com', inputSelector: '#x', sendButtonSelector: '#y' })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/site-configs', () => {
  it('lists all site configs for the tenant', async () => {
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'a.com', inputSelector: '#a', sendButtonSelector: '#b' })
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'b.com', inputSelector: '#c', sendButtonSelector: '#d' })
    const res = await supertest(app.server).get('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/site-configs/:domain', () => {
  it('updates inputSelector', async () => {
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'app.acme.com', inputSelector: '#old', sendButtonSelector: '#btn' })
    const res = await supertest(app.server)
      .patch('/v1/site-configs/app.acme.com')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inputSelector: '#new-input' })
    expect(res.status).toBe(200)
    expect(res.body.inputSelector).toBe('#new-input')
  })

  it('returns 404 for unknown domain', async () => {
    const res = await supertest(app.server)
      .patch('/v1/site-configs/notexist.com')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inputSelector: '#x' })
    expect(res.status).toBe(404)
  })
})

describe('DELETE /v1/site-configs/:domain', () => {
  it('removes the site config', async () => {
    await supertest(app.server).post('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
      .send({ domain: 'del.com', inputSelector: '#x', sendButtonSelector: '#y' })
    expect((await supertest(app.server).delete('/v1/site-configs/del.com').set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/site-configs').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((s: { domain: string }) => s.domain === 'del.com')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd backend && npx vitest run tests/site-configs.test.ts 2>&1 | tail -5
```

Expected: FAIL — routes not registered.

- [ ] **Step 3: Create `backend/src/site-configs/service.ts`**

```ts
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { siteConfigs, type SiteConfig, type NewSiteConfig } from '../db/schema.js'

export async function listSiteConfigs(tenantId: string): Promise<SiteConfig[]> {
  return db.select().from(siteConfigs).where(eq(siteConfigs.tenantId, tenantId))
}

export async function createSiteConfig(
  tenantId: string,
  data: Pick<NewSiteConfig, 'domain' | 'inputSelector' | 'sendButtonSelector'>
): Promise<SiteConfig> {
  const [row] = await db.insert(siteConfigs).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateSiteConfig(
  tenantId: string,
  domain: string,
  data: Partial<Pick<NewSiteConfig, 'inputSelector' | 'sendButtonSelector'>>
): Promise<SiteConfig | null> {
  const [row] = await db.update(siteConfigs)
    .set(data)
    .where(and(eq(siteConfigs.tenantId, tenantId), eq(siteConfigs.domain, domain)))
    .returning()
  return row ?? null
}

export async function deleteSiteConfig(tenantId: string, domain: string): Promise<void> {
  await db.delete(siteConfigs)
    .where(and(eq(siteConfigs.tenantId, tenantId), eq(siteConfigs.domain, domain)))
}
```

- [ ] **Step 4: Create `backend/src/site-configs/router.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listSiteConfigs, createSiteConfig, updateSiteConfig, deleteSiteConfig } from './service.js'

export async function siteConfigsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/site-configs', { preHandler: requireAdminToken }, async (req) => {
    return listSiteConfigs(req.tenant.id)
  })

  fastify.post('/site-configs', { preHandler: requireAdminToken }, async (req, reply) => {
    const { domain, inputSelector, sendButtonSelector } = req.body as {
      domain: string; inputSelector: string; sendButtonSelector: string
    }
    const row = await createSiteConfig(req.tenant.id, { domain, inputSelector, sendButtonSelector })
    return reply.status(201).send(row)
  })

  fastify.patch('/site-configs/:domain', { preHandler: requireAdminToken }, async (req, reply) => {
    const { domain } = req.params as { domain: string }
    const data = req.body as Partial<{ inputSelector: string; sendButtonSelector: string }>
    const row = await updateSiteConfig(req.tenant.id, domain, data)
    if (!row) return reply.status(404).send({ error: 'Site config not found' })
    return row
  })

  fastify.delete('/site-configs/:domain', { preHandler: requireAdminToken }, async (req, reply) => {
    const { domain } = req.params as { domain: string }
    await deleteSiteConfig(req.tenant.id, domain)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 5: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/site-configs/service.ts backend/src/site-configs/router.ts backend/tests/site-configs.test.ts
git commit -m "feat(site-configs): CRUD service + router"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run full TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: exits 0, no output.

- [ ] **Step 2: Run full test suite**

```bash
cd backend && npx vitest run 2>&1 | tail -10
```

Expected: all non-DB tests pass; DB tests fail with `ECONNREFUSED` only. No assertion failures, no type errors in output.

- [ ] **Step 3: Final commit if any stragglers**

```bash
git add -A
git status
# Only commit if there are untracked changes
```
