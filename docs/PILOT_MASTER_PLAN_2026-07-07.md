# Pilot Master Plan — 2026-07-07

Source findings: `docs/PILOT_AUDIT_2026-07-07.md` (this plan resolves every item in it), plus open tickets absorbed from `docs/PILOT_ACTION_PLAN.md` (A5–A9, C1a–C4, D1–D5, E1–E3, F1–F2). This document supersedes the action plan as the execution tracker; the action plan stays as design rationale.

Locked decisions (Yarin, 2026-07-07):
- **Infra: Render for everything (backend + console static site), Neon for Postgres.** The Fly.io plan in `docs/operations/pilot-release/tasks.md` is dead — that doc gets updated in Phase 7.
- **Invite multi-org fix: clients send `X-Tenant-Id`** (full org-selection support, not the delete-solo-tenant shortcut).
- **Desktop: full desktop app in pilot, all three platforms** (macOS, Windows, Linux). A5–A9 must all close before launch.

Status key: ☐ todo · ◐ in progress · ☑ done

---

## Phase 0 — Restore CI green (do first; everything else gates on this)

### 0.1 Fix duplicate `fail_mode` migration ☐
Problem: `0003_tough_the_twelve.sql` re-adds `tenants.fail_mode` already created by hand-written `0002_failmode_tenant.sql`; fresh DB dies with `42701`.
Steps:
1. Edit `backend/drizzle/0003_tough_the_twelve.sql`: wrap the `ALTER TABLE "tenants" ADD COLUMN "fail_mode" ...` statement in the same `DO $$ ... EXCEPTION WHEN duplicate_column THEN null; END $$;` guard style the file already uses for its enum creations. Guard is correct in every scenario: DB that ran 0002 (column exists → skipped), DB that ran neither (0002 adds, 0003 skips).
2. Before merging, check which migrations the current prod/staging DBs recorded (`select * from drizzle.__drizzle_migrations`) — informational only; the guard is safe either way.
3. Do NOT edit `0002` or the journal — history may already be applied somewhere.
Verify: `docker compose up -d db` (or scratch Neon branch) with empty DB → `pnpm --dir backend db:migrate` succeeds; run twice (idempotence); backend deploy + E2E workflows green on the PR.
Effort: ~1h.

### 0.2 Fix console unit tests (EnforcementBanner) ☐
Problem: `pretzel-console/tests/AppLayout.staging.test.tsx` renders `AppLayout` without mocking new `EnforcementBanner` → `useQuery` crashes (2 failures, blocks Deploy pretzel-console test job).
Steps: add `vi.mock('../src/components/layout/EnforcementBanner', () => ({ EnforcementBanner: () => null }))` next to the existing `UpgradeBanner` mock.
Verify: `pnpm --dir pretzel-console test` → 63/63.
Effort: 30 min.

### 0.3 Fix desktop release workflow ☐
Problem: `.github/workflows/pretzel-desktop-release.yml` pins `actions/setup-node@49933ea5288caeca8642d1e84afcd3f7d6820020` — corrupted SHA (`afcd` vs valid `afbd...`) in all 4 jobs → workflow cannot start. Also pnpm 10 vs repo-standard 9.
Steps:
1. Replace all 4 occurrences with the valid SHA used in `e2e.yml`: `49933ea5288caeca8642d1e84afbd3f7d6820020`.
2. Align `pnpm/action-setup` to `version: 9` (same lockfile as every other workflow) — or consciously bump the whole repo to 10 in one PR, not per-workflow drift.
Verify: push a throwaway tag `pretzel-desktop-v0.0.1-ci-test` on a branch fork/draft; confirm jobs at least start and reach the test step. Delete tag after.
Effort: 30 min + test-tag run.

### 0.4 Fix desktop e2e runner ☐
Problem: `pnpm --dir pretzel-desktop test:e2e` → `Cannot use 'import.meta' outside a module`, 0 tests collected. Suite dead on all platforms.
Steps:
1. Root cause: Playwright transpiles specs to CJS because `pretzel-desktop/package.json` lacks `"type": "module"` and no `tsconfig` in scope sets `module: esnext` for `tests/e2e`. Two clean options — pick whichever builds without disturbing electron build: (a) replace `import.meta.url` in `app-launch.spec.ts` with `__dirname`-safe resolution via `path.resolve(process.cwd(), ...)`; (b) add a `tests/e2e/tsconfig.json` making the spec dir ESM-compatible for Playwright.
2. `pnpm build` first (spec requires `dist-electron/main.js`), then run.
Verify: `pnpm --dir pretzel-desktop build && pnpm --dir pretzel-desktop test:e2e` collects and runs the 3 specs locally (Windows) — pass/fail on merit, not on collection.
Effort: 1–2h.

