# Pilot Action Plan

Date: 2026-07-06
Source: `docs/PILOT_READINESS_REVIEW.md`. This file breaks the findings into sequenced, ownable tickets.
Decision: **desktop app IS in scope for the pilot** — the desktop track below is the priority.

Status key: ☐ todo · ◐ in progress · ☑ done

---

## Track A — Desktop app (pilot-critical)

Goal: a desktop MITM DLP that actually blocks, only intercepts AI hosts, and survives streaming (SSE) responses.

### A1. Fix dead detection in the proxy ☑ done
- `detectPrompt` is async — now awaited; read `highestAction` not `.action`; pass valid `inputType:'prompt'` + `hostname`.
- Files: `pretzel-desktop/electron/proxy.ts` (rewritten), `tests/e2e/app-launch.spec.ts` (same bug fixed).
- Verified: `tests/unit/proxy-guard.test.ts` (evaluateRequest/needsDecision) green.

### A2. Stop MITMing every host ☑ done
- Added `MONITORED_HOST_RE` (chatgpt.com, chat.openai.com, claude.ai, gemini.google.com). Non-monitored + not-ready CONNECTs are blind-tunnelled (raw TCP, no TLS interception). Prevents intercepting banking/SSO/cert-pinned apps.
- Verified by `isMonitoredHost` tests.

### A3. SSE / streaming passthrough ☑ done (design) / ☐ needs real-host E2E
- Request body (the prompt) is buffered and scanned; the upstream **response** is `pipe`d through and never buffered → token-streaming (SSE) responses flow unbroken. WebSocket `upgrade` frames are tunnelled, not inspected.
- Still to do: validate against live ChatGPT/Claude/Gemini on a real machine (A8).

### A4. Honor the user's Allow/Block choice ☑ done
- Previously the decision window's response hit a no-op; only the 30s timeout (fail-open) ever resolved. Now `proxy.resolveDecision(requestId, allow)` is wired from `ipc-handlers.onDecision` → the held request. Single-settle guard prevents double-resolve (user + timeout).
- Files: `proxy.ts` (`pending` map + `awaitDecision`), `main.ts` (onDecision).

### A5. Desktop typecheck is red (pre-existing scaffold) ☐
- `renderer/*/main.tsx`: `Cannot use JSX unless '--jsx' is provided` — renderer tsconfig missing `jsx` setting.
- `renderer/tray-ui`: `window.pretzel` preload type declared twice with different shapes — unify the preload d.ts.
- `tests/unit/auth.test.ts`: keytar mock typed as `null`. 
- Not blocking runtime, but must be green before we trust CI. Own as one cleanup ticket.

