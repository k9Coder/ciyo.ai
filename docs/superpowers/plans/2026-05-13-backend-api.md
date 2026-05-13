# Backend API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Fastify REST API that provisions enterprise tenants via Stripe/PayPal webhooks, gates policy access behind bcrypt-hashed tokens, versions policy documents, and serves compiled law-firm detection rules to the Chrome extension.

**Architecture:** New Node.js project in `backend/` within this monorepo. Tenants are created on first successful payment; their `org_token` lets all lawyer machines pull the current policy, while `admin_token` unlocks CRUD on the client/matter roster and policy publishing. Policy documents are versioned JSONB blobs built from the matters table plus hard-coded law firm detection rules.

**Tech Stack:** Node.js 20, Fastify 4, Drizzle ORM, postgres-js, PostgreSQL 15, bcryptjs, Stripe SDK v14, nodemailer, Vitest, supertest, TypeScript 5, Railway.

---

## File Map

New files — all under `backend/`:

```
src/
  db/
    schema.ts          # Drizzle tables: tenants, policies, matters (+ inferred TS types)
    client.ts          # postgres-js connection + drizzle instance
    migrate.ts         # one-shot migration runner (tsx src/db/migrate.ts)
  auth/
    tokens.ts          # parseToken, generateSecret, formatToken, hashToken, compareToken
    middleware.ts      # requireOrgToken, requireAdminToken Fastify preHandler hooks
  tenants/
    service.ts         # getTenantBySlug, updateSubscriptionStatus
  matters/
    service.ts         # listMatters, createMatter, updateMatter, deleteMatter
    router.ts          # GET/POST /v1/matters, PATCH/DELETE /v1/matters/:id
  policy/
    compiler.ts        # compilePolicy(tenantId) → PolicyDoc JSON
    service.ts         # getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback
    router.ts          # GET /v1/policy/version, GET /v1/policy (org) + publish/history/rollback (admin)
  billing/
    service.ts         # activateTenant, updateSubscriptionStatus (re-exported from tenants)
    email.ts           # sendWelcomeEmail via nodemailer
    stripe.ts          # handleStripeEvent(rawBody, sig)
    paypal.ts          # handlePayPalEvent(body)
  types.ts             # FastifyRequest augmentation (tenant, tokenPrefix)
  app.ts               # buildApp() → FastifyInstance (no .listen)
  index.ts             # start server
tests/
  helpers/
    db.ts              # truncateAll(), buildTestTenant()
  tokens.test.ts
  tenants.test.ts
  matters.test.ts
  policy.test.ts
  policy-routes.test.ts
  billing-stripe.test.ts
  billing-paypal.test.ts
.env.example
drizzle.config.ts
package.json
tsconfig.json
railway.toml
```

---

### Task 1: Scaffold backend project

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/drizzle.config.ts`
- Create: `backend/.env.example`

- [ ] **Step 1: Create `backend/package.json`**

```json
{
  "name": "promptshield-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "bcryptjs": "^2.4.3",
    "drizzle-orm": "^0.30.10",
    "fastify": "^4.28.0",
    "nodemailer": "^6.9.13",
    "postgres": "^3.4.4",
    "stripe": "^14.21.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.12.12",
    "@types/nodemailer": "^6.4.15",
    "@types/supertest": "^6.0.2",
    "drizzle-kit": "^0.21.4",
    "supertest": "^7.0.0",
    "tsx": "^4.10.5",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `backend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `backend/drizzle.config.ts`**

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config
```

- [ ] **Step 4: Create `backend/.env.example`**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/promptshield
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
PAYPAL_SKIP_SIG_VERIFY=false
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@promptshield.dev
PORT=3000
```

- [ ] **Step 5: Install dependencies**

```bash
cd backend && npm install
```

Expected: `node_modules` populated, no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/tsconfig.json backend/drizzle.config.ts backend/.env.example
git commit -m "feat(backend): scaffold Node.js + Fastify project"
```

---

### Task 2: Database schema

**Files:**
- Create: `backend/src/db/schema.ts`
- Create: `backend/tests/tokens.test.ts` (schema import smoke test, expanded in Task 3)

- [ ] **Step 1: Write failing import test**

```typescript
// backend/tests/tokens.test.ts
import { describe, it, expect } from 'vitest'
import { tenants, policies, matters } from '../src/db/schema.js'

describe('schema', () => {
  it('exports all three tables', () => {
    expect(tenants).toBeDefined()
    expect(policies).toBeDefined()
    expect(matters).toBeDefined()
  })
})
```

Run: `cd backend && npm test -- tests/tokens.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Create `backend/src/db/schema.ts`**

```typescript
import {
  pgTable, uuid, text, integer, boolean,
  timestamp, jsonb, index, unique,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull(),
  orgTokenHash: text('org_token_hash').notNull(),
  adminTokenHash: text('admin_token_hash').notNull(),
  paymentProvider: text('payment_provider').notNull(),    // 'stripe' | 'paypal'
  externalSubId: text('external_sub_id').notNull(),
  subscriptionStatus: text('subscription_status').notNull().default('active'),
  plan: text('plan').notNull().default('pro'),
  gracePeriodDays: integer('grace_period_days').notNull().default(7),
  gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugUniq: unique().on(t.slug),
}))

export const policies = pgTable('policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  version: integer('version').notNull(),
  policyJson: jsonb('policy_json').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantVersionUniq: unique().on(t.tenantId, t.version),
  versionIdx: index().on(t.tenantId, t.version),
}))

export const matters = pgTable('matters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  clientName: text('client_name').notNull(),
  matterName: text('matter_name'),
  matterNumber: text('matter_number'),
  opposingParties: text('opposing_parties').array().default(sql`'{}'`),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  tenantActiveIdx: index().on(t.tenantId, t.active),
}))

export type Tenant = typeof tenants.$inferSelect
export type NewTenant = typeof tenants.$inferInsert
export type PolicyRow = typeof policies.$inferSelect
export type Matter = typeof matters.$inferSelect
export type NewMatter = typeof matters.$inferInsert
```

- [ ] **Step 3: Run test**

Run: `cd backend && npm test -- tests/tokens.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/db/schema.ts backend/tests/tokens.test.ts
git commit -m "feat(backend): Drizzle schema — tenants, policies, matters"
```

---

### Task 3: Token utilities

**Files:**
- Create: `backend/src/auth/tokens.ts`
- Modify: `backend/tests/tokens.test.ts`

- [ ] **Step 1: Replace `backend/tests/tokens.test.ts` with full token tests**

```typescript
import { describe, it, expect } from 'vitest'
import { tenants, policies, matters } from '../src/db/schema.js'
import {
  parseToken, generateSecret, formatToken, hashToken, compareToken,
} from '../src/auth/tokens.js'