### 0.5 Console deploy hooks on Render ☐ (Yarin — manual)
Render is confirmed as console host. Create deploy hooks in Render dashboard for prod + staging static sites, then:
`gh secret set RENDER_CONSOLE_PROD_DEPLOY_HOOK` and `gh secret set RENDER_CONSOLE_STAGING_DEPLOY_HOOK`.
Verify: next master push with a `pretzel-console/**` change → Deploy pretzel-console fully green.
Effort: 15 min, dashboard access required.

Phase-0 exit criterion: all five workflows green on master.

---

## Phase 1 — Invite flow: full `X-Tenant-Id` support (pilot-critical path)

Decision: clients gain org awareness. Backend already honors `X-Tenant-Id` in `resolveClerkJwt`; the gap is (a) no endpoint to discover memberships, (b) no client sends the header, (c) invite path bypasses seat cap.

### 1.1 Backend: memberships discovery endpoint ☐
Steps:
1. New route `GET /v1/me/memberships` (auth: raw Clerk JWT verification only — must NOT go through `resolveClerkJwt`, which is what 400s on multi-org). Returns `[{ tenantId, tenantName, role }]` for the Clerk user.
2. Lives in a new `backend/src/me/router.ts` (or extend users domain) — verify tenant names joined server-side, no tenant secrets in payload.
3. Unit test: user with 0/1/2 memberships → 401-free listing.
Effort: ~half day.

### 1.2 Console: org selection + header injection ☐
Steps:
1. On login (`RequireAuth` / bootstrap): call `/v1/me/memberships`. One membership → auto-select. Multiple → org-picker screen (simple list, styled like `InvitePage` card). Persist choice in `localStorage` (`ciyo.selectedTenantId`), validate it against the list each boot.
2. `src/api.ts` client: inject `X-Tenant-Id: <selected>` on every request when set. Single choke point — confirm all fetches go through it (grep for stray `fetch(` in src).
3. Org switcher entry in the user menu (can be minimal: dropdown listing memberships, re-select → reload).
4. After `acceptInvite` succeeds on `InvitePage`: set selected tenant to the invite's tenant before redirect to `/dashboard`.
5. Tests: api-client header unit test; RequireAuth multi-org test; InvitePage post-accept selection test.
Effort: 1–2 days.

### 1.3 Extension: tenant selection + header injection ☐
Steps:
1. Service worker: after Clerk sign-in, call `/v1/me/memberships`; store `selectedTenantId` in `chrome.storage.local`. Single membership → auto. Multiple → default to first and expose a selector in the options/popup UI.
2. All backend calls from the service worker (`policy sync`, `/v1/events`, `/v1/scans`, `/v1/telemetry/enforcement`) attach `X-Tenant-Id` when authed via Clerk. MDM org-token path (`ps_live`) is tenant-implicit — no header needed; do not send it there.
3. Managed-storage MDM may also pin tenant later — out of scope here (see 5.5/D5).
4. Unit tests: sync/dispatch attach header; token path does not.
Effort: ~1 day.

### 1.4 Backend: seat cap + role validation on invites ☐
Steps:
1. `invites/service.ts acceptInvite`: before the member insert, run the same seat check as `members/service.ts:51` (fetch tenant plan, `isOverSeatLimit(plan, currentSeats)` → 402-tagged error surfaced to `InvitePage` as friendly copy). Keep the atomic invite-claim ordering: check seats BEFORE claiming `usedAt`, and re-check inside the same transaction as the insert to avoid claim-then-fail burning the invite. Cleanest: wrap claim+insert in a transaction and roll back claim on seat failure.
2. `invites/router.ts`: validate `body.role` against explicit allowlist (zod enum), reject unknown. Decide whether non-super_admin invites may mint `super_admin` — recommend: only super_admin callers can create `super_admin` invites (mirrors C1a).
3. Unit tests: seat-4 rejected on pilot plan; invalid role 400; super_admin invite gated.
Effort: ~half day.

