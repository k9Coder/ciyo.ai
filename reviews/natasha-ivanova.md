# QA Review — Natasha Ivanova, QA Lead
**Date:** 2026-06-08
**Scope:** Full E2E test suite across all four packages (cross-cutting, backend, pretzel, pretzel-console)

---

## Cross-Cutting Suite

#### `e2e/extension/ai-full-flow.spec.ts` — AI-created rule enforced by extension after publish

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **No teardown of the applied rule.** The test applies `assistantFlowMessageId` (creates an `E2E_AI_FLOW` keyword rule) and publishes a new policy version. On a second run the apply returns 409 (which the test allows), but the DB accumulates an extra policy version on every run, and the `E2E_AI_FLOW` rule is never cleaned up — it contaminates the `GET /v1/policy` response in subsequent tests that rely on a known policy shape.
  2. **Single scenario only — no warn path, no bypass attempt.** The cross-service test only validates block enforcement. There is zero coverage of: (a) the same flow for a `warn` action, (b) what happens if the `policyDoc` injected into storage is stale (version mismatch) and the extension falls back to its cached copy, (c) what happens if `apply` succeeds but publish fails (partial state).
  3. **Hard-coded 8 s `toBeVisible` timeout on the modal.** If the extension takes longer due to policy parsing the test fails transiently. No `waitFor` on the service worker having the updated policyDoc before the page is opened.
  4. **`context.serviceWorkers()[0]` race.** If the service worker is not yet registered on launch, `[0]` is `undefined` and the fallback `waitForEvent('serviceworker')` has no timeout guard — it can hang indefinitely under CI load.
  5. **`e2e-fake-token` injected without intercepting `/v1/events`.** Any audit event dispatch from the extension will hit the real backend during this test; if the backend is slow or rejects the token the test can produce noise in the event log or log an error that obscures failures.
  6. **`EXT_PATH` resolves to `../../extension/dist` but the CLAUDE.md says the built extension lives at `pretzel/dist`.** The path resolves as `e2e/extension/../../extension/dist` which is `extension/dist` — this directory does not exist in the described repo structure (`pretzel/dist` does). This will silently cause the test to launch Chrome without the extension loaded and the modal will never appear, producing a false pass on the 409 branch.

  **Proposed changes:**
  - Add `test.afterAll` (or inline cleanup) to delete the `E2E_AI_FLOW` rule and roll back the extra policy version via API.
  - Add `context.route('**/v1/events', ...)` to absorb fire-and-forget event POSTs.
  - Fix `EXT_PATH` to `path.resolve(__dirname, '../../pretzel/dist')`.
  - Add a warn-action variant of the same flow.
  - Wrap `context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker', { timeout: 15_000 })`.
  - After injecting into storage, wait for the service worker to acknowledge before opening the page (e.g. evaluate a round-trip check or add a short `waitForFunction`).

---

#### `e2e/helpers/admin-headers.ts` — Thin wrapper over getSeedState

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** None — solid. Simple, stateless, no logic to break.
  **Proposed changes:** N/A

---

#### `e2e/helpers/org-headers.ts` — Thin wrapper over getSeedState

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** None — solid.
  **Proposed changes:** N/A

---

#### `e2e/helpers/seed-state.ts` — Loads `.seed-state.json` for cross-cutting suite

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Schema drift vs backend seed.** The interface here declares `assistantFlowMessageId` but omits `assistantOrgMessageId` that is written by `seed-e2e.ts`. The `ai-full-flow.spec.ts` consumes `assistantFlowMessageId` (present), but if any future cross-cutting test needs `assistantOrgMessageId` it will be a runtime crash with an unhelpful `undefined` error rather than a compile-time failure.
  2. **Module-level cache is never invalidated.** If `globalSetup` runs and writes a new `.seed-state.json`, any test worker that has already imported the module and cached `_cache` will operate on stale data. In practice this is fine in Playwright (workers start after globalSetup), but it is a hidden assumption that is not documented.

  **Proposed changes:**
  - Add `assistantOrgMessageId: string` to the `SeedState` interface to keep it in sync with the backend seed script.
  - Add a brief comment explaining why the cache is safe (workers start after globalSetup completes).

---