describe('schema exports', () => {
  it('exports all three tables', () => {
    expect(tenants).toBeDefined()
    expect(policies).toBeDefined()
    expect(matters).toBeDefined()
  })
})

describe('parseToken', () => {
  const SECRET = 'a'.repeat(32)

  it('parses a valid org token', () => {
    const result = parseToken(`ps_live_acmelaw_${SECRET}`)
    expect(result).toEqual({ prefix: 'ps_live', slug: 'acmelaw', secret: SECRET })
  })

  it('parses a valid admin token', () => {
    expect(parseToken(`ps_adm_acmelaw_${SECRET}`)?.prefix).toBe('ps_adm')
  })

  it('returns null for wrong prefix', () => {
    expect(parseToken(`ps_test_acmelaw_${SECRET}`)).toBeNull()
  })

  it('returns null for secret shorter than 32 chars', () => {
    expect(parseToken('ps_live_acmelaw_tooshort')).toBeNull()
  })

  it('returns null for malformed string', () => {
    expect(parseToken('invalid')).toBeNull()
  })
})

describe('generateSecret', () => {
  it('produces a 32-char base64url string', () => {
    const s = generateSecret()
    expect(s).toHaveLength(32)
    expect(s).toMatch(/^[A-Za-z0-9_-]{32}$/)
  })

  it('produces unique values each call', () => {
    expect(generateSecret()).not.toBe(generateSecret())
  })
})

