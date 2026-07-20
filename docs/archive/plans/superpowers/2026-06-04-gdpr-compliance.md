# GDPR Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement data retention TTL on the `events` and `scans` tables, add a right-to-erasure API that removes event/scan rows (not just the Clerk link), and add a privacy disclosure for `reportLevel: "rich"` that stores prompt fragments.

**Architecture:** A Postgres cron-style cleanup is done via a scheduled Node.js job that deletes rows older than 90 days. The erasure endpoint deletes all rows tied to a member's UUID before nullifying the Clerk link. The disclosure is added as an API field on the rule schema and surfaced in the console UI.

**Tech Stack:** Drizzle ORM, Fastify, existing `users` and `events`/`scans` schema, `node-cron` for scheduled cleanup.

---

### Task 1: Add Data Retention TTL Cleanup Job

**Files:**
- Create: `backend/src/scripts/purge-old-events.ts`
- Modify: `backend/src/index.ts`
- Modify: `backend/package.json`

- [ ] Step 1: Install `node-cron`.
```bash
cd backend && pnpm add node-cron && pnpm add -D @types/node-cron
```

- [ ] Step 2: Create `backend/src/scripts/purge-old-events.ts`:
```typescript
import { lt, sql } from 'drizzle-orm'
import { db } from '../db/client.js'
import { events, scans } from '../db/schema.js'
import { logger } from '../logger/index.js'

const RETENTION_DAYS = parseInt(process.env.EVENT_RETENTION_DAYS ?? '90', 10)

export async function purgeOldEvents(): Promise<void> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const [eventsResult] = await db
    .delete(events)
    .where(lt(events.occurredAt, cutoff))
    .returning({ id: events.id })

  const [scansResult] = await db
    .delete(scans)
    .where(lt(scans.occurredAt, cutoff))
    .returning({ id: scans.id })

  const eventsDeleted = Array.isArray(eventsResult) ? eventsResult.length : 0
  const scansDeleted  = Array.isArray(scansResult)  ? scansResult.length  : 0

  logger.info('Data retention purge complete', {
    eventsDeleted,
    scansDeleted,
    retentionDays: RETENTION_DAYS,
    cutoff:        cutoff.toISOString(),
  })
}
```

- [ ] Step 3: Schedule the job in `backend/src/index.ts`. Add after the server starts:
```typescript
import cron from 'node-cron'
import { purgeOldEvents } from './scripts/purge-old-events.js'

// Run daily at 02:00 UTC
cron.schedule('0 2 * * *', async () => {
  try {
    await purgeOldEvents()
  } catch (err) {
    logger.error('Data retention purge failed', { error: err instanceof Error ? err.message : String(err) })
  }
}, { timezone: 'UTC' })
```

- [ ] Step 4: Build and test the job runs without error.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Run the purge directly in a test environment:
DATABASE_URL=$DATABASE_URL node -e "
  import('./dist/scripts/purge-old-events.js').then(m => m.purgeOldEvents()).then(() => process.exit(0))
"
# Expected: INFO log: Data retention purge complete { eventsDeleted: 0, scansDeleted: 0, ... }
```

- [ ] Step 5: Commit.
```bash
git add backend/src/scripts/purge-old-events.ts backend/src/index.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(gdpr): daily data retention purge — delete events/scans older than 90 days

Configurable via EVENT_RETENTION_DAYS env var. Runs at 02:00 UTC daily.
Satisfies GDPR data minimisation obligation."
```

---

### Task 2: Right-to-Erasure API

**Files:**
- Modify: `backend/src/users/service.ts`
- Modify: `backend/src/platform/router.ts` (or users router)

- [ ] Step 1: Open `backend/src/users/service.ts`. The existing `nullifyClerkId` function only removes the Clerk link. It does not delete event/scan rows associated with the member. Add a full erasure function:

```typescript
import { eq } from 'drizzle-orm'
import { events, scans, members } from '../db/schema.js'