#### `e2e/global-setup.ts` — Runs `pnpm seed:e2e` before the suite

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`execSync` with `stdio: 'inherit'` will surface seed errors in the CI log but does not re-throw on non-zero exit.** If `seed:e2e` silently fails (e.g. DB connection refused), `globalSetup` completes successfully, all tests run against an empty DB, and every test that reads from `.seed-state.json` crashes with a confusing `ENOENT` rather than a clear "seed failed" message.
  2. **Missing validation that the fixture server is running.** The cross-cutting spec hits `http://localhost:9876`. Nothing in `globalSetup` verifies or starts that server — it is assumed to be running, but there is no check or startup step.
  3. **`E2E_CLERK_ORG_ID` is asserted to exist via `!` in the env spread but not validated like `E2E_DATABASE_URL`.** Missing Clerk env vars produce an opaque authentication error deep in the seed script.

  **Proposed changes:**
  - Wrap `execSync` in `try/catch` and throw a descriptive error on failure.
  - Add explicit `if (!process.env.E2E_CLERK_ORG_ID || !process.env.E2E_CLERK_USER_ID || !process.env.E2E_CLERK_USER_EMAIL)` guard similar to the `E2E_DATABASE_URL` check.
  - Document (in CLAUDE.md or a comment) that the fixture server at `:9876` must be started separately before running the cross-cutting suite.

---

#### `e2e/global-teardown.ts` — Runs `pnpm teardown:e2e` after the suite

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Same `execSync` issue as globalSetup** — a failed teardown silently succeeds, leaving test data in the DB.
  2. **No cleanup of `.seed-state.json`** after teardown. A stale file from a previous run can cause subsequent partial runs (run without globalSetup) to use old tokens that no longer exist in the DB.

  **Proposed changes:**
  - Wrap `execSync` in try/catch.
  - Delete `.seed-state.json` at the end of teardown (or write a sentinel `{}` to it) so accidental partial runs fail fast.

---

## Backend API Suite

#### `backend/e2e/policy.spec.ts` — Policy CRUD and rollback endpoints

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **No cross-tenant isolation test.** There is no test that verifies tenant A's `orgToken` cannot read tenant B's policy. This is the most dangerous class of multi-tenant bug.
  2. **Rollback test is order-dependent.** It calls `POST /v1/policy/publish` inline to create a second version, then rolls back to version 1. If a previous test in the same run has already applied the AI flow and incremented the version, the "rollback to 1" may pick up rules that were not present at v1, making the assertion (`version > maxBefore`) vacuously true but the policy content wrong. No assertion on the actual policy content after rollback.
  3. **`POST /v1/policy/rollback/99999` expects `>= 400` but the comment says Fastify returns 500.** A 500 for a "version not found" is a correctness bug — it should be 404 or 400. The test is green while the API has the wrong status code.
  4. **`GET /v1/policy/history` only checked for `length >= 1` and `version` type.** No check that the response is sorted (most recent first), no check that `publishedAt` is a valid ISO timestamp, no check that non-admin tokens (orgToken) are rejected.

  **Proposed changes:**
  - Add a cross-tenant test: use `freeOrgToken` to attempt `GET /v1/policy` for the main tenant — expect 401 or an empty/wrong result, not the main tenant's policy.
  - Assert the rollback response's policy content, not just version number.
  - Tighten the 500 test to expect exactly 404 (and fix the route if needed).
  - Add `GET /v1/policy/history` with `orgToken` — expect 401 or 403.

---

#### `backend/e2e/assistant.spec.ts` — Assistant session/message/apply endpoints

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Tests 3 and 4 are sequentially order-dependent and will race if run in parallel.** "POST apply executes the seeded action" (test 3) applies `assistantMessageId`, then "POST apply returns 409 when already applied" (test 4) re-applies it and expects 409. If test 4 runs first (parallel workers), test 3 gets 409 and fails. Playwright's `--project=api` runs tests in a single worker by default, but this assumption is fragile and undocumented.
  2. **Same order dependency for `assistantOrgMessageId` tests (tests 7 and 8).** Same hazard as above.
  3. **`assistantOrgMessageId` is not declared in the cross-cutting `e2e/helpers/seed-state.ts` interface**, creating a mismatch (line 98: `getSeedState().assistantOrgMessageId` works in `backend/e2e` which has the correct interface, but any test that imports the cross-cutting helper would get `undefined`).
  4. **No test that a non-admin `orgToken` cannot call `/v1/assistant/apply`.** The assistant apply endpoint modifies policy — if an org token (not admin) can apply changes, that is a privilege escalation. Currently only 401 (no token) is tested.
  5. **No test for `apply` with a malformed `messageId` (not a UUID, or a UUID that belongs to another tenant).** Cross-tenant data access is not gated-tested.

  **Proposed changes:**
  - Use `test.describe.configure({ mode: 'serial' })` on the describe block to enforce ordering, or refactor to not share state between "apply" and "409" tests (seed two separate messages).
  - Add a test: `POST /v1/assistant/apply` with `orgToken` expects 403.
  - Add a test: `POST /v1/assistant/apply` with `messageId` belonging to a different tenant expects 404 or 403.

---