describe('hashToken / compareToken', () => {
  it('round-trips: correct secret matches, wrong does not', async () => {
    const secret = generateSecret()
    const hash = await hashToken(secret)
    expect(await compareToken(secret, hash)).toBe(true)
    expect(await compareToken('wrongsecret123456789012345678901', hash)).toBe(false)
  })
})
```

Run: `cd backend && npm test -- tests/tokens.test.ts`
Expected: FAIL — `../src/auth/tokens.js` not found.

- [ ] **Step 2: Create `backend/src/auth/tokens.ts`**

```typescript
import { randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'

export interface ParsedToken {
  prefix: 'ps_live' | 'ps_adm'
  slug: string
  secret: string
}

const TOKEN_RE = /^(ps_live|ps_adm)_([a-z][a-z0-9]*)_([A-Za-z0-9_-]{32})$/

export function parseToken(token: string): ParsedToken | null {
  const m = token.match(TOKEN_RE)
  if (!m) return null
  return { prefix: m[1] as ParsedToken['prefix'], slug: m[2]!, secret: m[3]! }
}

/** 24 random bytes → 32 base64url chars (no padding). */
export function generateSecret(): string {
  return randomBytes(24).toString('base64url')
}

export function formatToken(prefix: 'ps_live' | 'ps_adm', slug: string, secret: string): string {
  return `${prefix}_${slug}_${secret}`
}

export async function hashToken(secret: string): Promise<string> {
  return bcrypt.hash(secret, 10)
}

export async function compareToken(secret: string, hash: string): Promise<boolean> {
  return bcrypt.compare(secret, hash)
}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npm test -- tests/tokens.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/auth/tokens.ts backend/tests/tokens.test.ts
git commit -m "feat(backend): token parse/generate/hash utilities"
```

---

### Task 4: Database client + migration runner + test helpers

**Files:**
- Create: `backend/src/db/client.ts`
- Create: `backend/src/db/migrate.ts`
- Create: `backend/tests/helpers/db.ts`

Prerequisite: copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL` to a local Postgres instance.

- [ ] **Step 1: Create `backend/src/db/client.ts`**

```typescript
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

const sql = postgres(process.env.DATABASE_URL!)
export const db = drizzle(sql, { schema })
```

- [ ] **Step 2: Create `backend/src/db/migrate.ts`**

```typescript
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
const db = drizzle(sql)
await migrate(db, { migrationsFolder: join(__dirname, '../../drizzle') })
await sql.end()
console.log('Migrations complete')
```

- [ ] **Step 3: Generate first migration**

```bash
cd backend && npm run db:generate
```

Expected: `backend/drizzle/0000_initial.sql` created.

- [ ] **Step 4: Run migration against test database**

```bash
cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5432/promptshield_test npm run db:migrate
```

Expected: `Migrations complete`.

- [ ] **Step 5: Create `backend/tests/helpers/db.ts`**

```typescript
import { db } from '../../src/db/client.js'
import { tenants, policies, matters } from '../../src/db/schema.js'
import { generateSecret, formatToken, hashToken } from '../../src/auth/tokens.js'

export async function truncateAll(): Promise<void> {
  await db.delete(matters)
  await db.delete(policies)
  await db.delete(tenants)
}

export interface TestTenantResult {
  tenantId: string
  orgToken: string
  adminToken: string
}

export async function buildTestTenant(slug = 'testfirm'): Promise<TestTenantResult> {
  const orgSecret = generateSecret()
  const adminSecret = generateSecret()
  const orgToken = formatToken('ps_live', slug, orgSecret)
  const adminToken = formatToken('ps_adm', slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name: 'Test Firm LLP',
    slug,
    orgTokenHash: await hashToken(orgSecret),
    adminTokenHash: await hashToken(adminSecret),
    paymentProvider: 'stripe',
    externalSubId: `sub_test_${slug}`,
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/ backend/drizzle/ backend/tests/helpers/
git commit -m "feat(backend): DB client, migration runner, test helper"
```

---

### Task 5: Tenant service

**Files:**
- Create: `backend/src/tenants/service.ts`
- Create: `backend/tests/tenants.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/tenants.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { getTenantBySlug, updateSubscriptionStatus } from '../src/tenants/service.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'

beforeEach(async () => { await truncateAll() })

describe('getTenantBySlug', () => {
  it('returns tenant for known slug', async () => {
    const { tenantId } = await buildTestTenant('acmelaw')
    const tenant = await getTenantBySlug('acmelaw')
    expect(tenant?.id).toBe(tenantId)
    expect(tenant?.slug).toBe('acmelaw')
  })

  it('returns null for unknown slug', async () => {
    expect(await getTenantBySlug('unknown')).toBeNull()
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

Run: `cd backend && npm test -- tests/tenants.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Create `backend/src/tenants/service.ts`**

```typescript
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, type Tenant } from '../db/schema.js'

export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const rows = await db.select().from(tenants).where(eq(tenants.slug, slug))
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
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npm test -- tests/tenants.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/tenants/service.ts backend/tests/tenants.test.ts
git commit -m "feat(backend): tenant service — lookup and subscription status"
```

---

### Task 6: Auth middleware

**Files:**
- Create: `backend/src/types.ts`
- Create: `backend/src/auth/middleware.ts`

Auth is tested implicitly through route tests (Tasks 8 and 9). The middleware itself is pure Fastify plumbing.

- [ ] **Step 1: Create `backend/src/types.ts`** (FastifyRequest augmentation)

```typescript
import type { Tenant } from './db/schema.js'

declare module 'fastify' {
  interface FastifyRequest {
    tenant: Tenant
    tokenPrefix: 'ps_live' | 'ps_adm'
  }
}
```

- [ ] **Step 2: Create `backend/src/auth/middleware.ts`**

```typescript
import type { FastifyRequest, FastifyReply } from 'fastify'
import { parseToken, compareToken } from './tokens.js'
import { getTenantBySlug } from '../tenants/service.js'

async function resolveToken(
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
  request.tokenPrefix = parsed.prefix
}

export async function requireOrgToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveToken(req, reply, false)
}

export async function requireAdminToken(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return resolveToken(req, reply, true)
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/types.ts backend/src/auth/middleware.ts
git commit -m "feat(backend): auth middleware — requireOrgToken, requireAdminToken"
```

---

### Task 7: Policy service

**Files:**
- Create: `backend/src/policy/service.ts`
- Create: `backend/tests/policy.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/policy.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import {
  getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback,
} from '../src/policy/service.js'

const SAMPLE = {
  version: 1 as const,
  baseline: [],
  custom: [],
  perSite: {},
  allowSendAnywayWithReason: true,
  auditRetentionDays: 90,
}

let tenantId: string

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId
})

describe('publishPolicy', () => {
  it('first publish returns version 1', async () => {
    expect(await publishPolicy(tenantId, SAMPLE)).toBe(1)
  })

  it('increments version on each call', async () => {
    await publishPolicy(tenantId, SAMPLE)
    expect(await publishPolicy(tenantId, SAMPLE)).toBe(2)
  })
})

describe('getVersionOnly', () => {
  it('returns null when no policy exists', async () => {
    expect(await getVersionOnly(tenantId)).toBeNull()
  })

  it('returns the latest version number', async () => {
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, SAMPLE)
    expect(await getVersionOnly(tenantId)).toBe(2)
  })
})

describe('getLatestPolicy', () => {
  it('returns null when no policy exists', async () => {
    expect(await getLatestPolicy(tenantId)).toBeNull()
  })

  it('returns the most recently published row', async () => {
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, { ...SAMPLE, auditRetentionDays: 365 })
    const row = await getLatestPolicy(tenantId)
    expect(row?.version).toBe(2)
    expect((row?.policyJson as typeof SAMPLE).auditRetentionDays).toBe(365)
  })
})

describe('getHistory', () => {
  it('returns versions in descending order', async () => {
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, SAMPLE)
    await publishPolicy(tenantId, SAMPLE)
    const history = await getHistory(tenantId)
    expect(history.map(h => h.version)).toEqual([3, 2, 1])
  })
})

describe('rollback', () => {
  it('publishes a copy of a past version as a new version', async () => {
    await publishPolicy(tenantId, { ...SAMPLE, auditRetentionDays: 30 })
    await publishPolicy(tenantId, { ...SAMPLE, auditRetentionDays: 60 })
    const newVer = await rollback(tenantId, 1)
    expect(newVer).toBe(3)
    const latest = await getLatestPolicy(tenantId)
    expect((latest?.policyJson as typeof SAMPLE).auditRetentionDays).toBe(30)
  })

  it('throws for a version that does not exist', async () => {
    await expect(rollback(tenantId, 99)).rejects.toThrow()
  })
})
```

Run: `cd backend && npm test -- tests/policy.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2: Create `backend/src/policy/service.ts`**

```typescript
import { eq, desc, max, and } from 'drizzle-orm'
import { db } from '../db/client.js'
import { policies, type PolicyRow } from '../db/schema.js'

export async function getVersionOnly(tenantId: string): Promise<number | null> {
  const [row] = await db
    .select({ version: max(policies.version) })
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
  return row?.version ?? null
}

export async function getLatestPolicy(tenantId: string): Promise<PolicyRow | null> {
  const [row] = await db
    .select()
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .orderBy(desc(policies.version))
    .limit(1)
  return row ?? null
}

export async function publishPolicy(tenantId: string, policyJson: unknown): Promise<number> {
  const current = await getVersionOnly(tenantId)
  const nextVersion = (current ?? 0) + 1
  await db.insert(policies).values({ tenantId, version: nextVersion, policyJson })
  return nextVersion
}

export async function getHistory(tenantId: string): Promise<Array<{ version: number; publishedAt: Date }>> {
  return db
    .select({ version: policies.version, publishedAt: policies.publishedAt })
    .from(policies)
    .where(eq(policies.tenantId, tenantId))
    .orderBy(desc(policies.version))
}

export async function rollback(tenantId: string, toVersion: number): Promise<number> {
  const [row] = await db
    .select({ policyJson: policies.policyJson })
    .from(policies)
    .where(and(eq(policies.tenantId, tenantId), eq(policies.version, toVersion)))
  if (!row) throw new Error(`Version ${toVersion} not found for tenant ${tenantId}`)
  return publishPolicy(tenantId, row.policyJson)
}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npm test -- tests/policy.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/policy/service.ts backend/tests/policy.test.ts
git commit -m "feat(backend): policy versioning service — publish, rollback, history"
```

---

### Task 8: Policy routes (org-facing) + app factory

**Files:**
- Create: `backend/src/policy/router.ts` (org routes only; admin routes added in Task 11)
- Create: `backend/src/app.ts`
- Create: `backend/tests/policy-routes.test.ts`

- [ ] **Step 1: Write failing route tests**

```typescript
// backend/tests/policy-routes.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { publishPolicy } from '../src/policy/service.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const BASE_POLICY = {
  version: 1 as const,
  baseline: [],
  custom: [],
  perSite: {},
  allowSendAnywayWithReason: true,
  auditRetentionDays: 90,
}