### 1.5 E2E: invite acceptance coverage ☐
Steps:
1. API project (`backend/e2e/invites.spec.ts`): create invite as admin → accept as seeded second user → member row exists; re-accept → 409; expired → 4xx; seat-cap → 402.
2. Admin browser project: extend `members.spec.ts` — after accept (via API), member row visible in console.
3. Full two-user browser flow (sign-up via invite link) needs a second Clerk test user — add `E2E_CLERK_USER2_*` secrets; if Clerk test-instance friction is high, ship the API-level spec first and track the browser spec as follow-up.
Effort: 1 day (API level) + 1 day (browser, optional first pass).

Phase-1 exit criterion: two-membership user fully functional in console + extension; invite E2E green in CI.

---

## Phase 2 — Desktop app to pilot-grade (all 3 platforms — longest pole, start immediately in parallel)

### 2.1 (A5) Typecheck green ☐
- `renderer/*/tsconfig`: add `"jsx": "react-jsx"` for renderer sources.
- Unify duplicate `window.pretzel` preload type declarations into one shared `d.ts` both renderers import.
- Fix `tests/unit/auth.test.ts` keytar mock typing (`vi.fn<..., string | null>` — currently inferred `null`).
Verify: `pnpm --dir pretzel-desktop typecheck` exit 0. Effort: ~half day.

### 2.2 (A6) CA install + system-proxy safety UX ☐
- Explicit consent screen before CA install; elevation flow per OS (`security` on macOS w/ admin prompt, `certutil` on Windows, `update-ca-certificates` w/ pkexec/sudo on Linux); clear failure state when declined (app runs in "monitoring disabled" mode, not crash).
- Proxy restore-on-crash: on every launch, detect stale proxy config from previous unclean exit and restore; plus watchdog note in tray.
- Tray kill switch: "Pause protection" → restores system proxy, keeps app alive.
Verify: unit tests for restore-on-launch logic; manual matrix in 2.6. Effort: 2–3 days.

### 2.3 (A7) Decision-window queueing ☐
- Serialize concurrent held requests (queue in `proxy.ts` `pending` map, one dialog at a time, FIFO); timeout copy tells user request auto-allowed (fail-open) after 30s.
Verify: unit test with two simultaneous `awaitDecision`. Effort: ~1 day.

### 2.4 Desktop e2e suite expanded ☐ (builds on 0.4)
- Keep app-launch specs; add: proxy starts and `isMonitoredHost` allowlist wiring asserted via IPC; decision IPC round-trip (mock request → decision window payload → allow/block resolution).
- Wire into release workflow (already runs `pnpm test:e2e` — becomes meaningful once 0.3+0.4 land).
Effort: 1–2 days.