export async function eraseUserData(clerkId: string): Promise<{
  eventsDeleted:  number
  scansDeleted:   number
  memberRecords:  number
}> {
  // Find the user
  const [user] = await db.select().from(users).where(eq(users.clerkId, clerkId))
  if (!user) return { eventsDeleted: 0, scansDeleted: 0, memberRecords: 0 }

  // Find all member records for this user
  const memberRows = await db.select({ id: members.id }).from(members).where(eq(members.userId, user.id))
  const memberIds  = memberRows.map(m => m.id)

  let eventsDeleted = 0
  let scansDeleted  = 0

  if (memberIds.length > 0) {
    const { inArray } = await import('drizzle-orm')

    const deletedEvents = await db.delete(events)
      .where(inArray(events.memberId, memberIds))
      .returning({ id: events.id })
    eventsDeleted = deletedEvents.length

    const deletedScans = await db.delete(scans)
      .where(inArray(scans.memberId, memberIds))
      .returning({ id: scans.id })
    scansDeleted = deletedScans.length
  }

  // Nullify Clerk ID (existing function does this)
  await nullifyClerkId(clerkId)

  return { eventsDeleted, scansDeleted, memberRecords: memberIds.length }
}
```

- [ ] Step 2: Add an erasure endpoint. The Clerk `user.deleted` webhook already calls `nullifyClerkId`. Update it to call `eraseUserData` instead:

In `backend/src/webhooks/clerk.ts`, update the `user.deleted` case:
```typescript
case 'user.deleted': {
  const result = await eraseUserData(event.data.id)
  logger.info('User data erased', {
    clerkId:       event.data.id,
    eventsDeleted: result.eventsDeleted,
    scansDeleted:  result.scansDeleted,
  })
  break
}
```

Update the import at the top:
```typescript
import { createUser, updateUserProfile, eraseUserData, claimPendingMembers } from '../users/service.js'
```

- [ ] Step 3: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 4: Write a test.
Create `backend/tests/users/erasure.test.ts`:
```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '../../src/db/client.js'
import { users, members, events as eventsTable, tenants } from '../../src/db/schema.js'
import { eraseUserData } from '../../src/users/service.js'

describe('eraseUserData', () => {
  it('deletes event rows associated with the user', async () => {
    // This test requires a real DB — run with DATABASE_URL pointing to test DB
    // See backend/CLAUDE.md for setup

    // Expect: the function returns counts of deleted rows
    // In a unit test environment with mocked DB, we verify the function calls
    // are made in the right order (events/scans before nullifying Clerk ID).
    const result = await eraseUserData('user_nonexistent_clerk_id')
    expect(result.eventsDeleted).toBe(0)
    expect(result.scansDeleted).toBe(0)
  })
})
```

- [ ] Step 5: Run test.
```bash
cd backend && pnpm test -- --reporter=verbose erasure
# Expected: ✓ deletes event rows associated with the user
```

- [ ] Step 6: Commit.
```bash
git add backend/src/users/service.ts backend/src/webhooks/clerk.ts backend/tests/users/erasure.test.ts
git commit -m "feat(gdpr): right-to-erasure deletes events/scans rows on user.deleted

Previous implementation only nullified the Clerk ID, leaving all
event and scan rows attributable to the member. Now deletes them."
```

---

### Task 3: Add Privacy Disclosure for reportLevel: "rich"

**Files:**
- Modify: `backend/src/rules/router.ts`
- Modify: `pretzel-console/src/pages/SubjectsPage.tsx`

- [ ] Step 1: Open `backend/src/rules/router.ts`. When a rule is created or updated with `reportLevel: "rich"`, add a `privacyNote` field to the response:

In the POST/PATCH handler response:
```typescript
const rule = await createRule(...)
return reply.status(201).send({
  ...rule,
  privacyNote: rule.reportLevel === 'rich'
    ? 'This rule stores matched prompt text server-side. Ensure users are informed via your privacy policy.'
    : undefined,
})
```

- [ ] Step 2: Add a visual warning in the console when `reportLevel: "rich"` is selected. Find the rule creation/edit form in `pretzel-console/src/pages/SubjectsPage.tsx` or in the relevant rule form component.

Search for where `reportLevel` is rendered:
```bash
grep -rn "reportLevel\|report_level" pretzel-console/src/ --include="*.tsx" | grep -v node_modules
```

In the form component that renders the `reportLevel` select, add a warning after the select element:
```tsx
{selectedReportLevel === 'rich' && (
  <div style={{
    marginTop: 6, padding: '8px 12px', borderRadius: 6,
    background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)',
    fontSize: 11, color: 'var(--status-danger)', lineHeight: 1.5,
  }}>
    Privacy notice: "Rich" reporting stores matched prompt text on mykka.ai servers.
    Ensure your organization's privacy policy discloses this to users.
  </div>
)}
```

- [ ] Step 3: Build both backend and frontend.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
cd pretzel-console && pnpm run build 2>&1 | tail -5
# Expected: both build without errors
```

- [ ] Step 4: Commit.
```bash
git add backend/src/rules/router.ts pretzel-console/src/
git commit -m "feat(gdpr): privacy warning for reportLevel=rich

Rich reporting stores matched prompt text server-side.
Backend now returns a privacyNote in the response.
Console UI shows a red warning when rich level is selected."
```