let app: FastifyInstance
let tenantId: string
let orgToken: string
let adminToken: string

beforeAll(async () => {
  app = buildApp()
  await app.ready()
})
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  orgToken = t.orgToken
  adminToken = t.adminToken
  await publishPolicy(tenantId, BASE_POLICY)
})
afterAll(async () => { await app.close() })

describe('GET /v1/policy/version', () => {
  it('returns current version for valid org token', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy/version')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
  })

  it('returns 401 without token', async () => {
    expect((await supertest(app.server).get('/v1/policy/version')).status).toBe(401)
  })
})

describe('GET /v1/policy', () => {
  it('returns PolicyResponse for active subscription', async () => {
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(1)
    expect(res.body.policy).toBeDefined()
    expect(res.body.tenantName).toBe('Test Firm LLP')
    expect(res.body.plan).toBe('pro')
  })

  it('returns 402 for cancelled subscription', async () => {
    await db.update(tenants).set({ subscriptionStatus: 'cancelled' }).where(eq(tenants.id, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(402)
  })

  it('returns 200 with warning for past_due within grace period', async () => {
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() + 6)
    await db.update(tenants)
      .set({ subscriptionStatus: 'past_due', gracePeriodEndsAt: endsAt })
      .where(eq(tenants.id, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(200)
    expect(res.body.warning).toBe('subscription_expiring')
  })

  it('returns 402 after grace period has passed', async () => {
    const endsAt = new Date()
    endsAt.setDate(endsAt.getDate() - 1)
    await db.update(tenants)
      .set({ subscriptionStatus: 'past_due', gracePeriodEndsAt: endsAt })
      .where(eq(tenants.id, tenantId))
    const res = await supertest(app.server)
      .get('/v1/policy')
      .set('Authorization', `Bearer ${orgToken}`)
    expect(res.status).toBe(402)
  })
})
```

Run: `cd backend && npm test -- tests/policy-routes.test.ts`
Expected: FAIL — `../src/app.js` not found.

- [ ] **Step 2: Create `backend/src/policy/router.ts`** (org routes only)

```typescript
import type { FastifyInstance } from 'fastify'
import { requireOrgToken } from '../auth/middleware.js'
import { getVersionOnly, getLatestPolicy } from './service.js'

export async function policyRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/policy/version', { preHandler: requireOrgToken }, async (req, reply) => {
    const version = await getVersionOnly(req.tenant.id)
    if (version === null) return reply.status(404).send({ error: 'No policy published' })
    return { version }
  })

  fastify.get('/policy', { preHandler: requireOrgToken }, async (req, reply) => {
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

    const response: Record<string, unknown> = {
      version: row.version,
      policy: row.policyJson,
      tenantName: tenant.name,
      plan: tenant.plan,
      expiresAt: tenant.gracePeriodEndsAt?.toISOString() ?? null,
    }
    if (tenant.subscriptionStatus === 'past_due') response['warning'] = 'subscription_expiring'
    return response
  })
}
```

- [ ] **Step 3: Create `backend/src/app.ts`**

```typescript
import Fastify from 'fastify'
import cors from '@fastify/cors'
import './types.js'
import { policyRouter } from './policy/router.js'

export function buildApp() {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' })
  void app.register(cors)

  // Raw-body passthrough for webhook routes; JSON parse for everything else
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (req.url?.startsWith('/webhooks')) {
      done(null, body)
    } else {
      try { done(null, JSON.parse(body as string)) }
      catch (e) { done(e as Error) }
    }
  })

  void app.register(policyRouter, { prefix: '/v1' })

  app.setErrorHandler((err, _req, reply) => {
    app.log.error(err)
    return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
  })

  app.get('/health', async () => ({ ok: true }))
  return app
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test -- tests/policy-routes.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/policy/router.ts backend/src/app.ts backend/tests/policy-routes.test.ts
git commit -m "feat(backend): policy routes — GET /v1/policy + /v1/policy/version with subscription gate"
```

---

### Task 9: Matters service + routes

**Files:**
- Create: `backend/src/matters/service.ts`
- Create: `backend/src/matters/router.ts`
- Create: `backend/tests/matters.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/matters.test.ts
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
  orgToken = t.orgToken
})
afterAll(async () => { await app.close() })

describe('POST /v1/matters', () => {
  it('creates a matter and returns it', async () => {
    const res = await supertest(app.server)
      .post('/v1/matters')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientName: 'Widget Corp', matterNumber: 'WC-001', opposingParties: ['Acme Inc'] })
    expect(res.status).toBe(201)
    expect(res.body.clientName).toBe('Widget Corp')
    expect(res.body.matterNumber).toBe('WC-001')
    expect(res.body.opposingParties).toContain('Acme Inc')
    expect(res.body.id).toBeDefined()
  })

  it('returns 403 with org token', async () => {
    const res = await supertest(app.server)
      .post('/v1/matters')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({ clientName: 'Widget Corp' })
    expect(res.status).toBe(403)
  })
})

describe('GET /v1/matters', () => {
  it('lists all active matters for the tenant', async () => {
    await supertest(app.server).post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'A' })
    await supertest(app.server).post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'B' })
    const res = await supertest(app.server).get('/v1/matters').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(2)
  })
})

describe('PATCH /v1/matters/:id', () => {
  it('updates the client name', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'Old' })
    const res = await supertest(app.server)
      .patch(`/v1/matters/${created.id as string}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ clientName: 'New' })
    expect(res.status).toBe(200)
    expect(res.body.clientName).toBe('New')
  })
})

describe('DELETE /v1/matters/:id', () => {
  it('removes the matter', async () => {
    const { body: created } = await supertest(app.server)
      .post('/v1/matters').set('Authorization', `Bearer ${adminToken}`).send({ clientName: 'To Delete' })
    expect((await supertest(app.server).delete(`/v1/matters/${created.id as string}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204)
    const list = await supertest(app.server).get('/v1/matters').set('Authorization', `Bearer ${adminToken}`)
    expect(list.body.find((m: { id: string }) => m.id === created.id)).toBeUndefined()
  })
})
```

Run: `cd backend && npm test -- tests/matters.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `backend/src/matters/service.ts`**

