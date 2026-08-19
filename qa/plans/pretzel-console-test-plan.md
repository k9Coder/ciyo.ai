---
product: pretzel-console
surface: web
type: browser
base_url: "local http://localhost:5173 | staging console URL"
auth: clerk-admin
timebox_minutes: 20
tags: [smoke, auth, access-gates, policy, members, billing, audit]
verified_at: 2026-08-08
---

# Pretzel Console — QA Test Plan

React/Vite admin SPA. Admins sign in with Clerk, then manage policy subjects and
rules, publish policy versions, organize members, review audit events, and manage
billing. "Working" means the access gates hold, each admin surface loads its data
without console errors, and a published policy version is the same policy the
desktop app and extension will later fetch.

## QA Results — 2026-08-08 (local :5173, admin = yarin0600 super_admin)

| Case | Status | Notes |
|---|---|---|
| PC-01 Admin sign-in → dashboard | ✅ Pass | Clerk sign-in (via minted ticket) → /dashboard, heading visible, no load errors |
| PC-02 Access gates | ✅ Pass (fixed) | signed-out /dashboard → /login ✅; no-org → /onboarding/profile ✅; public routes ✅. The missing `/unauthorized` gate was **built** (`7358f60`): TenantBootstrap now redirects a non-admin `member` to a real `/unauthorized` page. Verified: member → /unauthorized; admin unaffected. |
| PC-03 Dashboard analytics | ✅ Pass | tiles (Prompts/Threats/Users/Rules), threat chart, Recent Incidents, breakdown render; clean empty states; no failed calls |
| PC-04 Subjects CRUD | ✅ Pass | create via UI (qa-subject-…) + delete via UI (ConfirmDialog → DELETE 204) verified & cleaned up; edit path exercised via assistant |
| PC-05 Rules CRUD | ✅ Pass | create/edit(warn↔block)/delete all verified (via assistant apply); rules UI present. Invalid-input validation not separately exercised |
| PC-06 Publish policy version | ✅ Pass | published v1 then v2 (version increments; active policy reflects change; clients fetched it — see extension/desktop) |
| PC-07 Generate invite link | ✅ Pass (after fix) | initially 500 (missing `invites.division_id` migration — applied); then 201, link matches `/invite/<64-hex>`, Copy link |
| PC-08 Invite acceptance page | ✅ Pass (after fix) | invite page renders for token; accept was 401 (InvitePage didn't wire token — fixed `7fed38a`), now joins org |
| PC-09 Audit events | ✅ Pass | events list reflects recent block/warn actions; All/Warned/Blocked filter pills work |
| PC-10 Billing status + plan gate | ✅ Pass | `/v1/billing/status` resolves for admin (org token → 403 by design; admin JWT works) and drives the plan gate; business plan. No dedicated Billing nav page — status is consumed for gating |
| PC-11 Assistant billing gate | ✅ Pass | free → "Business plan required" gate; business → assistant renders; chat returns real replies (needs valid GROQ key) |
| PC-12 Sign out | ✅ Pass | account menu → sign out → /login; /dashboard re-gated to /login |

10 pass, 1 pass-after-fix chain (PC-07/08), 1 finding (PC-02). Bugs fixed this session: chat errors (e83de9d), revert (1451eb7), invite auth (7fed38a), + migration drift (invites.division_id). **Open finding:** PC-02 `/unauthorized` gate not implemented as described.

## Preconditions (whole suite)

- A dedicated **QA Clerk admin account** in an org where the account has role
  `org:admin` (see `qa/README.md`; never a customer account).
- Backend API reachable (`VITE_API_BASE`, default `http://localhost:3000`).
- For scripted auth, a stored session at `qa/.auth/console.json` (produced by
  `support/auth/console-login.setup.ts`).

## Cases

### PC-01 — Admin sign-in reaches the dashboard
**Priority:** critical   **Timebox:** 2m   **Auth:** clerk-admin
**Description:** the core sign-in → authenticated app path works.
**Steps:**
1. Go to `/login`.
2. Complete Clerk sign-in with the QA admin account.
3. Land on `/dashboard`.
**Expected:** URL is `/dashboard`, a heading is visible, zero `console.error` on load.

### PC-02 — Access gates hold for unauthorized states
**Priority:** critical   **Timebox:** 3m   **Auth:** mixed
**Description:** the three gates (signed-in, active org, `org:admin`) redirect correctly.
**Steps:**
1. **Signed out:** in a fresh/incognito context, go to `/dashboard` → expect redirect to `/login`.
2. **No active org:** with a signed-in account that has no active org, go to `/dashboard` → expect redirect to `/onboarding/profile`.
3. **Non-admin:** with a signed-in member who is not `org:admin`, go to `/dashboard` → expect redirect to `/unauthorized`.
4. Confirm public routes load without auth: `/login`, `/unauthorized`, `/onboarding/profile`, `/accessibility`.
**Expected:** each redirect matches; public routes render without a session.

### PC-03 — Dashboard analytics load
**Priority:** high   **Timebox:** 2m   **Auth:** clerk-admin
**Description:** analytics widgets fetch and render.
**Steps:**
1. On `/dashboard`, wait for analytics/metrics to load.
2. Watch the console and network tab.
**Expected:** widgets render with data (or a clean empty state); no failed API calls, no console errors.

### PC-04 — Policy subjects: create, edit, delete
**Priority:** high   **Timebox:** 3m   **Auth:** clerk-admin
**Description:** an admin can manage policy subjects.
**Steps:**
1. Navigate to the policy subjects area.
2. Create a subject with a unique QA name (e.g. `qa-subject-<timestamp>`).
3. Edit it (rename or change an attribute); confirm it persists on reload.
4. Delete it.
**Expected:** create/edit/delete all persist; the deleted subject is gone after reload. No orphan QA data left behind.

### PC-05 — Policy rules: create, edit, delete
**Priority:** high   **Timebox:** 3m   **Auth:** clerk-admin
**Description:** an admin can manage detection rules.
**Steps:**
1. Navigate to the policy rules area.
2. Create a rule (choose an action: warn or block) with a unique QA name.
3. Edit its action or pattern; confirm it persists.
4. Delete it.
**Expected:** create/edit/delete persist and clean up; validation errors show for invalid input.

### PC-06 — Publish a policy version
**Priority:** critical   **Timebox:** 3m   **Auth:** clerk-admin
**Description:** publishing produces a new version that clients will fetch — the contract the desktop app and extension depend on.
**Steps:**
1. Make a small policy change (add a temporary rule from PC-05).
2. Publish a new policy version.
3. Confirm the new version appears in the version list/history with a timestamp.
4. (Cross-service, optional) note the version so PD-04 / PX-07 can confirm clients pick it up.
**Expected:** publish succeeds, a new version is recorded, and the active policy reflects the change.

### PC-07 — Members: generate open invite link
**Priority:** high   **Timebox:** 2m   **Auth:** clerk-admin
**Description:** an admin can create a shareable invite link (mirrors `journeys/console/member-invite.spec.ts`).
**Steps:**
1. Go to `/members`.
2. Click **Invite member**.
3. In the form, click **Generate link**.
4. Confirm a **Copy link** button appears and the readonly URL matches `/invite/<64-hex>`.
**Expected:** a valid open-invite URL is generated. An unaccepted open invite creates no member row — nothing to clean up.

### PC-08 — Invite acceptance lands on onboarding
**Priority:** medium   **Timebox:** 2m   **Auth:** none → clerk
**Description:** an invite link routes a new user into the join flow.
**Preconditions:** a valid `/invite/<token>` from PC-07.
**Steps:**
1. In a fresh context, open the invite URL.
2. Confirm the invite page renders (public route) and prompts to sign in / join.
**Expected:** invite page renders for the token; expired/garbage tokens show an error, not a crash.

### PC-09 — Audit events list
**Priority:** medium   **Timebox:** 2m   **Auth:** clerk-admin
**Description:** audit events render and filter.
**Steps:**
1. Navigate to the audit events area.
2. Confirm recent events list (the PC-04..PC-07 actions should appear).
3. Apply a filter (date/type) if available.
**Expected:** events render, reflect recent admin actions, and filtering works without console errors.

### PC-10 — Billing status and plan gate
**Priority:** medium   **Timebox:** 2m   **Auth:** clerk-admin
**Description:** billing status loads and plan-gated UI reflects it.
**Steps:**
1. Navigate to billing.
2. Confirm `/v1/billing/status` resolves and current plan renders.
3. Observe any `PlanGate`-gated UI reflecting the plan.
**Expected:** billing status loads; gated UI matches plan; no failed billing call.

### PC-11 — Assistant billing gate
**Priority:** medium   **Timebox:** 1m   **Auth:** clerk-admin
**Description:** `/assistant` renders only when billing reports `features.assistantEnabled`.
**Steps:**
1. Go to `/assistant`.
2. Compare against the account's `features.assistantEnabled` from `/v1/billing/status`.
**Expected:** if enabled → assistant renders; if disabled → gated/redirected, not a broken page. (If enabled, sending a chat message should surface a real reply or a clear error, not silent failure.)

### PC-12 — Sign out
**Priority:** low   **Timebox:** 1m   **Auth:** clerk-admin
**Description:** signing out returns to the public login and re-gates the app.
**Steps:**
1. Sign out from the account menu.
2. Attempt to open `/dashboard`.
**Expected:** redirected to `/login`; protected routes no longer accessible.
