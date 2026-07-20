# Backend Code Review — Arjun Mehta (Backend Engineer)

> Lens: business-logic correctness, SQL safety/efficiency, multi-tenant isolation, input validation, error paths, API contract consistency, auth guards, dead code.
>
> Date: 2026-06-08

---

#### `backend/src/app.ts` — Fastify application factory

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `CORS_ORIGIN=true` (the fallback) reflects all origins with credentials. Fine for dev, but if this ever makes it to prod without the env var set, it is a full CORS open-door.
  2. The PayPal webhook endpoint (`POST /webhooks/paypal`) accepts raw JSON via the standard content-type parser (it falls through the `else` branch of the custom parser), but it is NOT signature-verified anywhere — `handlePayPalEvent` blindly trusts the body. Stripe is protected by `constructEvent`; PayPal has no equivalent check in this file or in `paypal.ts`.
  3. Both webhook routes return 200 even when `handleStripeEvent`/`handlePayPalEvent` throw — the `setErrorHandler` will catch and return 500, but Stripe expects 200 to stop retries; a 500 will cause Stripe to retry repeatedly.
  **Proposed changes:**
  - Guard the CORS default: `origin: process.env.CORS_ORIGIN?.split(',') ?? ['https://console.mykka.ai']`
  - Add PayPal webhook signature verification (see `paypal.ts` finding).
  - Wrap webhook handlers in try/catch and return 200 regardless on recoverable errors, or at minimum document the retry behaviour.

---

#### `backend/src/index.ts` — Entry point

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** None — clean. DB ping before listen, graceful SIGTERM/SIGINT, correct host binding.
  **Proposed changes:** N/A

---

#### `backend/src/auth/middleware.ts` — Auth middleware

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `resolveClerkJwt` does two sequential DB round-trips for the common single-org case (select user → select members → select tenant). These could be collapsed into one join query to avoid ~2 extra RTTs per authenticated request.
  2. In `requireAdminTokenOrClerkAdmin`, after `resolveClerkJwt` the code checks `req.member?.role !== 'super_admin'`. The `division_admin` role is not allowed here, which is correct, but the check silently ignores `division_admin` users who try to use admin endpoints — they get a clear 403, fine.
  3. `requireActiveSubscription` accesses `req.tenant` without a null guard — if somehow called before auth (e.g. if a route misconfigures middleware order), it will throw an uncaught `TypeError`. The Fastify `preHandler` chain makes this unlikely in practice, but defensive coding is warranted.
  4. `resolveOrgToken` uses bcrypt compare on every extension request (the hot path). bcrypt is intentionally slow; at high extension request volume this becomes a CPU bottleneck. Consider caching a short-lived (30s) token→tenantId mapping in memory.
  **Proposed changes:**
  - Combine the three queries in `resolveClerkJwt` into a single join or at least parallelize the tenant lookup: once the member row is found, the `tenantId` is already on it — no need for the second select on `tenants` in the single-org case if `req.tenant` is populated directly from the joined row.
  - Add a null-safe guard in `requireActiveSubscription`: `if (!req.tenant) return`.

---

#### `backend/src/auth/tokens.ts` — Token generation and validation

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. 24-byte entropy (192 bits) for secrets is sufficient. bcrypt cost factor 10 is appropriate. Token regex is strict and correct.
  **Proposed changes:** N/A

---

#### `backend/src/db/schema.ts` — Database schema

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `members` table has no index on `(tenantId, userId)`. The Clerk webhook `user.created` path and auth middleware do `WHERE userId = ?` and `WHERE tenantId = ? AND userId = ?` on every login — no index will cause a full members table scan as tenants grow.
  2. `invites` table has no index on `(token)` beyond the `unique()` constraint — the unique constraint implicitly creates an index, so this is fine.
  3. `rules` table only has `index().on(t.subjectId)`. The extremely common query `WHERE tenantId = ? AND active = true` (used in `listAllActiveRules`) has no compound index; Postgres will use the PK or a seq scan.
  4. `chatMessages` has an index on `sessionId` but `getMessages` also filters by `chatSessions.tenantId` via a join — the index is correct since the join resolves the tenant check.
  5. `subjectVersions` has no index on `tenantId` — `snapshotSubject` does a subject lookup scoped by `tenantId` (going through `subjects` table, not `subjectVersions` directly), so this is acceptable.
  **Proposed changes:**
  ```ts
  // In members table definition:
  tenantUserIdx: index().on(t.tenantId, t.userId),

  // In rules table definition:
  tenantActiveIdx: index().on(t.tenantId, t.active),
  ```

---

#### `backend/src/db/client.ts` — Database client

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `DATABASE_URL!` non-null assertion will throw a cryptic error at startup if the env var is missing. `pingDb` in `index.ts` catches this, but only at connection time, not at module load time. The `!` also suppresses IDE warnings.
  **Proposed changes:**
  ```ts
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL env var is required')
  export const sql = postgres(url)
  ```

---

#### `backend/src/db/migrate.ts` — Migration runner

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Uses `max: 1` connection for migration (correct — avoids concurrent migration runs). Top-level await is intentional for a one-shot script.
  **Proposed changes:** N/A

---

