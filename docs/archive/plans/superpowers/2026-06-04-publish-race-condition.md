# Policy Publish Race Condition Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the TOCTOU race in `publishPolicy` where two concurrent publishes can both read `MAX(version)` = N and both try to insert version N+1, hitting the unique constraint. Also fix `policyBus` being emitted outside the transaction.

**Architecture:** Replace the read-then-insert pattern with a Postgres-level serialized insert using an advisory lock or `INSERT ... SELECT MAX(version)+1 ... WHERE ...` inside a transaction. The `policyBus` emit moves inside the transaction callback to guarantee it only fires after a successful commit.

**Tech Stack:** Drizzle ORM, PostgreSQL, node:async_hooks, existing `policyBus` EventEmitter.

---

### Task 1: Replace TOCTOU with Advisory Lock Transaction

**Files:**
- Modify: `backend/src/policy/service.ts`

- [ ] Step 1: Open `backend/src/policy/service.ts`. The current `publishPolicy` function (lines 24–29):
```typescript
export async function publishPolicy(tenantId: string, policyJson: unknown): Promise<number> {
  const current     = await getVersionOnly(tenantId)
  const nextVersion = (current ?? 0) + 1
  await db.insert(policies).values({ tenantId, version: nextVersion, policyJson })
  policyBus.emit(policyUpdatedEvent(tenantId))
  return nextVersion
}
```

Replace with a version that uses a Postgres advisory lock to serialize concurrent publishes for the same tenant, and moves the `policyBus` emit after a confirmed successful insert:

```typescript
import { sql } from '../db/client.js'

export async function publishPolicy(tenantId: string, policyJson: unknown): Promise<number> {
  // Use a Postgres advisory lock keyed on the tenant's UUID to serialize concurrent publishes.
  // hashtext() converts the UUID string to a 32-bit int suitable for pg_advisory_xact_lock.
  let nextVersion: number

  await sql.begin(async (tx) => {
    // Acquire an exclusive advisory lock for this tenant for the duration of the transaction.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`

    const [current] = await tx`
      SELECT COALESCE(MAX(version), 0) AS v
      FROM policies
      WHERE tenant_id = ${tenantId}
    `
    nextVersion = (current!.v as number) + 1

    await tx`
      INSERT INTO policies (tenant_id, version, policy_json)
      VALUES (${tenantId}, ${nextVersion!}, ${JSON.stringify(policyJson)})
    `
  })

  // Emit outside the transaction but only after it committed successfully.
  policyBus.emit(policyUpdatedEvent(tenantId))
  return nextVersion!
}
```

Note: The `sql` import here is the raw `postgres` client from `backend/src/db/client.ts` (line 5: `export const sql = postgres(...)`). This is needed because Drizzle's transaction API does not expose the `BEGIN`/`COMMIT` surface needed for advisory locks. The raw SQL here is safe — only the tenantId is interpolated, and it is a server-generated UUID.

- [ ] Step 2: Verify the import of `sql` is accessible.
```bash
cd backend && node -e "
const { sql } = require('./dist/db/client.js')
sql\`SELECT 1\`.then(r => { console.log('db ok:', r); process.exit(0) })
"
# Expected: db ok: [ { '?column?': 1 } ]
```

- [ ] Step 3: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 4: Write a concurrent publish test to verify no unique constraint errors.
Create `backend/tests/policy/publish-concurrent.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { db, sql } from '../../src/db/client.js'
import { policies, tenants } from '../../src/db/schema.js'
import { publishPolicy } from '../../src/policy/service.js'
import { eq } from 'drizzle-orm'

const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001'

beforeAll(async () => {
  await db.insert(tenants).values({
    id:                 TEST_TENANT_ID,
    name:               'Test Tenant',
    slug:               'test-publish-concurrent',
    orgTokenHash:       'x',
    adminTokenHash:     'x',
    subscriptionStatus: 'active',
    plan:               'free',
    seatCount:          1,
  }).onConflictDoNothing()
})

afterAll(async () => {
  await db.delete(policies).where(eq(policies.tenantId, TEST_TENANT_ID))
  await sql.end()
})

describe('publishPolicy concurrent safety', () => {
  it('handles 5 concurrent publishes without unique constraint errors', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        publishPolicy(TEST_TENANT_ID, { test: i })
      )
    )

    const fulfilled = results.filter(r => r.status === 'fulfilled')
    const rejected  = results.filter(r => r.status === 'rejected')

    // All 5 should succeed with sequential version numbers
    expect(fulfilled).toHaveLength(5)
    expect(rejected).toHaveLength(0)

    const versions = (fulfilled as PromiseFulfilledResult<number>[]).map(r => r.value).sort()
    // Versions should be sequential (no gaps or duplicates)
    expect(versions).toEqual([1, 2, 3, 4, 5])
  })
})
```