```typescript
import { and, eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { matters, type Matter, type NewMatter } from '../db/schema.js'

export async function listMatters(tenantId: string): Promise<Matter[]> {
  return db.select().from(matters).where(
    and(eq(matters.tenantId, tenantId), eq(matters.active, true))
  )
}

export async function createMatter(
  tenantId: string,
  data: Pick<NewMatter, 'clientName' | 'matterName' | 'matterNumber' | 'opposingParties'>
): Promise<Matter> {
  const [row] = await db.insert(matters).values({ tenantId, ...data }).returning()
  return row!
}

export async function updateMatter(
  tenantId: string,
  matterId: string,
  data: Partial<Pick<NewMatter, 'clientName' | 'matterName' | 'matterNumber' | 'opposingParties' | 'active'>>
): Promise<Matter | null> {
  const [row] = await db
    .update(matters)
    .set(data)
    .where(and(eq(matters.id, matterId), eq(matters.tenantId, tenantId)))
    .returning()
  return row ?? null
}

export async function deleteMatter(tenantId: string, matterId: string): Promise<void> {
  await db.delete(matters).where(
    and(eq(matters.id, matterId), eq(matters.tenantId, tenantId))
  )
}
```

- [ ] **Step 3: Create `backend/src/matters/router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { requireAdminToken } from '../auth/middleware.js'
import { listMatters, createMatter, updateMatter, deleteMatter } from './service.js'

export async function mattersRouter(fastify: FastifyInstance): Promise<void> {
  fastify.get('/matters', { preHandler: requireAdminToken }, async (req) => {
    return listMatters(req.tenant.id)
  })

  fastify.post('/matters', { preHandler: requireAdminToken }, async (req, reply) => {
    const body = req.body as {
      clientName: string
      matterName?: string
      matterNumber?: string
      opposingParties?: string[]
    }
    return reply.status(201).send(await createMatter(req.tenant.id, body))
  })

  fastify.patch('/matters/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = req.body as Partial<{ clientName: string; matterName: string; matterNumber: string; active: boolean }>
    const updated = await updateMatter(req.tenant.id, id, body)
    if (!updated) return reply.status(404).send({ error: 'Matter not found' })
    return updated
  })

  fastify.delete('/matters/:id', { preHandler: requireAdminToken }, async (req, reply) => {
    await deleteMatter(req.tenant.id, (req.params as { id: string }).id)
    return reply.status(204).send()
  })
}
```

- [ ] **Step 4: Register mattersRouter in `backend/src/app.ts`**

Add these two lines inside `buildApp()`, after the policyRouter registration:

```typescript
import { mattersRouter } from './matters/router.js'
// ...
void app.register(mattersRouter, { prefix: '/v1' })
```

- [ ] **Step 5: Run tests**

Run: `cd backend && npm test -- tests/matters.test.ts`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/matters/ backend/tests/matters.test.ts
git commit -m "feat(backend): matters service and admin CRUD routes"
```

---

### Task 10: Policy compiler

**Files:**
- Create: `backend/src/policy/compiler.ts`
- Create: `backend/tests/policy-compiler.test.ts`

The compiler builds a law-firm `PolicyDoc` (matches the extension's `PolicySchema` shape) from the tenant's active matters plus three hard-coded law firm rules.

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/policy-compiler.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { createMatter, updateMatter } from '../src/matters/service.js'
import { compilePolicy } from '../src/policy/compiler.js'

let tenantId: string

beforeEach(async () => {
  await truncateAll()
  tenantId = (await buildTestTenant()).tenantId
})

describe('compilePolicy', () => {
  it('always includes confidentiality-markers DictionaryRule', async () => {
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'confidentiality-markers')
    expect((rule as { kind: string }).kind).toBe('dictionary')
    expect((rule as { terms: string[] }).terms).toContain('ATTORNEY-CLIENT PRIVILEGE')
  })

  it('always includes legal-document-structure ScoreRule', async () => {
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'legal-document-structure')
    expect((rule as { kind: string }).kind).toBe('score')
    expect((rule as { warnThreshold: number }).warnThreshold).toBe(50)
    expect((rule as { confirmThreshold: number }).confirmThreshold).toBe(80)
  })

  it('omits client-roster when no active matters exist', async () => {
    const policy = await compilePolicy(tenantId)
    expect(policy.custom.find(r => (r as { id: string }).id === 'client-roster')).toBeUndefined()
  })

  it('includes active matter fields in client-roster terms', async () => {
    await createMatter(tenantId, { clientName: 'Widget Corp', matterNumber: 'WC-001', opposingParties: ['Acme Inc'] })
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as { terms: string[] }
    expect(rule.terms).toContain('Widget Corp')
    expect(rule.terms).toContain('WC-001')
    expect(rule.terms).toContain('Acme Inc')
  })

  it('adds fuzzy variant for names ≤ 20 chars', async () => {
    await createMatter(tenantId, { clientName: 'Short Name' }) // 10 chars
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as
      { fuzzyTerms?: Array<{ term: string; maxDistance: number }> }
    expect(rule.fuzzyTerms?.some(f => f.term === 'Short Name')).toBe(true)
  })

  it('does NOT add fuzzy variant for names > 20 chars', async () => {
    await createMatter(tenantId, { clientName: 'This Is A Very Long Client Name' })
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as
      { fuzzyTerms?: Array<{ term: string }> } | undefined
    expect(rule?.fuzzyTerms?.some(f => f.term === 'This Is A Very Long Client Name')).toBeFalsy()
  })

  it('excludes inactive matters', async () => {
    await createMatter(tenantId, { clientName: 'Active' })
    const inactive = await createMatter(tenantId, { clientName: 'Inactive' })
    await updateMatter(tenantId, inactive.id, { active: false })
    const policy = await compilePolicy(tenantId)
    const rule = policy.custom.find(r => (r as { id: string }).id === 'client-roster') as { terms: string[] }
    expect(rule.terms).toContain('Active')
    expect(rule.terms).not.toContain('Inactive')
  })
})
```

Run: `cd backend && npm test -- tests/policy-compiler.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `backend/src/policy/compiler.ts`**

```typescript
import { listMatters } from '../matters/service.js'

const CONFIDENTIALITY_TERMS = [
  'PRIVILEGED AND CONFIDENTIAL',
  'ATTORNEY-CLIENT PRIVILEGE',
  'ATTORNEY WORK PRODUCT',
  'WORK PRODUCT DOCTRINE',
  'DO NOT DISCLOSE',
  'CONFIDENTIAL — NOT FOR DISTRIBUTION',
  'SUBJECT TO PROTECTIVE ORDER',
]

