# Policy Versioning & Real-Time Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two connected features: (1) subject-level versioning so the AI assistant's changes can be reverted from the chat UI; (2) real-time policy update notifications via SSE for the web app and 2-minute REST polling for the extension — no Firebase, everything stays in our own backend.

**Architecture:**
- **Phase 0 (code health):** Extract the duplicated subscription-status guard into a `requireActiveSubscription` Fastify preHandler.
- **Part 1 (subject versioning):** A `subject_versions` table captures a full snapshot of each affected subject **before** the AI assistant applies its changes. `POST /assistant/apply` snapshots first, then writes. `POST /assistant/messages/:messageId/revert` restores from the snapshot. The web app chat UI shows a "Revert" affordance on messages where `hasVersionSnapshot = true`.
- **Part 2 (real-time sync):** An in-process EventEmitter fires on every `publishPolicy` call. `GET /v1/events?token=` is an SSE endpoint the web app subscribes to via `EventSource` — native browser reconnect handles all lifecycle. The extension polls `GET /v1/policy/last-updates` every 2 minutes (reduced from 30) and calls `syncPolicy()` only if the server timestamp is newer than its local `syncedAt`.

**Tech Stack:** Fastify SSE (raw response stream), Node.js `EventEmitter`, `EventSource` browser API, Drizzle ORM, PostgreSQL, Vitest, Playwright.

---

## Architecture Notes

### Why no Firebase
We only need **server → client** push. Firebase RTDB uses a bidirectional WebSocket because it's a sync database — we'd be using 2% of what it offers while paying for 100% of its complexity (third-party billing, service account, tenant IDs leaving our infra, vendor lock-in). SSE is designed for exactly this case.

### Extension cannot use SSE
Chrome MV3 service workers are ephemeral — they are killed when idle. `EventSource` does not exist in the service worker scope. Persistent connections are impossible. The extension must poll. Reducing from 30 min → 2 min with a lightweight "has anything changed?" check is the right approach.

### SSE auth
`EventSource` does not support custom headers. The token is passed as a query param (`?token=xxx`). The server validates once on the initial handshake; subsequent events don't re-validate. On connection drop, `EventSource` auto-reconnects. On a 401 (expired token on reconnect), we catch the error event and re-create `EventSource` with a fresh Clerk token.

### Subject versioning — what is stored and when
- Snapshot is taken **before** AI changes are applied, so it represents "the state to restore to."
- `conversationMsgId` links the snapshot to the assistant message that triggered the change.
- "Revert message X" = restore all snapshots whose `conversationMsgId = X`.
- Manual publish does NOT create `subject_versions` rows — the sync mechanism uses `policies.publishedAt` directly.
- Per-subject publish timestamps can be added later when incremental publish becomes a feature.

### Per-subject sync vs single org timestamp
All subjects always publish together (one `publishPolicy` call compiles everything). Per-subject timestamp granularity adds complexity with no current benefit. `GET /v1/policy/last-updates` returns a single `{ ts: number }` for the org (from `MAX(policies.publishedAt)`). The extension compares this single timestamp. This is YAGNI; per-subject can be added when incremental publish ships.

---

## File Map

| Status | Path | Responsibility |
|--------|------|----------------|
| **Phase 0** | | |
| Modify | `backend/src/auth/middleware.ts` | Add `requireActiveSubscription` preHandler |
| Modify | `backend/src/policy/router.ts` | Replace inline subscription guards with preHandler |
| **Part 1 — Subject Versioning** | | |
| Modify | `backend/src/db/schema.ts` | Add `subjectVersions` table + `SubjectSnapshot` type |
| Create | `backend/src/subjects/snapshot.ts` | `snapshotSubject()` — reads subject+rules, writes version row |
| Create | `backend/src/assistant/versioning.ts` | `resolveAffectedSubjectIds()` — pre-pass before apply |
| Modify | `backend/src/assistant/router.ts` | Snapshot before apply; add revert endpoint; enrich messages |
| Create | `backend/src/subjects/router.ts` | `GET /subjects/:id/versions` history endpoint |
| Modify | `pretzel-console/src/components/assistant/` | Revert button on messages with snapshots |
| **Part 2 — Real-Time Sync** | | |
| Create | `backend/src/events/policy-bus.ts` | In-process EventEmitter for policy publish events |
| Modify | `backend/src/policy/service.ts` | Emit on publish |
| Modify | `backend/src/policy/router.ts` | Add `GET /policy/last-updates` + SSE `GET /events` |
| Create | `pretzel/src/realtime/types.ts` | `ILastUpdatesChecker` interface |
| Create | `pretzel/src/realtime/backend-rest.adapter.ts` | Polls our own `/v1/policy/last-updates` |
| Create | `pretzel/src/realtime/index.ts` | Live singleton export |
| Create | `pretzel/src/background/update-check.ts` | Alarm handler: compare ts, call syncPolicy if stale |
| Modify | `pretzel/src/background/service-worker.ts` | Alarm 30 min → 2 min, wire `checkForUpdates` |
| Create | `pretzel-console/src/realtime/types.ts` | `IRealtimeSubscriber` interface |
| Create | `pretzel-console/src/realtime/sse.adapter.ts` | `EventSource` wrapper + reconnect on 401 |
| Create | `pretzel-console/src/realtime/index.ts` | Live singleton export |
| Create | `pretzel-console/src/hooks/usePolicyRealtime.ts` | SSE subscription → query invalidation |
| Modify | `pretzel-console/src/App.tsx` *(or auth layout)* | Mount `usePolicyRealtime()` |

---

## Phase 0 — Code Health

### Task 0: Extract `requireActiveSubscription` preHandler

**Files:**
- Modify: `backend/src/auth/middleware.ts`
- Modify: `backend/src/policy/router.ts`
- Test: `backend/tests/policy.router.test.ts`

**Context:** The subscription-status guard (cancelled → 402, past_due + expired → 402) is copy-pasted inline in `GET /policy`. Every new endpoint would copy it again. Extract once, reference everywhere.

