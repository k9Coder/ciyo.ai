# Pilot Audit — 2026-07-07

Scope: CI health, unit/E2E status for backend + extension + desktop + console, auth/onboarding/invite flows, per-package docs, pilot readiness (3-month free pilot, no billing).
Method: workflow/log inspection (GitHub Actions), full local test runs, code trace of auth/onboarding/invite paths, docs cross-check against code.
Builds on: `docs/PILOT_READINESS_REVIEW.md` (2026-07-06) and `docs/PILOT_ACTION_PLAN.md`. Items below marked **[NEW]** are not tracked in either.

---

## Test & CI matrix (verified today)

| Suite | Result | Notes |
|---|---|---|
| pretzel (extension) unit | ✅ 76/76 | |
| pretzel-desktop unit | ✅ 76/76 | typecheck ✗ (A5, confirmed still red) |
| pretzel-desktop e2e | ❌ broken | `SyntaxError: Cannot use 'import.meta' outside a module` → "No tests found", exit 1 |
| pretzel-console unit | ❌ 61/63 | 2 fail: `AppLayout.staging.test.tsx` (unmocked `EnforcementBanner` → no QueryClient) |
| backend unit | ❌ 312/314 | 2 fail: `assistant.test.ts` — mock covers Anthropic only; fails when `LLM_PROVIDER=openai/groq` |
| E2E suite (CI, master) | ❌ red | dies at "Run DB migrations": duplicate `fail_mode` migration |
| Deploy Backend (CI, master) | ❌ red | same migration failure in test job |
| Deploy pretzel-console (CI, master) | ❌ red | console test failures + deploy-hook secrets still missing |
| Release Pretzel Desktop (CI) | ❌ cannot run | corrupted `actions/setup-node` SHA in all 4 jobs |
| docs:check | ✅ | link/frontmatter check only — does not catch stale content |

---

## P0 — master is red; fix before anything else

### P0-1. [NEW] Duplicate `fail_mode` migration kills every CI pipeline
`backend/drizzle/0002_failmode_tenant.sql` (hand-written) adds `tenants.fail_mode`. `0003_tough_the_twelve.sql` (drizzle-generated for telemetry B2) adds the **same column again, unguarded** (`ALTER TABLE "tenants" ADD COLUMN "fail_mode" ...`). On any fresh DB: 0002 applies, 0003 throws `42701 column already exists`.
Impact: E2E gate and Deploy Backend fail on master since PR #13 merged. No backend deploy can ship.
Fix: wrap the 0003 `ADD COLUMN` in a `DO $$ ... EXCEPTION WHEN duplicate_column` guard (matching the style already used for its enum/type statements), **or** drop 0002 from the journal if production never applied it — check prod's `drizzle.__drizzle_migrations` table first before editing history.

### P0-2. [NEW] Console CI test failure: `EnforcementBanner` unmocked
`pretzel-console/tests/AppLayout.staging.test.tsx` mocks `UpgradeBanner` but the new `EnforcementBanner` (mounted in `AppLayout`, B2 work) calls `useQuery` → "No QueryClient set". 2 tests fail locally and in CI, blocking the console deploy job's test gate.
Fix: add `vi.mock` for `EnforcementBanner` (consistent with the existing banner mocks) or wrap render in a `QueryClientProvider`.

### P0-3. [NEW] Invited-member flow breaks itself (multi-org 400)
Sequence: CISO sends invite link → employee signs up via Clerk → `user.created` webhook finds no membership and no pending member row (invites do **not** pre-create member rows) → **auto-provisions a personal tenant with the employee as super_admin** → employee accepts invite → now has 2 memberships.
`resolveClerkJwt` (backend/src/auth/middleware.ts:81-90) then requires an `X-Tenant-Id` header for every request — and **neither the console nor the extension ever sends one** (grep: zero occurrences in either client). Every API call for that user returns 400 "Multiple organisations found".
This is the pilot's core flow (Natasha's checklist: "employee signs up via invite link → appears as member"). It cannot work as coded.
Fix options (pick one):
1. On `acceptInvite`, detect and delete the user's auto-provisioned solo tenant (only member, zero data, created via auto-provision) — cleanest for pilot.
2. Suppress auto-provision when the Clerk signup carries invite context (harder — webhook has no invite awareness today).
3. Teach console + extension to select an org and send `X-Tenant-Id` on every call — most correct long-term, most work.