const SCORE_SIGNALS = [
  { id: 'paste_detected',       description: 'Detected as paste (not typed)',             points: 20,  enabled: true },
  { id: 'long_text',            description: 'Text length > 400 words',                   points: 20,  enabled: true, threshold: 400 },
  { id: 'legal_terms_whereas',  description: 'Contains WHEREAS / HEREBY / IN WITNESS WHEREOF', points: 25, enabled: true },
  { id: 'numbered_paragraphs',  description: 'Numbered paragraphs at line start',         points: 15,  enabled: true },
  { id: 'long_avg_sentence',    description: 'Average sentence length > 25 words',        points: 10,  enabled: true },
  { id: 'formal_heading',       description: 'All-caps formal heading on its own line',   points: 10,  enabled: true },
  { id: 'block_quote',          description: 'Looks like a block quote (reduces score)',  points: -15, enabled: true },
]

export interface PolicyDoc {
  version: 1
  tenantId: string
  baseline: unknown[]
  custom: unknown[]
  perSite: Record<string, unknown>
  allowSendAnywayWithReason: boolean
  auditRetentionDays: number
}

export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const activeMatters = await listMatters(tenantId)

  const rosterTerms: string[] = []
  const fuzzyTerms: Array<{ term: string; maxDistance: number }> = []

  for (const m of activeMatters) {
    const candidates = [
      m.clientName,
      m.matterName,
      m.matterNumber,
      ...(m.opposingParties ?? []),
    ].filter((t): t is string => !!t)

    for (const term of candidates) {
      rosterTerms.push(term)
      if (term.length <= 20) fuzzyTerms.push({ term, maxDistance: 1 })
    }
  }

  const custom: unknown[] = [
    {
      kind: 'dictionary',
      id: 'confidentiality-markers',
      name: 'Confidentiality Markers',
      description: 'Legal privilege headers that indicate confidential content',
      severity: 'high',
      action: 'require_confirmation',
      enabled: true,
      tags: ['legal', 'law-firm'],
      terms: CONFIDENTIALITY_TERMS,
      caseSensitive: false,
    },
    {
      kind: 'score',
      id: 'legal-document-structure',
      name: 'Legal Document Structure',
      description: 'Scores large pastes for signals of a pasted legal document',
      severity: 'high',
      action: 'block',
      enabled: true,
      tags: ['legal', 'law-firm'],
      signals: SCORE_SIGNALS,
      warnThreshold: 50,
      confirmThreshold: 80,
    },
  ]

  if (rosterTerms.length > 0) {
    custom.push({
      kind: 'dictionary',
      id: 'client-roster',
      name: 'Client / Matter Roster',
      description: 'Blocks prompts containing client names, matter numbers, or opposing parties',
      severity: 'critical',
      action: 'block',
      enabled: true,
      tags: ['legal', 'law-firm'],
      terms: rosterTerms,
      fuzzyTerms: fuzzyTerms.length > 0 ? fuzzyTerms : undefined,
      caseSensitive: false,
    })
  }

  return {
    version: 1,
    tenantId,
    baseline: [],
    custom,
    perSite: {},
    allowSendAnywayWithReason: false,
    auditRetentionDays: 365,
  }
}
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npm test -- tests/policy-compiler.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/policy/compiler.ts backend/tests/policy-compiler.test.ts
git commit -m "feat(backend): policy compiler — law firm rules from matters table"
```

---

### Task 11: Admin policy routes (publish, history, rollback)

**Files:**
- Modify: `backend/src/policy/router.ts`
- Modify: `backend/tests/policy-routes.test.ts`

- [ ] **Step 1: Add admin route tests** — append to `backend/tests/policy-routes.test.ts`

```typescript
describe('POST /v1/policy/publish', () => {
  it('compiles current matters and publishes a new version', async () => {
    const res = await supertest(app.server)
      .post('/v1/policy/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(2) // version 1 was published in beforeEach
  })

  it('returns 403 with org token', async () => {
    expect((await supertest(app.server)
      .post('/v1/policy/publish')
      .set('Authorization', `Bearer ${orgToken}`)
      .send({})).status).toBe(403)
  })
})

describe('GET /v1/policy/history', () => {
  it('returns versions newest-first', async () => {
    await supertest(app.server).post('/v1/policy/publish').set('Authorization', `Bearer ${adminToken}`).send({})
    const res = await supertest(app.server).get('/v1/policy/history').set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body[0].version).toBe(2)
    expect(res.body[1].version).toBe(1)
  })
})

describe('POST /v1/policy/rollback/:version', () => {
  it('creates a new version from a past version', async () => {
    const res = await supertest(app.server)
      .post('/v1/policy/rollback/1')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body.version).toBe(2)
  })
})
```

Run: `cd backend && npm test -- tests/policy-routes.test.ts`
Expected: new tests FAIL (routes not registered yet).

- [ ] **Step 2: Add admin routes to `backend/src/policy/router.ts`**

Add these imports and routes inside the `policyRouter` function:

```typescript
import { requireAdminToken } from '../auth/middleware.js'
import { compilePolicy } from './compiler.js'
import { publishPolicy, getHistory, rollback } from './service.js'

// Add inside policyRouter():

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
```

- [ ] **Step 3: Run full policy-routes tests**

Run: `cd backend && npm test -- tests/policy-routes.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/policy/router.ts backend/tests/policy-routes.test.ts
git commit -m "feat(backend): admin policy routes — publish, history, rollback"
```

---

### Task 12: Billing service

**Files:**
- Create: `backend/src/billing/service.ts`
- Create: `backend/tests/billing-stripe.test.ts` (billing service tests only; webhook tests added in Task 14)

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/billing-stripe.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { truncateAll } from './helpers/db.js'
import { activateTenant } from '../src/billing/service.js'
import { getTenantBySlug } from '../src/tenants/service.js'

beforeEach(async () => { await truncateAll() })

describe('activateTenant', () => {
  it('creates tenant row and returns plaintext tokens', async () => {
    const result = await activateTenant({
      name: 'Acme Law LLP',
      slug: 'acmelaw',
      paymentProvider: 'stripe',
      externalSubId: 'sub_test_001',
    })
    expect(result.orgToken).toMatch(/^ps_live_acmelaw_[A-Za-z0-9_-]{32}$/)
    expect(result.adminToken).toMatch(/^ps_adm_acmelaw_[A-Za-z0-9_-]{32}$/)
  })

  it('persists hashed tokens (not plaintext) in the database', async () => {
    await activateTenant({ name: 'A', slug: 'alaw', paymentProvider: 'stripe', externalSubId: 'sub_1' })
    const tenant = await getTenantBySlug('alaw')
    expect(tenant?.subscriptionStatus).toBe('active')
    expect(tenant?.orgTokenHash).not.toMatch(/^ps_live/)
  })

  it('throws if slug already exists', async () => {
    await activateTenant({ name: 'A', slug: 'dup', paymentProvider: 'stripe', externalSubId: 'sub_1' })
    await expect(
      activateTenant({ name: 'B', slug: 'dup', paymentProvider: 'stripe', externalSubId: 'sub_2' })
    ).rejects.toThrow()
  })
})
```