- [ ] **Step 1: Write the failing test**

  Add to `backend/tests/policy.router.test.ts` (create if it doesn't exist):

  ```ts
  import { describe, it, expect, vi } from 'vitest'
  import Fastify from 'fastify'
  import { policyRouter } from '../src/policy/router.js'

  vi.mock('../src/policy/service.js', () => ({
    getVersionOnly:  vi.fn().mockResolvedValue(1),
    getLatestPolicy: vi.fn().mockResolvedValue({ version: 1, policyJson: { version: 1, tenantId: 't1', subjects: [], siteConfigs: {} } }),
    publishPolicy:   vi.fn().mockResolvedValue(2),
    getHistory:      vi.fn().mockResolvedValue([]),
    rollback:        vi.fn().mockResolvedValue(1),
  }))
  vi.mock('../src/policy/resolver.js', () => ({
    resolveMemberPolicy: vi.fn().mockImplementation((_t, _m, snap) => snap),
  }))
  vi.mock('../src/events/policy-bus.js', () => ({ policyBus: { emit: vi.fn() } }))

  function makeApp(tenantOverrides: Record<string, unknown> = {}) {
    const app = Fastify()
    app.addHook('onRequest', async (req) => {
      ;(req as any).tenant = { id: 't1', name: 'Acme', slug: 'acme', plan: 'pro', gracePeriodEndsAt: null, subscriptionStatus: 'active', ...tenantOverrides }
      ;(req as any).member = null
    })
    app.register(policyRouter, { prefix: '' })
    return app
  }

  describe('requireActiveSubscription preHandler', () => {
    it('returns 402 subscription_cancelled', async () => {
      const res = await makeApp({ subscriptionStatus: 'cancelled' }).inject({ method: 'GET', url: '/policy' })
      expect(res.statusCode).toBe(402)
      expect(res.json().error).toBe('subscription_cancelled')
    })

    it('returns 402 subscription_expired when grace period has passed', async () => {
      const res = await makeApp({ subscriptionStatus: 'past_due', gracePeriodEndsAt: new Date(Date.now() - 1000) })
        .inject({ method: 'GET', url: '/policy' })
      expect(res.statusCode).toBe(402)
      expect(res.json().error).toBe('subscription_expired')
    })

    it('returns 200 with warning when still in grace period', async () => {
      const res = await makeApp({ subscriptionStatus: 'past_due', gracePeriodEndsAt: new Date(Date.now() + 86_400_000) })
        .inject({ method: 'GET', url: '/policy' })
      expect(res.statusCode).toBe(200)
      expect(res.json().warning).toBe('subscription_expiring')
    })

    it('returns 200 for active subscription', async () => {
      const res = await makeApp().inject({ method: 'GET', url: '/policy' })
      expect(res.statusCode).toBe(200)
    })
  })
  ```

- [ ] **Step 2: Run test to capture baseline**

  ```bash
  cd backend && pnpm test policy.router
  ```

- [ ] **Step 3: Add `requireActiveSubscription` to `backend/src/auth/middleware.ts`**

  Append after the last existing export:

  ```ts
  export async function requireActiveSubscription(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const { subscriptionStatus, gracePeriodEndsAt } = req.tenant
    if (subscriptionStatus === 'cancelled') {
      return reply.status(402).send({ error: 'subscription_cancelled' })
    }
    if (subscriptionStatus === 'past_due') {
      const expired = gracePeriodEndsAt && gracePeriodEndsAt < new Date()
      if (expired) return reply.status(402).send({ error: 'subscription_expired' })
    }
  }
  ```

- [ ] **Step 4: Replace `backend/src/policy/router.ts` with the clean version**

  ```ts
  import type { FastifyInstance } from 'fastify'
  import {
    requireOrgTokenOrClerkAuth,
    requireAdminTokenOrClerkAdmin,
    requireActiveSubscription,
  } from '../auth/middleware.js'
  import { getVersionOnly, getLatestPolicy, publishPolicy, getHistory, rollback } from './service.js'
  import { compilePolicy, type PolicyDoc } from './compiler.js'
  import { resolveMemberPolicy } from './resolver.js'

  export async function policyRouter(fastify: FastifyInstance): Promise<void> {
    fastify.get('/policy/version', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
      const version = await getVersionOnly(req.tenant.id)
      if (version === null) return reply.status(404).send({ error: 'No policy published' })
      return { version }
    })

    fastify.get(
      '/policy',
      { preHandler: [requireOrgTokenOrClerkAuth, requireActiveSubscription] },
      async (req, reply) => {
        const row = await getLatestPolicy(req.tenant.id)
        if (!row) return reply.status(404).send({ error: 'No policy published' })

        const snapshot = row.policyJson as PolicyDoc
        const policy   = req.member
          ? await resolveMemberPolicy(req.tenant.id, req.member.id, snapshot)
          : snapshot

        const response: Record<string, unknown> = {
          version:    row.version,
          policy,
          tenantName: req.tenant.name,
          plan:       req.tenant.plan,
          expiresAt:  req.tenant.gracePeriodEndsAt?.toISOString() ?? null,
        }
        if (req.tenant.subscriptionStatus === 'past_due') response['warning'] = 'subscription_expiring'
        return response
      }
    )

    fastify.post('/policy/publish', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
      const policy  = await compilePolicy(req.tenant.id)
      const version = await publishPolicy(req.tenant.id, policy)
      return { version }
    })

    fastify.get('/policy/history', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
      return getHistory(req.tenant.id)
    })

    fastify.post('/policy/rollback/:version', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
      const { version } = req.params as { version: string }
      const newVersion  = await rollback(req.tenant.id, parseInt(version, 10))
      return { version: newVersion }
    })

    fastify.get('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
      const { id, name, slug, plan, subscriptionStatus } = req.tenant
      return { id, name, slug, plan, subscriptionStatus }
    })
  }
  ```

- [ ] **Step 5: Run tests**

  ```bash
  cd backend && pnpm test policy.router && pnpm test
  ```

  Expected: all pass

- [ ] **Step 6: Commit**

  ```bash
  git add backend/src/auth/middleware.ts backend/src/policy/router.ts backend/tests/policy.router.test.ts
  git commit -m "refactor(backend): extract requireActiveSubscription preHandler, remove duplicate guards"
  ```

---

## Part 1 — Subject Versioning & AI Revert

### Task 1: DB Schema — `subject_versions` Table

**Files:**
- Modify: `backend/src/db/schema.ts`

- [ ] **Step 1: Add `SubjectSnapshot` interface and `subjectVersions` table to `backend/src/db/schema.ts`**

  Add the interface before the `// ── Types ──` section:

  ```ts
  // ── Subject Snapshot (stored in subject_versions.snapshot) ───────────────────
  export interface SubjectSnapshot {
    name:        string
    description: string | null
    divisionId:  string | null
    teamId:      string | null
    active:      boolean
    rules: Array<{
      id:                  string
      kind:                'keyword' | 'pattern' | 'entropy' | 'score'
      keywords:            string[] | null
      pattern:             string | null
      destinations:        string[]
      destinationGroupIds: string[]
      action:              'warn' | 'block'
      message:             string | null
      reportLevel:         'none' | 'minimal' | 'medium' | 'rich'
      active:              boolean
    }>
  }
  ```

  Add the table definition after `chatMessages` and before `invites`:

  ```ts
  // ── Subject Versions ──────────────────────────────────────────────────────────
  // One row per subject per version snapshot. Source 'pre_ai_apply' is taken
  // BEFORE executeActions runs — restoring it undoes what the AI message did.
  export const subjectVersionSourceEnum = pgEnum('subject_version_source', [
    'pre_ai_apply',
    'rollback',
  ])

  export const subjectVersions = pgTable('subject_versions', {
    id:               uuid('id').primaryKey().defaultRandom(),
    tenantId:         uuid('tenant_id').notNull().references(() => tenants.id),
    subjectId:        uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    version:          integer('version').notNull(),
    snapshot:         jsonb('snapshot').notNull().$type<SubjectSnapshot>(),
    source:           subjectVersionSourceEnum('source').notNull(),
    conversationMsgId: uuid('conversation_msg_id').references(() => chatMessages.id, { onDelete: 'set null' }),
    createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  }, (t) => ({
    subjectVersionUniq: unique().on(t.subjectId, t.version),
    conversationMsgIdx: index().on(t.conversationMsgId),
  }))
  ```

  Add the inferred types at the bottom of the Types section:

  ```ts
  export type SubjectVersion    = typeof subjectVersions.$inferSelect
  export type NewSubjectVersion = typeof subjectVersions.$inferInsert
  ```

- [ ] **Step 2: Generate and run migration**

  ```bash
  cd backend && pnpm drizzle-kit generate
  pnpm drizzle-kit migrate
  ```

  Expected: new migration file created and applied, no errors.

- [ ] **Step 3: Commit**

  ```bash
  git add backend/src/db/schema.ts backend/drizzle/
  git commit -m "feat(db): add subject_versions table for AI revert snapshots"
  ```

---

### Task 2: Snapshot Service

**Files:**
- Create: `backend/src/subjects/snapshot.ts`
- Test: `backend/tests/subjects/snapshot.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `backend/tests/subjects/snapshot.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'

  const mockSelect = vi.fn()
  const mockInsert = vi.fn()
  const mockValues = vi.fn().mockResolvedValue(undefined)

  vi.mock('../../src/db/client.js', () => ({
    db: {
      select: mockSelect,
      insert: mockInsert,
    },
  }))

  const subject = {
    id: 'sub-1', tenantId: 'tenant-1', name: 'PII',
    description: 'Personally identifiable info',
    divisionId: null, teamId: null, active: true,
    createdAt: new Date(),
  }

  const rule = {
    id: 'rule-1', tenantId: 'tenant-1', subjectId: 'sub-1',
    kind: 'keyword', keywords: ['password'], pattern: null,
    destinations: [], destinationGroupIds: [], action: 'block',
    message: null, reportLevel: 'none', active: true, createdAt: new Date(),
  }

  describe('snapshotSubject', () => {
    beforeEach(() => {
      vi.clearAllMocks()

      // subject query
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([subject]),
      })
      // rules query
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([rule]),
      })
      // max version query
      mockSelect.mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ version: 3 }]),
      })
      // insert
      mockInsert.mockReturnValue({ values: mockValues })
    })

    it('inserts a version row with the correct snapshot shape', async () => {
      const { snapshotSubject } = await import('../../src/subjects/snapshot.js')
      await snapshotSubject('tenant-1', 'sub-1', 'pre_ai_apply', 'msg-abc')

      const insertArg = mockValues.mock.calls[0][0]
      expect(insertArg.tenantId).toBe('tenant-1')
      expect(insertArg.subjectId).toBe('sub-1')
      expect(insertArg.version).toBe(4)
      expect(insertArg.source).toBe('pre_ai_apply')
      expect(insertArg.conversationMsgId).toBe('msg-abc')
      expect(insertArg.snapshot.name).toBe('PII')
      expect(insertArg.snapshot.rules).toHaveLength(1)
      expect(insertArg.snapshot.rules[0].id).toBe('rule-1')
    })

    it('uses version 1 when no prior versions exist', async () => {
      mockSelect
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([subject]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) })
        .mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([{ version: null }]) })
      const { snapshotSubject } = await import('../../src/subjects/snapshot.js')
      await snapshotSubject('tenant-1', 'sub-1', 'pre_ai_apply')
      expect(mockValues.mock.calls[0][0].version).toBe(1)
    })

    it('does nothing when subject does not exist', async () => {
      mockSelect.mockReturnValueOnce({ from: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue([]) })
      const { snapshotSubject } = await import('../../src/subjects/snapshot.js')
      await snapshotSubject('tenant-1', 'ghost', 'pre_ai_apply')
      expect(mockInsert).not.toHaveBeenCalled()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd backend && pnpm test subjects/snapshot
  ```

  Expected: FAIL — module not found

- [ ] **Step 3: Create `backend/src/subjects/snapshot.ts`**

  ```ts
  import { eq, and, max } from 'drizzle-orm'
  import { db } from '../db/client.js'
  import { subjects, rules, subjectVersions, type SubjectSnapshot } from '../db/schema.js'

  export async function snapshotSubject(
    tenantId: string,
    subjectId: string,
    source: 'pre_ai_apply' | 'rollback',
    conversationMsgId?: string,
  ): Promise<void> {
    const [subject] = await db
      .select()
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.tenantId, tenantId)))

    if (!subject) return

    const currentRules = await db
      .select()
      .from(rules)
      .where(and(eq(rules.subjectId, subjectId), eq(rules.tenantId, tenantId)))

    const [lastVersionRow] = await db
      .select({ version: max(subjectVersions.version) })
      .from(subjectVersions)
      .where(eq(subjectVersions.subjectId, subjectId))

    const nextVersion = (lastVersionRow?.version ?? 0) + 1

    const snapshot: SubjectSnapshot = {
      name:        subject.name,
      description: subject.description ?? null,
      divisionId:  subject.divisionId ?? null,
      teamId:      subject.teamId ?? null,
      active:      subject.active,
      rules: currentRules.map(r => ({
        id:                  r.id,
        kind:                r.kind,
        keywords:            r.keywords ?? null,
        pattern:             r.pattern ?? null,
        destinations:        r.destinations ?? [],
        destinationGroupIds: r.destinationGroupIds ?? [],
        action:              r.action,
        message:             r.message ?? null,
        reportLevel:         r.reportLevel,
        active:              r.active,
      })),
    }

    await db.insert(subjectVersions).values({
      tenantId,
      subjectId,
      version:          nextVersion,
      snapshot,
      source,
      conversationMsgId: conversationMsgId ?? null,
    })
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd backend && pnpm test subjects/snapshot
  ```

  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/subjects/snapshot.ts backend/tests/subjects/snapshot.test.ts
  git commit -m "feat(backend): add snapshotSubject — writes subject_versions row before AI changes"
  ```