#### `backend/src/policy/router.ts` — Policy routes

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **SSE route `/events` is not protected by `requireActiveSubscription`**. A tenant with a cancelled subscription can still hold an SSE connection open and receive policy-updated events indefinitely.
  2. On the SSE route, `req.member!.tenantId` uses a non-null assertion. `req.member` is only set for Clerk auth, not for org-token auth. If an org-token caller somehow hits this endpoint (they can't because only Clerk tokens have `member`), this would crash. However, the more immediate issue: the event channel is keyed by `req.member!.tenantId` but the check `if (reply.sent) return` is the only guard against an already-rejected request — if `resolveClerkJwt` fails mid-way and sets `req.member` partially, behavior is undefined.
  3. `POST /policy/rollback/:version` parses `version` with `parseInt` but does not validate that the result is a positive integer (`parseInt('abc')` → NaN, which will cause a DB error rather than a clean 400).
  **Proposed changes:**
  ```ts
  // Rollback route — add version validation:
  const ver = parseInt(version, 10)
  if (isNaN(ver) || ver < 1) return reply.status(400).send({ error: 'version must be a positive integer' })

  // SSE route — add subscription check and null guard:
  await resolveClerkJwt(req, reply, token)
  if (reply.sent) return
  await requireActiveSubscription(req, reply)
  if (reply.sent) return
  // ... then use req.member!.tenantId safely
  ```

---

#### `backend/src/policy/service.ts` — Policy service

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `publishPolicy` has a TOCTOU race: `getVersionOnly` then `insert` are two separate queries. Under concurrent publishes for the same tenant, both could read the same current version and try to insert the same `nextVersion`, which the `tenantVersionUniq` constraint will reject with a DB error rather than a handled conflict. For now with a single-server deploy this is low risk, but worth noting.
  **Proposed changes:**
  Consider using a DB-level sequence or a `SELECT ... FOR UPDATE` / advisory lock pattern:
  ```ts
  // Option: single upsert using a subquery for the next version
  await db.insert(policies).values({
    tenantId,
    version: sql`(SELECT COALESCE(MAX(version), 0) + 1 FROM policies WHERE tenant_id = ${tenantId})`,
    policyJson,
  })
  ```

---

#### `backend/src/policy/compiler.ts` — Policy compiler

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Parallel data fetching with `Promise.all`. All queries are tenant-scoped. `listSubjects` only returns active subjects; `listAllActiveRules` only returns active rules — correct.
  **Proposed changes:** N/A

---

#### `backend/src/policy/resolver.ts` — Member policy resolver

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `destinationGroups` are fetched by IDs from the policy snapshot but there is **no `tenantId` filter** on the `destinationGroups` query (line 96). An attacker who can inject a destination group ID from a different tenant into the policy JSON (e.g. by exploiting the LLM assistant) could have cross-tenant domain data merged into the resolved policy.
  2. The `inArray(teams.id, [...memberTeamIds])` call has no upper bound check — a member in thousands of teams would generate a very large `IN` clause.
  **Proposed changes:**
  ```ts
  // Add tenantId filter to destination groups lookup:
  .where(and(
    inArray(destinationGroups.id, allGroupIds),
    eq(destinationGroups.tenantId, tenantId),  // add this
  ))
  ```

---

#### `backend/src/tenants/router.ts` — Tenant routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All routes behind `requireAdminTokenOrClerkAdmin`. `PATCH /tenant` validates and trims the name. Token rotation returns the plaintext token in-response (correct — one-time reveal).
  **Proposed changes:** N/A

---

#### `backend/src/tenants/service.ts` — Tenant service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All updates scoped by `tenantId`. Grace period calculation is correct. `updateTenantName` returns the updated row; non-null assertion on `row!` is safe because the update targets a known-existing row.
  **Proposed changes:** N/A

---

#### `backend/src/members/router.ts` — Members routes

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. `POST /members/:id/teams` and `POST /members/:id/teams/:teamId` are **duplicate routes doing the same thing**. The first takes `teamId` from the body; the second from params. The route handler for the first (`assignTeam(id, teamId)`) does not validate that the `teamId` in the body belongs to the same tenant as `req.tenant`. Any admin can assign any global team UUID to a member, including a team from another tenant.
  2. `DELETE /members/:id/teams/:teamId` calls `removeTeam(id, teamId)` without a tenant check — same cross-tenant risk.
  **Proposed changes:**
  ```ts
  // In members/service.ts, add tenant validation to assignTeam:
  export async function assignTeam(memberId: string, teamId: string, tenantId: string): Promise<void> {
    // Verify the team belongs to the tenant
    const [team] = await db.select({ id: teams.id }).from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.tenantId, tenantId)))
    if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 })
    await db.insert(memberTeams).values({ memberId, teamId }).onConflictDoNothing()
  }
  ```
  Also remove the duplicate `POST /members/:id/teams` body-based route.

---

#### `backend/src/members/service.ts` — Members service

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `importMembers` does **no seat-limit check** before bulk-inserting. `createMember` has the limit check but `importMembers` bypasses it entirely. An admin could import hundreds of members on a free plan.
  2. `importMembers` uses `Promise.all` to look up `getUserByEmail` for each row — N individual DB queries. A single query with `inArray` would be more efficient.
  3. `deleteMember` deletes from `memberTeams` first (good), then deletes the member with the tenant check — but `memberTeams` deletion does not verify the member belongs to the same tenant. A malicious admin could pass any member UUID and delete their team assignments.
  **Proposed changes:**
  ```ts
  // importMembers: add seat limit check
  const [countRow] = await db.select({ n: count() }).from(members).where(eq(members.tenantId, tenantId))
  const currentSeats = countRow?.n ?? 0
  if (isOverSeatLimit(plan, currentSeats + rows.length)) {
    throw Object.assign(new Error(`Seat limit would be exceeded`), { statusCode: 402 })
  }

  // deleteMember: verify member belongs to tenant before deleting memberTeams
  const [existing] = await db.select({ id: members.id }).from(members)
    .where(and(eq(members.id, id), eq(members.tenantId, tenantId)))
  if (!existing) return  // not this tenant's member
  await db.delete(memberTeams).where(eq(memberTeams.memberId, id))
  await db.delete(members).where(eq(members.id, id))
  ```

---

#### `backend/src/teams/router.ts` — Teams routes

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `GET /teams/:teamId/members` calls `listMembersByTeam(req.tenant.id, teamId)` — the service filters members by `tenantId` in JS after the join (`.filter(m => m.tenantId === tenantId)`), not in SQL. This means the DB returns all members of the team regardless of tenant, and the JS filter removes the wrong-tenant ones. This is a correctness/isolation issue if a team UUID from another tenant is guessed.
  **Proposed changes:** Push the filter to SQL (see `teams/service.ts`).

---

#### `backend/src/teams/service.ts` — Teams service

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** `listMembersByTeam` filters tenant in JS (`rows.map(...).filter(m => m.tenantId === tenantId)`), not in the WHERE clause. This leaks a cross-tenant team lookup — if a valid `teamId` from another tenant is passed, the join returns their members and the JS filter silently drops them, but the DB still executed the join and returned data across tenant boundaries.
  **Proposed changes:**
  ```ts
  export async function listMembersByTeam(tenantId: string, teamId: string): Promise<Member[]> {
    // First verify the team belongs to this tenant
    const [team] = await db.select({ id: teams.id }).from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.tenantId, tenantId)))
    if (!team) return []

    const rows = await db
      .select({ member: members })
      .from(memberTeams)
      .innerJoin(members, and(eq(members.id, memberTeams.memberId), eq(members.tenantId, tenantId)))
      .where(eq(memberTeams.teamId, teamId))
    return rows.map(r => r.member)
  }
  ```

---

#### `backend/src/divisions/router.ts` — Divisions routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All routes behind `requireAdminTokenOrClerkAdmin`. Service functions properly scoped by `tenantId`.
  **Proposed changes:** N/A

---

#### `backend/src/divisions/service.ts` — Divisions service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All CRUD operations include `tenantId` in WHERE clause. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/subjects/router.ts` — Subjects routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** The `GET /subjects/:subjectId/versions` route validates subject ownership via `tenantId` before returning versions. `listSubjects` returns only active subjects — inactive subjects are accessible via the versions endpoint only if you know the subjectId, which is fine.
  **Proposed changes:** N/A

---

#### `backend/src/subjects/service.ts` — Subjects service

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `listSubjects` only returns `active = true` subjects. The policy compiler calls `listSubjects`, which means inactive subjects are automatically excluded from compiled policies. However, `deleteSubject` hard-deletes; there is no soft-delete. If a subject is referenced in historical events or rules, the FK constraint on `events.ruleId → rules.id` and `rules.subjectId → subjects.id` will reject the delete (cascade is not defined). The router calls `deleteSubject` and swallows the error silently (no try/catch in the router) — the global error handler will return 500 with a FK error message, which is unhelpful.
  **Proposed changes:** Either add `onDelete: 'cascade'` to rules (if that's the intent) or catch FK violations in the router and return a 409 with a clear message.

---

#### `backend/src/subjects/snapshot.ts` — Subject snapshot

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Tenant isolation maintained throughout (both subject and rules queries scoped by tenantId). Version number computed with `max()` — safe for single-server but has the same TOCTOU issue as policy versioning under concurrent applies.
  **Proposed changes:** N/A

---

#### `backend/src/rules/router.ts` — Rules routes

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `GET /subjects/:subjectId/rules` calls `listRules(req.tenant.id, subjectId)` — the service queries `WHERE tenantId = ? AND subjectId = ?`, correctly scoped.
  2. `POST /subjects/:subjectId/rules` checks `isRuleKindAllowed` for the plan — but **does not validate that `subjectId` belongs to this tenant**. An admin could pass a `subjectId` from another tenant and create a rule on it. The insert will succeed because `createRule` only enforces `tenantId` on the rule row itself, not on the subject it references.
  3. `PATCH /rules/:id` sends `body` to `updateRule` without validating `kind` or `action` enum values — invalid values will cause a DB-level error.
  **Proposed changes:**
  ```ts
  // POST /subjects/:subjectId/rules — validate subjectId belongs to tenant:
  const [subject] = await db.select({ id: subjects.id }).from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.tenantId, req.tenant.id)))
  if (!subject) return reply.status(404).send({ error: 'Subject not found' })
  ```

---

#### `backend/src/rules/service.ts` — Rules service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All CRUD includes `tenantId` in WHERE. `listAllActiveRules` correctly filters `active = true`. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/site-configs/router.ts` — Site config routes

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The `domain` path parameter is used as a primary key for PATCH/DELETE. No validation that the domain is a valid hostname — a path traversal-style value like `../../admin` in the domain field could cause unexpected behavior, though in this context it only affects a Postgres query so the risk is low (parameterized query prevents injection).
  **Proposed changes:** Add a basic hostname format check (e.g. reject values containing `/`).

---

#### `backend/src/site-configs/service.ts` — Site config service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All queries scoped by `tenantId`. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/destination-groups/router.ts` — Destination groups routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All routes behind `requireAdminTokenOrClerkAdmin`, all service calls pass `tenantId`.
  **Proposed changes:** N/A

---

#### `backend/src/destination-groups/service.ts` — Destination groups service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All queries include `tenantId`. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/invites/router.ts` — Invites routes

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `POST /invites` checks `if (!req.member)` and returns 403, but this check is a business logic guard that duplicates what `requireAdminTokenOrClerkAdmin` should already enforce. If an org-token admin hits this route, `req.member` is undefined and they get a 403. The comment "Clerk auth required" is correct but the check should arguably be middleware, not inline logic.
  2. `GET /invites/:token` is a public endpoint with no rate limiting. An attacker can enumerate valid invite tokens (64-char hex, so not feasible by brute force, but worth noting).
  **Proposed changes:** N/A (acceptable as-is, document the public endpoint in API docs).

---

#### `backend/src/invites/service.ts` — Invites service

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** `acceptInvite` has a **TOCTOU race condition**: it reads the invite (checks `usedAt`, `expiresAt`) and then writes `usedAt` in two separate queries. Under concurrent accept requests (e.g. double-click), both reads could see `usedAt = null` and both inserts could succeed, creating a duplicate membership. The `tenantEmailUniq` constraint on `members` will catch duplicate memberships and throw a DB error, but the error will surface as an unhandled 500 rather than a graceful 409.
  **Proposed changes:**
  ```ts
  // Use a single atomic UPDATE with WHERE usedAt IS NULL and check rows affected:
  const updated = await db.update(invites)
    .set({ usedAt: now, usedByUserId: userId })
    .where(and(eq(invites.token, token), isNull(invites.usedAt)))
    .returning()
  if (!updated.length) return { error: 'Invite already used' }
  // Then proceed with member creation inside a transaction
  ```

---

#### `backend/src/events/router.ts` — Events routes

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The route accepts `ruleId` from the client (extension) and passes it directly to `ingestEvent`. There is **no validation that `ruleId` belongs to the tenant**. `ingestEvent` queries rules without a `tenantId` filter (see below), so a malicious extension can record events against rules from other tenants.
  **Proposed changes:** Add `tenantId` to the rule lookup in `ingestEvent`.

---

#### `backend/src/events/service.ts` — Events service

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** `ingestEvent` fetches the rule with only `WHERE rules.id = ?` — **no `tenantId` filter**. This means:
  - Any tenant with an org-token can POST `/events` with a `ruleId` from another tenant.
  - The event is inserted with the caller's `tenantId` but the rule's `reportLevel` from the foreign tenant's rule is used for the decision.
  - More critically, the event row stores the foreign `ruleId`, which breaks the analytics join integrity.
  **Proposed changes:**
  ```ts
  const [rule] = await db.select({ reportLevel: rules.reportLevel })
    .from(rules)
    .where(and(eq(rules.id, ruleId), eq(rules.tenantId, tenantId)))  // add tenantId filter

  if (!rule || rule.reportLevel === 'none') return null
  ```

---

#### `backend/src/events/policy-bus.ts` — Policy event bus

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** In-process `EventEmitter` with `maxListeners(1000)`. This works for a single-server deploy but is incompatible with multi-instance/multi-pod deployments — each instance has its own bus, so publishing on instance A does not notify SSE clients connected to instance B.
  **Proposed changes:** Document the single-instance limitation. When scaling, replace with Redis pub/sub or a similar mechanism.

---

#### `backend/src/analytics/router.ts` — Analytics routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `parseDays` safely whitelists values to `[7, 30, 90]`. All routes behind `requireAdminTokenOrClerkAdmin`.
  **Proposed changes:** N/A

---

#### `backend/src/analytics/service.ts` — Analytics service

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `getAnalyticsSummary` fires **6 separate DB queries** sequentially. All are independent and can be parallelized with `Promise.all`.
  2. `getAnalyticsDaily` fetches all events and scans for the last 7 days into memory and filters in JS. For tenants with high event volume this could be thousands of rows. A `GROUP BY date_trunc('day', occurred_at)` in SQL would be far more efficient.
  3. `getAnalyticsTopSites` fetches all siteUrl+count combinations into memory then maps to domains in JS. Fine for now but will not scale.
  4. All join queries on `events → rules → subjects` in `getAnalyticsIncidents` and `getAnalyticsBySubject` do not have a `subjects.tenantId` filter — they rely on `events.tenantId` being correct. Given the `ingestEvent` bug above (ruleId cross-tenant), this could surface wrong data.
  **Proposed changes:**
  ```ts
  // getAnalyticsSummary: parallelize
  const [scansTotal, blocked, warned, activeUsers, totalMembers, activeRulesCount] = await Promise.all([
    db.select({ v: sql<number>`count(*)` }).from(scans).where(...),
    db.select({ v: sql<number>`count(*)` }).from(events).where(...block...),
    // etc.
  ])

  // getAnalyticsDaily: use SQL date truncation
  .select({ date: sql`date_trunc('day', occurred_at)`, action: events.action, cnt: sql`count(*)` })
  .groupBy(sql`date_trunc('day', occurred_at)`, events.action)
  ```

---

#### `backend/src/audit-log/router.ts` — Audit log routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Cursor-based pagination is clean. `before` date is validated. `action` enum is validated. Limit is capped at 100.
  **Proposed changes:** N/A

---

#### `backend/src/audit-log/service.ts` — Audit log service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Tenant-scoped. `limit + 1` trick for pagination is correct. `innerJoin` on rules/subjects is correct (events should always have valid rule/subject references).
  **Proposed changes:** N/A

---

#### `backend/src/scans/router.ts` — Scans routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. No auth gap — uses `requireOrgTokenOrClerkAuth`. Returns remaining count.
  **Proposed changes:** N/A

---

#### `backend/src/scans/service.ts` — Scans service

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `recordScan` has a TOCTOU race — `countMonthlyScans` then `insert` are separate queries. Under concurrent scan requests from multiple extension users, the count check can pass for all of them before any insert is committed, allowing more scans than the limit. For free-tier with a 500/month limit this could over-count by the number of concurrent requests. An atomic approach (database-level enforcement or advisory lock) would be more correct.
  **Proposed changes:** Consider using a `INSERT ... SELECT WHERE count < limit` pattern or Redis atomic counter for scan tracking.

---

#### `backend/src/billing/router.ts` — Billing routes

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `POST /billing/free-signup` and `POST /billing/stripe/checkout` and `POST /billing/paypal/checkout` are **public unauthenticated endpoints** with no rate limiting. These are open to abuse (spam tenant creation, Stripe API hammering).
  2. `POST /billing/stripe/checkout` validates `plan === 'business' && seatCount < 10` but does not validate `seatCount` is a positive integer at all — `seatCount: -1` or `seatCount: NaN` would pass and reach Stripe.
  **Proposed changes:**
  ```ts
  if (!Number.isInteger(seatCount) || seatCount < 1) {
    return reply.status(400).send({ error: 'seatCount must be a positive integer' })
  }
  ```
  Add rate limiting middleware on public billing endpoints.

---

#### `backend/src/billing/service.ts` — Billing service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `freeTierSignup` fires-and-forgets the welcome email (`.catch(() => {})`), which is intentional to avoid blocking. `activateTenant` returns the plaintext tokens only at creation time — correct.
  **Proposed changes:** N/A

---

#### `backend/src/billing/limits.ts` — Plan limits

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean enumeration of plan limits. `isOverScanLimit` and `isOverSeatLimit` correctly handle `-1` as unlimited. `isRuleKindAllowed` type-widens to `string[]` cleanly.
  **Proposed changes:** N/A

---

#### `backend/src/billing/stripe.ts` — Stripe integration

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `STRIPE_SKIP_SIG_VERIFY === 'true'` bypasses webhook signature verification. This is fine for testing but the guard should fail loudly in production. There is no check that this flag cannot be set in prod.
  2. `handleStripeEvent` creates a new `Stripe` instance on every webhook call (via `stripe()` function). The Stripe SDK recommends reusing the client instance.
  3. `customer.subscription.updated` handler updates tenant metadata (trial end, seat count) but does not update the `plan` field if a plan upgrade/downgrade happens — Stripe's subscription update can change the plan's price ID, but this is not reflected in the `tenants.plan` column.
  **Proposed changes:**
  - Move Stripe client to module-level singleton.
  - Add plan update handling in `customer.subscription.updated` by mapping the new price ID to a plan name.
  - Add a check: `if (process.env.NODE_ENV === 'production' && process.env.STRIPE_SKIP_SIG_VERIFY === 'true') throw new Error('Stripe sig verification must not be skipped in production')`.

---

#### `backend/src/billing/paypal.ts` — PayPal integration

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **No webhook signature verification**. `handlePayPalEvent` accepts any POST body and trusts `event_type` and `resource` fields. PayPal provides a webhook signature verification mechanism (via `PAYPAL-TRANSMISSION-ID`, `PAYPAL-TRANSMISSION-TIME`, `PAYPAL-TRANSMISSION-SIG` headers + certificate). Without it, anyone who knows the webhook URL can activate tenants for free, cancel subscriptions, or forge payment events.
  2. `getAccessToken` fails silently if `PAYPAL_CLIENT_ID`/`PAYPAL_CLIENT_SECRET` are not set — the `Buffer.from()` would use `undefined:undefined` and base64-encode it, causing a 401 from PayPal with a confusing error.
  3. `parseCustomId` uses `|` as a delimiter but tenant names can contain `|` characters, causing parse failure.
  **Proposed changes:**
  - Implement PayPal webhook signature verification using their webhook event validation API or local certificate check.
  - Validate env vars at startup.
  - Use a more robust encoding for `customId` (e.g. JSON or base64).

---

#### `backend/src/billing/email.ts` — Welcome email

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `createTransport()` is called fresh on every `sendWelcomeEmail` invocation. Nodemailer transports maintain a connection pool internally; creating a new one each time discards that pool and reconnects. For low-volume welcome emails this is acceptable, but it wastes a TCP handshake per email.
  **Proposed changes:** Move `createTransport()` to module scope as a singleton.

---

#### `backend/src/webhooks/clerk.ts` — Clerk webhook handler

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. In `user.created`, the auto-provision path inserts the tenant with `orgTokenHash` and `adminTokenHash` but **does not send a welcome email** with the generated tokens. The user created via Clerk (not via free-signup or Stripe) gets a tenant but has no way to retrieve their tokens. The `seed-fintech` script replicates this pattern intentionally, but for real auto-provisioned users this is a product gap.
  2. The `user.created` handler has no idempotency protection — if the Clerk webhook fires twice (Clerk guarantees at-least-once delivery), the second call will fail on `createUser` (caught by `onConflictDoNothing`) but then re-check `alreadyEnrolled` using the newly-created user's ID, which will find the member and break correctly. This path is actually safe.
  3. The auto-provisioned tenant is created with no `paymentProvider`, `externalSubId`, `subscriptionStatus` defaulting to `active`, `plan` defaulting to `free`. This is intentional free-tier signup via Clerk — but it means a user who signs up via Clerk AND also goes through the Stripe checkout would get two tenants.
  **Proposed changes:** After auto-provisioning, emit tokens via email (call `sendWelcomeEmail` or store them somewhere the user can retrieve them). Currently the Clerk-auto-provisioned tenant tokens are created and silently discarded.

---

#### `backend/src/assistant/router.ts` — Assistant routes

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. `POST /assistant/apply` fetches `chatMessages` by `messageId` with **no `tenantId` filter**: `db.select().from(chatMessages).where(eq(chatMessages.id, messageId))`. An admin from tenant A could supply a `messageId` belonging to tenant B's chat session, and if that message has actions, those actions would be executed against tenant A's data (since `executeActions` uses `req.tenant.id`). This is a partial isolation breach — the actions execute in the correct tenant, but the message that triggered them belongs to another tenant, creating audit trail confusion and enabling replay of another tenant's LLM-generated actions.
  2. `POST /assistant/messages/:messageId/revert` iterates `versions` and checks `ver.tenantId !== req.tenant.id` — this check is done in a loop and returns 403 on the first violation, but prior iterations (that passed the check) have already mutated data. This means a partially-reverted state is possible if a mixed set of versions is returned (though in practice all versions for a messageId should belong to one tenant).
  3. The `revert` endpoint does `db.delete(rulesTable).where(eq(rulesTable.subjectId, ver.subjectId))` — this deletes ALL rules for the subject, not just those created by the assistant message. If rules were manually added after the AI apply but before the revert, they are silently deleted. This is a data loss scenario.
  **Proposed changes:**
  ```ts
  // POST /assistant/apply — add tenantId check:
  const [session] = await db.select({ tenantId: chatSessions.tenantId })
    .from(chatSessions)
    .innerJoin(chatMessages, eq(chatMessages.sessionId, chatSessions.id))
    .where(and(eq(chatMessages.id, messageId), eq(chatSessions.tenantId, req.tenant.id)))
  if (!session) return reply.status(404).send({ error: 'Message not found' })

  // revert: fetch versions with tenantId pre-filter:
  const versions = await db.select().from(subjectVersions)
    .where(and(
      eq(subjectVersions.conversationMsgId, messageId),
      eq(subjectVersions.tenantId, req.tenant.id),
    ))
  ```

---

#### `backend/src/assistant/service.ts` — Assistant service

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `sendMessage` does not verify that the provided `sessionId` belongs to the same tenant. An admin from tenant A could pass a `sessionId` from tenant B — the history and snapshot from tenant A would be used, but the messages would be appended to tenant B's session.
  2. `fetchSnapshot` calls `listSubjects(tenantId)` which only returns active subjects. Inactive subjects are not visible to the LLM — this is intentional and correct.
  3. The `getMessages` function is safe — it checks `session.tenantId !== tenantId`.
  **Proposed changes:**
  ```ts
  // sendMessage: validate sessionId belongs to tenant
  if (sessionId) {
    const [session] = await db.select({ tenantId: chatSessions.tenantId })
      .from(chatSessions).where(eq(chatSessions.id, sessionId))
    if (!session || session.tenantId !== tenantId) {
      throw Object.assign(new Error('Session not found'), { statusCode: 404 })
    }
  }
  ```

---

#### `backend/src/assistant/apply.ts` — Action executor

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `assign_member_team` and `remove_member_team` call `assignTeam`/`removeTeam` without tenant validation (same issue as in `members/service.ts`).
  2. `executeActions` catches all errors per-action and continues. This means a partially-applied set of actions is possible with no rollback. The snapshot taken before apply enables manual revert, but the apply result `{ applied, errors }` mixes successes and failures without a clear overall status.
  3. There is no billing plan check on `create_rule` for the plan-restricted rule kinds (`entropy`, `score` on free/starter plans). The router checks this for manual rule creation, but the assistant apply path bypasses it.
  **Proposed changes:**
  - Add plan check in `executeActions` for `create_rule`:
    ```ts
    case 'create_rule': {
      const [tenant] = await db.select({ plan: tenants.plan }).from(tenants).where(eq(tenants.id, tenantId))
      if (!isRuleKindAllowed(tenant!.plan as Plan, action.kind)) {
        throw new Error(`Rule kind '${action.kind}' not allowed on this plan`)
      }
      // ...
    }
    ```

---

#### `backend/src/assistant/prompt.ts` — System prompt builder

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** The prompt includes member IDs and emails in the CURRENT STATE section, but the guardrail #5 (DATA_EXFILTRATION_GUARD) is a soft-instruction, not a hard technical control. This is acceptable for an LLM-based system. The prompt injection guardrails (rules 1–6) are comprehensive. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/assistant/versioning.ts` — Subject ID resolver for versioning

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `resolveAffectedSubjectIds` correctly scopes the rules lookup by `tenantId`. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/assistant/llm/interface.ts` — LLM interface

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean type definitions. `Action` union is well-structured.
  **Proposed changes:** N/A

---

#### `backend/src/assistant/llm/anthropic.ts` — Anthropic LLM adapter

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `parseResponse` uses a greedy regex `/\{[\s\S]*\}/` to extract JSON from the model response. If the model returns multiple JSON objects or has a `}` in a string value, the greedy match could pick up the wrong JSON boundaries. Anthropic's API supports structured output / tool use which would be more reliable.
  2. No timeout configured on the API call — a hung LLM request will block the Fastify handler indefinitely.
  **Proposed changes:** Add `signal: AbortSignal.timeout(30_000)` to the API call.

---

#### `backend/src/assistant/llm/openai.ts` — OpenAI LLM adapter

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Uses `response_format: { type: 'json_object' }` — more reliable than regex extraction. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/assistant/llm/groq.ts` — Groq LLM adapter

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Reuses OpenAI `parseResponse` correctly. Clean.
  **Proposed changes:** N/A

---

#### `backend/src/users/service.ts` — Users service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `createUser` with `onConflictDoNothing` + fallback `getUserByEmail` is a clean idempotency pattern. `claimPendingMembers` correctly uses `isNull` to only update unlinked members.
  **Proposed changes:** N/A

---

#### `backend/src/platform/router.ts` — Platform admin routes

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `addHook('preHandler', requirePlatformAdmin)` applies to all routes in the plugin — the hook applies correctly in Fastify's scoping model. The `requirePlatformAdmin` middleware resolves `req.tenant` from the `:tenantId` param, so all tenant-scoped operations are correctly isolated.
  **Proposed changes:** N/A

---

#### `backend/src/platform/service.ts` — Platform service

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `listAllTenants` uses a LEFT JOIN + GROUP BY to get member count in one query — correct and efficient.
  **Proposed changes:** N/A

---

#### `backend/src/logger/index.ts` — Logger

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Singleton pattern, TTY detection for pretty vs JSON transport, correct stderr routing for errors/warns.
  **Proposed changes:** N/A

---

#### `backend/src/logger/request-logging.ts` — Request logging plugin

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** Every request generates 2 log lines (onRequest + onResponse). High-volume health check polling (`GET /health`) will flood logs. Consider skipping logging for `/health`.
  **Proposed changes:**
  ```ts
  app.addHook('onRequest', async (request) => {
    if (request.url === '/health') return
    logger.info('Request Started', { ... })
  })
  ```

---

#### `backend/src/scripts/seed-e2e.ts` — E2E seed script

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The script does a full table truncation in dependency order without using `TRUNCATE ... CASCADE` or a transaction. If it fails mid-way, the DB is left in a partial state.
  2. `subjectVersions` table is not deleted in the teardown order — it will fail with a FK violation if `subjects` has cascade disabled. Checking the schema, `subjectVersions.subjectId` has `onDelete: 'cascade'`, so deleting subjects will cascade. But the explicit truncation in the seed doesn't delete `subjectVersions` before `subjects`, relying on cascade — this is fine but implicit.
  **Proposed changes:** N/A (acceptable for a dev script, but wrapping in a transaction would be safer).

---

#### `backend/src/scripts/seed-fintech.ts` — Fintech demo seed

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `ADMIN_EMAIL = 'yarin0600@gmail.com'` is hardcoded. This is a dev/demo script so it is acceptable, but it should be moved to an env var for portability.
  2. The seed inserts events directly into the `events` table bypassing `ingestEvent`'s `reportLevel` check — all events are inserted regardless of the rule's `reportLevel`. This is intentional for demo data seeding.
  3. Per-event insert in a loop (`for (const e of eventBatch) await db.insert(events).values(e)`) — slow for ~80 events. Could batch with `db.insert(events).values(eventBatch)`.
  **Proposed changes:** Use `ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'yarin0600@gmail.com'` for portability.

---

#### `backend/src/scripts/teardown-e2e.ts` — E2E teardown script

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** Does not delete `users` table rows — unlike `seed-e2e.ts` which deletes users. This inconsistency means the teardown leaves orphaned user rows that `seed-e2e.ts` will fail to re-insert (due to `clerkId` unique constraint) if run again without a full teardown including users.
  **Proposed changes:** Add `await db.delete(users)` to teardown, matching the seed script.

---

#### `backend/scripts/seed-tenant.ts` — Quick tenant seed script

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Simple one-off script using `activateTenant`. Tokens are printed to stdout — this is intentional for local dev use.
  **Proposed changes:** N/A

---

#### `backend/src/types.ts` — Fastify type augmentation

- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `tenant: Tenant` (non-optional) means TypeScript believes `req.tenant` is always defined. But on public/unauthenticated routes (e.g. `GET /health`, `GET /invites/:token`, the billing checkout endpoints), `req.tenant` is never set and would throw at runtime if accessed. This is a type-lie — any handler that does `req.tenant` on a public route will throw a runtime error that TypeScript won't warn about.
  **Proposed changes:**
  ```ts
  interface FastifyRequest {
    tenant:        Tenant         // set by auth middleware — accessing on public routes throws
    // OR make it optional:
    tenant?:       Tenant
  }
  ```
  Making it optional would require adding null checks in all authenticated handlers, which is annoying but more honest. Alternatively, document that `req.tenant` is only valid in authenticated handlers.

---

## Summary Table

| File | Verdict |
|------|---------|
| `app.ts` | WARN |
| `index.ts` | PASS |
| `auth/middleware.ts` | WARN |
| `auth/tokens.ts` | PASS |
| `db/schema.ts` | WARN |
| `db/client.ts` | WARN |
| `db/migrate.ts` | PASS |
| `policy/router.ts` | ISSUE |
| `policy/service.ts` | WARN |
| `policy/compiler.ts` | PASS |
| `policy/resolver.ts` | WARN |
| `tenants/router.ts` | PASS |
| `tenants/service.ts` | PASS |
| `members/router.ts` | ISSUE |
| `members/service.ts` | WARN |
| `teams/router.ts` | WARN |
| `teams/service.ts` | ISSUE |
| `divisions/router.ts` | PASS |
| `divisions/service.ts` | PASS |
| `subjects/router.ts` | PASS |
| `subjects/service.ts` | WARN |
| `subjects/snapshot.ts` | PASS |
| `rules/router.ts` | WARN |
| `rules/service.ts` | PASS |
| `site-configs/router.ts` | WARN |
| `site-configs/service.ts` | PASS |
| `destination-groups/router.ts` | PASS |
| `destination-groups/service.ts` | PASS |
| `invites/router.ts` | WARN |
| `invites/service.ts` | ISSUE |
| `events/router.ts` | WARN |
| `events/service.ts` | ISSUE |
| `events/policy-bus.ts` | WARN |
| `analytics/router.ts` | PASS |
| `analytics/service.ts` | WARN |
| `audit-log/router.ts` | PASS |
| `audit-log/service.ts` | PASS |
| `scans/router.ts` | PASS |
| `scans/service.ts` | WARN |
| `billing/router.ts` | WARN |
| `billing/service.ts` | PASS |
| `billing/limits.ts` | PASS |
| `billing/stripe.ts` | WARN |
| `billing/paypal.ts` | ISSUE |
| `billing/email.ts` | WARN |
| `webhooks/clerk.ts` | WARN |
| `assistant/router.ts` | ISSUE |
| `assistant/service.ts` | WARN |
| `assistant/apply.ts` | WARN |
| `assistant/prompt.ts` | PASS |
| `assistant/versioning.ts` | PASS |
| `assistant/llm/interface.ts` | PASS |
| `assistant/llm/anthropic.ts` | WARN |
| `assistant/llm/openai.ts` | PASS |
| `assistant/llm/groq.ts` | PASS |
| `users/service.ts` | PASS |
| `platform/router.ts` | PASS |
| `platform/service.ts` | PASS |
| `logger/index.ts` | PASS |
| `logger/request-logging.ts` | WARN |
| `scripts/seed-e2e.ts` | WARN |
| `scripts/seed-fintech.ts` | WARN |
| `scripts/teardown-e2e.ts` | WARN |
| `scripts/seed-tenant.ts` | PASS |
| `types.ts` | WARN |

**PASS: 27 | WARN: 28 | ISSUE: 8**

---

## Top 5 Most Important Issues

### 1. `events/service.ts` — Cross-tenant rule reference in event ingestion (ISSUE)
`ingestEvent` fetches the rule with no `tenantId` filter. Any org-token holder can POST `/events` with a rule ID from another tenant. The event lands in their own tenant's analytics but with a foreign `ruleId`, corrupting analytics joins (audit-log, incidents, by-subject all do `events → rules → subjects` joins). Fix: add `eq(rules.tenantId, tenantId)` to the rule lookup.

### 2. `billing/paypal.ts` — No PayPal webhook signature verification (ISSUE)
Anyone who discovers the webhook URL can POST a `BILLING.SUBSCRIPTION.ACTIVATED` event with a crafted payload and get a free tenant activation with business-plan access. PayPal provides cryptographic webhook verification — it must be implemented. This is the most severe security gap.

### 3. `assistant/router.ts` — `POST /assistant/apply` does not verify message belongs to caller's tenant (ISSUE)
A tenant A admin can apply a chat message from tenant B's session by guessing/knowing its UUID. The actions execute in tenant A (so no direct data leakage to tenant B), but it enables replay of another tenant's LLM-generated policy changes and corrupts the audit trail. Fix: join through `chatSessions` with `tenantId` filter before trusting the message.

### 4. `members/router.ts` + `teams/service.ts` — Cross-tenant team assignment (ISSUE)
`assignTeam` accepts any `teamId` without verifying it belongs to the same tenant. An admin can assign their members to a team from another tenant, which corrupts the `memberTeams` join table and causes cross-tenant data to appear in `listMembersByTeam`. The JS-filter workaround in `listMembersByTeam` masks but does not fix the underlying isolation breach.

### 5. `invites/service.ts` — TOCTOU on invite acceptance allows duplicate membership creation (ISSUE)
Concurrent `POST /invites/:token/accept` calls (e.g. double-submit) can both pass the `usedAt IS NULL` check and both attempt to insert a member. The `tenantEmailUniq` constraint will throw a DB error on the second insert, surfacing as an unhandled 500 instead of a graceful 409. Use a single atomic `UPDATE ... WHERE usedAt IS NULL` and check rows affected before proceeding with member insertion.