Run: `cd backend && npm test -- tests/billing-stripe.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `backend/src/billing/service.ts`**

```typescript
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
import { updateSubscriptionStatus } from '../tenants/service.js'

export interface ActivateInput {
  name: string
  slug: string
  paymentProvider: 'stripe' | 'paypal'
  externalSubId: string
}

export interface ActivateResult {
  tenantId: string
  orgToken: string
  adminToken: string
}

export async function activateTenant(input: ActivateInput): Promise<ActivateResult> {
  const orgSecret = generateSecret()
  const adminSecret = generateSecret()
  const orgToken = formatToken('ps_live', input.slug, orgSecret)
  const adminToken = formatToken('ps_adm', input.slug, adminSecret)

  const [row] = await db.insert(tenants).values({
    name: input.name,
    slug: input.slug,
    orgTokenHash: await hashToken(orgSecret),
    adminTokenHash: await hashToken(adminSecret),
    paymentProvider: input.paymentProvider,
    externalSubId: input.externalSubId,
    subscriptionStatus: 'active',
  }).returning({ id: tenants.id })

  return { tenantId: row!.id, orgToken, adminToken }
}

export { updateSubscriptionStatus }
```

- [ ] **Step 3: Run tests**

Run: `cd backend && npm test -- tests/billing-stripe.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/billing/service.ts backend/tests/billing-stripe.test.ts
git commit -m "feat(backend): billing service — activateTenant, token generation"
```

---

### Task 13: Email service

**Files:**
- Create: `backend/src/billing/email.ts`

No automated test — SMTP side-effect. Tested manually during QA by checking inbox after a test webhook call.

- [ ] **Step 1: Create `backend/src/billing/email.ts`**

```typescript
import nodemailer from 'nodemailer'

interface WelcomeEmailInput {
  to: string
  tenantName: string
  orgToken: string
  adminToken: string
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
  })
}

export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const transport = createTransport()
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@promptshield.dev',
    to: input.to,
    subject: `Welcome to PromptShield — ${input.tenantName}`,
    text: [
      `Welcome to PromptShield, ${input.tenantName}!`,
      '',
      'Your deployment tokens are below. Keep these secure.',
      '',
      'ORG TOKEN (deploy to all company machines via MDM/GPO):',
      `  ${input.orgToken}`,
      '',
      'ADMIN TOKEN (admin machine only):',
      `  ${input.adminToken}`,
      '',
      'Deploy via Chrome managed storage keys "orgToken" and "adminToken".',
      'Questions? Reply to this email.',
    ].join('\n'),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/billing/email.ts
git commit -m "feat(backend): welcome email via nodemailer"
```

---

### Task 14: Stripe webhook handler

**Files:**
- Create: `backend/src/billing/stripe.ts`
- Modify: `backend/tests/billing-stripe.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Add webhook tests** — append to `backend/tests/billing-stripe.test.ts`

```typescript
import supertest from 'supertest'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'
import { eq } from 'drizzle-orm'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import { buildTestTenant } from './helpers/db.js'

let webhookApp: FastifyInstance

// These describe blocks run with STRIPE_SKIP_SIG_VERIFY=true
describe('POST /webhooks/stripe', () => {
  beforeAll(async () => {
    process.env['STRIPE_SKIP_SIG_VERIFY'] = 'true'
    webhookApp = buildApp()
    await webhookApp.ready()
  })
  afterAll(async () => {
    delete process.env['STRIPE_SKIP_SIG_VERIFY']
    await webhookApp.close()
  })
  beforeEach(async () => { await truncateAll() })

  it('activates tenant on checkout.session.completed', async () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          customer_email: 'admin@acme.com',
          metadata: { tenantName: 'Acme Law LLP', tenantSlug: 'acme2law' },
          subscription: 'sub_stripe_001',
        },
      },
    }
    const res = await supertest(webhookApp.server)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test')
      .send(JSON.stringify(event))
    expect(res.status).toBe(200)
    expect(await getTenantBySlug('acme2law')).not.toBeNull()
  })

  it('sets past_due on invoice.payment_failed', async () => {
    const { tenantId } = await buildTestTenant('invoicefirm')
    await db.update(tenants).set({ externalSubId: 'sub_fail_001' }).where(eq(tenants.id, tenantId))
    const event = {
      type: 'invoice.payment_failed',
      data: { object: { subscription: 'sub_fail_001' } },
    }
    await supertest(webhookApp.server)
      .post('/webhooks/stripe')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 'test')
      .send(JSON.stringify(event))
    expect((await getTenantBySlug('invoicefirm'))?.subscriptionStatus).toBe('past_due')
  })
})
```

Run: `cd backend && npm test -- tests/billing-stripe.test.ts`
Expected: new describe block FAIL (handler not registered).

- [ ] **Step 2: Create `backend/src/billing/stripe.ts`**

```typescript
import Stripe from 'stripe'
import { activateTenant, updateSubscriptionStatus } from './service.js'
import { sendWelcomeEmail } from './email.js'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { eq } from 'drizzle-orm'

async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export async function handleStripeEvent(rawBody: string, sig: string): Promise<void> {
  let event: Stripe.Event
  if (process.env['STRIPE_SKIP_SIG_VERIFY'] === 'true') {
    event = JSON.parse(rawBody) as Stripe.Event
  } else {
    const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']!)
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env['STRIPE_WEBHOOK_SECRET']!)
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const meta = session.metadata ?? {}
      const email = session.customer_email ?? ''
      const result = await activateTenant({
        name: meta['tenantName'] ?? email,
        slug: meta['tenantSlug'] ?? email.split('@')[0]!.replace(/[^a-z0-9]/gi, '').toLowerCase(),
        paymentProvider: 'stripe',
        externalSubId: (session.subscription as string) ?? '',
      })
      await sendWelcomeEmail({ to: email, tenantName: meta['tenantName'] ?? email, orgToken: result.orgToken, adminToken: result.adminToken })
      break
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice
      const id = await tenantIdBySubId((inv.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'active')
      break
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice
      const id = await tenantIdBySubId((inv.subscription as string) ?? '')
      if (id) await updateSubscriptionStatus(id, 'past_due')
      break
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const id = await tenantIdBySubId(sub.id)
      if (id) await updateSubscriptionStatus(id, 'cancelled')
      break
    }
  }
}
```

