# Pilot Action Plan

Date: 2026-07-06 · Last updated: 2026-07-08
Source: `docs/PILOT_READINESS_REVIEW.md`. This file breaks the findings into sequenced, ownable tickets.
Decision: **desktop app IS in scope for the pilot** — the desktop track below is the priority.

Completed tickets are removed from this file (see git history for A1, A2, A4, B1, B2, C1, C1a, C2, C3, C4, C5). Deployment/infra execution lives in `docs/PILOT_MASTER_PLAN_2026-07-07.md`.

Status key: ☐ todo · ◐ in progress · ☑ done

---

## Track A — Desktop app (pilot-critical)

Goal: a desktop MITM DLP that actually blocks, only intercepts AI hosts, and survives streaming (SSE) responses.

### A5. Desktop typecheck is red (pre-existing scaffold) ☐
- Verified still red 2026-07-08 (`pnpm exec tsc --noEmit`):
  - `renderer/*/main.tsx`: `Cannot use JSX unless '--jsx' is provided` — renderer tsconfig missing `jsx` setting.
  - `renderer/tray-ui`: `window.pretzel` preload type declared twice with different shapes — unify the preload d.ts.
  - `tests/unit/auth.test.ts`: keytar mock typed as `null`.
- Not blocking runtime, but must be green before we trust CI. Own as one cleanup ticket.