### A6. First-run trust + system-proxy UX and safety ☐
- CA install (`ca.ts installCACert`) shells `security`/`certutil`/`update-ca-certificates` — needs elevation; today it will throw on a normal user. Add an explicit consent + elevation step and a clear failure state.
- `system-proxy.ts` sets an OS-wide proxy; ensure `restoreSystemProxy` runs on crash (SIGkill can't be caught — add a watchdog / restore-on-next-launch check).
- Add a localhost bypass + a kill switch in the tray (pause protection).

### A7. Decision-window robustness ☐
- Concurrent intercepts: current decision window shows one payload at a time; queue or serialize multiple held requests.
- Timeout copy: user should see why a request was auto-allowed/blocked when the 30s fires.

### A8. End-to-end validation on a real machine ☐
- Manual: install CA, enable system proxy, send a secret to ChatGPT/Claude/Gemini → expect block; send benign → expect normal streamed reply. Confirm non-AI sites (a bank, Gmail) are untouched (blind-tunnelled).
- Add a Playwright/electron smoke test that boots the app and asserts proxy + allowlist wiring.

### A9. Scope call for pilot ☐ (decision)
- Recommend pilot desktop = **Windows first** (single platform to validate CA + registry proxy), expand to macOS after A8 passes on Windows. Cuts validation surface for the deadline.

---

## Track B — Extension enforcement gap (pilot-critical)

### B1. Scan JSON request bodies, not just DOM clicks ☑ done
- New `pretzel/src/content/request-extract.ts`: per-host parsers extract the prompt from the outbound request body (ChatGPT `/backend-api/conversation` → `messages[].content.parts`; Claude `/completion` → `prompt`). Gemini deliberately returns null (batchexecute is brittle → DOM path covers it).
- Wired into the MAIN-world interceptor for both `fetch` and XHR string bodies (`fetch-interceptor.ts`). Runs only when the button-click path did NOT pre-approve the send (`nextFetchApproved`), so no double modal; fires exactly when the DOM path missed.
- Backstop-detected warn/block now written to the audit trail (`content-script.ts` bridge — previously the network/file path showed a modal but logged nothing).
- Verified: `tests/unit/content/request-extract.test.ts` (7 tests) + full suite 76/76 green; `pnpm build` succeeds.
- Follow-up: confirm live request shapes against current ChatGPT/Claude builds; add a Gemini parser if a stable shape is found.

### B2. Fail-open telemetry / degraded-enforcement signal ☑ done

Both layers implemented. Neither ships prompt content.

Implemented:
- Backend: `enforcement_signals` table (migration `0003_tough_the_twelve.sql`), `telemetry/service.ts` (record + `recentDegraded` + `silentFailureSuspected`), `telemetry/router.ts` (`POST /v1/telemetry/enforcement`, `GET /v1/telemetry/enforcement/summary`), registered in `app.ts`.
- Extension: `telemetry/dispatch.ts` (debounced per host+reason, fires only when authed), `REPORT_DEGRADED` message handled in the service worker; triggers wired for `decision_timeout` (MAIN→ISOLATED via `CIYO_DEGRADED`), `bridge_error`, and `adapter_miss`.
- Console: `useEnforcementHealth` hook + `EnforcementBanner` mounted in `AppLayout` (degraded hosts + silent-failure alarm).
- Verified: backend typecheck + extension/console typecheck clean; extension 76/76, backend limits 28/28; console build green.
- Follow-up: add `enforcement_signals` to the retention purge (C4) so it doesn't grow unbounded.

Design (for reference):

**Layer 1 — client emits an `enforcement_degraded` signal.**
- Fire when: the interceptor's 5s decision timeout elapses (`fetch-interceptor.ts` DECISION_TIMEOUT); the ISOLATED bridge throws; or on send-intent the adapter returns no composer/send button (`content-script.ts` `findComposer()`/`findSendButton()` null while a send is happening).
- Payload: `{ hostname, reason: 'decision_timeout'|'bridge_error'|'adapter_miss', extVersion }`. No prompt text, no hashes.
- Transport: new `POST /v1/telemetry/enforcement` (auth via existing `requireOrgTokenOrClerkAuth`). Keep it off the `/v1/events` schema — events require `ruleId`, which a degradation has none of. Debounce client-side (e.g. max 1/min/reason) so a broken site can't spam.
- Store in a small `enforcement_signals(tenantId, memberId, hostname, reason, occurredAt)` table with the same retention job as scans (see C4).

**Layer 2 — console surfaces it + silent-failure alarm.**
- Console: per-tenant banner "Protection degraded on chatgpt.com (adapter_miss) — extension may need an update," driven by a count of recent signals.
- Silent-failure alarm: the dangerous case is *no* signal at all — an adapter that stopped firing produces zero scans. Add a backend check: for tenants with active members, alert when rolling scan volume drops toward zero versus their trailing baseline. This catches "extension quietly stopped enforcing" that Layer 1 can miss.
- Effort: Layer 1 ≈ 1 endpoint + 1 table + ~3 client call sites. Layer 2 ≈ 1 console widget + 1 scheduled query.

---

## Track C — Backend correctness & compliance

### C1. Close the assistant plan-gating bypass ☑ done
- Invariant moved to the service layer: `assertRuleKindAllowed` (pure, in `billing/limits.ts`) + `enforceRuleKind` in `rules/service.ts` (fetches tenant plan, throws 402) guards both `createRule` and `updateRule`. Redundant router check removed. The assistant/internal apply path is now covered — its 402 surfaces in the apply `errors[]`.
- Test: `billing/limits.test.ts` covers reject-on-free / allow-on-business (28/28 pass).
- Remaining: C1a (assistant super_admin guard + regex complexity, ties to C2).

Original problem: plan gating lived in the HTTP router (`rules/router.ts:25`), but the assistant applies rules through the internal client, which skips that router. Fix by moving the invariant **down to the service layer**, the one choke point both paths cross.

Plan:
1. Add the check inside `rules/service.ts:createRule` (and `updateRule` when `kind` changes): fetch the tenant plan, call `isRuleKindAllowed(plan, kind)`, throw a `402`-tagged error if not allowed. `createMember` already does exactly this for seats (`members/service.ts:44`) — mirror that shape (tenant lookup via `tenantsClient`, `statusCode` on the error).
2. Delete the now-redundant check in `rules/router.ts` (or keep it for a friendlier message, but the service is the source of truth).
3. Same audit sweep for the other assistant ops — confirm no other entitlement is enforced only at the router: seats (covered), advancedAnalytics, assistant-enabled. Add service-level guards where an internal path can reach them.
4. Test: unit test `createRule` rejects `pattern` on a `free` plan; e2e — free-plan tenant asks the assistant to add a regex rule → apply returns the 402 error in the `errors[]` array (`assistant/apply.ts` already collects per-action errors).

Principle to lock in: **entitlement and tenant-scope checks belong in services, not routers**, because the assistant/internal mesh bypasses routers by design.

### C1a. While here — assistant action authorization ☐
- `assistant/apply.ts` can `create_member` with `role:'super_admin'`. Access is already limited to super-admins (`requireAdminTokenOrClerkAdmin`), so not an escalation today, but add a guard so the assistant can't mint `super_admin` unless the caller explicitly is one, and cap regex complexity on `create_rule` (ties to C2).

### C2. Regex safety on rule ingest ☐
- AI (and admins) can author arbitrary regex compiled in every browser → ReDoS risk. Add a complexity/timeout guard when a `pattern` rule is created/updated.

### C3. Pseudonymize member PII sent to LLMs ☐
- `assistant/prompt.ts` embeds member emails in the system prompt to Anthropic/OpenAI/Groq. Replace `email` with `member-<hash>` (AI only needs IDs). Sign DPAs + list sub-processors regardless.

### C4. Scan/audit retention + erasure ☐
- Implement the purge job described in `scans/service.ts` TODO (default 90d) and anonymize member scan rows on deletion. Aligns with the site's stated 90-day window.

### C5. Deploy ordering: migrate before live ☑ done
- `backend-deploy.yml` reordered: migrations + seed run **before** the Render deploy POST; deploy fails if migrations fail. Added a "Guard against destructive migrations" step in the `test` job that greps newly-changed `backend/drizzle/*.sql` for `DROP COLUMN`/`DROP TABLE`/`ALTER ... TYPE`/`RENAME` and fails unless repo var `ALLOW_DESTRUCTIVE_MIGRATION=true`. `fetch-depth: 0` added so the diff works.

Rationale:

You keep migrations — schema will change. The question is only **when** they run relative to the new image going live. Today (`backend-deploy.yml:107-133`): Render deploy fires, *then* `migrate.ts` runs. That creates a window where new code serves against the old schema, and a non-additive migration breaks prod mid-rollout. "Additive-only" is a code comment, not a gate.

Recommended for pilot — **migrate-first (expand/contract):**
1. Reorder the workflow: run `pnpm exec tsx src/db/migrate.ts` against prod **before** the Render deploy POST. Fail the job if migrations fail → the bad image never goes live.
2. This is safe as long as each migration is backward-compatible with the *currently running* (old) code for the brief overlap — standard expand/contract: add columns/tables now, backfill, switch reads, drop in a *later* release. Never `DROP`/rename in the same deploy that needs the column gone.
3. Add a lightweight guard so the rule is enforced, not hoped: a CI check that greps new `drizzle/*.sql` for `DROP COLUMN`/`DROP TABLE`/`ALTER ... TYPE`/`RENAME` and fails unless the PR carries a `migration:destructive-reviewed` label. Cheap, catches the foot-gun.
4. Migrations run with `max: 1` and are transactional per drizzle — fine. Add an app-start schema-version assertion later if you want belt-and-suspenders (block boot if DB is behind the code's expected version).

Net: flip the two steps + add the destructive-migration CI grep. Low effort, removes the single biggest deploy risk for a low-traffic pilot. Rollback story stays: migrations are forward-only, so a bad *code* deploy rolls back by redeploying the previous image (schema already expanded, still compatible).

---

## Track D — Console / product polish

- D1. ☐ Remove or fix the Stripe portal path (PayPal is live; Stripe routes disabled).
- D2. ☐ Add destinations/sites/publish to sidebar nav.
- D3. ☐ Fix console Docker port/CSP mismatch (`5173:80` vs nginx `8080`).
- D4. ☐ Enforce or hide the parsed-but-unenforced policy fields (`destinations`, `allowSendAnywayWithReason`, `perSite.defaultAction`, `auditRetentionDays`).
- D5. ☐ Fix managed-storage schema: declare the `orgToken` key the extension reads, or the enterprise MDM bypass-prevention guarantee is void.

## Track E — Marketing / claims (before external pilot users see the site)

- E1. ☐ Reconcile "every prompt / all AI sites" to the real 3-host support matrix.
- E2. ☐ Remove/qualify unsourced stats, "200+ companies", SSO/SAML/SIEM/on-prem, "SOC 2 in progress".
- E3. ☐ Fix `eu-west-1` "Frankfurt" (it's Ireland) and the "never stored / 90-day" retention wording (must match C4).

## Track F — Repo hygiene

- F1. ☐ `AGENTS.md` says "no pnpm-workspace.yaml" but one exists — update.
- F2. ☐ Prune stale `worktree-agent-*` branches on origin.