- [ ] **Step 3: Register Stripe webhook route in `backend/src/app.ts`**

Add import and route inside `buildApp()`:

```typescript
import { handleStripeEvent } from './billing/stripe.js'

// Before void app.register(policyRouter, ...):
app.post('/webhooks/stripe', async (request, reply) => {
  await handleStripeEvent(request.body as string, (request.headers['stripe-signature'] as string) ?? '')
  return reply.status(200).send({ received: true })
})
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test -- tests/billing-stripe.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/stripe.ts backend/tests/billing-stripe.test.ts backend/src/app.ts
git commit -m "feat(backend): Stripe webhook — checkout, renewal, failure, cancellation"
```

---

### Task 15: PayPal webhook handler

**Files:**
- Create: `backend/src/billing/paypal.ts`
- Create: `backend/tests/billing-paypal.test.ts`
- Modify: `backend/src/app.ts`

PayPal encodes tenant provisioning data in `resource.custom_id` as `slug|name|email`.

- [ ] **Step 1: Write failing tests**

```typescript
// backend/tests/billing-paypal.test.ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { eq } from 'drizzle-orm'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { getTenantBySlug } from '../src/tenants/service.js'
import { buildApp } from '../src/app.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance

beforeAll(async () => {
  process.env['PAYPAL_SKIP_SIG_VERIFY'] = 'true'
  app = buildApp()
  await app.ready()
})
beforeEach(async () => { await truncateAll() })
afterAll(async () => {
  delete process.env['PAYPAL_SKIP_SIG_VERIFY']
  await app.close()
})

describe('POST /webhooks/paypal', () => {
  it('activates tenant on BILLING.SUBSCRIPTION.ACTIVATED', async () => {
    const res = await supertest(app.server)
      .post('/webhooks/paypal')
      .send({
        event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
        resource: { id: 'I-PAYPAL001', custom_id: 'pplaw|PP Law LLP|admin@pplaw.com' },
      })
    expect(res.status).toBe(200)
    expect((await getTenantBySlug('pplaw'))?.subscriptionStatus).toBe('active')
  })

  it('cancels tenant on BILLING.SUBSCRIPTION.CANCELLED', async () => {
    const { tenantId } = await buildTestTenant('ppfirm')
    await db.update(tenants).set({ externalSubId: 'I-PPCANCEL' }).where(eq(tenants.id, tenantId))
    await supertest(app.server).post('/webhooks/paypal').send({
      event_type: 'BILLING.SUBSCRIPTION.CANCELLED',
      resource: { id: 'I-PPCANCEL' },
    })
    expect((await getTenantBySlug('ppfirm'))?.subscriptionStatus).toBe('cancelled')
  })
})
```

Run: `cd backend && npm test -- tests/billing-paypal.test.ts`
Expected: FAIL.

- [ ] **Step 2: Create `backend/src/billing/paypal.ts`**

```typescript
import { activateTenant, updateSubscriptionStatus } from './service.js'
import { sendWelcomeEmail } from './email.js'
import { db } from '../db/client.js'
import { tenants } from '../db/schema.js'
import { eq } from 'drizzle-orm'

function parseCustomId(raw: string): { slug: string; name: string; email: string } | null {
  const [slug, name, email] = raw.split('|')
  if (!slug || !name || !email) return null
  return { slug, name, email }
}

async function tenantIdBySubId(subId: string): Promise<string | null> {
  const [row] = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.externalSubId, subId))
  return row?.id ?? null
}

export async function handlePayPalEvent(body: Record<string, unknown>): Promise<void> {
  const eventType = body['event_type'] as string
  const resource = body['resource'] as Record<string, unknown>

  switch (eventType) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED': {
      const parsed = parseCustomId((resource['custom_id'] as string) ?? '')
      if (!parsed) return
      const result = await activateTenant({
        name: parsed.name,
        slug: parsed.slug,
        paymentProvider: 'paypal',
        externalSubId: (resource['id'] as string) ?? '',
      })
      await sendWelcomeEmail({ to: parsed.email, tenantName: parsed.name, orgToken: result.orgToken, adminToken: result.adminToken })
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

- [ ] **Step 3: Register PayPal webhook route in `backend/src/app.ts`**

```typescript
import { handlePayPalEvent } from './billing/paypal.js'

// Inside buildApp(), alongside the Stripe route:
app.post('/webhooks/paypal', async (request, reply) => {
  await handlePayPalEvent(request.body as Record<string, unknown>)
  return reply.status(200).send({ received: true })
})
```

- [ ] **Step 4: Run tests**

Run: `cd backend && npm test -- tests/billing-paypal.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/billing/paypal.ts backend/tests/billing-paypal.test.ts backend/src/app.ts
git commit -m "feat(backend): PayPal webhook — activate, renewal, cancellation, failure"
```

---

### Task 16: Server entry point + Railway config + full test run

**Files:**
- Create: `backend/src/index.ts`
- Create: `backend/railway.toml`

- [ ] **Step 1: Create `backend/src/index.ts`**

```typescript
import { buildApp } from './app.js'

const app = buildApp()
await app.listen({ port: Number(process.env['PORT'] ?? 3000), host: '0.0.0.0' })
```

- [ ] **Step 2: Create `backend/railway.toml`**

```toml
[build]
builder = "nixpacks"
buildCommand = "npm ci && npm run build && npm run db:migrate"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

- [ ] **Step 3: Run full test suite**

```bash
cd backend && npm test
```

Expected: all tests across all files PASS. If any fail, fix before proceeding.

- [ ] **Step 4: Commit**

```bash
git add backend/src/index.ts backend/railway.toml
git commit -m "feat(backend): server entry point and Railway deployment config"
```
