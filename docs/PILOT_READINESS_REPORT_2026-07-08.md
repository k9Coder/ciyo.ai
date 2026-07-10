# Pilot Readiness Report — 2026-07-08

Scope: full re-verification of pilot blockers on branch `fix/pilot-master-plan` (PR #14), one day after `docs/PILOT_AUDIT_2026-07-07.md` and `docs/PILOT_MASTER_PLAN_2026-07-07.md`. Everything below was verified against code and live test runs today — not copied from the previous audit.

Method: full local test runs (backend, console, extension, desktop unit + typecheck, desktop e2e collection), PR/CI status via `gh`, code trace of the new X-Tenant-Id flow, spot checks of every still-open master-plan item.

---

## Verified state (test/CI matrix, today)

| Suite | Result |
|---|---|
| backend unit | ✅ 343/343 (includes new LLM-seam, ReDoS, PII, retention, invite tests) |
| pretzel-console unit | ✅ 73/73 (EnforcementBanner failure fixed) |
| pretzel (extension) unit | ✅ 88/88 |
| pretzel-desktop unit | ✅ 76/76 |
| pretzel-desktop typecheck | ❌ red — tray-ui JSX flag + `tests/unit/auth.test.ts` keytar mock typing (plan 2.1 / A5) |
| pretzel-desktop e2e | ✅ collects 6 specs (was: 0 collected) — run-on-merit not yet exercised in CI |
| PR #14 checks | ✅ E2E + Documentation green |
| Desktop release workflow | fixed on branch, **never executed** — needs a throwaway tag after merge |

Confirmed fixed on this branch (audit P0-1…P0-5, P1-1, P1-2 closed): migration guard, console test mock, release-workflow SHA/pnpm, desktop e2e collection, invite multi-org X-Tenant-Id end-to-end (console bootstrap + org picker + switcher; backend membership validation is spoof-safe — `auth/middleware.ts:86-90` rejects tenants the user isn't a member of), seat cap inside the accept transaction with claim rollback (well built), invite role allowlist + super_admin-invite gating, LLM provider seam, ReDoS guard, PII pseudonymization, retention purge.

---

## NEW findings (not in any previous audit)

### N1. Extension silently enforces the WRONG tenant's policy for invited employees — HIGH, pilot-core

The exact scenario the pilot is built around: employee signs up via invite link → webhook auto-provisions a personal tenant (they're super_admin of it, empty policy) → they accept the invite → 2 memberships.

- `GET /v1/me/memberships` (`backend/src/me/router.ts:28-33`) has **no ORDER BY** — row order is arbitrary (in practice insertion order: personal tenant first, since it was created at signup, before the invite was accepted).
- `pretzel/src/auth/tenant.ts:86-90`: >1 memberships → **selects the first**, i.e. almost always the employee's own empty personal tenant.
- There is **no tenant selector in the extension UI** (plan 1.3 promised one in options/popup; only `ensureTenantSelected` was wired into `Popup.tsx`). The employee cannot even fix it manually.
- Worse: even if a correct selection were stored, `ensureTenantSelected` **overwrites it with `memberships[0]`** on every refresh past the 60s debounce (module state resets on service-worker restart, so this happens often).

Net effect: the invited employee's extension syncs the personal tenant's policy — **the employer's DLP rules are not enforced, and scans/events land in the wrong tenant**, so the CISO's console shows nothing. Silent failure of the product's core promise; the smoke test "second user accepts and lands in the right org" (tasks_for_yarin §6) will pass in the console yet fail in the extension.

Fix suggestion (small):
1. Backend: order memberships deterministically and/or return an `autoProvisioned` flag on tenants (the webhook knows; or heuristic: sole super_admin member + name `X's Organization`).
2. Extension: prefer the non-auto-provisioned / most-recently-joined membership; never overwrite an existing **valid** selection (only clear when it's no longer in the list).
3. Add the promised selector in the options page.
4. Extend `backend/e2e/invites.spec.ts`: after accept, `/v1/me/memberships` + policy sync with each tenant header — assert the invited tenant's policy is the one served for the stored selection.

### N2. Console runs two parallel "organization" systems — Clerk Organizations gate the door, backend tenants hold the data — MEDIUM

`RequireAuth.tsx:32-33` requires a Clerk **organization** (`orgId`) and `orgRole === 'org:admin'`; `OnboardingPage` exists to create a Clerk org. But all real authorization is backend memberships (X-Tenant-Id), and Clerk orgs are never synced to tenants.

Consequences:
- An invited console admin (`division_admin`/`super_admin` via invite link) has a backend membership but **no Clerk org** → after accepting they're bounced to `/onboarding` and forced to "Create your organization" — a junk Clerk org with no backend counterpart — before they can see the dashboard of the org they were invited to. Confusing, and pollutes Clerk.
- The gate adds no security: anyone can create their own Clerk org and instantly be `org:admin` of it. Real role enforcement already happens server-side.
- `DashboardPage.tsx:34` shows the **Clerk** org name — for invited admins this displays the junk org, not the tenant TenantBootstrap selected.

Fix suggestion: drop the Clerk-org requirement from `RequireAuth` (keep sign-in check); gate on backend membership role from the `/v1/me/memberships` response TenantBootstrap already fetches (redirect non-admin roles to `/unauthorized`); display the selected tenant's name. Removes OnboardingPage's Clerk-org step for invited users entirely.

### N3. Repo hygiene (small)
- `.gitignore` does not cover `pretzel-desktop/dist-electron/` or `pretzel-desktop/test-results/` — both sit untracked in the worktree now; one stray `git add .` commits build output.
- Root `tasks.txt` — empty, untracked (plan 7.9 already says delete).

---

## Still open from the master plan (re-verified today, not stale)

| Item | Status today | Note |
|---|---|---|
| 2.1 (A5) desktop typecheck | ❌ red | tray-ui JSX + keytar mock — exact errors reproduced |
| 2.2 (A6) CA consent / proxy crash-restore / kill switch | ❌ none present | `restoreSystemProxy` only on graceful quit (`main.ts:194,201`); no restore-on-launch, no consent UX, no tray pause |
| 2.3 (A7) decision-window queueing | ❌ unchanged | |
| 2.5 release hardening | ◐ | workflow fixed but never run; macOS signing waits on Apple enrollment (Yarin §4) |
| 2.6 (A8) real-machine validation | ❌ not started | local warning stands: **Windows Defender deletes the built `main.js`** — expect AV friction on customer machines; signing is the real fix |
| 5.1 (D1) Stripe portal path | ❌ still referenced in Settings/useBilling | |
| 5.2 (D2) sidebar nav | ❌ | destinations/sites/publish routes exist in `App.tsx` but not in `AppLayout` nav (lines 46-52) |
| 5.3 (D3) compose port | ❌ | `docker-compose.yml:41` maps `5173:80`; nginx listens **8080** — local console container broken |
| 5.4 (D4) unenforced policy fields | ❌ still shown | |
| 5.5 (D5) managed-storage schema | ❌ | `pretzel/managed_schema.json` still only declares `promptshield_policy` — no `orgToken`; enterprise MDM auth story void |
| 6.1–6.3 (E1–E3) marketing claims | ❌ | "200+ companies"/SOC 2/SAML/Frankfurt etc. still in 11 ciyo-web files |
| Phase 7 docs | ❌ | root `AGENTS.md` still claims "no pnpm-workspace.yaml", omits pretzel-desktop + packages/detect; pretzel-desktop has **zero** README/AGENTS; KNOWN_ISSUES stale |
| Phase 4 / manual | ❌ | all Yarin-side: Render deploy hooks + env (`PILOT_MODE`, `ADMIN_BASE_URL` — invite links broken in prod without it), Neon, Clerk prod, Apple, CWS — tracked in `docs/operations/pilot-release/tasks_for_yarin.md` |

---

## Recommended order

1. **N1 (wrong-tenant enforcement)** — belongs in PR #14 or an immediate follow-up; it undoes the value of the invite work just merged into that PR. Half a day including the e2e assertion.
2. Merge PR #14 → master green → throwaway desktop release tag (proves the never-run workflow).
3. N2 Clerk-org gate removal (half a day) — before pilot users invite their second admin.
4. Desktop track (2.1, 2.2, 2.3, then 2.6 validation matrix) — longest pole, unchanged.
5. Phase 5 quick wins in one PR: D1, D2, D3, D5 + N3 gitignore (~half day total).
6. Phases 6/7 (marketing, docs) before any external user sees the site.
7. Manual/external items continue in parallel (Apple + CWS are the long lead times).

## Go/No-Go delta vs master plan Phase 8

Gates 1 (CI green) and 4 (backend hardening) are effectively met pending merge. Gate 2 (invite flow) is **not** met despite the X-Tenant-Id work — N1 fails its spirit. Gates 3, 5, 6, 7 remain open.