### 2.5 Release pipeline hardening ☐
- After 0.3: full tag-driven release builds all 3 platforms. Confirm `CIYO_API_URL_PROD` + `VITE_CLERK_PUBLISHABLE_KEY_PROD` secrets exist (they're referenced; verify set).
- macOS: unsigned DMG = Gatekeeper "damaged/unidentified developer" friction for pilot customers. Enroll Apple Developer Program NOW ($99/yr, takes days) — signing + notarization per the workflow TODO. Windows unsigned NSIS shows SmartScreen warning — acceptable for pilot with onboarding-doc note, or buy an OV cert. **Full-desktop pilot decision makes macOS signing effectively mandatory; treat enrollment as critical-path lead time alongside CWS review.**
Effort: config ~1 day + external lead times.

### 2.6 (A8) Real-machine validation matrix ☐ (gate for desktop GA in pilot)
Per platform (macOS arm64, Windows x64, Linux deb/AppImage): install → CA consent → proxy on → secret to ChatGPT/Claude/Gemini blocked per policy → benign prompt streams normally (SSE intact) → bank + Gmail untouched (blind tunnel) → kill switch restores proxy → uninstall leaves system clean.
Record results in `docs/operations/desktop-validation.md`. No desktop artifact ships to a pilot customer before its platform row passes.
Effort: ~1 day per platform once builds exist.

Phase-2 exit criterion: typecheck+unit+e2e green in release workflow; validation matrix passed on all 3 platforms; signed macOS build (or explicit signed-off exception).

---

## Phase 3 — Backend correctness & compliance

### 3.1 LLM provider test seam + Groq coverage ☐
Problem: `assistant.test.ts` mocks only `llm/anthropic.js`; prod pilot uses `LLM_PROVIDER=groq` — untested path, and local/CI results depend on ambient env.
Steps: extract provider selection (`assistant/router.ts:16-21`) into `llm/index.ts` factory; tests mock the factory; add Groq-path test (request-shape → parsed actions) with stubbed HTTP; pin `LLM_PROVIDER` in test setup so env can't flip behavior.
Verify: `pnpm --dir backend test` green with `LLM_PROVIDER=groq`, `=openai`, unset. Effort: ~1 day.

### 3.2 (C2) Regex safety on rule ingest ☐
- Validate `pattern` rules at create/update in `rules/service.ts` (same choke point as C1): compile check, length cap, and ReDoS heuristic — recommend `safe-regex2` or RE2-style linear-engine check; reject with 400 + friendly message (assistant surfaces it in `errors[]`).
Verify: unit tests with known-catastrophic patterns (`(a+)+$`). Effort: ~half day.

### 3.3 (C1a) Assistant super_admin guard ☐
- `assistant/apply.ts` `create_member`: reject `role: 'super_admin'` unless calling member is super_admin (already admin-gated route; make invariant explicit in service).
Effort: 1–2h.

### 3.4 (C3) Pseudonymize member PII to LLMs ☐
- `assistant/prompt.ts`: replace member emails with stable `member-<shortid>` placeholders; map back on apply. Sub-processor list update belongs to Phase 6 privacy work.
Effort: ~half day.

### 3.5 (C4) Retention + erasure ☐
- Purge job (interval on boot or Render cron): delete `scans` rows older than 90d (default; per-tenant `auditRetentionDays` when D4 lands), same for `enforcement_signals`. On member deletion: anonymize their scan/signal rows (null memberId).
- Document actual behavior in privacy policy (ties to E3/pilot retention note).
Verify: unit test purge boundaries. Effort: ~1 day.

---

## Phase 4 — Infra: Render + Neon (locked)

### 4.1 Neon production DB ☐
1. Create Neon project + prod branch; enable backups/PITR (verify tier includes it; else schedule manual export pre-launch).
2. Run migrations against Neon (after 0.1): `DATABASE_URL=<neon> pnpm --dir backend db:migrate` then `seed:templates`.
3. Point Render backend service `DATABASE_URL` at Neon (connection-pooled URL; postgres.js works with Neon's pooler — verify `max` settings).

### 4.2 Render env vars — backend ☐
Set and verify on the Render backend service: `PILOT_MODE=true` (CRITICAL — without it signups land on `free`: no assistant, keyword-only), `LLM_PROVIDER=groq`, `GROQ_API_KEY`, `CLERK_SECRET_KEY` (prod instance), `CLERK_WEBHOOK_SECRET` (prod), `DATABASE_URL` (Neon), `CORS_ORIGIN=https://console.ciyo.ai`, **`ADMIN_BASE_URL=https://console.ciyo.ai`** (audit found invite links default to `http://localhost:5173` — every invite email/link is broken in prod without this), internal-service secret vars.

### 4.3 Clerk production instance ☐
- Webhook endpoint → Render backend `https://<api-domain>/webhooks/clerk`; prod publishable key into console build env + extension prod build + desktop release secrets (`VITE_CLERK_PUBLISHABLE_KEY_PROD` — same key referenced by desktop workflow).

### 4.4 Console on Render ☐
- Static site with `VITE_API_BASE=<prod api>`, prod Clerk key; deploy hooks per 0.5. Confirm `nginx.conf`/static config serves SPA routes (deep links like `/invite/<token>` must not 404 — verify rewrite rule; this is now a critical path because invite links land there).

### 4.5 Monitoring + ops ☐
- Better Stack (or similar) uptime monitor on `/health`; alerts to Marcus + Ryan. `privacy@ciyo.ai` alias. Named on-call for week 1.

### 4.6 Post-deploy smoke ☐
- Signup → tenant on `pilot` plan (proves PILOT_MODE) → org token → onboarding template → extension install → scan event → console shows it → invite → second user accepts (proves Phase 1 in prod) → assistant 6th prompt of day 429s.

---

## Phase 5 — Console / product polish

- 5.1 (D1) Stripe portal path: hide/remove portal button (PayPal idle during pilot anyway; Settings already hides billing for `pilot` plan — verify nothing else calls Stripe). ☐
- 5.2 (D2) Sidebar: add destinations / sites / publish routes. ☐
- 5.3 (D3) Docker compose: map `5173:8080` (nginx listens 8080) + fix CSP for local API. ☐
- 5.4 (D4) Unenforced policy fields (`destinations`, `allowSendAnywayWithReason`, `perSite.defaultAction`, `auditRetentionDays`): for pilot, HIDE unenforced controls in console (fast, honest) and enforce `auditRetentionDays` via 3.5; full enforcement post-pilot. ☐
- 5.5 (D5) `pretzel/managed_schema.json`: declare `orgToken` (and any other keys `auth.ts`/service worker reads from `chrome.storage.managed`) so MDM deployment works as documented. ☐

## Phase 6 — Marketing / legal (existing owners, unchanged)

- 6.1 (E1) Site claims → real support matrix (3 hosts + desktop once 2.6 passes). ☐
- 6.2 (E2) Remove unsourced stats / "200+ companies" / SSO/SAML/SIEM/on-prem / SOC 2 phrasing. ☐
- 6.3 (E3) Retention wording matches 3.5 reality; region labels correct. ☐
- 6.4 Privacy policy pilot-retention note + David Horowitz review + deploy (per `pilot-release/tasks.md`, still valid). ☐
- 6.5 CWS registration + submission after privacy page live (longest external lead time with Apple enrollment 2.5). ☐

## Phase 7 — Docs fix (do last-but-one; content must reflect post-fix reality)

- 7.1 Root `AGENTS.md`: repo shape → seven pnpm-workspace projects (`backend`, `pretzel`, `pretzel-console`, `pretzel-desktop`, `ciyo-web`, `e2e`, `packages/detect`); remove "no pnpm-workspace.yaml" claim; add desktop regression rule (proxy/CA changes → desktop unit+e2e). ☐
- 7.2 `docs/CURRENT_STATE.md`: desktop implemented (proxy allowlist, decision window, fail-mode) not roadmap; telemetry/enforcement signals; pilot plan + PILOT_MODE; Render+Neon deployment model. ☐
- 7.3 `docs/KNOWN_ISSUES.md`: remove verified-fixed rows (workspace, e2e.yml installs, deploy-before-migrate); add current defects still open at that time (from audit + this plan's unfinished items). Bump `verified_at`. ☐
- 7.4 `docs/index.md`: add pretzel-desktop + packages/detect to Packages. ☐
- 7.5 Create `pretzel-desktop/README.md` + `AGENTS.md` (architecture: electron main/proxy/CA/system-proxy/renderers; commands: build/test/test:e2e/typecheck; release: tag flow; safety invariants: allowlist, fail-mode, restore-proxy). ☐
- 7.6 Create `packages/detect/README.md` + `AGENTS.md` (shared engine, consumed by extension + desktop; API: `detectPrompt`, `highestAction`, `InputType`). ☐
- 7.7 `docs/operations/pilot-release/tasks.md`: replace Fly.io/Vercel-console rows with Render+Neon per Phase 4; mark done items. ☐
- 7.8 `docs/operations/deployment.md` + `release-process.md`: Render+Neon, desktop release flow incl. signing status. ☐
- 7.9 Delete root `tasks.txt` (empty, untracked). ☐
- 7.10 `pnpm docs:check` green + manual read of changed docs against code. ☐

## Phase 8 — Go / No-Go gate (Marcus)

All must be true:
1. All five GitHub workflows green on master (Phase 0).
2. Invite E2E green; two-membership user works in console + extension (Phase 1).
3. Desktop validation matrix passed on macOS/Windows/Linux; signed macOS build or signed-off exception (Phase 2).
4. Backend suite green under `LLM_PROVIDER=groq`; ReDoS guard + PII pseudonymization + retention live (Phase 3).
5. Prod smoke (4.6) passed incl. `pilot`-plan tenant proof.
6. Privacy policy live; CWS submitted (Phase 6).
7. Docs verified current (Phase 7).

---

## Sequencing & parallelism

```
Phase 0 (CI green)  ──────────► Phase 1 (invites/X-Tenant-Id) ──► Phase 4 (infra+smoke) ──► Phase 8
        │                                        ▲
        ├──► Phase 2 (desktop, longest pole) ────┤   (2.5 Apple enrollment + 6.5 CWS: start day 1 — external lead time)
        ├──► Phase 3 (backend correctness) ──────┤
        └──► Phase 5 (console polish)  Phase 6 (marketing/legal)  Phase 7 (docs, after fixes land)
```

Rough effort: Phase 0 ≈ 1 day · Phase 1 ≈ 3–5 days · Phase 2 ≈ 2 weeks incl. validation · Phase 3 ≈ 3 days · Phase 4 ≈ 1–2 days · Phases 5–7 ≈ 3–4 days combined. Critical path = Phase 2 + external reviews (Apple, CWS, legal).