### A6. First-run trust + system-proxy UX and safety ☐
- CA install (`ca.ts installCACert`) shells `security`/`certutil`/`update-ca-certificates` — needs elevation; today it will throw on a normal user. Add an explicit consent + elevation step and a clear failure state.
- `system-proxy.ts` sets an OS-wide proxy; ensure `restoreSystemProxy` runs on crash (SIGKILL can't be caught — add a watchdog / restore-on-next-launch check).
- Add a localhost bypass + a kill switch in the tray (pause protection).

### A7. Decision-window robustness ☐
- Concurrent intercepts: current decision window shows one payload at a time; queue or serialize multiple held requests.
- Timeout copy: user should see why a request was auto-allowed/blocked when the 30s fires.

### A8. End-to-end validation on a real machine ☐
- Manual: install CA, enable system proxy, send a secret to ChatGPT/Claude/Gemini → expect block; send benign → expect normal streamed reply. Confirm non-AI sites (a bank, Gmail) are untouched (blind-tunnelled).
- Includes the A3 residual: validate SSE/streaming passthrough against live ChatGPT/Claude/Gemini (design is done; response is piped unbuffered, but never proven against real hosts).
- Add a Playwright/electron smoke test that boots the app and asserts proxy + allowlist wiring.

### A9. Scope call for pilot ☐ (decision)
- Recommend pilot desktop = **Windows first** (single platform to validate CA + registry proxy), expand to macOS after A8 passes on Windows. Cuts validation surface for the deadline.

---

## Track B — Extension enforcement gap

### B1a. Live request-shape validation (follow-up to B1) ☐
- Confirm the request-extract parsers against current live ChatGPT/Claude builds (`/backend-api/conversation` → `messages[].content.parts`; Claude `/completion` → `prompt`).
- Add a Gemini parser if a stable batchexecute shape is found (DOM path covers it today).

---

## Track G — Observability (audit 2026-07-08)

Current coverage: extension + console have Sentry wired with DSNs in staging/prod envs; backend has structured JSON logs (traceId/tenantId, request logging with redaction) but no error alerting; desktop has **nothing**.

### G1. Desktop crash + error reporting ☐ (biggest blind spot)
- Desktop runs on pilot users' machines — no server logs exist for it. Today a proxy crash, CA-install failure, or silent renderer failure is invisible until the user complains, and then it's un-diagnosable remotely.
- Add `@sentry/electron` (main + renderer): proxy exceptions, `uncaughtException`/`unhandledRejection`, renderer errors → Sentry with OS/app-version context. Reuse the existing Sentry org (`o4511497522380800`), new project + DSN.
- Add `electron-log` file logging in the main process (policy-sync results, proxy start/stop, CA install outcome, per-host tunnel/intercept decisions — no prompt content). Covers the offline/network-broken case Sentry can't reach; user can send the log file.

### G2. Backend error alerting ☐
- JSON logs exist but nobody is paged: a 500 spike is visible only if someone reads Render logs. Add `@sentry/node`, capture in the existing `setErrorHandler` (`app.ts`), tag events with the logger's `traceId`/`tenantId` so alerts link to the affected pilot tenant. Same Sentry org, new project + DSN env var on Render.

### G3. `/health` should check the DB ☐
- `app.ts` `/health` returns static `{ ok: true }` — a Neon outage still reports healthy, so the uptime monitor (master plan 4.5) would watch a lie. Add a `select 1` (with a short timeout) to the handler.

### G4. Uptime monitor + on-call ☐ (manual — Yarin)
- Better Stack (or similar) on `/health`; alerts to Marcus + Ryan; named on-call for pilot week 1. Tracked as master plan 4.5 — do after G3 so the check is meaningful.

### G5. Console session-replay cleanup ☐ (small)
- Decide LogRocket: `VITE_LOGROCKET_ID` is empty in `.env.prod` so it's silently disabled — either set it for the pilot or drop the dependency.
- `pretzel-console/src/lib/sentry.ts` comment says "Clarity handles session replay" but Clarity is nowhere in the codebase — fix the stale comment (Sentry error-replay is what actually runs).

---

## Track D — Console / product polish

- D1. ☐ Remove or fix the Stripe portal path (PayPal is live; Stripe routes disabled).
- D2. ☐ Add destinations/sites/publish to sidebar nav.
- D3. ☐ Fix console Docker port/CSP mismatch (`5173:80` vs nginx `8080`).
- D4. ☐ Enforce or hide the parsed-but-unenforced policy fields (`destinations`, `allowSendAnywayWithReason`, `perSite.defaultAction`, `auditRetentionDays`). Note: `auditRetentionDays` has a fixed 90-day purge job now (C4); per-tenant configurability still unenforced.
- D5. ☐ Fix managed-storage schema: declare the `orgToken` key the extension reads, or the enterprise MDM bypass-prevention guarantee is void.

## Track E — Marketing / claims (before external pilot users see the site)

- E1. ☐ Reconcile "every prompt / all AI sites" to the real 3-host support matrix.
- E2. ☐ Remove/qualify unsourced stats, "200+ companies", SSO/SAML/SIEM/on-prem, "SOC 2 in progress".
- E3. ☐ Fix `eu-west-1` "Frankfurt" (it's Ireland) and the "never stored / 90-day" retention wording (must match the C4 purge job, now live at 90d).

## Track F — Repo hygiene

- F1. ☐ `AGENTS.md` says "no pnpm-workspace.yaml" but one exists at the repo root — update (verified still stale 2026-07-08, `AGENTS.md:34`).
- F2. ☐ Prune stale `worktree-agent-*` branches on origin.

## Track H — Security (manual / external — Yarin)

Source: `docs/PILOT_SECURITY_REVIEW_2026-07-08.md`. Code-side counterparts are in `docs/PILOT_SECURITY_FIX_PLAN.md` (S1–S8). These items need dashboard/infra access an agent cannot reach.

- H1. ☐ **CRITICAL — set `INTERNAL_SECRET` in Render before any public deploy.** Generate 32+ random bytes (`openssl rand -base64 32`) and set it as an env var on the backend service. Today it is set only in the CI test job (`=test-secret`), not in Render and not in `tasks_for_yarin.md` — so on first prod boot it defaults to `''`, which lets an internet caller reach the privileged `/internal/*` routes and mint a super_admin in any tenant. The S1 boot guard will refuse to start without it once merged, so set this first. Add it to `docs/operations/pilot-release/tasks_for_yarin.md` env checklist next to `PILOT_MODE`/`ADMIN_BASE_URL`.
- H2. ☐ **Network-isolate the internal API on Render.** Confirm `/internal/*` is not reachable from the public internet — either run the internal listener on a private port/interface (see S1 step 5) or place it behind Render private networking, and verify from outside that `POST https://<api>/internal/v1/tenants` returns 404/blocked. The shared secret (H1) is defense-in-depth, not the boundary.
- H3. ☐ Rotate any `INTERNAL_SECRET` / org-admin tokens that were ever committed or shared in plaintext before go-live (audit git history + shared docs); confirm none are in the repo.
