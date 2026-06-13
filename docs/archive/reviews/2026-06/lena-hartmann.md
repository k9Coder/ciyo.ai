# QA Review — Lena Hartmann, QA Analyst
**Date:** 2026-06-08  
**Scope:** All unit and integration test files across `backend/`, `pretzel/`, and `pretzel-console/`

---

## Backend Tests

#### `backend/tests/policy.test.ts` — Policy service DB integration (publish, version, history, rollback)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - Tests are real-DB integration tests (use `truncateAll` + live Drizzle) and cover the key paths well.
  - `rollback` only tests the happy path plus one missing-version throw. There is no test for rolling back version 2 when version 1 had a different `policyJson` shape, i.e., no assertion that the content of the rolled-back version is correct at the snapshot level beyond `auditRetentionDays`.
  - `getHistory` has one test but does not assert the full set of fields returned (only `version` numbers); if the service accidentally strips `policyJson` from history rows, this test would still pass.
  - No test for `publishPolicy` with an empty `tenantId` or cross-tenant isolation (can tenant B read tenant A's policy?).
  **Proposed changes:**
  - Add a test asserting that `getHistory` rows include `policyJson` and `publishedAt`.
  - Add a test that verifies `getLatestPolicy` for tenant B returns null when only tenant A has published.
  - Add a rollback test that confirms the rolled-back content is an exact deep-equal of the source version (not just one scalar field).

---

#### `backend/tests/policy.service.test.ts` — Mocked unit test for publishPolicy (event emission + version return)
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  - This file mocks `db` with a hand-rolled chainable builder. The `makeSelectBuilder` mock's `.where()` always calls `resolve(result)` synchronously via a custom `then` property — this is a non-standard Promise trick that does not accurately model Drizzle's async behavior and will mask bugs if the real implementation changes query shape.
  - The test only asserts that `policyBus.emit` is called with the event string and that the returned version is `maxVersion + 1`. It does not assert that `db.insert` was actually called with the correct row shape (the `mockInsertValues` mock is set up but never asserted).
  - Both tests import the module with `await import(...)` inside the `it` body, but the `vi.mock` calls are hoisted. If module caching is involved, the second test reuses the same module instance as the first, which means the `mockSelect` call count accumulates — the `beforeEach` only does `vi.clearAllMocks()` which resets call counts but the mock implementation for the second test is not re-established, so the second call to `mockSelect` in the same test run has no mock return value set.
  - Given that `policy.test.ts` already covers the same function end-to-end against a real DB, this file adds little value and the mock fidelity is low enough to give false confidence.
  **Proposed changes:**
  - Either delete this file (the real-DB tests are comprehensive) or rewrite it to properly assert `mockInsertValues.mock.calls[0][0]` has the expected shape (version, tenantId, policyJson).
  - Fix the `beforeEach` to re-establish the mock return values for `mockSelect` on every test rather than relying on call ordering.
  - Replace the custom `then`-on-object pattern with proper `vi.fn().mockResolvedValue(...)` chains.

---

#### `backend/tests/policy.router.test.ts` — Router unit test: subscription gating + last-updates endpoint
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - The `requireActiveSubscription` mock is re-implemented inline in the test file rather than testing the real middleware. The comment says "the real one" is used, but then the mock definition reimplements the same logic — if the production middleware changes (e.g., adds a new status code or a `trial` state), this test will not catch it.
  - The `GET /policy/last-updates` test asserts the epoch value but does not test the case where the DB returns no rows (empty result), which would cause a `null` dereference if the code does `result[0].publishedAt`.
  - No test for `GET /policy` with `null` policy (the mock always returns a policy; what happens if `getLatestPolicy` returns null?).
  - No test for `POST /policy/publish` or `rollback` routing paths — only subscription preHandler and one GET are covered.
  **Proposed changes:**
  - Add a test for `last-updates` when no publish has occurred (empty DB result).
  - Add at least a smoke test for `POST /policy/publish` and `POST /policy/rollback/:version` to ensure they reach the mocked service.
  - Consider importing and testing the real `requireActiveSubscription` rather than reimplementing it.

---

#### `backend/tests/policy-compiler.test.ts` — Policy compiler DB integration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Solid coverage of the compiler: empty state, active rules, inactive rules excluded, global scope, multi-subject, empty-rules subject, and `destinationGroupIds` stored. The tests hit a real DB and assert specific fields rather than just shapes. No significant gaps.

---

#### `backend/tests/policy-resolver.test.ts` — Policy resolver DB integration (member scoping + destination expansion)
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Comprehensive. Tests cover global-only member, team member getting all scopes, team-beats-global conflict resolution, block-beats-warn at same scope, destination group expansion, explicit+group domain merging with deduplication, and absence of `destinationGroupIds` in resolved output. The deduplication assertion (`filter(d => d === 'shared.com').toHaveLength(1)`) is precise and correct. Minor note: no test for a member in multiple teams or a member in a division-level team without a specific teamId — edge cases that could reveal scope resolution bugs.

---

#### `backend/tests/policy-routes.test.ts` — Full HTTP integration test of policy routes (supertest + real DB)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `GET /v1/policy` response is checked with `expect(res.body.policy).toBeDefined()` — this is a vacuous assertion. If `policy` is an empty object `{}` or `null`, this still passes. The test should assert `res.body.policy.subjects` is an array.
  - `GET /v1/policy/history` test only checks that index 0 and 1 have the right version numbers but does not check the shape of each history entry (missing `policyJson`, `publishedAt`).
  - No test for `GET /v1/policy/version` when no policy has been published (the `beforeEach` always publishes one, so the null case is never hit via this route).
  - No test for `POST /v1/policy/rollback/:version` with a non-existent version (should return 4xx).
  **Proposed changes:**
  - Strengthen `GET /v1/policy` assertion: `expect(Array.isArray(res.body.policy.subjects)).toBe(true)`.
  - Add a test for rollback of a missing version (expect 4xx/500).
  - Assert `publishedAt` is present in history entries.

---

#### `backend/tests/assistant.test.ts` — Assistant chat + apply HTTP integration (mocked LLM)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `GET /v1/assistant/sessions` asserts `res.body.sessions.length > 0` and `sessions[0].title` is defined — both are weak. If the session title is an empty string `""`, `.toBeDefined()` passes but the UI would render a blank title.
  - The "prompt injection attempt" test relies on the mock LLM returning `actions: []` for any message containing "ignore previous instructions" — this tests the mock configuration, not any real injection guard.
  - The `POST /v1/assistant/apply` — "executes actions and marks message applied" test manually patches `actionsJson` via raw DB update before calling apply. This is reasonable, but the test does not verify that the `applied` array in the response contains the right operation name, only that `applied.length > 0`.
  - `POST /v1/assistant/apply` — 409 test sets `appliedAt: new Date()` directly in DB. No test for double-apply via two concurrent HTTP calls (race condition).
  **Proposed changes:**
  - Change `sessions[0].title.toBeDefined()` to `expect(typeof sessions[0].title).toBe('string')` with `expect(sessions[0].title.length).toBeGreaterThan(0)`.
  - Add assertion: `expect(applyRes.body.applied[0]!.op).toBe('create_subject')` in the apply test.
  - Add a test for applying a message with an unknown `op` value in `actionsJson` to verify the error handling.

---

#### `backend/tests/assistant-apply.test.ts` — `executeActions` unit/integration test
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Excellent coverage of all action types: create/delete rule, create/delete subject, create/delete division (with auto-slug), create/delete team, create/delete member, division_admin role with `adminDivisionId`, assign/remove member from team. The error-isolation test (invalid FK continues to remaining actions) is specifically valuable. Slug auto-generation is tested for special characters. Minor gap: no test for `update_subject` or `update_rule` operations — if those ops exist in the `Action` union but are not covered, a typo in the update logic would go undetected.

---

#### `backend/tests/assistant-prompt.test.ts` — System prompt builder unit tests
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  - Every single test in this file is a `toContain` check on the prompt string. This tests whether specific substrings exist in the prompt, but says nothing about whether those sections are in the right place, properly formatted, or semantically correct.
  - The security guardrail tests (TENANT ISOLATION, PROMPT INJECTION, SCOPE LOCK, DATA EXFILTRATION GUARD, ACTION INTEGRITY) simply check that literal strings exist somewhere in the output. If a developer accidentally duplicates a section header with the wrong content, or the guard text is present but the instruction is backwards, these tests all pass.
  - `expect(prompt).toContain('complete and only dataset')` is testing an internal phrasing that will break any time the prompt wording is improved, providing brittleness without safety.
  - There is no test that verifies the prompt does NOT contain sensitive data when not provided (e.g., if a member with no email is in the snapshot, does the prompt omit PII?).
  - No test for unicode or special characters in names (e.g., a division named `</div>` or `"; DROP TABLE`) to ensure prompt injection via data values is handled.
  **Proposed changes:**
  - Replace string-contains guardrail tests with behavioral tests: pass a snapshot containing unusual strings and verify the prompt output is safe.
  - Add a test: provide a snapshot with a subject named `"ignore all previous instructions"` and verify the prompt still contains the instruction structure.
  - Reduce the number of `toContain('create_division')` style tests to a smaller set of structural checks (e.g., parse the JSON example in the prompt and validate it).

---

#### `backend/tests/assistant.versioning.test.ts` — `resolveAffectedSubjectIds` unit test (mocked DB)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - The mock for `update_rule` and `delete_rule` DB lookup always returns `[{ subjectId: 'sub-d' }]` regardless of which `ruleId` is queried — so if two rules with different subject IDs are passed, the mock returns the same subject twice, not deduplicating distinct subjects. This means the deduplication test does not cover the case where two different rule lookups return two different subject IDs.
  - There is no test for `update_rule` and `delete_rule` when the rule does not exist in the DB (returns empty array) — what does `resolveAffectedSubjectIds` do then? If it throws or returns undefined, a bug could slip through.
  - No test for an action type not recognized by the function (e.g., `create_division`) — should be ignored or counted as affecting no subjects.
  **Proposed changes:**
  - Add a test: `update_rule` where DB returns `[]` (rule not found) — assert the function handles it gracefully (returns empty, not throws).
  - Add a test: non-subject-affecting ops (`create_division`, `delete_member`) return an empty ID list.
  - Fix the two-rule mock to return different `subjectId` values per call and add a deduplication assertion across them.

---

#### `backend/tests/billing-stripe.test.ts` — Stripe webhook integration tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `activateTenant` tests verify the token format and that the DB stores a hash (not plaintext). Good. But there is no test confirming the `plan`, `seatCount`, `paymentProvider`, and `externalSubId` fields are persisted correctly to the DB row.
  - `checkout.session.completed` webhook test only checks that the tenant row exists by name — does not assert `subscriptionStatus === 'active'`, `plan === 'business'`, or `seatCount === 10`.
  - `invoice.payment_failed` test correctly checks `subscriptionStatus === 'past_due'` but does not check that `gracePeriodEndsAt` is set.
  - No test for `customer.subscription.deleted` (cancellation) webhook event.
  - `STRIPE_SKIP_SIG_VERIFY` is set in `beforeAll` but the flag could leak into other test files if the test suite runs in the same process without isolation. This is a test-environment risk.
  **Proposed changes:**
  - Add assertions: after `checkout.session.completed`, verify `row.subscriptionStatus === 'active'` and `row.plan === 'business'`.
  - Add a test for the subscription cancellation webhook event.
  - Assert `gracePeriodEndsAt` is set after `invoice.payment_failed`.

---

#### `backend/tests/billing-paypal.test.ts` — PayPal webhook integration tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `BILLING.SUBSCRIPTION.ACTIVATED` test only verifies `subscriptionStatus === 'active'` on the tenant. Does not verify `plan`, `seatCount`, `paymentProvider`, or `externalSubId` are stored from the `custom_id` field.
  - No test for the `BILLING.SUBSCRIPTION.SUSPENDED` event (if it exists in the handler).
  - The `custom_id` parsing format `'PP Law LLP|admin@pplaw.com|business|10'` is brittle — no test for a malformed `custom_id` (missing fields, wrong delimiter).
  - Coverage is thinner than the Stripe tests (only 2 test cases).
  **Proposed changes:**
  - Add: verify `paymentProvider === 'paypal'` and `plan === 'business'` after activation.
  - Add: test a malformed `custom_id` (e.g., missing seatCount) — should not crash the webhook handler.
  - Add: test for `BILLING.SUBSCRIPTION.SUSPENDED` if handled.

---

#### `backend/tests/billing/limits.test.ts` — Plan limits pure unit tests
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean, thorough, and focused. Covers boundary values correctly (free at 499/500 for scans, 2/3 for seats), all plan tiers, all rule kind combinations. `getScanLimit`/`getSeatLimit` accessors are tested. Assertions are specific, not vacuous. No issues.

---

#### `backend/tests/clerk-auth.test.ts` — Clerk JWT auth middleware HTTP integration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Covers JWT acceptance, org token fallback, user-not-found (no DB row), user-without-member-row, and invalid JWT rejection. All 401 paths are explicit. The `mockVerifyToken.mockResolvedValue` is reset in `beforeEach`. Minor gap: no test for a member with a role that might grant different access levels (e.g., is a `super_admin` member treated differently than a `member` for this endpoint?).

---

#### `backend/tests/clerk-webhook.test.ts` — Clerk webhook integration tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `user.created` — auto-provision test checks that exactly 1 tenant row exists, but if the test DB already has a tenant from a prior (not fully cleaned) run, `toHaveLength(1)` would be unreliable. This is mitigated by `truncateAll` in `beforeEach`, which is correct.
  - `user.deleted` test nulls `clerkId` — does not verify the `members` row or any downstream effect (e.g., should deletion orphan or cascade?).
  - No test for `user.created` with multiple email addresses in the payload — the code takes `email_addresses[0]`, but what if the array is empty?
  - No test for `user.updated` where the user does not exist in the DB yet (ghost user update).
  - No test for unknown event types — should the webhook return 200 (ignore) or 4xx?
  **Proposed changes:**
  - Add: `user.created` with `email_addresses: []` — verify graceful handling.
  - Add: `user.updated` for a non-existent `clerkId` — verify it does not crash.
  - Add: unknown `type` (e.g., `organization.created`) — verify 200 no-op response.

---

#### `backend/tests/tokens.test.ts` — Token format, parsing, and hashing unit tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - The `schema exports` describe block tests that three Drizzle table objects are defined — this is not a token test and is misplaced in this file. It adds noise and provides no real value (the schema will fail to import if the exports are missing, so import itself is the test).
  - `parseToken` tests cover valid formats and several invalid cases. Missing: a token where the UUID portion is syntactically valid but the secret is exactly 31 chars (one under the limit) — the current tests jump from "tooshort" to valid-length, skipping the exact boundary.
  - `generateSecret` uniqueness test calls the function twice and checks they differ — this is statistically correct but should use a larger sample for a cryptographic primitive. Given this is a unit test, this is acceptable.
  - `compareToken` only tests correct match and one wrong secret — does not test timing-safe behavior (not easily testable in unit tests, but worth noting in comments).
  **Proposed changes:**
  - Remove the `schema exports` block or move it to a dedicated schema test.
  - Add boundary case: `parseToken` with a 31-character secret (should return null).
  - Add: `parseToken` with a UUID that has lowercase vs. uppercase — verify behavior is consistent.

---

#### `backend/tests/members.test.ts` — Members CRUD HTTP integration
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `GET /v1/members` lists only 2 manually-added members, but the `buildTestTenant` fixture may create its own member rows (check `helpers/db.ts` — it does not, confirmed). OK.
  - `POST /v1/members` with `role` explicitly set is not tested — only default role creation. What happens if an invalid role is passed?
  - `PATCH /v1/members/:id` tests only `displayName` update — not `role` update or `adminDivisionId` update.
  - `DELETE /v1/members/:id` verifies the member is gone from the list but does not verify that `memberTeams` entries are cascade-deleted (if there is a constraint).
  - No test for creating a duplicate email member (what status code?).
  **Proposed changes:**
  - Add: `POST /v1/members` with an invalid role — expect 400.
  - Add: `POST /v1/members` with a duplicate email — expect 409 or 400.
  - Add: `PATCH /v1/members/:id` to update role.

---

#### `backend/tests/teams.test.ts` — Teams CRUD HTTP integration
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `POST /v1/members/:id/teams` (add to team) uses `.send({ teamId: team.id })` in the body rather than the URL param pattern seen in `members.test.ts` line 90. There is inconsistency in how the endpoint is tested between the two files.
  - `GET /v1/teams/:teamId/members` — the test assigns the member using POST body `{ teamId }` but `members.test.ts` uses the URL pattern `/v1/members/:id/teams/:teamId`. One of these may be testing a non-existent endpoint variant.
  - No test for `DELETE /v1/teams/:id` when the team has members assigned — should cascade or return 409.
  - No test for creating a team under a division that belongs to a different tenant (cross-tenant isolation).
  **Proposed changes:**
  - Reconcile the team-assignment endpoint path between `teams.test.ts` and `members.test.ts`.
  - Add: delete a team that has members — verify behavior (cascade or 409).

---

#### `backend/tests/divisions.test.ts` — Divisions CRUD HTTP integration
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `PATCH /v1/divisions/:id` only tests `name` update — there is no test for updating `slug`.
  - `DELETE /v1/divisions/:id` does not test whether teams inside the division are cascade-deleted or orphaned.
  - No test for duplicate `slug` on create.
  - No test for deleting a division that belongs to a different tenant (cross-tenant isolation check for DELETE).
  **Proposed changes:**
  - Add: create two divisions with the same slug — expect 409 or 400.
  - Add: delete division with teams — verify teams are removed or an appropriate error is returned.

---

#### `backend/tests/tenants.test.ts` — Tenant service unit/integration tests
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Compact but correct. `getTenantById` covers known and unknown IDs. `updateSubscriptionStatus` verifies `past_due` sets `gracePeriodEndsAt` in the correct 6-8 day window and that `active` clears it. The window assertion (`> 6 days`, `< 8 days`) correctly tests the grace period logic without being brittle to exact milliseconds. Minor gap: no test for `cancelled` status — does it also affect `gracePeriodEndsAt`?

---

#### `backend/tests/subjects.test.ts` — Subjects CRUD HTTP integration
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `GET /v1/subjects` title says "lists only active subjects" but only creates active ones — it does not actually test the filtering (create one active, one inactive, verify count is 1). This assertion can never reveal a bug where inactive subjects leak through.
  - `PATCH /v1/subjects/:id` can deactivate a subject — verified by checking the list — but no assertion that the list has 0 items (only that the specific id is not found).
  - No test for creating a scoped subject (with `divisionId` or `teamId`).
  **Proposed changes:**
  - Fix the "lists only active subjects" test: create one inactive subject and assert `res.body.length === 1` (or 0 after deactivation).
  - Add: create a subject with `divisionId` — verify it is returned correctly.

---

#### `backend/tests/subjects/snapshot.test.ts` — Subject snapshot service unit test (mocked DB)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - Mock fidelity is low: `setupMocks` returns the same static `subjectResult`, `rulesResult`, and `maxVersion` — but the mock for `select` uses `.mockReturnValueOnce` three times, which means the third call (for max version) must happen in the exact order expected. If the implementation ever reorders queries, the mock returns the wrong data to the wrong query without failing.
  - `snapshotSubject` — "inserts a version row with correct snapshot shape" — asserts `insertArg.snapshot.name` and `insertArg.snapshot.rules[0].id` but does not assert the full rule shape (action, kind, keywords) is preserved in the snapshot.
  - No test for the `source` field being stored with a value other than `'pre_ai_apply'` (e.g., `'manual'`).
  - No test for `conversationMsgId` being `undefined` (the second test calls without it) — the test for version 1 passes `undefined` for `conversationMsgId`, but does not assert that the stored value is null/undefined.
  **Proposed changes:**
  - Assert `insertArg.snapshot.rules[0].action === 'block'` and `insertArg.snapshot.rules[0].keywords` in the first test.
  - Assert `insertArg.conversationMsgId` is null/undefined in the "no prior versions" test.
  - Consider ordering-independent mocks by matching query arguments rather than using `mockReturnValueOnce` in sequence.

---

#### `backend/tests/rules.test.ts` — Rules CRUD HTTP integration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Good coverage: keyword rule creation with default reportLevel, custom reportLevel, pattern rule with message, listing active rules, action update, deactivation via PATCH, reportLevel update, 404 for unknown rule, and DELETE. Assertions are specific. Minor gap: no test for creating a rule on a subject belonging to a different tenant (cross-tenant isolation).

---

#### `backend/tests/scans.test.ts` — Scan recording HTTP integration
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  - Only two tests: a happy path and a 401. This is a thin suite for a billing-critical endpoint.
  - The happy path does `expect(typeof res.body.remaining).toBe('number')` — vacuous. If `remaining` is `-1` (unlimited) or `0` (blocked), the test still passes. For the `business` plan tenant used in `buildTestTenant`, the remaining should be a large number or -1 — this should be asserted.
  - There is no test for what happens when the scan limit is reached — the endpoint should presumably return 429 or a specific `ok: false` response.
  - No test for a `memberId` being set when a Clerk-authenticated member makes the request (the `members.memberId` is verified to be null in the happy path, but there is no test for the non-null case).
  **Proposed changes:**
  - Add: set the tenant's scan count to the plan limit and verify the response signals the limit is reached.
  - Add: make the scan request with a Clerk JWT (member token) and verify `memberId` is populated.
  - Strengthen: `expect(res.body.remaining).toBeGreaterThanOrEqual(0)` at minimum, or assert the specific unlimited value.

---

#### `backend/tests/events.test.ts` — Event ingestion service + HTTP integration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Solid. All four `reportLevel` values (none, minimal, medium, rich) are tested in `ingestEvent` with precise assertions about what is and is not stored (`memberId`, `matchedTerm`). The unknown-ruleId case returns null. HTTP layer covers 201/204/401. No significant gaps. Minor: no test for `matchedTerm` being null at `medium` level (it is covered — returns null — but the comment in the test says "matchedTerm" will be null which is correct). Good.

---

#### `backend/tests/events/policy-bus.test.ts` — In-memory policy event bus unit test
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Concise and correct. Tests that emit reaches the correct listener and does not cross-emit to a different tenant. No issues. A note for completeness: does not test listener cleanup (removing a listener then emitting — does it still fire?), but that level of detail is acceptable for an EventEmitter wrapper.

---

#### `backend/tests/sse-events.test.ts` — SSE endpoint HTTP integration (real HTTP connections)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - The cross-tenant isolation test uses a 500ms `setTimeout` to assert that no data frame was received. This is a timing-based negative assertion — if the server is slow (CI under load), the test could pass even though a frame was eventually sent. A more reliable approach would be to use a ping/pong mechanism or a second event to signal readiness.
  - The "sends a data frame" test correctly skips comment frames (`: connected`, `: ping`). Good — but this depends on the implementation sending comment frames before data, which is an ordering assumption.
  - No test for what happens when the SSE connection is established but `publishPolicy` is called for the same tenant before the first keepalive — i.e., no test for the race between connection setup and first event.
  - Auth tests are well-structured and cover all 401 cases.
  **Proposed changes:**
  - Replace the 500ms timeout in the cross-tenant test with a deterministic approach: emit a known event for the correct tenant after the wrong-tenant event and listen for that one, confirming the frame order.

---

#### `backend/tests/analytics.test.ts` — Analytics service unit/integration tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `getAnalyticsSummary` "returns zeroes" test hardcodes `expect(result.totalMembers).toBe(1)` and `expect(result.activeRulesCount).toBe(1)` based on `beforeEach` setup. These are not "zero" values — the test name is misleading.
  - `getAnalyticsDaily` "always returns 7 entries" test uses `result[0]` to check shape but does not verify that the `date` fields represent the correct 7-day window (e.g., that today is at index 6 and 6 days ago is at index 0).
  - `getAnalyticsIncidents` paginates to 20 — the test inserts 25 and checks `toHaveLength(20)`. Good. But does not verify they are sorted by most-recent (it just checks count).
  - `getAnalyticsBySubject` calculates `pct: 100` for the only subject — no test with two subjects to verify the percentage split calculation.
  - No test for the `days` parameter in `getAnalyticsSummary` — does passing `days: 7` actually exclude events older than 7 days?
  **Proposed changes:**
  - Rename or fix the "zeroes" test.
  - Add a two-subject percentage test: 2 events on subject A, 1 on subject B, expect `pct` to be 66 and 33 respectively.
  - Add a test for `days` filtering: insert an event 31 days ago and verify it is excluded from a 30-day summary.

---

#### `backend/tests/audit-log.test.ts` — Audit log HTTP integration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Covers: 401, empty state, entry shape (`toMatchObject` is specific), pagination with `nextBefore`, and `action` filter. The `toMatchObject` assertion is well-formed and checks all key fields. Minor: the `nextBefore` test does not actually use the cursor to fetch the next page (does not verify cursor-based pagination works end-to-end).

---

#### `backend/tests/site-configs.test.ts` — Site configs CRUD HTTP integration
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - No test for creating a duplicate domain (should return 409 or 400).
  - `PATCH /v1/site-configs/:domain` — tests `inputSelector` update but not `sendButtonSelector`.
  - `DELETE /v1/site-configs/:domain` — no test for deleting a non-existent domain (expect 404 or 204).
  - No test for what happens if `domain` contains special URL characters (e.g., `*.acme.com`).
  **Proposed changes:**
  - Add: create a duplicate domain — expect 409.
  - Add: PATCH non-existent domain — expect 404 (there is one for unknown domain on PATCH, but listed as existing — verify this is already covered; it is).

---

#### `backend/tests/destination-groups.test.ts` — Destination groups CRUD HTTP integration
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `POST /v1/destination-groups` with empty `domains: []` is tested for 403 (org token) but the happy path with empty domains is not verified to store correctly.
  - `PATCH` test verifies `name` and that `domains` contains `b.com`, but does not assert that the old domain `a.com` is gone (a partial update might have merged rather than replaced).
  - No test for creating a group with an invalid domain format.
  - No test for a division-scoped or team-scoped destination group.
  **Proposed changes:**
  - Assert: after PATCH with `domains: ['b.com', 'c.com']`, verify `res.body.domains` does not contain `a.com`.
  - Add: create a division-scoped group — verify `divisionId` is returned.

---

#### `backend/tests/platform.test.ts` — Platform admin HTTP integration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Good coverage for a restricted endpoint: non-admin returns 403, admin returns tenant list with `memberCount`, members list per tenant, 404 for unknown tenant, and DELETE member. The `memberCount` assertion is specific. Minor gap: no test for what happens when a platform admin tries to access their own user record through the platform API (self-referential case).

---

#### `backend/tests/settings.test.ts` — Tenant settings + token rotation HTTP integration
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Excellent. Token rotation tests go beyond just asserting the format — they parse the new token, verify the secret matches the stored hash via `compareToken`, and check the old token prefix. The `PATCH /v1/tenant` tests cover happy path, missing name (400), and 401. No significant gaps.

---

#### `backend/tests/helpers/db.ts` — Test DB helper (truncateAll, buildTestTenant, etc.)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `buildTestTenant` always creates a tenant with `plan: 'business'` and `subscriptionStatus: 'active'`. Tests that need to verify plan-specific limits (e.g., free plan scan cap) must manually update the tenant after creation. No `overrides` parameter is available — this creates a pattern where tests use raw `db.update` to set up the specific state they need, which is fine but could be cleaner.
  - `buildTestTenant` does not accept a `name` parameter override, meaning all test tenants are named `'Test Firm LLP'`, which can make debugging harder when multiple test tenants exist.
  - The `truncateAll` function deletes in a specific order to respect FK constraints. It is missing `users` — wait, it does include `users` at the end. Confirmed correct order.
  - `buildTestTenant` has an overload used in some tests with a string argument (e.g., `buildTestTenant('ssefirm')`) but the type signature shown here only has `()`. This suggests either the function has an optional argument not shown or the callers are passing arguments that are silently ignored.
  **Proposed changes:**
  - Add an `overrides` parameter to `buildTestTenant` (e.g., `{ plan?: string, subscriptionStatus?: string }`).
  - Verify whether `buildTestTenant(name: string)` variant is used and add the parameter to the signature if so.

---

#### `backend/src/logger/logger.test.ts` — Logger singleton and transport unit tests
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clear and correct. Tests singleton identity, structured entry shape (level, message, context, timestamp type), empty context default, all four log levels, and multi-transport delivery. The `afterEach` cleanup restores the console transport. No issues.

---

#### `backend/src/logger/request-logging.test.ts` — Fastify request logging plugin unit tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - "Request Failed" test throws a generic `Error('boom')` which becomes a 500. There is no test for a 4xx response (e.g., `reply.status(404).send({})`). The spec says "4xx/5xx" but only 5xx is covered.
  - "does not emit Request Completed for failed requests" — good negative assertion.
  - No test for the `responseTimeMs` value being a positive number (only that its type is `'number'`; it could be `NaN` or `0`).
  **Proposed changes:**
  - Add a 404 route to `buildTestApp` and test that it emits "Request Failed" at the correct log level.
  - Assert `completed!.context['responseTimeMs'] > 0`.

---

## Pretzel Extension Tests

#### `pretzel/tests/unit/detection/api-keys.test.ts` — API key detection patterns
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - Tests are end-to-end through `detectPrompt` rather than testing the pattern function directly — acceptable for detection tests, but means a failure does not pinpoint which layer broke.
  - No test for an OpenAI key embedded in a JSON string with escaped quotes (e.g., `{"key":"sk-ABC..."}`) — common in real prompts.
  - No test for a key at the very start of the prompt (no preceding text).
  - No test for a key at the very end of the prompt (no trailing text).
  - No test for a prompt containing two different API keys (multi-finding case) — does `findings` have 2 entries or 1?
  - Anthropic key test uses a key that includes the version segment (`api03-`) — no test for just `sk-ant-` with no version.
  - The ASIA key test for AWS uses `ASIAIOSFODNN7EXAMPLE1` — that is 21 characters after ASIA (correct length). Good.
  **Proposed changes:**
  - Add a test for two different API keys in the same prompt — expect 2 findings.
  - Add a test for a key at the end of the prompt string.
  - Add a test for a GitHub `ghs_` server token (a valid prefix that may or may not be handled).

---

#### `pretzel/tests/unit/detection/pii.test.ts` — PII detection (Luhn, SSN, RFC1918 IP)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `luhnCheck` does not test an empty string input — could panic or return incorrect result.
  - `ssnCheck` tests areas 000, 666, and 900+ but not group number 00 (which is also invalid: `123-00-6789`).
  - Credit card detection: no test for a Mastercard number (only Visa tested via `detectPrompt`).
  - RFC1918 IP detection: `172.16.254.1` is tested, and `172.32.0.1` is confirmed not to match. But the boundary `172.31.255.255` (last valid address in the 172.16/12 range) is not tested.
  - No test for an SSN without dashes (e.g., `123456789`) — should this be detected or not?
  **Proposed changes:**
  - Add: `luhnCheck("")` — expect `false` (not a crash).
  - Add: `ssnCheck("123-00-6789")` — expect `false` (group 00 is invalid).
  - Add: detect a Mastercard number via `detectPrompt`.
  - Add: SSN without dashes — document expected behavior.

---

#### `pretzel/tests/unit/detection/entropy.test.ts` — Shannon entropy and high-entropy token detection
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `shannonEntropy` covers empty string (0), single-char repeated (0), two-char balanced (~1), varied vs. less varied comparison, and a realistic API key. `findHighEntropyTokens` covers the happy path, short token rejection, and low-entropy token rejection. Integration test covers a realistic secret and ordinary prose. No significant gaps. Minor: no test for a token that is exactly `minLength` characters (boundary).

---

#### `pretzel/tests/unit/detection/dictionary.test.ts` — Levenshtein and dictionary matching
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `levenshtein` covers identity (0), substitution (1), insertion (1), deletion (1), and empty string boundary cases. Exact dictionary matching covers hit, case-insensitivity, partial-word rejection, and unrelated text. Fuzzy matching covers one-typo match and two-typo non-match at maxDistance=1. Well-structured. Minor gap: no test for `levenshtein` with unicode multi-byte characters.

---

#### `pretzel/tests/unit/detection/corpus.test.ts` — Corpus regression test
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - The precision/recall test uses thresholds of 0.8 for both metrics. This means up to 20% false positives and 20% false negatives are acceptable — for a DLP product, 20% false negatives is quite permissive.
  - The corpus fixture `tests/fixtures/prompts.json` is not reviewed here but its quality determines the usefulness of this test entirely. If the corpus is small (< 20 entries), the thresholds are meaningless.
  - Individual corpus entries check `findings.length > 0` but not which specific rule fired — so if the wrong rule fires (e.g., entropy instead of credit card), it still passes.
  - The precision/recall aggregate test runs the entire corpus a second time (it is already run per-entry above), doubling the runtime with no additional coverage.
  **Proposed changes:**
  - Raise the recall threshold to at least 0.9 for a DLP product.
  - For entries with `expectedRuleIds`, assert that the `firedIds` match exactly (not just "any matched").
  - Deduplicate corpus iteration — or run aggregate metrics only.

---

#### `pretzel/tests/unit/detection/score-rule.test.ts` — Score rule schema validation and scoring logic
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `ScoreRule schema` — only one valid rule is tested. There is no test for a rule with `warnThreshold > confirmThreshold` (invalid configuration) — does the schema reject it?
  - `runScoreRuleForTest` — "returns no findings when score is below warnThreshold" uses "short text" with only `paste_detected` firing (20 pts). The comment says it is below 50. But the test does not explicitly state which signals fired and why, making it brittle if the threshold or point values change.
  - "returns a warn-level finding between thresholds" — the exact text `'word '.repeat(10) + 'WHEREAS...'` assumes specific signal triggering. If the `long_text` threshold is `5` words, `'word '.repeat(10)` (10 words) should trigger it. But this is implicit — a comment documenting expected score breakdown would help.
  - "block_quote signal subtracts points" — `paste(40) + long_text(20) - block_quote(15) = 45 < 50` — this is documented correctly. Good.
  - No test for a `score` rule with `confirmThreshold` equal to `warnThreshold` (edge case — should fire block immediately, never warn).
  **Proposed changes:**
  - Add: `SchemaRuleSchema.safeParse` with `warnThreshold > confirmThreshold` — expect `success: false`.
  - Add: score exactly at `warnThreshold` (boundary) — should it warn or not?
  - Add: score exactly at `confirmThreshold` — should it block?

---

#### `pretzel/tests/unit/policy/bridge.test.ts` — Policy bridge (API doc → extension policy)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `bridgePolicy` — entropy rule test only checks `minTokenLength === 24`. Does not check `minBitsPerChar` or `action` in the output.
  - `disabledSites` injection test checks `perSite['chatgpt.com'].enabled === false`. Does not test that an already-configured site (present in `siteConfigs` in the PolicyDoc) is not overwritten or incorrectly merged with a disabled site.
  - No test for a keyword rule with an empty `keywords` array.
  - No test for a subject with multiple rules — does the bridge map all of them or only the first?
  - No test for a `score` rule kind (if it exists in the API doc shape).
  **Proposed changes:**
  - Add: a subject with two rules — verify both appear in `custom`.
  - Add: verify `minBitsPerChar` default in the entropy rule.
  - Add: a site that is both in `siteConfigs` and in `disabledSites` — verify the merged output.

---

#### `pretzel/tests/unit/policy/role.test.ts` — Role resolution from Chrome storage
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - The token format used in tests is `ps_live_acmelaw_` + 32 chars — this is a slug-based format that `parseToken` in the backend explicitly rejects (`returns null for old slug-based token format`). If `getRole` uses the same parser, these tests are using invalid tokens. If `getRole` uses a different parser, the mismatch is a risk.
  - `returns "user" when admin token lacks correct prefix` — tests with `'invalid_token'`. Would also be valuable to test with a `ps_adm_` prefixed token that has the correct structure but wrong length.
  - No test for the case where both managed and local storage throw an error (Chrome API failure).
  - No test for managed storage having an admin token but no org token.
  **Proposed changes:**
  - Fix token format in tests to use the current UUID-based format (`ps_live_<uuid>_<32char>`), or document why slug format is still valid here.
  - Add: `chrome.storage.managed.get` throws — verify `getRole` does not crash.

---

#### `pretzel/tests/unit/policy/schema.test.ts` — Policy schema Zod validation
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Good coverage of the schema: default policy acceptance, missing version rejection, wrong version number rejection, invalid rule kind rejection, and valid custom rules for pattern, dictionary, and entropy. `PolicyDocSchema` tests parse-from-API shape, defaults `siteConfigs`, and rejects invalid rule kinds. No significant gaps. Minor: no test for a dictionary rule with an empty `terms` array.

---

#### `pretzel/tests/unit/policy/sync.test.ts` — Policy sync logic (fetch + cache)
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Covers: no-token early exit, same-version skip (only 1 fetch), version change triggers 2 fetches and stores result, 402 on `/version` sets `subscriptionExpired: true`, 402 on `/policy` sets flag, network error leaves cache intact. Assertions on `mockLocalSet` are specific (use `expect.objectContaining`). Good. Minor: no test for what happens if the fetched `policyDoc` fails Zod validation (malformed server response).

---

#### `pretzel/tests/unit/realtime.adapter.test.ts` — Backend REST checker unit test
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Tests the correct URL construction, auth header, null on network error, null on non-ok response, and null when unauthenticated (with no fetch call). The `getLastUpdatedAt` null-when-no-auth test specifically verifies `fetchMock` was not called, which is a good behavioral assertion. No issues.

---

#### `pretzel/tests/unit/service-worker.alarm.test.ts` — Service worker alarm wiring
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - Both tests import the service worker module via `await import(...)` inside the `it` block. The first test calls `installListeners[0]?.({ reason: 'install' })` — but this only triggers if the import has registered the listener synchronously. If the service worker registers listeners asynchronously, this test is racy.
  - The second test uses `vi.clearAllMocks()` then fires the alarm listener, but `clearAllMocks` also clears the install listener array's mocks. The alarm listener was registered in the first test's module import, so if Vitest isolates modules between tests, `alarmListeners[0]` may be undefined in the second test.
  - No test for an alarm with a name other than `'policy-sync'` (unknown alarm) — should be ignored.
  - No test for the `onMessage` listener behavior.
  **Proposed changes:**
  - Add: fire an alarm with `name: 'unknown-alarm'` — verify neither `mockCheck` nor `mockSync` is called.
  - Clarify module isolation between the two tests (consider using `vi.isolateModules` or import at the top of each test).

---

#### `pretzel/tests/unit/update-check.test.ts` — Update check logic (timestamp comparison + sync trigger)
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Covers all branches: `remoteTs > localSyncedAt` triggers sync, equal timestamps do not, no `syncedAt` (first run) triggers sync, `null` from `getLastUpdatedAt` does nothing, and `syncedAt` is updated after syncing. The in-memory store mock is well-structured and readable. No issues.

---

#### `pretzel/tests/unit/shared/theme.test.ts` — Extension theme utility tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `setTheme('dark')` removes the attribute — verified. But `getTheme()` after setting dark is not tested (is the default still correct after explicitly setting dark?).
  - `setTheme` persistence test verifies `mockSet` is called with `{ theme: 'light' }` but not for `setTheme('dark')` — does dark also persist to storage, or is it the default and not stored?
  - `getTheme` returns `'dark'` by default (no attribute set) — not tested after calling `setTheme('dark')` and the attribute is removed. This is fine if `getTheme` reads the attribute (which is removed = dark), but a test would confirm this.
  - No test for an invalid theme value (e.g., `setTheme('purple')`) — should it be rejected?
  **Proposed changes:**
  - Add: `setTheme('dark')` followed by `getTheme()` — expect `'dark'`.
  - Add: verify `chrome.storage.sync.set` is also called when `setTheme('dark')`.

---

## Pretzel Console Tests

#### `pretzel-console/tests/api.test.ts` — Admin API client unit tests
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - Token helpers are tested but `getToken()` returning `null` is not tested (what does `api.subjects.list()` do when there is no token — does it throw, return 401, or call fetch without the header?).
  - Only a subset of API methods are tested: `subjects.list/create/update/remove` and `policy.publish/rollback`. Missing: `members`, `divisions`, `teams`, `rules`, `analytics`, `auditLog`, `siteConfigs`, `destinationGroups`, and `assistant` endpoints.
  - All assertions are about the URL called and the HTTP method — there are no assertions about the return value shape (e.g., does `api.subjects.list()` return an array? does `api.policy.publish()` return `{ version: number }`?).
  - No test for network error handling — does the API client throw `AdminApiError` on network failure, or a raw `Error`?
  **Proposed changes:**
  - Add: call any API method with no token set — verify the fetch call omits the Authorization header or throws.
  - Add: assert the return value of `api.subjects.list()` is an array.
  - Add: test for a 500 server error — verify the error type and message.

---

#### `pretzel-console/tests/AppLayout.staging.test.tsx` — AppLayout staging environment badge
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Minimal but correct for its stated scope. Tests the STAGING badge visibility based on `VITE_APP_ENV`. The mock setup is appropriate. `afterEach` restores env vars. No issues.

---

#### `pretzel-console/tests/MillerColumns.test.tsx` — MillerColumns UI component
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - `highlights selected item with brand color` — uses `toHaveStyle({ color: 'var(--brand-primary)' })`. This asserts a CSS variable is set, but jsdom does not resolve CSS custom properties — this test may pass regardless of whether the variable is actually applied, since jsdom treats it as a literal string match on the `style` attribute. The test only catches if the inline style is literally set to `var(--brand-primary)`, not if it resolves to a color.
  - No test for empty columns (no items) — what does the component render?
  - No test for a `sublabel` being rendered in the Teams column (the fixture has `sublabel: '3 members'` but no assertion on it).
  - No test for keyboard navigation (if the component supports it).
  **Proposed changes:**
  - Add: render with empty `items: []` — verify the column title still renders.
  - Add: verify `sublabel` is visible (`screen.getByText('3 members')`).
  - Consider switching the style assertion to a class name check if the styling is done via CSS classes.

---

#### `pretzel-console/tests/OnboardingPage.test.tsx` — Onboarding page component tests
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Strong coverage: not-signed-in redirect, already-has-org redirect, form rendered when signed in, auto-slug generation, submit calls `createOrganization` with correct args, and error message display. The slug generation test (`'Acme Law LLP'` → `'acme-law-llp'`) is specific. The error test verifies that `createOrganization`'s rejection message is surfaced. No significant gaps. Minor: no test for submitting with an empty company name (should the button be disabled or show a validation error?).

---

#### `pretzel-console/tests/RequireAuth.test.tsx` — RequireAuth guard component
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Covers all four states: loading (spinner), not signed in (redirect to /login), signed in without org (redirect to /onboarding), signed in with org but wrong role (redirect to /unauthorized), and signed in with admin role (renders children). All redirect targets are asserted precisely. The `Navigate` mock as `<div data-testid="redirect:${to}">` is a clean, readable pattern. No issues.

---

#### `pretzel-console/tests/hooks/usePolicyRealtime.test.tsx` — usePolicyRealtime hook
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Tests mount (subscribe called), token callback returns fresh JWT, `invalidateQueries` is called for both `['policy']` and `['policy-history']` on update, and unsubscribe is called on unmount. The spy on `qc.invalidateQueries` is well-structured. No issues.

---

#### `pretzel-console/tests/realtime/sse.adapter.test.ts` — SSE subscriber unit test (mocked EventSource)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  - The reconnect test uses `setTimeout(r, 1100)` to wait for the reconnect logic. This is a timing-based test — 1100ms may not be enough on a slow CI runner, and it unnecessarily slows the suite.
  - `_triggerError(true)` sets `readyState = 2` (closed) but the comment says "closes with 401". The mock has no way to distinguish a 401 close from any other disconnection. The test name claims 401 reconnection but the adapter cannot actually detect 401 from an EventSource error event — it only knows the connection closed.
  - No test for successful reconnection after a transient error that is NOT a close (readyState remains 0 — transient error, connection still alive).
  - No test for unsubscribing after an error (before reconnect fires) — the unsub callback should prevent the reconnect.
  **Proposed changes:**
  - Replace the 1100ms sleep with a deterministic signal (e.g., mock a timer using `vi.useFakeTimers()`).
  - Add: unsubscribe after error — verify `MockEventSource.instances` stays at length 1 (no reconnect attempted).

---

#### `pretzel-console/tests/theme.test.ts` — Admin console theme utility
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Covers default (dark), light set with attribute and localStorage persistence, dark set removes attribute with persistence, and `initTheme` restoring from localStorage. Clean and correct. No issues.

---

#### `pretzel-console/tests/setup.ts` — Test setup file
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Single import of `@testing-library/jest-dom`. Correct and minimal. No issues.

---

## Summary Table

| File | Verdict |
|---|---|
| `backend/tests/policy.test.ts` | WARN |
| `backend/tests/policy.service.test.ts` | ISSUE |
| `backend/tests/policy.router.test.ts` | WARN |
| `backend/tests/policy-compiler.test.ts` | PASS |
| `backend/tests/policy-resolver.test.ts` | PASS |
| `backend/tests/policy-routes.test.ts` | WARN |
| `backend/tests/assistant.test.ts` | WARN |
| `backend/tests/assistant-apply.test.ts` | PASS |
| `backend/tests/assistant-prompt.test.ts` | ISSUE |
| `backend/tests/assistant.versioning.test.ts` | WARN |
| `backend/tests/billing-stripe.test.ts` | WARN |
| `backend/tests/billing-paypal.test.ts` | WARN |
| `backend/tests/billing/limits.test.ts` | PASS |
| `backend/tests/clerk-auth.test.ts` | PASS |
| `backend/tests/clerk-webhook.test.ts` | WARN |
| `backend/tests/tokens.test.ts` | WARN |
| `backend/tests/members.test.ts` | WARN |
| `backend/tests/teams.test.ts` | WARN |
| `backend/tests/divisions.test.ts` | WARN |
| `backend/tests/tenants.test.ts` | PASS |
| `backend/tests/subjects.test.ts` | WARN |
| `backend/tests/subjects/snapshot.test.ts` | WARN |
| `backend/tests/rules.test.ts` | PASS |
| `backend/tests/scans.test.ts` | ISSUE |
| `backend/tests/events.test.ts` | PASS |
| `backend/tests/events/policy-bus.test.ts` | PASS |
| `backend/tests/sse-events.test.ts` | WARN |
| `backend/tests/analytics.test.ts` | WARN |
| `backend/tests/audit-log.test.ts` | PASS |
| `backend/tests/site-configs.test.ts` | WARN |
| `backend/tests/destination-groups.test.ts` | WARN |
| `backend/tests/platform.test.ts` | PASS |
| `backend/tests/settings.test.ts` | PASS |
| `backend/tests/helpers/db.ts` | WARN |
| `backend/src/logger/logger.test.ts` | PASS |
| `backend/src/logger/request-logging.test.ts` | WARN |
| `pretzel/tests/unit/detection/api-keys.test.ts` | WARN |
| `pretzel/tests/unit/detection/pii.test.ts` | WARN |
| `pretzel/tests/unit/detection/entropy.test.ts` | PASS |
| `pretzel/tests/unit/detection/dictionary.test.ts` | PASS |
| `pretzel/tests/unit/detection/corpus.test.ts` | WARN |
| `pretzel/tests/unit/detection/score-rule.test.ts` | WARN |
| `pretzel/tests/unit/policy/bridge.test.ts` | WARN |
| `pretzel/tests/unit/policy/role.test.ts` | WARN |
| `pretzel/tests/unit/policy/schema.test.ts` | PASS |
| `pretzel/tests/unit/policy/sync.test.ts` | PASS |
| `pretzel/tests/unit/realtime.adapter.test.ts` | PASS |
| `pretzel/tests/unit/service-worker.alarm.test.ts` | WARN |
| `pretzel/tests/unit/update-check.test.ts` | PASS |
| `pretzel/tests/unit/shared/theme.test.ts` | WARN |
| `pretzel-console/tests/api.test.ts` | WARN |
| `pretzel-console/tests/AppLayout.staging.test.tsx` | PASS |
| `pretzel-console/tests/MillerColumns.test.tsx` | WARN |
| `pretzel-console/tests/OnboardingPage.test.tsx` | PASS |
| `pretzel-console/tests/RequireAuth.test.tsx` | PASS |
| `pretzel-console/tests/hooks/usePolicyRealtime.test.tsx` | PASS |
| `pretzel-console/tests/realtime/sse.adapter.test.ts` | WARN |
| `pretzel-console/tests/theme.test.ts` | PASS |
| `pretzel-console/tests/setup.ts` | PASS |

**Counts: PASS: 21 / WARN: 32 / ISSUE: 3**

---

## Top 5 Most Important Test Quality Issues

**1. `policy.service.test.ts` (ISSUE) — Broken mock chain gives false confidence in event emission**
The hand-rolled chainable DB mock uses a non-standard `.then` property trick that does not correctly model Drizzle's async query chain. The `mockInsertValues` mock is never asserted — the test verifies the event was emitted but does not confirm the DB write happened with the correct shape. Since `policy.test.ts` already covers this function end-to-end, this file should either be deleted or rewritten with correct assertions on `mockInsertValues.mock.calls[0][0]`.

**2. `scans.test.ts` (ISSUE) — Billing-critical endpoint completely untested for limit enforcement**
The scan recording endpoint is the primary billing enforcement gate for the free/starter plans. The only tests are a happy path and a 401. There is no test for what happens when the scan limit is reached, no test for the `remaining` count being meaningful, and no test for the Clerk-authenticated member path (where `memberId` should be populated). A bug in limit enforcement could give free-plan users unlimited scans silently.

**3. `assistant-prompt.test.ts` (ISSUE) — Security guardrail tests only check string presence, not correctness**
All thirteen security guardrail tests do `expect(prompt).toContain('SECTION_HEADER')` or a literal phrase. These tests pass if the header is present anywhere in the prompt, even if the instructional content below it is missing, reversed, or corrupted. A developer could accidentally delete the actual guardrail instructions while keeping the header, and every test would still pass. The tests should verify the behavioral output of the guardrails (e.g., that the prompt instructs the LLM to refuse out-of-scope requests) rather than just that certain strings exist.

**4. `policy-routes.test.ts` + `policy.router.test.ts` — Vacuous `policy.toBeDefined()` assertion and missing null-DB cases**
In `policy-routes.test.ts`, `expect(res.body.policy).toBeDefined()` can never catch a bug where `policy` is `null` or `{}`. In `policy.router.test.ts`, there is no test for `GET /policy` when `getLatestPolicy` returns null (no policy published yet). Both gaps could mask a `Cannot read properties of null` crash in production that only occurs for new tenants who have not yet published a policy.

**5. `role.test.ts` — Token format mismatch between test and production parser**
The `role.test.ts` file uses slug-based token formats (`ps_live_acmelaw_...`) that the backend explicitly rejects as an old format. If `getRole` uses the same token parser as the backend, every test in this file is using invalid tokens and only passes because the Chrome storage mock ignores token validation. This means the tests do not actually verify that a valid production token is correctly identified as `'user'` or `'admin'`. If the role parser ever strictly validates tokens, all these tests will break simultaneously with no warning.