---

### Task 3: AI Apply — Snapshot Before, Revert Endpoint, Enrich Messages

**Files:**
- Create: `backend/src/assistant/versioning.ts`
- Modify: `backend/src/assistant/router.ts`
- Test: `backend/tests/assistant.versioning.test.ts`
- Test: `backend/tests/assistant.router.test.ts`

- [ ] **Step 1: Write the failing test for `resolveAffectedSubjectIds`**

  Create `backend/tests/assistant.versioning.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest'
  import type { Action } from '../src/assistant/llm/interface.js'

  const mockSelect = vi.fn()
  vi.mock('../src/db/client.js', () => ({ db: { select: mockSelect } }))

  describe('resolveAffectedSubjectIds', () => {
    it('returns subjectId directly for create_rule and update_subject', async () => {
      const { resolveAffectedSubjectIds } = await import('../src/assistant/versioning.js')
      const actions: Action[] = [
        { op: 'create_rule', subjectId: 'sub-a', kind: 'keyword', keywords: ['foo'], action: 'warn', destinations: [], destinationGroupIds: [], reportLevel: 'none' },
        { op: 'update_subject', subjectId: 'sub-b', patch: { name: 'New' } },
        { op: 'create_subject', name: 'IP', description: null, divisionId: null, teamId: null },
      ] as any
      const ids = await resolveAffectedSubjectIds('tenant-1', actions)
      expect(ids).toContain('sub-a')
      expect(ids).toContain('sub-b')
      expect(ids).not.toContain(undefined)
    })

    it('looks up subjectId from DB for update_rule and delete_rule', async () => {
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ subjectId: 'sub-c' }]),
      })
      const { resolveAffectedSubjectIds } = await import('../src/assistant/versioning.js')
      const actions: Action[] = [
        { op: 'update_rule', ruleId: 'rule-1', patch: { action: 'block' } },
      ] as any
      const ids = await resolveAffectedSubjectIds('tenant-1', actions)
      expect(ids).toContain('sub-c')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd backend && pnpm test assistant.versioning
  ```

  Expected: FAIL — module not found

- [ ] **Step 3: Create `backend/src/assistant/versioning.ts`**

  ```ts
  import { eq, and, inArray } from 'drizzle-orm'
  import { db } from '../db/client.js'
  import { rules } from '../db/schema.js'
  import type { Action } from './llm/interface.js'

  export async function resolveAffectedSubjectIds(
    tenantId: string,
    actions: Action[],
  ): Promise<string[]> {
    const ids = new Set<string>()
    const ruleIdsToLookup: string[] = []

    for (const action of actions) {
      switch (action.op) {
        case 'create_rule':
        case 'update_subject':
        case 'delete_subject':
          if ('subjectId' in action && action.subjectId) ids.add(action.subjectId)
          break
        case 'update_rule':
        case 'delete_rule':
          if ('ruleId' in action && action.ruleId) ruleIdsToLookup.push(action.ruleId)
          break
        // create_subject: nothing to snapshot before creation
      }
    }

    if (ruleIdsToLookup.length > 0) {
      const rows = await db
        .select({ subjectId: rules.subjectId })
        .from(rules)
        .where(and(eq(rules.tenantId, tenantId), inArray(rules.id, ruleIdsToLookup)))
      for (const row of rows) ids.add(row.subjectId)
    }

    return Array.from(ids)
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd backend && pnpm test assistant.versioning
  ```

  Expected: PASS