#### `backend/e2e/billing.spec.ts` — Billing status and scan gate endpoints

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`POST /v1/billing/free-signup` creates a new tenant on every run but is never cleaned up.** The tenant is identified only by a `Date.now()` email so it accumulates indefinitely in the test DB. Over time this pollutes the DB and could affect aggregate queries.
  2. **Scan gate test (`POST /v1/scans returns 402`) relies on the seed having exactly 500 scans.** If any other test in the suite posts to `/v1/scans` for the free tenant before this test runs, the count could exceed 500 and the 402 still passes — but if someone adds a test that posts scans and then resets, the count could drop below 500 and this test gets 200 instead of 402. No guard.
  3. **No test that `scanBlocked: true` actually prevents policy reads or extension syncs** — the billing spec only verifies the `/v1/billing/status` shape. It does not verify that the extension cannot pull a fresh policy when blocked.
  4. **`POST /v1/billing/free-signup` response is only checked for token format regex** — no follow-up call to verify the new tenant can actually authenticate with the returned tokens.

  **Proposed changes:**
  - Add cleanup in `test.afterAll` for the free-signup tenant (fetch it by email, delete it).
  - Add a test: free tenant with `scanBlocked: true` attempts `GET /v1/policy` — expect 402 or appropriate block response.
  - Verify the returned tokens from free-signup are usable: call `GET /v1/billing/status` with each and expect 200.

---

#### `backend/e2e/analytics.spec.ts` — Analytics summary and query endpoints

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **All assertions are shape-only (type checks, `Array.isArray`).** None verify that values are non-zero. The seed inserts 8 block events and 7 warn events, so `scansTotal`, `blocked`, and `warned` should all be positive integers. A regression that zeros out counts would pass all current tests.
  2. **No 401 test for `/v1/analytics/daily`, `/incidents`, `/top-sites`, `/by-subject`** — only `/summary` has an auth rejection test. If auth middleware is accidentally removed from the other routes, this suite will not catch it.
  3. **`days=7` param test only checks the response shape, not that filtering is actually applied.** If the backend ignores the param and always returns all-time data, the test passes.
  4. **No test that an `orgToken` (non-admin) cannot access analytics.** Analytics leaks may be a compliance issue.

  **Proposed changes:**
  - Assert `body.scansTotal >= 15`, `body.blocked >= 8`, `body.warned >= 7` based on seeded data.
  - Add 401 tests for each analytics sub-route.
  - Add a test with `orgToken` on `/v1/analytics/summary` — expect 403.
  - Add a `days=7` test where all seeded events are within 7 days and assert `scansTotal` matches (seed events are seeded within minutes of each other, so they will be within any 7-day window — at least assert > 0).

---

#### `backend/e2e/members-import.spec.ts` — Bulk member import endpoint

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Cleanup is inside the test body, not in `afterEach`.** If the main `expect` assertion fails before the cleanup block runs, `import-a@e2e.test` and `import-b@e2e.test` remain in the DB and poison subsequent runs (idempotency test will find them already created and the behavior changes).
  2. **Idempotency test cleanup has the same problem** — if `res2` assertion fails, `import-dup@e2e.test` is leaked.
  3. **No test for oversized import (e.g. 10,000 rows)** — if the endpoint has no size limit, this is a DoS vector. At minimum a test for a very large batch should be present.
  4. **No test that importing a member with an invalid email format is rejected** (if there is validation). Currently only valid emails are tested.
  5. **No test that a non-admin `orgToken` cannot call `/v1/members/import`.**

  **Proposed changes:**
  - Move cleanup to `test.afterEach` using a shared array of created emails, deleted unconditionally.
  - Add `POST /v1/members/import` with `orgToken` — expect 403.
  - Add a test for invalid email format in the rows — expect 400 or an error array in the response.

---

#### `backend/e2e/helpers/seed-state.ts` — Loads `.seed-state.json` for backend suite

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Interface correctly includes `assistantOrgMessageId` (unlike the cross-cutting helper). `__dirname` is correctly computed with `fileURLToPath` for ESM compatibility. Path resolution `../../../e2e/.seed-state.json` correctly traverses from `backend/e2e/helpers/` to the root `e2e/` folder.
  **Proposed changes:** N/A

---

#### `backend/e2e/helpers/admin-headers.ts` — Admin header factory (backend)

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** None — solid.
  **Proposed changes:** N/A

---

#### `backend/e2e/helpers/org-headers.ts` — Org header factory (backend)

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** None — solid.
  **Proposed changes:** N/A

---

## Extension (Pretzel) Suite