- [ ] Step 5: Run the test (requires a running test database).
```bash
cd backend && DATABASE_URL=$DATABASE_URL pnpm test -- --reporter=verbose publish-concurrent
# Expected:
# ✓ handles 5 concurrent publishes without unique constraint errors
```

- [ ] Step 6: Commit.
```bash
git add backend/src/policy/service.ts backend/tests/policy/publish-concurrent.test.ts
git commit -m "fix(policy): serialize publishPolicy with pg_advisory_xact_lock

Replaced TOCTOU MAX(version)+1 pattern with advisory lock transaction.
Concurrent publishes now queue rather than colliding on the unique constraint."
```

---

### Task 2: Move policyBus Emit Inside Transaction Boundary

**Files:**
- Modify: `backend/src/policy/service.ts`

The emit was already moved outside the transaction in Task 1 (after the `sql.begin` call resolves), which is the correct position — it fires only after a confirmed commit. This task documents the rationale and adds a test.

- [ ] Step 1: Confirm the emit is after the `sql.begin(...)` promise resolves in the code from Task 1. The ordering should be:
```
sql.begin(async tx => {
  // advisory lock + insert
}) // transaction commits here
// only reaches here on success:
policyBus.emit(...)
return nextVersion
```
This guarantees no SSE event is sent if the transaction rolled back.

- [ ] Step 2: Add a test verifying the bus event fires exactly once per publish.
```typescript
// Add to publish-concurrent.test.ts:
import { policyBus, policyUpdatedEvent } from '../../src/events/policy-bus.js'

it('emits policyBus event exactly once per publish', async () => {
  const emitted: string[] = []
  const listener = (tenantId: string) => emitted.push(tenantId)
  policyBus.on(policyUpdatedEvent(TEST_TENANT_ID), listener)

  await publishPolicy(TEST_TENANT_ID, { test: 'bus' })
  policyBus.off(policyUpdatedEvent(TEST_TENANT_ID), listener)

  expect(emitted).toHaveLength(1)
})
```

- [ ] Step 3: Run the updated test.
```bash
cd backend && DATABASE_URL=$DATABASE_URL pnpm test -- --reporter=verbose publish-concurrent
# Expected: both tests pass
```

- [ ] Step 4: Commit.
```bash
git add backend/tests/policy/publish-concurrent.test.ts
git commit -m "test(policy): verify policyBus emits exactly once per publish"
```

---

### Task 3: Document policyBus Horizontal-Scale Limitation

**Files:**
- Create: `docs/superpowers/plans/architecture-notes/policy-bus-scaling.md`

This task creates an architecture decision record noting that the in-process EventEmitter does not survive horizontal scaling (SR-1) and documenting the planned migration path to Postgres LISTEN/NOTIFY.

- [ ] Step 1: Create the ADR file.
```markdown
# ADR: policyBus Scaling Limitation

**Status:** Known limitation — tracked for fix before horizontal scale-out.

**Problem:** `policyBus` in `backend/src/events/policy-bus.ts` is a Node.js EventEmitter.
When multiple backend instances run (e.g., Railway scale-out), a `PUBLISH` event
on instance A does not propagate to SSE connections held by instance B.
Extension clients connected to instance B miss the update and poll instead.

**Current behaviour:** Polling fallback in the extension (every 30s) masks the issue
in production but adds latency.

**Planned fix:** Replace the EventEmitter with a Postgres LISTEN/NOTIFY channel.
Each backend instance runs `LISTEN policy_updated_<tenantId>` on startup.
`publishPolicy` calls `NOTIFY policy_updated_<tenantId>`.
All instances receive the notification via their own connection.

**Migration steps (when ready to scale out):**
1. Add `postgres-notify` pattern to `backend/src/events/policy-bus.ts`
2. Replace `policyBus.emit` with `NOTIFY` call
3. Replace `policyBus.on` listener registration with `LISTEN` subscription
4. Test with two backend instances behind a load balancer

**Effort estimate:** 2 days.
```

- [ ] Step 2: Commit.
```bash
git add "docs/superpowers/plans/architecture-notes/policy-bus-scaling.md"
git commit -m "docs: ADR for policyBus horizontal scaling limitation and migration path"
```