- [ ] **Step 5: Update `backend/src/assistant/router.ts`**

  The full updated file:

  ```ts
  import type { FastifyInstance } from 'fastify'
  import { eq, inArray } from 'drizzle-orm'
  import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
  import { db } from '../db/client.js'
  import { chatMessages, subjectVersions, subjects, rules as rulesTable } from '../db/schema.js'
  import { sendMessage, getSessions, getMessages } from './service.js'
  import { executeActions } from './apply.js'
  import { resolveAffectedSubjectIds } from './versioning.js'
  import { snapshotSubject } from '../subjects/snapshot.js'
  import { PLAN_LIMITS, type Plan } from '../billing/limits.js'
  import type { LlmService, Action } from './llm/interface.js'

  async function makeLlmService(): Promise<LlmService> {
    if (process.env.LLM_PROVIDER === 'openai') {
      const { OpenAiLlmService } = await import('./llm/openai.js')
      return new OpenAiLlmService()
    }
    if (process.env.LLM_PROVIDER === 'groq') {
      const { GroqLlmService } = await import('./llm/groq.js')
      return new GroqLlmService()
    }
    const { AnthropicLlmService } = await import('./llm/anthropic.js')
    return new AnthropicLlmService()
  }

  export async function assistantRouter(fastify: FastifyInstance): Promise<void> {
    const llm = await makeLlmService()

    fastify.post('/assistant/chat', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
      const plan = req.tenant.plan as Plan
      if (!PLAN_LIMITS[plan]?.assistantEnabled) {
        return reply.status(402).send({
          error: 'The AI Assistant is available on the Business plan. Upgrade to access it.',
        })
      }
      const { message, sessionId } = req.body as { message: string; sessionId?: string }
      if (!message || typeof message !== 'string') {
        return reply.status(400).send({ error: 'message is required' })
      }
      return sendMessage({ tenantId: req.tenant.id, memberId: req.member?.id, sessionId, message, llm })
    })

    fastify.post('/assistant/apply', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
      const { messageId } = req.body as { messageId: string }
      const [msg] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId))
      if (!msg) return reply.status(404).send({ error: 'Message not found' })
      if (msg.appliedAt) return reply.status(409).send({ error: 'Already applied' })

      const actions = Array.isArray(msg.actionsJson)
        ? (msg.actionsJson as Action[])
        : []

      // Snapshot affected subjects BEFORE applying — this is the revert point
      const affectedIds = await resolveAffectedSubjectIds(req.tenant.id, actions)
      await Promise.all(
        affectedIds.map(id => snapshotSubject(req.tenant.id, id, 'pre_ai_apply', messageId))
      )

      const { applied, errors } = await executeActions(req.tenant.id, actions)
      await db.update(chatMessages).set({ appliedAt: new Date() }).where(eq(chatMessages.id, messageId))

      return { applied, errors }
    })

    // Revert all subject changes made by a specific assistant message
    fastify.post('/assistant/messages/:messageId/revert', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
      const { messageId } = req.params as { messageId: string }

      const versions = await db
        .select()
        .from(subjectVersions)
        .where(eq(subjectVersions.conversationMsgId, messageId))

      if (!versions.length) return reply.status(404).send({ error: 'No revertible changes found for this message' })

      for (const ver of versions) {
        if (ver.tenantId !== req.tenant.id) return reply.status(403).send({ error: 'Forbidden' })
        const snap = ver.snapshot

        // Restore subject metadata
        await db.update(subjects)
          .set({ name: snap.name, description: snap.description, active: snap.active })
          .where(eq(subjects.id, ver.subjectId))

        // Replace rules: delete current, reinsert from snapshot
        await db.delete(rulesTable).where(eq(rulesTable.subjectId, ver.subjectId))

        if (snap.rules.length > 0) {
          await db.insert(rulesTable).values(
            snap.rules.map(r => ({
              tenantId:            req.tenant.id,
              subjectId:           ver.subjectId,
              kind:                r.kind,
              keywords:            r.keywords,
              pattern:             r.pattern,
              destinations:        r.destinations,
              destinationGroupIds: r.destinationGroupIds,
              action:              r.action,
              message:             r.message,
              reportLevel:         r.reportLevel,
              active:              r.active,
            }))
          )
        }

        // Record the rollback as a new version (audit trail)
        await snapshotSubject(req.tenant.id, ver.subjectId, 'rollback')
      }

      return { reverted: versions.length }
    })

    fastify.get('/assistant/sessions', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
      return { sessions: await getSessions(req.tenant.id) }
    })

    fastify.get('/assistant/sessions/:id/messages', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
      const { id } = req.params as { id: string }
      const messages = await getMessages(req.tenant.id, id)
      if (!messages.length) return reply.status(404).send({ error: 'Session not found' })

      // Enrich: mark which assistant messages have associated version snapshots
      const assistantMsgIds = messages
        .filter(m => m.role === 'assistant' && m.appliedAt)
        .map(m => m.id)

      const snapshotMsgIds = new Set<string>()
      if (assistantMsgIds.length > 0) {
        const rows = await db
          .selectDistinct({ conversationMsgId: subjectVersions.conversationMsgId })
          .from(subjectVersions)
          .where(inArray(subjectVersions.conversationMsgId, assistantMsgIds))
        for (const row of rows) {
          if (row.conversationMsgId) snapshotMsgIds.add(row.conversationMsgId)
        }
      }

      return {
        messages: messages.map(m => ({
          ...m,
          hasVersionSnapshot: snapshotMsgIds.has(m.id),
        })),
      }
    })
  }
  ```

- [ ] **Step 6: Run full backend test suite**

  ```bash
  cd backend && pnpm test
  ```

  Expected: all pass

- [ ] **Step 7: Commit**

  ```bash
  git add backend/src/assistant/router.ts backend/src/assistant/versioning.ts backend/tests/assistant.versioning.test.ts
  git commit -m "feat(backend): snapshot subjects before AI apply; add revert endpoint; enrich messages with hasVersionSnapshot"
  ```

---

### Task 4: Subject Version History Endpoint