#### `pretzel/e2e/detection.spec.ts` — Core detection engine against fixture pages

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`launchWithExtension` is called once per test, spawning a full Chromium + extension for every case.** Five launches in one describe is slow and creates context-isolation at the cost of startup time. More importantly, no `test.afterAll` or shared context — this pattern works but makes adding tests expensive.
  2. **"text matching no rule" negative test uses a 2 s hard-coded timeout** (`not.toBeVisible({ timeout: 2_000 })`). If the extension's detection is async and occasionally takes > 2 s (e.g. under CI load), this produces a false positive pass. A safer pattern is to wait for the send event to fully process before asserting absence.
  3. **No fixture for Copilot, Perplexity, or other AI sites beyond ChatGPT, Claude, Gemini.** The product claims to support multiple AI sites; each site has a distinct DOM structure. These are zero-coverage detection scenarios.
  4. **API key pattern test uses a known OpenAI-style key (`sk-...`).** No test covers AWS keys, GCP credentials, generic `Bearer` tokens in a POST body, or private SSH key material — all are realistic DLP scenarios.
  5. **Warn path in `detection.spec.ts` uses a JWT with the string `fake_sig_AABBCCDDEE` which relies on the DEFAULT_POLICY treating any JWT-pattern as warn.** If the default policy changes the action to block, this test silently fails the assertion `toContainText('SENT:')`.

  **Proposed changes:**
  - Add fixtures for at least one more AI site (Copilot/Bing Chat or Perplexity).
  - Replace the 2 s hard-timeout negative test with: click send, wait for `#output` to contain "SENT:", then assert modal is not visible.
  - Add detection tests for AWS key patterns and SSH private key patterns.
  - Pin the warn-policy test to an explicit injected policy rather than relying on DEFAULT_POLICY shape.

---

#### `pretzel/e2e/warn.spec.ts` — Warn vs block modal behavior with injected policy

- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Solid approach — inline `TEST_POLICY_DOC` avoids backend dependency, tests both warn and block action-specific UI differences. `toBeVisible` timeouts are generous (8 s) without being reckless.
  Minor: after clicking modal buttons, no assertion that the composer textarea has reverted to editable state after "Edit prompt" or that the send was actually dispatched for "Looks fine, send it". The ACME_WARN test stops at asserting the button is visible but never clicks it.
  **Proposed changes:**
  - Add: after asserting `'Looks fine, send it'` is visible, click it and assert `#output` contains `'SENT:'`.
  - Add: after asserting block modal, click "Edit prompt" and assert `#output` still shows "No message sent yet." (block stayed blocked).

---

#### `pretzel/e2e/policy-sync.spec.ts` — Policy enforcement and audit event dispatch

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`await new Promise(r => setTimeout(r, 2_000))` is a hard sleep** waiting for the fire-and-forget event POST. This is the canonical fragile test pattern: on a fast machine it may fire in 100 ms; on a slow CI machine it may take 3 s. Better to use `page.waitForRequest('**/v1/events')` or poll `capturedEvents.length` with `expect.poll`.
  2. **Only one event is asserted (`capturedEvents[0]`).** If the extension fires multiple events for one detection (e.g. one per rule match), the test still passes but the extra events are unchecked. The event body shape (`action`, `ruleId`, `siteUrl`, `matchedTerm`) is only partially validated.
  3. **No test that `capturedEvents[0]` contains the correct `ruleId`, `matchedTerm`, and `siteUrl`.** The test asserts `action === 'block'` but an event with `action: 'block'` and `matchedTerm: undefined` would still pass.
  4. **No test that the audit event is NOT dispatched when the user clicks "Edit prompt"** (i.e. the user corrects the prompt and does not send). Currently no coverage of the "no send = no event" path.

  **Proposed changes:**
  - Replace `setTimeout(2_000)` with `await expect.poll(() => capturedEvents.length, { timeout: 8_000 }).toBeGreaterThanOrEqual(1)`.
  - Assert `body.matchedTerm === 'ACME_SECRET'`, `body.siteUrl` contains the fixture URL, `typeof body.ruleId === 'string'`.
  - Add a second scenario: type ACME_SECRET, block modal appears, click "Edit prompt", assert `capturedEvents` remains empty (or has only an "intercepted" event, not a "sent" event).

---