### P0-4. [NEW] Desktop release workflow cannot execute
`.github/workflows/pretzel-desktop-release.yml` pins `actions/setup-node@49933ea5288caeca8642d1e84afcd3f7d6820020` — SHA is corrupted (`afcd` vs the valid `afbd...` used in e2e.yml) in **all four jobs**. Tag push → immediate "unable to resolve action". Also uses pnpm 10 while every other workflow uses pnpm 9 (one shared lockfile — `--frozen-lockfile` may disagree between workflows).
Even fixed, the `test` job would then die at `pnpm test:e2e` (see P0-5).

### P0-5. [NEW] Desktop E2E suite is non-functional
`pnpm test:e2e` in pretzel-desktop: Playwright errors `Cannot use 'import.meta' outside a module` and collects zero tests (spec uses `import.meta.url`; package/tsconfig not ESM for Playwright's transpile). The desktop app — the highest-risk component (system proxy + local CA) — currently has **no runnable E2E anywhere**: not locally, not in CI. Action-plan A8 (real-machine validation) is also still open, and typecheck is red (A5, confirmed).
Blunt assessment: the desktop app's enforcement rewrite (A1–A4) is merged but has never been executed end-to-end by any automated or documented manual test. Do not hand it to a pilot customer until A5 + A8 + this suite run green.

---

## P1 — fix before first pilot customer

### P1-1. [NEW] Invite acceptance bypasses the 3-seat pilot cap
`members/service.ts:51` enforces `isOverSeatLimit`, but `invites/service.ts acceptInvite` inserts into `members` directly (`db.insert(members)`), skipping the check. A pilot tenant can grow past 3 seats via invite links. Arjun's checklist item "attempt to add seat 4, expect block" will pass on the members-page path and silently fail on the invite path.
Also: `invites/router.ts:12` casts `body.role` unvalidated (`as 'member' | 'division_admin' | 'super_admin'`) — validate the enum explicitly; DB enum is the only guard.

### P1-2. [NEW] Assistant tests are provider-locked to Anthropic; pilot runs Groq
`backend/tests/assistant.test.ts` mocks only `../src/assistant/llm/anthropic.js`. With `LLM_PROVIDER=groq` (the documented pilot config in `docs/operations/pilot-release/tasks.md`) or `openai`, tests hit the real provider path and fail (2 failures reproduced locally). Consequences: (a) test results depend on ambient env, (b) the **Groq code path that production will use has zero test coverage**. Mock at the provider-selection seam and add a Groq-path test.

### P1-3. [NEW] Zero E2E coverage for the flows the pilot depends on
- Invite: `members.spec.ts` only asserts an invite **link is generated**. Acceptance, second-user signup, multi-org behavior — untested (which is why P0-3 survived).
- Onboarding wizard: unit test exists (`OnboardingPage.test.tsx`), no E2E spec exercises apply-template → publish → extension sync.
Add an `invite-accept` API-project spec (backend/e2e) minimum; a full two-user browser spec ideally.

### P1-4. Open action-plan items that are genuinely pilot-relevant (verified still open)
- **A5** desktop typecheck red (confirmed today: JSX flag, duplicated `window.pretzel` types, keytar mock typing).
- **A6** CA install requires elevation with no consent/failure UX; proxy restore-on-crash missing.
- **A7** decision-window concurrency.
- **C2** regex ReDoS guard on rule ingest (AI-authored regex ships to every browser).
- **C3** member emails sent to LLM providers (compliance; trivial pseudonymization fix).
- **C4** no retention/erasure for scans — and `enforcement_signals` (new) also grows unbounded.
- **D5** managed-storage schema missing `orgToken` — enterprise MDM auth broken as documented.
- **E1–E3** marketing overclaims — pilot customers will read the site.

### P1-5. Deployment/infra decisions unresolved
- `docs/operations/pilot-release/tasks.md` mandates Fly.io + Neon + Vercel; CI still deploys Render + GHCR. Nobody has reconciled — decide before go-live, because env vars (`PILOT_MODE=true`, `LLM_PROVIDER=groq`, `GROQ_API_KEY`, Clerk prod keys/webhook URL) land on whichever platform wins.
- `RENDER_CONSOLE_PROD_DEPLOY_HOOK` / `RENDER_CONSOLE_STAGING_DEPLOY_HOOK` secrets still missing (deploy job red on every master push since June 2). Either create them or retarget to Vercel — the task file itself says "decide one; don't leave CI permanently red".
- `PILOT_MODE` is not set in any workflow or documented Render env — auto-provisioned tenants will land on `free` (3 seats, keyword rules only, **no AI assistant**) instead of `pilot` unless this is set before the first signup. Silent misconfiguration; nothing alerts.

---

## P2 — cleanup / hygiene

- **Docs staleness (systemic).** Root `AGENTS.md`: claims "no pnpm-workspace.yaml" (false), repo shape omits `pretzel-desktop` and `packages/detect`. `docs/CURRENT_STATE.md`: says desktop protection is "roadmap work" (false — it's implemented and pilot-scoped). `docs/KNOWN_ISSUES.md` (verified 2026-06-13): lists at least three fixed items (workspace, e2e.yml installs, deploy-before-migrate) and none of the desktop/telemetry-era defects. `docs/index.md` package list omits pretzel-desktop and packages/detect.
- **pretzel-desktop has zero docs.** No README.md, no AGENTS.md — the only package without either. `packages/detect` likewise. Every other package's docs are reasonable (backend/pretzel/pretzel-console/ciyo-web have AGENTS.md + README.md).
- `tasks.txt` at repo root: empty, untracked. Delete or move into `docs/operations/pilot-release/`.
- Console sidebar missing destinations/sites/publish routes (D2); Docker compose port/CSP mismatch (D3); Stripe portal dead path (D1).
- CI E2E `retries: 2` masks the Clerk-JWT flakiness the git history shows was fought all week — fine for now, but the flake root cause (JWT warm-up) is still there.
- `requireActiveSubscription` gates only policy routes; harmless for pilot (default status `active`, PayPal idle), revisit when billing turns on.

## Flow verdicts (as requested)

- **CISO signup/auth**: sound. Clerk webhook (svix-verified) → user via internal client → auto-tenant with hashed org/admin tokens → super_admin member. One race: signing into the console before the webhook lands yields 401 "sign up first" with no retry UX — cosmetic for pilot, note it in the onboarding doc.
- **Onboarding wizard**: solid. Validated professions, template matching with wildcard fallback, idempotent re-apply, publishes policy immediately so the extension syncs. No E2E though (P1-3).
- **Invite/add-member**: broken end-to-end (P0-3), leaks seats (P1-1). Invite mechanics themselves are well-built: 72h TTL, email restriction, TOCTOU-safe atomic claim.
- **Extension auth/enforcement**: MDM-token-over-personal-login priority correct; JSON-body backstop (B1) + degraded telemetry (B2) genuinely implemented with tests. MDM schema gap (D5) voids the managed-deployment story until fixed.
- **Desktop**: enforcement rewrite merged but unvalidated (P0-5). Keep out of pilot until A5/A6/A8 close, or run Windows-only supervised installs (A9).

## Suggested order of work

1. P0-1 migration guard → master green (unblocks everything; ½ day with verification).
2. P0-2 console test mock (30 min) + decide deploy-hook question (P1-5).
3. P0-3 invite multi-org fix + P1-1 seat check in `acceptInvite` + invite-accept E2E (P1-3) — one ticket, same code area.
4. P0-4 workflow SHA/pnpm fix + P0-5 desktop E2E runner — then make the desktop go/no-go call (A9) honestly.
5. P1-2 LLM mock seam + Groq test.
6. Set `PILOT_MODE` + env on the chosen platform; smoke-test tenant lands on `pilot` plan.
7. Docs sweep (P2) — cheap, and this repo's agents rely on them being true.