**Files:**
- Modify: `backend/src/subjects/router.ts` (add the endpoint; create the file if it doesn't exist)

- [ ] **Step 1: Add `GET /subjects/:subjectId/versions` to the subjects router**

  In `backend/src/subjects/router.ts`, add inside the router function:

  ```ts
  import { subjectVersions } from '../db/schema.js'
  import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'

  fastify.get('/subjects/:subjectId/versions', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { subjectId } = req.params as { subjectId: string }

    // Verify the subject belongs to this tenant
    const [subject] = await db.select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.tenantId, req.tenant.id)))
    if (!subject) return reply.status(404).send({ error: 'Subject not found' })

    const versions = await db
      .select({
        id:               subjectVersions.id,
        version:          subjectVersions.version,
        source:           subjectVersions.source,
        conversationMsgId: subjectVersions.conversationMsgId,
        createdAt:        subjectVersions.createdAt,
      })
      .from(subjectVersions)
      .where(eq(subjectVersions.subjectId, subjectId))
      .orderBy(desc(subjectVersions.version))

    return { versions }
  })
  ```

- [ ] **Step 2: Write and run a test**

  Add to `backend/tests/subjects/router.test.ts`:

  ```ts
  it('GET /subjects/:id/versions returns version list', async () => {
    // stub db queries, assert 200 with versions array
  })
  it('GET /subjects/:id/versions returns 404 for unknown subject', async () => {
    // assert 404
  })
  ```

- [ ] **Step 3: Run tests**

  ```bash
  cd backend && pnpm test subjects/router
  ```

  Expected: PASS

- [ ] **Step 4: Commit**

  ```bash
  git add backend/src/subjects/router.ts backend/tests/subjects/router.test.ts
  git commit -m "feat(backend): add GET /subjects/:id/versions history endpoint"
  ```

---

### Task 5: Web App — Revert UI in AI Chat

**Files:**
- Modify: the AI chat message component in `pretzel-console/src/`

- [ ] **Step 1: Find the AI chat message component**

  ```bash
  grep -r "appliedAt\|assistant\|chat" pretzel-console/src --include="*.tsx" -l
  ```

- [ ] **Step 2: Add a revert mutation hook in `pretzel-console/src/hooks/useAssistant.ts` (or wherever assistant hooks live)**

  ```ts
  export function useRevertMessage() {
    const qc = useQueryClient()
    const { toast } = useToast()
    return useMutation({
      mutationFn: ({ messageId }: { messageId: string }) =>
        api.assistant.revertMessage(messageId),
      onSuccess: (data) => {
        qc.invalidateQueries({ queryKey: ['subjects'] })
        toast(`Reverted ${data.reverted} subject(s). Click Publish to apply.`)
      },
      onError: (e: Error) => toast(e.message, 'error'),
    })
  }
  ```

- [ ] **Step 3: Add the API method to the API client**

  In `pretzel-console/src/api.ts` (or wherever API methods live), add:

  ```ts
  assistant: {
    revertMessage: (messageId: string) =>
      apiFetch(`/v1/assistant/messages/${messageId}/revert`, { method: 'POST' }),
  }
  ```

- [ ] **Step 4: Add revert button to the message component**

  In the assistant message bubble component, render the button conditionally:

  ```tsx
  {message.role === 'assistant' && message.hasVersionSnapshot && (
    <button
      onClick={() => revertMessage.mutate({ messageId: message.id })}
      disabled={revertMessage.isPending}
      className="text-xs text-amber-600 underline mt-1"
    >
      Revert changes from this message
    </button>
  )}
  ```

- [ ] **Step 5: Run component tests and smoke test manually**

  ```bash
  cd pretzel-console && pnpm test
  ```

  Then:
  1. Start backend + web app (`pnpm dev` in both)
  2. Open AI assistant
  3. Send a message that modifies a rule, click Apply
  4. Confirm "Revert changes from this message" button appears
  5. Click Revert → toast appears → check that the rule was restored

- [ ] **Step 6: Commit**

  ```bash
  git add pretzel-console/src
  git commit -m "feat(pretzel-console): add revert button on AI chat messages with version snapshots"
  ```

---

## Part 2 — Real-Time Sync (SSE + REST Polling)

### Task 6: Policy Event Bus

**Files:**
- Create: `backend/src/events/policy-bus.ts`
- Test: `backend/tests/events/policy-bus.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `backend/tests/events/policy-bus.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'

  describe('policyBus', () => {
    it('emits policy:updated events with tenant id', async () => {
      const { policyBus, policyUpdatedEvent } = await import('../../src/events/policy-bus.js')
      const received: string[] = []
      policyBus.on(policyUpdatedEvent('tenant-1'), () => received.push('tenant-1'))
      policyBus.emit(policyUpdatedEvent('tenant-1'))
      expect(received).toEqual(['tenant-1'])
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd backend && pnpm test events/policy-bus
  ```

  Expected: FAIL — module not found

- [ ] **Step 3: Create `backend/src/events/policy-bus.ts`**

  ```ts
  import { EventEmitter } from 'events'

  const bus = new EventEmitter()
  bus.setMaxListeners(1000)

  export const policyBus = bus
  export const policyUpdatedEvent = (tenantId: string) => `policy:updated:${tenantId}`
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd backend && pnpm test events/policy-bus
  ```

  Expected: PASS

- [ ] **Step 5: Commit**

  ```bash
  git add backend/src/events/policy-bus.ts backend/tests/events/policy-bus.test.ts
  git commit -m "feat(backend): add in-process policy event bus for SSE notifications"
  ```

---

### Task 7: Emit on Publish + Add `last-updates` and SSE Endpoints

**Files:**
- Modify: `backend/src/policy/service.ts`
- Modify: `backend/src/policy/router.ts`
- Test: `backend/tests/policy.service.test.ts`
- Test: `backend/tests/policy.router.test.ts`

- [ ] **Step 1: Write the failing test for the emit**

  Add to `backend/tests/policy.service.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'

  const mockEmit = vi.fn()
  vi.mock('../src/events/policy-bus.js', () => ({
    policyBus: { emit: mockEmit },
    policyUpdatedEvent: (id: string) => `policy:updated:${id}`,
  }))
  vi.mock('../src/db/client.js', () => ({
    db: {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue([{ version: 1 }]),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockResolvedValue(undefined),
    },
  }))

  describe('publishPolicy', () => {
    beforeEach(() => vi.clearAllMocks())

    it('emits policy:updated after inserting to DB', async () => {
      const { publishPolicy } = await import('../src/policy/service.js')
      await publishPolicy('tenant-1', { version: 1, tenantId: 'tenant-1', subjects: [], siteConfigs: {} })
      expect(mockEmit).toHaveBeenCalledWith('policy:updated:tenant-1')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd backend && pnpm test policy.service
  ```

- [ ] **Step 3: Update `backend/src/policy/service.ts`**

  ```ts
  import { eq, desc, max, and } from 'drizzle-orm'
  import { db } from '../db/client.js'
  import { policies, type PolicyRow } from '../db/schema.js'
  import { policyBus, policyUpdatedEvent } from '../events/policy-bus.js'

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
    const current     = await getVersionOnly(tenantId)
    const nextVersion = (current ?? 0) + 1
    await db.insert(policies).values({ tenantId, version: nextVersion, policyJson })
    policyBus.emit(policyUpdatedEvent(tenantId))
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

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd backend && pnpm test policy.service
  ```

  Expected: PASS

- [ ] **Step 5: Write the failing tests for the two new endpoints**

  Add to `backend/tests/policy.router.test.ts`:

  ```ts
  describe('GET /policy/last-updates', () => {
    it('returns { ts: number } with the last publishedAt epoch', async () => {
      const publishedAt = new Date('2026-01-01T00:00:00Z')
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ publishedAt }]),
      } as any)
      const app = makeApp()
      const res = await app.inject({ method: 'GET', url: '/policy/last-updates' })
      expect(res.statusCode).toBe(200)
      expect(res.json().ts).toBe(publishedAt.getTime())
    })

    it('returns { ts: 0 } when no policy has been published', async () => {
      vi.mocked(db.select).mockReturnValueOnce({
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue([{ publishedAt: null }]),
      } as any)
      const app = makeApp()
      const res = await app.inject({ method: 'GET', url: '/policy/last-updates' })
      expect(res.statusCode).toBe(200)
      expect(res.json().ts).toBe(0)
    })

    it('returns 402 for cancelled subscription', async () => {
      const app = makeApp({ subscriptionStatus: 'cancelled' })
      const res = await app.inject({ method: 'GET', url: '/policy/last-updates' })
      expect(res.statusCode).toBe(402)
    })
  })
  ```

- [ ] **Step 6: Add `GET /policy/last-updates` to `backend/src/policy/router.ts`**

  Add after `GET /policy`:

  ```ts
  fastify.get(
    '/policy/last-updates',
    { preHandler: [requireOrgTokenOrClerkAuth, requireActiveSubscription] },
    async (req) => {
      const [row] = await db
        .select({ publishedAt: max(policies.publishedAt) })
        .from(policies)
        .where(eq(policies.tenantId, req.tenant.id))
      return { ts: row?.publishedAt?.getTime() ?? 0 }
    }
  )
  ```

  Add required imports at the top of the router file:

  ```ts
  import { max, eq } from 'drizzle-orm'
  import { db } from '../db/client.js'
  import { policies } from '../db/schema.js'
  ```

- [ ] **Step 7: Add the SSE endpoint `GET /events` to `backend/src/policy/router.ts`**

  Add after `GET /policy/last-updates`. This endpoint validates the token from a query param because `EventSource` cannot send custom headers:

  ```ts
  fastify.get('/events', async (req, reply) => {
    // Auth: token comes from ?token= query param (EventSource cannot send headers)
    const { token } = req.query as { token?: string }
    if (!token) return reply.status(401).send({ error: 'Missing token' })

    // Re-use org token path — Clerk JWT also passes as Bearer
    const fakeReq = Object.assign(Object.create(req), {
      headers: { ...req.headers, authorization: `Bearer ${token}` },
    })
    let authError = false
    const fakeReply = { status: () => ({ send: () => { authError = true } }), sent: false }

    await requireOrgTokenOrClerkAuth(fakeReq as any, fakeReply as any)
    if (authError || !fakeReq.tenant) return reply.status(401).send({ error: 'Unauthorized' })

    const tenant = fakeReq.tenant
    if (tenant.subscriptionStatus === 'cancelled') {
      return reply.status(402).send({ error: 'subscription_cancelled' })
    }

    const res = reply.raw
    res.writeHead(200, {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    })

    const send = () => { if (!req.raw.destroyed) res.write('data: policy_updated\n\n') }
    const keepAlive = setInterval(() => { if (!req.raw.destroyed) res.write(': keep-alive\n\n') }, 25_000)

    policyBus.on(policyUpdatedEvent(tenant.id), send)
    req.raw.on('close', () => {
      policyBus.off(policyUpdatedEvent(tenant.id), send)
      clearInterval(keepAlive)
    })

    return new Promise(() => {}) // keep alive until client disconnects
  })
  ```

  Add at the top of the router file:

  ```ts
  import { policyBus, policyUpdatedEvent } from '../events/policy-bus.js'
  ```

- [ ] **Step 8: Run full backend test suite**

  ```bash
  cd backend && pnpm test
  ```

  Expected: all pass

- [ ] **Step 9: Commit**

  ```bash
  git add backend/src/policy/service.ts backend/src/policy/router.ts backend/tests/policy.service.test.ts backend/tests/policy.router.test.ts
  git commit -m "feat(backend): emit on publish; add GET /policy/last-updates and GET /events SSE endpoint"
  ```

---

### Task 8: Extension — `ILastUpdatesChecker` Interface + Backend REST Adapter

**Files:**
- Create: `pretzel/src/realtime/types.ts`
- Create: `pretzel/src/realtime/backend-rest.adapter.ts`
- Create: `pretzel/src/realtime/index.ts`
- Test: `pretzel/tests/unit/realtime.adapter.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `pretzel/tests/unit/realtime.adapter.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

  vi.mock('../../src/policy/auth', () => ({ getAuthToken: vi.fn().mockResolvedValue('tok') }))
  vi.mock('../../src/shared/constants', () => ({ API_BASE: 'https://api.test' }))

  const originalFetch = global.fetch
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => { fetchMock = vi.fn(); global.fetch = fetchMock })
  afterAll(() => { global.fetch = originalFetch })

  describe('BackendRESTChecker', () => {
    it('fetches /v1/policy/last-updates with auth header and returns ts', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ts: 9999 }) })
      const { BackendRESTChecker } = await import('../../src/realtime/backend-rest.adapter')
      const result = await new BackendRESTChecker().getLastUpdatedAt()
      expect(result).toBe(9999)
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test/v1/policy/last-updates',
        { headers: { Authorization: 'Bearer tok' } }
      )
    })

    it('returns null on network error', async () => {
      fetchMock.mockRejectedValueOnce(new Error('offline'))
      const { BackendRESTChecker } = await import('../../src/realtime/backend-rest.adapter')
      expect(await new BackendRESTChecker().getLastUpdatedAt()).toBeNull()
    })

    it('returns null when not authenticated', async () => {
      const { getAuthToken } = await import('../../src/policy/auth')
      vi.mocked(getAuthToken).mockResolvedValueOnce(null)
      const { BackendRESTChecker } = await import('../../src/realtime/backend-rest.adapter')
      expect(await new BackendRESTChecker().getLastUpdatedAt()).toBeNull()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd pretzel && pnpm test realtime.adapter
  ```

  Expected: FAIL — module not found

- [ ] **Step 3: Create `pretzel/src/realtime/types.ts`**

  ```ts
  export interface ILastUpdatesChecker {
    /** Returns epoch ms of last policy publish, or null on error/unauthenticated. */
    getLastUpdatedAt(): Promise<number | null>
  }
  ```

- [ ] **Step 4: Create `pretzel/src/realtime/backend-rest.adapter.ts`**

  ```ts
  import { getAuthToken } from '@/policy/auth'
  import { API_BASE } from '@/shared/constants'
  import type { ILastUpdatesChecker } from './types'

  export class BackendRESTChecker implements ILastUpdatesChecker {
    async getLastUpdatedAt(): Promise<number | null> {
      const token = await getAuthToken()
      if (!token) return null
      try {
        const res = await fetch(`${API_BASE}/v1/policy/last-updates`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return null
        const { ts } = await res.json() as { ts: number }
        return ts
      } catch {
        return null
      }
    }
  }
  ```

- [ ] **Step 5: Create `pretzel/src/realtime/index.ts`**

  ```ts
  import { BackendRESTChecker } from './backend-rest.adapter'
  import type { ILastUpdatesChecker } from './types'

  export const lastUpdatesChecker: ILastUpdatesChecker = new BackendRESTChecker()
  export type { ILastUpdatesChecker }
  ```

- [ ] **Step 6: Run test to verify it passes**

  ```bash
  cd pretzel && pnpm test realtime.adapter
  ```

  Expected: PASS

- [ ] **Step 7: Commit**

  ```bash
  git add pretzel/src/realtime/ pretzel/tests/unit/realtime.adapter.test.ts
  git commit -m "feat(pretzel): add ILastUpdatesChecker interface and BackendRESTChecker adapter"
  ```

---

### Task 9: Extension — `checkForUpdates` Alarm Handler

**Files:**
- Modify: `pretzel/src/policy/sync.ts` (extract `getAuthToken`, reset `syncedAt`)
- Create: `pretzel/src/policy/auth.ts`
- Create: `pretzel/src/background/update-check.ts`
- Test: `pretzel/tests/unit/update-check.test.ts`

- [ ] **Step 1: Extract `getAuthToken` to `pretzel/src/policy/auth.ts`**

  ```ts
  export async function getAuthToken(): Promise<string | null> {
    const clerkResult = await chrome.storage.local.get('clerkSessionToken') as Record<string, unknown>
    if (typeof clerkResult['clerkSessionToken'] === 'string') return clerkResult['clerkSessionToken']

    const managed = await chrome.storage.managed.get('orgToken').catch(() => ({})) as Record<string, unknown>
    if (typeof managed['orgToken'] === 'string') return managed['orgToken']

    const local = await chrome.storage.local.get('orgToken') as Record<string, unknown>
    return typeof local['orgToken'] === 'string' ? local['orgToken'] : null
  }
  ```

  Update `pretzel/src/policy/sync.ts` to import from `./auth` instead of defining `getAuthToken` locally:

  ```ts
  import { PolicyDocSchema } from './schema'
  import { getAuthToken } from './auth'
  import { API_BASE } from '@/shared/constants'

  async function getCachedVersion(): Promise<number | null> {
    const result = await chrome.storage.local.get('cachedPolicyVersion') as Record<string, unknown>
    const v = result['cachedPolicyVersion']
    return typeof v === 'number' ? v : null
  }

  export async function syncPolicy(): Promise<void> {
    const token = await getAuthToken()
    if (!token) return
    try {
      const versionRes = await fetch(`${API_BASE}/v1/policy/version`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!versionRes.ok) {
        if (versionRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true })
        return
      }
      const { version: contentVersion } = await versionRes.json() as { version: number }
      const cached = await getCachedVersion()
      if (cached === contentVersion) return

      const policyRes = await fetch(`${API_BASE}/v1/policy`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!policyRes.ok) {
        if (policyRes.status === 402) await chrome.storage.local.set({ subscriptionExpired: true })
        return
      }
      const raw    = await policyRes.json() as { policy: unknown }
      const parsed = PolicyDocSchema.safeParse(raw.policy)
      if (!parsed.success) return

      await chrome.storage.local.set({
        policyDoc:           parsed.data,
        cachedPolicyVersion: contentVersion,
        subscriptionExpired: false,
        syncedAt:            Date.now(),
      })
    } catch {
      // Network error — keep cached policy
    }
  }
  ```

- [ ] **Step 2: Write the failing test for `checkForUpdates`**

  Create `pretzel/tests/unit/update-check.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'

  const store: Record<string, unknown> = {}
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const ks = Array.isArray(keys) ? keys : [keys]
          return Object.fromEntries(ks.map(k => [k, store[k]]))
        }),
        set: vi.fn(async (vals: Record<string, unknown>) => Object.assign(store, vals)),
      },
    },
  })

  const mockGetLastUpdatedAt = vi.fn<[], Promise<number | null>>()
  vi.mock('../../src/realtime/index', () => ({ lastUpdatesChecker: { getLastUpdatedAt: mockGetLastUpdatedAt } }))
  const mockSyncPolicy = vi.fn().mockResolvedValue(undefined)
  vi.mock('../../src/policy/sync', () => ({ syncPolicy: mockSyncPolicy }))

  beforeEach(() => {
    Object.keys(store).forEach(k => delete store[k])
    vi.clearAllMocks()
  })

  describe('checkForUpdates', () => {
    it('calls syncPolicy when remoteTs > localSyncedAt', async () => {
      store['syncedAt'] = 1000
      mockGetLastUpdatedAt.mockResolvedValueOnce(2000)
      const { checkForUpdates } = await import('../../src/background/update-check')
      await checkForUpdates()
      expect(mockSyncPolicy).toHaveBeenCalledOnce()
    })

    it('does NOT call syncPolicy when remoteTs <= localSyncedAt', async () => {
      store['syncedAt'] = 2000
      mockGetLastUpdatedAt.mockResolvedValueOnce(2000)
      const { checkForUpdates } = await import('../../src/background/update-check')
      await checkForUpdates()
      expect(mockSyncPolicy).not.toHaveBeenCalled()
    })

    it('calls syncPolicy when no localSyncedAt (first run)', async () => {
      // no syncedAt in store
      mockGetLastUpdatedAt.mockResolvedValueOnce(5000)
      const { checkForUpdates } = await import('../../src/background/update-check')
      await checkForUpdates()
      expect(mockSyncPolicy).toHaveBeenCalledOnce()
    })

    it('does nothing when getLastUpdatedAt returns null', async () => {
      mockGetLastUpdatedAt.mockResolvedValueOnce(null)
      const { checkForUpdates } = await import('../../src/background/update-check')
      await checkForUpdates()
      expect(mockSyncPolicy).not.toHaveBeenCalled()
    })

    it('updates syncedAt in storage after syncing', async () => {
      store['syncedAt'] = 0
      mockGetLastUpdatedAt.mockResolvedValueOnce(3000)
      const { checkForUpdates } = await import('../../src/background/update-check')
      await checkForUpdates()
      expect(store['syncedAt']).toBe(3000)
    })
  })
  ```

- [ ] **Step 3: Run test to verify it fails**

  ```bash
  cd pretzel && pnpm test update-check
  ```

  Expected: FAIL — module not found

- [ ] **Step 4: Create `pretzel/src/background/update-check.ts`**

  ```ts
  import { lastUpdatesChecker } from '@/realtime/index'
  import { syncPolicy } from '@/policy/sync'

  export async function checkForUpdates(): Promise<void> {
    const remoteTs = await lastUpdatesChecker.getLastUpdatedAt()
    if (remoteTs === null) return

    const stored = await chrome.storage.local.get('syncedAt') as { syncedAt?: number }
    const localTs = stored.syncedAt ?? 0

    if (remoteTs <= localTs) return

    await syncPolicy()
    await chrome.storage.local.set({ syncedAt: remoteTs })
  }
  ```

- [ ] **Step 5: Run test to verify it passes**

  ```bash
  cd pretzel && pnpm test update-check
  ```

  Expected: PASS

- [ ] **Step 6: Commit**

  ```bash
  git add pretzel/src/policy/auth.ts pretzel/src/policy/sync.ts pretzel/src/background/update-check.ts pretzel/tests/unit/update-check.test.ts
  git commit -m "feat(pretzel): add checkForUpdates — timestamp-based polling replaces 30-min version check"
  ```

---

### Task 10: Extension — Wire Alarm to `checkForUpdates`

**Files:**
- Modify: `pretzel/src/background/service-worker.ts`
- Test: `pretzel/tests/unit/service-worker.alarm.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `pretzel/tests/unit/service-worker.alarm.test.ts`:

  ```ts
  import { describe, it, expect, vi } from 'vitest'

  const mockCheck = vi.fn().mockResolvedValue(undefined)
  const mockSync  = vi.fn().mockResolvedValue(undefined)

  vi.mock('../../src/background/update-check', () => ({ checkForUpdates: mockCheck }))
  vi.mock('../../src/policy/sync',             () => ({ syncPolicy: mockSync }))
  vi.mock('../../src/policy/loader',           () => ({ loadPolicy: vi.fn().mockResolvedValue({}) }))
  vi.mock('../../src/detection/engine',        () => ({ detectPrompt: vi.fn().mockResolvedValue({ findings: [] }) }))
  vi.mock('../../src/events/dispatch',         () => ({ dispatchEvents: vi.fn() }))
  vi.mock('../../src/scans/dispatch',          () => ({ dispatchScan: vi.fn(), isScanLimitReached: vi.fn().mockResolvedValue(false) }))

  const alarmListeners:   Array<(a: { name: string }) => void> = []
  const installListeners: Array<(d: { reason: string }) => void> = []
  vi.stubGlobal('chrome', {
    runtime: {
      onInstalled: { addListener: (fn: typeof installListeners[0]) => installListeners.push(fn) },
      onMessage:   { addListener: vi.fn() },
    },
    alarms: {
      create:  vi.fn(),
      onAlarm: { addListener: (fn: typeof alarmListeners[0]) => alarmListeners.push(fn) },
    },
    storage: {
      local:   { get: vi.fn().mockResolvedValue({}), set: vi.fn() },
      managed: { get: vi.fn().mockResolvedValue({}) },
    },
  })

  describe('service-worker alarm', () => {
    it('creates a 2-minute alarm on install', async () => {
      await import('../../src/background/service-worker')
      installListeners[0]?.({ reason: 'install' })
      expect(chrome.alarms.create).toHaveBeenCalledWith('policy-sync', { periodInMinutes: 2 })
    })

    it('calls checkForUpdates (not syncPolicy) when alarm fires', async () => {
      alarmListeners[0]?.({ name: 'policy-sync' })
      await new Promise(r => setTimeout(r, 0))
      expect(mockCheck).toHaveBeenCalled()
      expect(mockSync).not.toHaveBeenCalled()
    })

    it('calls syncPolicy on initial install for first-time full sync', () => {
      expect(mockSync).toHaveBeenCalledTimes(1)
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd pretzel && pnpm test service-worker.alarm
  ```

  Expected: FAIL — alarm is 30 min, calls syncPolicy

- [ ] **Step 3: Update `pretzel/src/background/service-worker.ts`**

  Replace the `onInstalled` listener and `onAlarm` listener with:

  ```ts
  import { syncPolicy }        from '@/policy/sync'
  import { checkForUpdates }   from '@/background/update-check'
  // ... rest of existing imports unchanged

  chrome.runtime.onInstalled.addListener(({ reason }) => {
    logger.info('mykka installed. Reason:', reason)
    void syncPolicy()                                           // full sync on first install
    chrome.alarms.create('policy-sync', { periodInMinutes: 2 }) // 2 min instead of 30
  })

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'policy-sync') void checkForUpdates()   // lightweight ts check
  })
  // ... rest of existing message handler unchanged
  ```

- [ ] **Step 4: Run all extension tests and build**

  ```bash
  cd pretzel && pnpm test && pnpm build
  ```

  Expected: all pass, build succeeds

- [ ] **Step 5: Commit**

  ```bash
  git add pretzel/src/background/service-worker.ts pretzel/tests/unit/service-worker.alarm.test.ts
  git commit -m "feat(pretzel): wire checkForUpdates into 2-min alarm"
  ```

---

### Task 11: Web App — `IRealtimeSubscriber` Interface + SSE Adapter

**Files:**
- Create: `pretzel-console/src/realtime/types.ts`
- Create: `pretzel-console/src/realtime/sse.adapter.ts`
- Create: `pretzel-console/src/realtime/index.ts`
- Test: `pretzel-console/tests/realtime/sse.adapter.test.ts`

- [ ] **Step 1: Write the failing test**

  Create `pretzel-console/tests/realtime/sse.adapter.test.ts`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'

  class MockEventSource {
    static instances: MockEventSource[] = []
    listeners: Record<string, EventListener[]> = {}
    readyState = 1
    url: string
    constructor(url: string) { this.url = url; MockEventSource.instances.push(this) }
    addEventListener(type: string, fn: EventListener) {
      this.listeners[type] = [...(this.listeners[type] ?? []), fn]
    }
    close() { this.readyState = 2 }
    // helpers for tests
    _trigger(type: string) { this.listeners[type]?.forEach(fn => (fn as any)()) }
    _triggerError(closed = false) {
      this.readyState = closed ? 2 : 0
      this.listeners['error']?.forEach(fn => (fn as any)())
    }
  }

  vi.stubGlobal('EventSource', MockEventSource)
  vi.mock('../../src/lib/api', () => ({ API_BASE: 'https://api.test' }))

  beforeEach(() => { MockEventSource.instances = [] })

  describe('SSESubscriber', () => {
    it('opens EventSource at /v1/events?token=xxx', () => {
      const { SSESubscriber } = require('../src/realtime/sse.adapter')
      new SSESubscriber().subscribe(async () => 'my-token', vi.fn())
      expect(MockEventSource.instances[0].url).toBe('https://api.test/v1/events?token=my-token')
    })

    it('calls onUpdate when server sends a message event', async () => {
      const { SSESubscriber } = require('../src/realtime/sse.adapter')
      const onUpdate = vi.fn()
      new SSESubscriber().subscribe(async () => 'tok', onUpdate)
      MockEventSource.instances[0]._trigger('message')
      expect(onUpdate).toHaveBeenCalledOnce()
    })

    it('closes EventSource on unsubscribe', () => {
      const { SSESubscriber } = require('../src/realtime/sse.adapter')
      const unsub = new SSESubscriber().subscribe(async () => 'tok', vi.fn())
      unsub()
      expect(MockEventSource.instances[0].readyState).toBe(2)
    })

    it('reconnects with a fresh token when EventSource closes with 401', async () => {
      const getToken = vi.fn().mockResolvedValue('fresh-token')
      const { SSESubscriber } = require('../src/realtime/sse.adapter')
      new SSESubscriber().subscribe(getToken, vi.fn())

      // Simulate a closed error (readyState = 2 → server refused, e.g. 401)
      MockEventSource.instances[0]._triggerError(true)
      await new Promise(r => setTimeout(r, 10))

      expect(MockEventSource.instances).toHaveLength(2)
      expect(MockEventSource.instances[1].url).toContain('fresh-token')
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd pretzel-console && pnpm test realtime/sse.adapter
  ```

  Expected: FAIL — module not found

- [ ] **Step 3: Create `pretzel-console/src/realtime/types.ts`**

  ```ts
  export interface IRealtimeSubscriber {
    /**
     * Open an SSE connection. Calls onUpdate on each server push.
     * Returns an unsubscribe function — call it on component unmount.
     */
    subscribe(getToken: () => Promise<string>, onUpdate: () => void): () => void
  }
  ```

- [ ] **Step 4: Create `pretzel-console/src/realtime/sse.adapter.ts`**

  ```ts
  import { API_BASE } from '../lib/api'
  import type { IRealtimeSubscriber } from './types'

  export class SSESubscriber implements IRealtimeSubscriber {
    subscribe(getToken: () => Promise<string>, onUpdate: () => void): () => void {
      let es: EventSource | null = null
      let closed = false

      const connect = async () => {
        const token = await getToken()
        es = new EventSource(`${API_BASE}/v1/events?token=${token}`)

        es.addEventListener('message', onUpdate)

        es.addEventListener('error', async () => {
          // readyState === 2 means the server responded with non-2xx (e.g. token expired).
          // readyState === 0 means it's reconnecting automatically — leave it alone.
          if (es?.readyState === EventSource.CLOSED && !closed) {
            es.close()
            await new Promise(r => setTimeout(r, 1000))
            connect()
          }
        })
      }

      connect()

      return () => {
        closed = true
        es?.close()
      }
    }
  }
  ```

- [ ] **Step 5: Create `pretzel-console/src/realtime/index.ts`**

  ```ts
  import { SSESubscriber }        from './sse.adapter'
  import type { IRealtimeSubscriber } from './types'

  export const realtimeSubscriber: IRealtimeSubscriber = new SSESubscriber()
  export type { IRealtimeSubscriber }
  ```

- [ ] **Step 6: Run test to verify it passes**

  ```bash
  cd pretzel-console && pnpm test realtime/sse.adapter
  ```

  Expected: PASS

- [ ] **Step 7: Commit**

  ```bash
  git add pretzel-console/src/realtime/ pretzel-console/tests/realtime/
  git commit -m "feat(pretzel-console): add IRealtimeSubscriber interface and SSE adapter with auto-reconnect"
  ```

---

### Task 12: Web App — `usePolicyRealtime` Hook + Mount

**Files:**
- Create: `pretzel-console/src/hooks/usePolicyRealtime.ts`
- Test: `pretzel-console/tests/hooks/usePolicyRealtime.test.tsx`
- Modify: authenticated layout component

- [ ] **Step 1: Write the failing test**

  Create `pretzel-console/tests/hooks/usePolicyRealtime.test.tsx`:

  ```ts
  import { describe, it, expect, vi, beforeEach } from 'vitest'
  import { renderHook, act } from '@testing-library/react'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import React from 'react'

  let capturedGetToken: (() => Promise<string>) | null = null
  let capturedOnUpdate: (() => void) | null = null
  const mockUnsub = vi.fn()

  vi.mock('../../src/realtime/index', () => ({
    realtimeSubscriber: {
      subscribe: vi.fn((getToken, onUpdate) => {
        capturedGetToken = getToken
        capturedOnUpdate = onUpdate
        return mockUnsub
      }),
    },
  }))

  const mockGetToken = vi.fn().mockResolvedValue('clerk-jwt')
  vi.mock('@clerk/clerk-react', () => ({
    useAuth: () => ({ getToken: mockGetToken }),
  }))

  function wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: new QueryClient() }, children)
  }

  describe('usePolicyRealtime', () => {
    beforeEach(() => { vi.clearAllMocks(); capturedOnUpdate = null })

    it('calls realtimeSubscriber.subscribe on mount', () => {
      const { realtimeSubscriber } = require('../../src/realtime/index')
      const { usePolicyRealtime } = require('../../src/hooks/usePolicyRealtime')
      renderHook(() => usePolicyRealtime(), { wrapper })
      expect(realtimeSubscriber.subscribe).toHaveBeenCalledOnce()
    })

    it('the getToken callback returns a fresh Clerk JWT', async () => {
      const { usePolicyRealtime } = require('../../src/hooks/usePolicyRealtime')
      renderHook(() => usePolicyRealtime(), { wrapper })
      const token = await capturedGetToken?.()
      expect(token).toBe('clerk-jwt')
    })

    it('invalidates policy queries when onUpdate fires', () => {
      const { usePolicyRealtime } = require('../../src/hooks/usePolicyRealtime')
      let qc!: QueryClient
      const w = ({ children }: { children: React.ReactNode }) => {
        qc = new QueryClient()
        vi.spyOn(qc, 'invalidateQueries')
        return React.createElement(QueryClientProvider, { client: qc }, children)
      }
      renderHook(() => usePolicyRealtime(), { wrapper: w })
      act(() => { capturedOnUpdate?.() })
      expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['policy'] })
      expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['policy-history'] })
    })

    it('calls unsubscribe on unmount', () => {
      const { usePolicyRealtime } = require('../../src/hooks/usePolicyRealtime')
      const { unmount } = renderHook(() => usePolicyRealtime(), { wrapper })
      unmount()
      expect(mockUnsub).toHaveBeenCalledOnce()
    })
  })
  ```

- [ ] **Step 2: Run test to verify it fails**

  ```bash
  cd pretzel-console && pnpm test usePolicyRealtime
  ```

  Expected: FAIL — module not found

- [ ] **Step 3: Create `pretzel-console/src/hooks/usePolicyRealtime.ts`**

  ```ts
  import { useEffect }       from 'react'
  import { useQueryClient }  from '@tanstack/react-query'
  import { useAuth }         from '@clerk/clerk-react'
  import { realtimeSubscriber } from '../realtime/index'

  export function usePolicyRealtime(): void {
    const qc         = useQueryClient()
    const { getToken } = useAuth()

    useEffect(() => {
      return realtimeSubscriber.subscribe(
        () => getToken() as Promise<string>,
        () => {
          qc.invalidateQueries({ queryKey: ['policy'] })
          qc.invalidateQueries({ queryKey: ['policy-history'] })
          qc.invalidateQueries({ queryKey: ['subjects'] })
        }
      )
    }, [qc, getToken])
  }
  ```

- [ ] **Step 4: Run test to verify it passes**

  ```bash
  cd pretzel-console && pnpm test usePolicyRealtime && pnpm test
  ```

  Expected: all pass

- [ ] **Step 5: Find and update the authenticated layout**

  ```bash
  grep -r "usePolicy\|QueryClientProvider\|ClerkProvider" pretzel-console/src --include="*.tsx" -l
  ```

  In the authenticated layout/shell component, add:

  ```ts
  import { usePolicyRealtime } from '../hooks/usePolicyRealtime'
  // inside the component:
  usePolicyRealtime()
  ```

- [ ] **Step 6: Manual smoke test**

  1. `cd backend && pnpm dev`
  2. `cd pretzel-console && pnpm dev`
  3. Open two browser tabs at `http://localhost:5173`
  4. In tab 1: publish a policy
  5. Tab 2: policy view should refresh within ~1–2 seconds, no page reload

- [ ] **Step 7: Commit**

  ```bash
  git add pretzel-console/src/hooks/usePolicyRealtime.ts pretzel-console/tests/hooks/usePolicyRealtime.test.tsx pretzel-console/src
  git commit -m "feat(pretzel-console): add usePolicyRealtime SSE hook; mount in authenticated layout"
  ```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|---|---|
| `requireActiveSubscription` preHandler — no more duplicate inline guards | Task 0 |
| `subject_versions` table with snapshot + source + conversationMsgId | Task 1 |
| `snapshotSubject()` service — reads subject + rules, writes version row | Task 2 |
| Snapshot BEFORE AI apply; link snapshot to message via conversationMsgId | Task 3 |
| Revert endpoint restores subject metadata + rules from snapshot | Task 3 |
| `hasVersionSnapshot` enrichment on `getMessages` response | Task 3 |
| Subject version history endpoint | Task 4 |
| Revert button in AI chat UI on messages with snapshots | Task 5 |
| Policy event bus (in-process EventEmitter) | Task 6 |
| `policyBus.emit` on every publish (covers rollback too, which calls publishPolicy) | Task 7 |
| `GET /policy/last-updates` → `{ ts }` from `policies.publishedAt` | Task 7 |
| `GET /events` SSE endpoint with query param auth | Task 7 |
| `ILastUpdatesChecker` interface + BackendRESTChecker adapter | Task 8 |
| `checkForUpdates` — compare ts, call syncPolicy if stale | Task 9 |
| Extension alarm reduced 30 → 2 min | Task 10 |
| `IRealtimeSubscriber` interface + SSESubscriber adapter with reconnect on 401 | Task 11 |
| `usePolicyRealtime` hook — invalidates queries on SSE push | Task 12 |
| No Firebase anywhere | Whole plan |

### Placeholder Check

None found.

### Type Consistency

- `SubjectSnapshot` defined once in `schema.ts`, used in `snapshot.ts` and the revert endpoint
- `ILastUpdatesChecker.getLastUpdatedAt()` returns `Promise<number | null>` — matches `update-check.ts` usage
- `IRealtimeSubscriber.subscribe(getToken, onUpdate)` signature matches `usePolicyRealtime.ts` usage
- `policyUpdatedEvent(tenantId)` function used consistently in `policy-bus.ts`, `service.ts`, and `router.ts`
- `syncedAt` storage key used consistently in `sync.ts` and `update-check.ts`