#### `pretzel/e2e/options.spec.ts` — Extension options page tabs

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`launchAndGetOptionsUrl` is called once per test** — four separate Chromium launches for a four-test describe. A shared `beforeAll` context would be faster and semantically cleaner.
  2. **"Audit Log tab renders without crashing" uses a broad regex** (`/audit log|no audit events/i`). If the page crashes and renders a generic error boundary text that happens to match "no audit events", the test passes. Better to assert the tab pane is rendered and no error message is shown.
  3. **"Account tab shows sign-in form" uses a multi-selector fallback** (`.cl-signIn-root, [data-clerk-id], form`). If none of these selectors match (e.g. Clerk's class names change), the test silently looks for `form` which could match an unrelated element on an error page.
  4. **No test for authenticated state** — the options page is only tested unauthenticated. When a user is signed in, the Account tab should show their profile and token display, not the sign-in form. This is zero-covered.
  5. **`extId` extraction from `sw.url()` hostname is fragile** — if Chrome changes the URL format for service workers, the hostname parse breaks silently.

  **Proposed changes:**
  - Refactor to `test.beforeAll` / `test.afterAll` with a single shared context.
  - Add an authenticated options page test: inject `orgToken` into storage, reload, assert sign-in form is NOT visible and token display IS visible.
  - Tighten the Audit Log selector: `await expect(page.locator('[data-testid="audit-log-pane"]')).toBeVisible()` (add `data-testid` if not present).

---

## Admin Console (pretzel-console) Suite

#### `pretzel-console/e2e/auth.setup.ts` — Clerk sign-in setup step

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`E2E_CLERK_USER_PASSWORD` is used directly without a null check.** If it is missing from the env, `.fill(undefined!)` will throw an unhelpful Playwright error rather than a clear "missing env var" message.
  2. **15 s `waitForURL` timeout is generous but if the redirect goes to an MFA or captcha page the test hangs silently until timeout.** No assertion that the dashboard page actually loaded content (only URL pattern checked).
  3. **The auth state file is saved to `pretzel-console/e2e/../.auth/admin.json`** (relative to `__dirname` which is `pretzel-console/e2e/`), placing it at `pretzel-console/.auth/admin.json`. This path needs to match what the Playwright config's `storageState` points to — if they differ, every subsequent test runs unauthenticated without a clear error.

  **Proposed changes:**
  - Add `if (!process.env.E2E_CLERK_USER_PASSWORD) throw new Error('E2E_CLERK_USER_PASSWORD is not set')`.
  - After `waitForURL`, add `await expect(page.getByRole('heading', { name: /dashboard/i })).toBeVisible({ timeout: 5_000 })` to confirm actual content loaded.
  - Document the auth file path in CLAUDE.md or verify it matches the `playwright.config.ts` storageState path.

---

#### `pretzel-console/e2e/dashboard.spec.ts` — Dashboard loads and auth redirect

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`getByText(/incidents/i)` and `getByText(/sites/i)` match any text containing those words** — including error states, empty states, or sidebar nav items that happen to use those words. If the metric cards fail to render but the sidebar has an "Incidents" nav link, the test passes.
  2. **The unauthenticated redirect test checks for `/login|\/$/` — both paths.** A redirect to the bare root `/` would satisfy this regex even if the app has a bug sending users to the wrong page. Should be narrowed to `/login`.
  3. **No test that metric values are numeric** (even if zero). A regression that renders `NaN` or `undefined` in the cards would not be caught.
  4. **No test for the date range selector or any interactive dashboard element** — dashboard is the most visible page for admins and has essentially only a smoke test.

  **Proposed changes:**
  - Scope card assertions to `page.locator('[data-testid="metric-card"]')` (add test IDs to cards) to avoid matching sidebar items.
  - Narrow the redirect regex to `/login/`.
  - Assert card values are displayed as numbers: `await expect(page.locator('[data-testid="incidents-value"]')).toHaveText(/^\d+$/)`.

---

#### `pretzel-console/e2e/assistant.spec.ts` — AI assistant UI flows

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **All API calls are mocked.** This is intentional (avoids LLM cost) and documented, but it means the test validates the UI contract with a mock, not with the real backend. If the real backend changes its response shape (e.g. `actions` vs `actionsJson`), tests pass but the real integration is broken. The cross-cutting `ai-full-flow.spec.ts` is supposed to close this gap, but as noted above that spec has issues.
  2. **`page.getByText('["API_KEY"]')` asserts an exact JSON stringification.** If the UI renders the keywords array differently (e.g. formatted or labeled), this will break. It is also testing implementation detail (how the UI serializes keywords) rather than user-visible behavior.
  3. **`getByTitle('Test session')` is fragile** — `title` attribute presence depends on whether the session tab renders a `title` attribute on the element. If the DOM uses `aria-label` instead this silently fails.
  4. **No test for the billing gate at the UI level** (free plan showing PlanGate overlay on the assistant page) — this is covered in `billing.spec.ts`, but the assistant spec does not verify that a mocked free-plan response blocks the chat input. The billing spec covers it better.
  5. **No error state testing** — what does the UI show if the chat API returns 500? If apply returns 409? These are unhandled states a user can realistically encounter.

  **Proposed changes:**
  - Add a test: mock `/v1/assistant/chat` to return 500; assert a user-visible error message appears.
  - Add a test: mock `/v1/assistant/apply` to return 409; assert the UI surfaces a "already applied" message rather than crashing.
  - Replace `getByText('["API_KEY"]')` with a more semantic assertion like `getByText(/API_KEY/)` or add a `data-testid`.

---

#### `pretzel-console/e2e/publish.spec.ts` — Policy publish and rollback UI

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`page.getByText(/version/i).first()` is extremely broad** — it will match any text containing "version" on the page (header, footer, breadcrumb, sidebar badge). If the element order changes between renders, `first()` picks up the wrong element and the version number parse returns `NaN`, making `toBeGreaterThan(NaN)` always false but Playwright may not surface this clearly.
  2. **Rollback confirmation button is labeled `'Delete'`** — this looks like the wrong button label for a rollback confirmation dialog. Either the button is mislabeled in the UI (UX issue) or the test is wrong. Either way this should be investigated.
  3. **No test that publish is disabled when there are no unpublished changes** — if the publish button is always enabled regardless of state, the test would not catch it.
  4. **No test that a non-admin user cannot access the publish page** — auth gate for publish is not covered here or in auth.setup.ts.

  **Proposed changes:**
  - Scope version text locators: `page.locator('[data-testid="current-version"]')`.
  - Clarify or fix the `'Delete'` button label — if it should be `'Confirm'` or `'Rollback'`, update both the test and the UI.
  - Add a test: navigate to `/publish` as a `member`-role user — expect redirect or disabled state.

---

#### `pretzel-console/e2e/members.spec.ts` — Member invite and role management

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Invite link tests do not verify the invite actually appears in the member list after acceptance.** The test stops at "link was generated" — the invite acceptance flow is zero-covered.
  2. **`page.locator('tr', { hasText: 'e2e-role-edit@example.com' })` relies on the email being rendered inside a `<tr>` element.** If the table renders in a different structure (e.g. cards on mobile breakpoint or a `<div>`-based table), this selector silently fails.
  3. **`memberRow.getByRole('combobox').selectOption('division_admin')` assumes exactly one combobox in the row.** If the row has multiple select elements, this selects the first regardless of which is the role selector.
  4. **The cleanup for "can change a member role" deletes via `member.id` captured before the page visit.** If the member creation fails (non-201), `member.id` is undefined and the cleanup attempt throws — leaking the test intent but not crashing the cleanup.

  **Proposed changes:**
  - Scope the combobox: `memberRow.getByRole('combobox', { name: /role/i })`.
  - Add null check on `createRes` before extracting `member.id`.
  - Add a test that covers the invite acceptance URL (can be a simple GET to the invite link endpoint).

---

#### `pretzel-console/e2e/billing.spec.ts` — Billing UI: plan display, banners, gate

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`page.locator('text=business').nth(1)` uses nth-child on text-content matching** — this is fragile. If any other element on the page renders "business" (e.g. a plan badge in the sidebar), the index shifts and the assertion breaks silently.
  2. **PlanGate test for free plan (`/assistant`)**: only asserts that the gate text is visible, not that the chat input is actually disabled or hidden. A PlanGate that renders the overlay but still allows typing in the input would pass this test.
  3. **No test for the upgrade CTA link** — `getByText(/view plans/i)` is asserted to be visible but not that it points to the correct URL.
  4. **UpgradeBanner threshold (80% = 420/500) is hard-coded in the test mock.** If the threshold changes in the product (e.g. 90%), the test continues to pass with outdated threshold knowledge, giving false confidence.

  **Proposed changes:**
  - Replace `locator('text=business').nth(1)` with a scoped `locator('[data-testid="billing-plan-label"]')`.
  - Assert that the chat input (`getByPlaceholder(...)`) is disabled or not visible when the PlanGate is shown.
  - Assert the upgrade link `href` points to the pricing page.

---

#### `pretzel-console/e2e/audit.spec.ts` — Audit log: rendering and filters

- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **`tbody td:nth-child(4) span` is a positional selector** that will break silently if a column is added, removed, or reordered before the action column. This is one of the most fragile selector patterns in the entire suite.
  2. **Filter tests (`Blocked`, `Warned`) rely on the seeded events containing both action types visible within the default page size.** If the default page size is 10 and the seed inserts 8 block + 7 warn events, after applying the "Blocked" filter the backend may return a second page with warn events not shown — so `texts.every(t => t === 'block')` may be vacuously true on a short result set. Conversely if pagination loads all events, the filter test is genuinely meaningful. This is untested assumption.
  3. **`Load more` test intercepts `**/v1/audit-log**` and forces `limit=5`** — but the `rowsBefore === 5` assertion is made before `Load more` is clicked, which assumes the first page renders synchronously before the assertion. If the page renders with a loading skeleton first, `tbody tr` count could be 0.
  4. **No test for search/filtering by member email or site URL** — if those filter controls exist, they are zero-covered.
  5. **No test that audit events are sorted by newest first** — an inverted sort would be a silent regression.

  **Proposed changes:**
  - Replace `td:nth-child(4) span` with `[data-testid="event-action"]` (add test IDs to the table action cell).
  - Add a `waitFor` before `rowsBefore` assertion: `await expect(page.locator('tbody tr')).toHaveCount(5, { timeout: 5_000 })`.
  - Add a test: verify the first row's timestamp is more recent than the last row's.

---

#### `pretzel-console/e2e/org.spec.ts` — Division and team management

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **"can create and delete a division" cleanup is done via API but the UI delete path is not tested.** The test only exercises the create flow; delete via the UI is entirely untested.
  2. **"can create a team inside a division" cleanup finds teams via `GET /v1/divisions/{id}/teams`** — but this assumes `E2E Division` (the seeded division) still exists when cleanup runs. If a parallel test has renamed or deleted it, cleanup throws and the team leaks.
  3. **"selecting a division and team shows member column" uses `getByText(/member|no member/i).first()`** — if the page has a "Members" heading in the navigation sidebar, this matches the sidebar rather than the column.
  4. **No test for deleting a division or team via the UI.**
  5. **No test for assigning a member to a team via the UI.**

  **Proposed changes:**
  - Add a test: create a division, then delete it via the UI Delete button, assert it disappears.
  - Add a `data-testid="member-column"` to the third column and scope the assertion there.

---

#### `pretzel-console/e2e/subjects.spec.ts` — Subject and rule management

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`keywordSpan.locator('../..')` is an XPath-style parent traversal** — Playwright supports `..` in locator chains but it is fragile: if the DOM nesting changes (keyword span wrapped in an extra div), the traversal lands on the wrong element. This is one of the most brittle selector patterns present in the suite.
  2. **"can rename a subject" restores the name via API in cleanup** — but if the `PATCH` itself fails (e.g. subject was already renamed by a parallel test), the seeded subject name is left as "ACME Confidential Renamed" and every subsequent test that relies on `getByText('ACME Confidential')` will fail. There is a real risk of cascade failure with no indication of the root cause.
  3. **"can edit a rule action" creates a throwaway rule via API, then finds it in the UI by filtering for `EDIT_RULE_E2E` keyword.** If the UI does not immediately reflect the API-created rule (no refetch/invalidation on navigate), the test will find nothing and timeout. There is no `waitFor` or explicit refetch trigger.
  4. **`afterEach` in subjects.spec.ts only cleans up `createdSubjectId`** — it does not clean up rules added within tests. The "add a keyword block rule" test deletes the rule inline, but if that cleanup fails (API error), the rule leaks.

  **Proposed changes:**
  - Replace `locator('../..')` with a stable `data-testid` on the rule card.
  - Add `await page.reload()` or wait for network idle after navigating to `/subjects` before asserting the API-created rule is visible.
  - Make cleanup unconditional: move rule cleanup to `afterEach` with an array of rule IDs to delete.

---

#### `pretzel-console/e2e/settings.spec.ts` — Tenant name and token rotation

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`page.locator('input').first()` in the "can edit organisation name" test** is an extremely broad selector — any input on the page (including hidden inputs from Clerk or other components) could be matched first if the DOM order changes.
  2. **Token rotation tests only verify that a `dialog` event fires with the right message.** They do not verify that declining the dialog leaves the token unchanged (dismissal is tested — good) nor that confirming actually rotates the token and the new token is displayed. The "confirm and rotate" path is zero-covered.
  3. **`page.getByRole('button', { name: 'Rotate' }).nth(1)` relies on button order.** If a third rotate button is added (e.g. for a new token type) and appears before the admin token button, this picks the wrong one.

  **Proposed changes:**
  - Replace `locator('input').first()` with `page.getByLabel(/organisation name|name/i)` or a `data-testid`.
  - Add a test: click Rotate, confirm in the dialog, assert the displayed token value has changed.
  - Scope rotate buttons with `data-testid="rotate-org-token"` and `data-testid="rotate-admin-token"`.

---

#### `pretzel-console/e2e/sites.spec.ts` — Site config CRUD

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`afterEach` deletes `TEST_DOMAIN` unconditionally** — but the "can edit site config selectors" test uses `EDIT_DOMAIN` (a different domain) and cleans it up inline. If that inline cleanup is missed or the API call fails, `EDIT_DOMAIN` leaks. The `afterEach` only covers `TEST_DOMAIN`, not `EDIT_DOMAIN`.
  2. **The edit test calls `page.getByRole('button', { name: 'Edit' }).first()`** — "first" depends on row order in the table. If `EDIT_DOMAIN` is not the first row (e.g. another test has added a site config above it alphabetically), the wrong row is edited.
  3. **No test for deleting a site config via the UI.**
  4. **No test that a site config with no input selector or send selector is rejected** — if validation is present, it is untested.

  **Proposed changes:**
  - Move `EDIT_DOMAIN` cleanup to `afterEach` alongside `TEST_DOMAIN`.
  - Scope the Edit button to the specific row: `page.locator('tr', { hasText: EDIT_DOMAIN }).getByRole('button', { name: 'Edit' })`.

---

#### `pretzel-console/e2e/destinations.spec.ts` — Destination group CRUD

- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **"can rename a destination group" uses `page.getByRole('button', { name: 'Edit' }).first()`** — same fragile "first" pattern. If another group exists (from a leak or seeded data), the wrong group is edited.
  2. **No test for deleting a destination group via the UI.**
  3. **No test that a destination group with empty domains list is rejected.**
  4. **No test that a rule can actually reference a destination group** (the create-destination-group → assign-to-rule → verify-enforcement pipeline is zero-covered end-to-end).

  **Proposed changes:**
  - Scope Edit button to the specific group card: `page.locator('[data-testid="destination-group-card"]', { hasText: 'E2E Edit Group' }).getByRole('button', { name: 'Edit' })`.
  - Add a delete-via-UI test.

---

## Summary Table

| File | Verdict |
|---|---|
| `e2e/extension/ai-full-flow.spec.ts` | **ISSUE** |
| `e2e/helpers/admin-headers.ts` | PASS |
| `e2e/helpers/org-headers.ts` | PASS |
| `e2e/helpers/seed-state.ts` | WARN |
| `e2e/global-setup.ts` | WARN |
| `e2e/global-teardown.ts` | WARN |
| `backend/e2e/policy.spec.ts` | WARN |
| `backend/e2e/assistant.spec.ts` | **ISSUE** |
| `backend/e2e/billing.spec.ts` | WARN |
| `backend/e2e/analytics.spec.ts` | WARN |
| `backend/e2e/members-import.spec.ts` | WARN |
| `backend/e2e/helpers/seed-state.ts` | PASS |
| `backend/e2e/helpers/admin-headers.ts` | PASS |
| `backend/e2e/helpers/org-headers.ts` | PASS |
| `pretzel/e2e/detection.spec.ts` | WARN |
| `pretzel/e2e/warn.spec.ts` | PASS |
| `pretzel/e2e/policy-sync.spec.ts` | WARN |
| `pretzel/e2e/options.spec.ts` | WARN |
| `pretzel-console/e2e/dashboard.spec.ts` | WARN |
| `pretzel-console/e2e/assistant.spec.ts` | WARN |
| `pretzel-console/e2e/publish.spec.ts` | WARN |
| `pretzel-console/e2e/members.spec.ts` | WARN |
| `pretzel-console/e2e/billing.spec.ts` | WARN |
| `pretzel-console/e2e/audit.spec.ts` | **ISSUE** |
| `pretzel-console/e2e/org.spec.ts` | WARN |
| `pretzel-console/e2e/subjects.spec.ts` | WARN |
| `pretzel-console/e2e/settings.spec.ts` | WARN |
| `pretzel-console/e2e/sites.spec.ts` | WARN |
| `pretzel-console/e2e/destinations.spec.ts` | WARN |
| `pretzel-console/e2e/auth.setup.ts` | WARN |

**Totals: 5 PASS / 22 WARN / 3 ISSUE**

---

## Top Critical QA Gaps

### 1. ISSUE — `ai-full-flow.spec.ts` wrong extension path + no event cleanup
The `EXT_PATH` resolves to `extension/dist` which does not exist in the repo (the correct path is `pretzel/dist`). This means the cross-service E2E almost certainly launches Chrome *without* the extension loaded. Any detection that "passes" does so vacuously. This is the highest-risk finding in the suite — it creates total false confidence in the one test designed to prove the full AI-rule → publish → enforce pipeline works.

### 2. ISSUE — `assistant.spec.ts` order-dependent apply/409 test pair
Tests 3+4 and 7+8 in `backend/e2e/assistant.spec.ts` are rigidly sequentially dependent. They work only because Playwright runs them in declaration order with a single worker. The moment parallelism is enabled (or the order shifts during refactoring), test 4 gets the message in an un-applied state or test 3 hits 409 — both would be CI red with no clear root cause. Two tests fighting over shared mutable DB state.

### 3. ISSUE — `audit.spec.ts` positional column selector `td:nth-child(4)`
The filter correctness tests for the Audit Log use `tbody td:nth-child(4) span` to read the action column. Adding any column before position 4 breaks every filter test silently (if the new column happens to contain `block`/`warn` text) or noisily. This is the canonical fragile E2E test pattern and needs a semantic `data-testid` replacement immediately.

### 4. WARN — Zero cross-tenant isolation coverage across the entire backend suite
No test anywhere verifies that tenant A's tokens cannot read, modify, or enumerate tenant B's data. For a DLP product handling enterprise secrets this is a critical security regression class. A multi-tenancy bug that leaks one org's policy rules to another org would not be caught by any current E2E test.

### 5. WARN — Hard sleeps and non-deterministic timeouts scattered across extension tests
`policy-sync.spec.ts` uses `setTimeout(2_000)` for the event dispatch wait; `detection.spec.ts` uses `not.toBeVisible({ timeout: 2_000 })` for the negative case. These are the two most common root causes of flaky CI red that masks real regressions. Both should be replaced with deterministic `expect.poll` / `page.waitForRequest` / `waitForResponse` patterns.
