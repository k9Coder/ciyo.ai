---
status: current
owner: desktop
verified_at: 2026-09-19
sources:
  - docs/PILOT_ACTION_PLAN.md (Track A, G1)
  - docs/operations/desktop-validation.md
  - docs/operations/release-process.md
  - pretzel-desktop/electron/proxy.ts
  - pretzel-desktop/electron/policy-sync.ts
  - pretzel-desktop/electron/auth.ts
  - pretzel-desktop/electron/session.ts
  - pretzel-desktop/electron/ca.ts
  - pretzel-desktop/qa-bridge/server.mjs
  - backend/src/desktop-auth/router.ts
---

# Pretzel Desktop: QA report and pilot-readiness (September 2026)

Written 2026-09-25 about a QA pass done 2026-09-19. Read this before you resume desktop development or plan its release. It records what was tested, what was found, what was fixed, what was **not** tested, how to repeat the QA, and what still blocks a pilot.

## 1. Bottom line

**Pretzel Desktop is not ready for pilot users yet.** The app logic is in good shape: sign-in, policy sync, block and warn enforcement through the proxy, session handling, and crash recovery all worked in a live end-to-end run. But the riskiest parts of the product were never exercised, because they cannot be exercised from a developer machine or by an agent:

- a real installer on a clean machine, with the CA trust prompt (UAC) and the OS proxy change
- real logged-in ChatGPT, Claude and Gemini traffic, including streamed replies
- non-AI sites (bank, Gmail) passing through untouched
- code signing / SmartScreen, uninstall cleanup, auto-update in a packaged build

That work is the A8 gate in `docs/PILOT_ACTION_PLAN.md`, and the checklist for it already exists in `docs/operations/desktop-validation.md`. Nothing in this report replaces it.

## 2. What was done

| Area | Result |
|---|---|
| Unit tests (desktop) | 202 before, **256** after (+54). All pass. |
| Typecheck (desktop, both tsconfigs) | Green. (`PILOT_ACTION_PLAN.md` A5 says red; that is stale.) |
| Playwright e2e (`pnpm test:e2e`) | 6/6 pass. |
| Backend suite | 58 files pass, 1 skipped. |
| Console suite | 94 tests pass, 1 skipped. |
| Live run | Real app + isolated backend/console/Postgres, driven through `pretzel-desktop/qa-bridge`. |

The fixes shipped in PR #33 (into `staging`) and PR #34 (`staging` into `master`). **They are on production `master`**, including DB migration `0011`.

## 3. Findings

Severity is as judged at the time. "Fixed" means fixed with a regression test and re-verified in the running app.

| ID | Sev | Finding | Status |
|---|---|---|---|
| 001 | High | Decision window inferred "block" from severity `critical`, not the rule action. A high-severity `block` rule showed "Policy Warning" with an **Allow anyway** button (a bypass). A critical `warn` rule showed as a hard block. | Fixed (`bae6415`, test `72ebb0b`) |
| 002 | Medium | An unanswered prompt was resolved by `failMode` alone after 30s, so under fail-open a `block` rule's request was **sent** if the user walked away. The prompt window also stayed open on a dead request. | Fixed (`9641e7b`) |
| 005 | High | The single startup policy fetch failed silently if the network was not up at login. Next attempt was 2 minutes away, so the proxy ran with no rules. Reproduced: policy loaded 96s after the backend returned. | Fixed (`8858a44`): 4s in the same test |
| 007 | High | Expired or revoked device token: credentials were cleared but the UI was never told. Tray sat on "Waiting" with no sign-in button until restart. The 90-day expiry makes this a guaranteed event for every user. | Fixed (`c5d9c6c`) |
| 008 | Medium | Audit-log events derived block/warn from severity instead of the rule action (same class as 001). | Fixed (`a3fdffb`) |
| 009 | Low | Startup race: the final status push could overwrite "policy loaded" if the first sync landed before the proxy finished starting. | Fixed inside `8858a44` |
| 003 | Low | `POST /v1/policy/exceptions` returns **500** for a non-UUID `ruleId` (should be 400). Only the synthetic e2e hook id triggers it. | **Open** |
| 006 | Low | Renderer windows had no Content-Security-Policy. | Fixed (`0392fc6`) |
| 010 | Low | One relaunch after a hard kill skipped the startup sync. Not reproducible in 10 later tries. The retry work (005) makes it recoverable either way. | Unreproduced |

Features added in the same pass (requested during QA): sign-out with an account row in the tray (`89786ae`), server endpoints `GET /auth/desktop/session` and `POST /auth/desktop/sign-out` plus migration `0011` (`4145ee9`), and a **Desktop** column on the console Members page showing last sign-in and last sign-out (`50d63cf`).

### Things that look like bugs but are not

- Update check shows "Up to date - 31.7.7". In an unpackaged dev run `app.getVersion()` returns Electron's own version.
- `Skip checkForUpdates because application is not packed` in logs. Expected in dev.
- Four e2e failures with "Process failed to launch!". The harness sets `ELECTRON_RUN_AS_NODE=1`; run `env -u ELECTRON_RUN_AS_NODE pnpm test:e2e`. (The qa-bridge deletes it itself.)
- Screenshots occasionally time out right after sign-in or on a hidden window. A hidden window cannot be captured; a plain retry works.

## 4. Behaviour as it now works (for the next developer)

**Unanswered prompt.** `decideOnTimeout(highestAction, failMode)` in `proxy.ts`: `block` rules are always denied; `warn` rules are sent, or denied when the org is fail-closed. The prompt shows a countdown (`deadlineAt`, `onTimeout` in the decision event), then a "Blocked/Sent automatically" notice for 4s, then hides. An OS notification is always raised on timeout (raised to silent if the user set notifications to off). The tray activity list records `outcome` (`blocked`, `allowed`, `timeout-blocked`, `timeout-allowed`). The 403 body carries the reason and restores the typed text. `PRETZEL_DECISION_TIMEOUT_MS` shortens the 30s wait, only when `PRETZEL_E2E=1`.

**Session.** `session.ts` fetches `GET /auth/desktop/session` at launch, after sign-in, and every 6h (account, tenant name, token expiry). A 401 from either the session call or `/v1/policy` runs `handleSessionLost` in `main.ts`: clears credentials, drops the loaded policy, pushes `auth:state` to the tray, rebuilds the native menu, and starts the sign-in nag. Inside 14 days of the 90-day expiry the tray shows "Your sign-in expires soon" and one OS notification per launch. The device token has a fixed 90-day expiry with no refresh (`DEVICE_TOKEN_TTL_MS` in `backend/src/desktop-auth/service.ts`).

**Startup sync retry.** `policy-sync.ts` classifies each fetch: network error, timeout, 5xx, 408, 429 = transient; 401 = auth; other 4xx or unreadable body = invalid. While no policy has ever loaded, transient failures retry at 5s, 15s, 30s, then every 60s. Once a policy is loaded the 2-minute tick is enough and the stale policy keeps enforcing. 10s fetch timeout. Also syncs on `powerMonitor` resume. The tray shows "Can't reach server / Retrying".

**Sign-out.** Calls `POST /auth/desktop/sign-out` first (revokes the device token, sets `device_tokens.signed_out_at`), then clears credentials and policy locally. If the server is unreachable the device still signs out and the tray says the record will follow. No immediate nag after a deliberate sign-out; the 24h reminder still runs. The console reads it from `GET /v1/members` (`desktopLastSignInAt`, `desktopLastSignOutAt`).

**CSP.** `renderer-csp.ts`, injected by a Vite plugin in production builds only (dev hot reload needs inline scripts). Verified: both windows render, no violations.

## 5. What was NOT tested

Everything below was out of reach for this QA. Treat each as unverified, not as passing.

1. **Real AI traffic.** Proxy tests posted to `chatgpt.com/backend-api/conversation` unauthenticated and got Cloudflare's 403 from upstream. No logged-in session was used, so streaming (SSE) through the proxy and the live request shapes for ChatGPT, Claude and Gemini are unproven (plan items A3 residual, B1a).
2. **CA trust and elevation on a clean machine.** QA used `curl -k`. No normal browser ever trusted the proxy's CA, and the UAC prompt path (`ca.ts installCACert`, `hardening.ts`) was never run for real.
3. **Non-AI hosts untouched.** Not checked that a bank or Gmail passes through with its real certificate.
4. **Packaged app.** Only the unpackaged dev app was run. Not tested: NSIS installer, uninstall cleanup (CA and proxy residue), electron-updater, code signing and SmartScreen, `keytar` in a packaged build.
5. **Concurrent held requests (suspected issue, not reproduced).** The decision window holds one event (`lastEvent` in `decision-window.ts`). A second held request probably replaces the first prompt; the first then times out and is auto-blocked or auto-sent without the user seeing it (`PILOT_ACTION_PLAN.md` A7). Needs a test.
6. **macOS and Linux.** Windows only. The plan already recommends Windows-first.
7. **Tray icon and native menu.** Skipped under `PRETZEL_E2E` (no real OS tray). The new "Sign out…" menu item and its confirm dialog were not clicked.
8. **Pause / kill switch (A6).** Not built. Today "Quit" restores the OS proxy and the sentinel/watchdog restore it after a crash (verified with a hard kill), but there is no pause that keeps the app running.

## 6. Hazards for developers and QA

- **The installed app and a dev/QA run share the OS keychain.** `ca.ts` stores the local CA private key under keychain service `pretzel-desktop`, account `local-ca-key`, one slot per Windows user. A dev or QA instance that generates a new CA overwrites it. On 2026-09-19 the key in the keychain matched `%APPDATA%\Electron\pretzel-ca.crt` (dated 2026-09-05, from an earlier QA run) but **not** `%APPDATA%\pretzel-desktop\pretzel-ca.crt` (dated 2026-08-13). If a real install reads a cert file that does not match the keychain key, its intercepted HTTPS shows certificate errors. Which data folder the installed app uses (`pretzel-desktop` or `Pretzel Desktop`) was **not confirmed**. To recover on an affected machine: quit the app, delete its `pretzel-ca.crt`, relaunch, approve the UAC prompt. Planned fix: in `PRETZEL_E2E` mode keep the CA key in a file under userData (as auth already does with `e2e-credentials.json`) so QA never touches the keychain.
- **QA data folder.** The bridge launches `electron main.js`, so the app name is "Electron" and userData is `%APPDATA%\Electron`, not the installed app's folder. Credentials there are plaintext in `e2e-credentials.json`, E2E mode only.
- **Baked API URL.** `electron.vite.config.ts` bakes `PRETZEL_API_URL` at build time from the environment or `.env`. A plain `pnpm build` points at **production**. A QA build must set it.
- **Port 18888 and the OS proxy.** Only one Pretzel instance can own the proxy port and the Windows system proxy. Close a running installed app before QA, and confirm `ProxyEnable` is 0 afterwards.
- **A misleading first diagnosis.** During QA a `curl --cacert` chain error was blamed on the shared keychain. It was more likely that the wrong cert file was used (`%APPDATA%\pretzel-desktop`, not `%APPDATA%\Electron`). The overwrite risk above is real either way.
- **While signed out, or after a session is lost, the proxy keeps running and intercepting AI hosts with no policy.** Traffic passes, but the interception and any cert warning remain. Decide whether that is acceptable (see section 8).

## 7. How to repeat the QA

All commands from the repo root in Git Bash on Windows. Use a label per run.

1. Close the installed Pretzel Desktop. Confirm nothing listens on 18888.
2. Start the isolated stack **without** the seed argument:
   `bash scripts/agent-stack-daemon.sh "" --with-console --label qa-desktop-1`
   Passing `seed:e2e` fails: the seed calls `compilePolicy`, which uses `INTERNAL_API_URL` (default `localhost:3000`, another process on a dev machine) before the isolated backend exists.
3. Seed against the isolated backend:
   `source .gstack/agent-stacks/qa-desktop-1/env`, then in `backend/`:
   `DATABASE_URL=$DATABASE_URL INTERNAL_API_URL=$BACKEND_URL E2E_CLERK_USER_ID=... E2E_CLERK_USER_EMAIL=... INTERNAL_SECRET=... pnpm seed:e2e`
   (the values are in `e2e/.env.e2e`). The seed includes two dictionary rules: `ACME_SECRET` (block, high) and `ACME_WARN` (warn, medium).
4. Build the app against that backend:
   `cd pretzel-desktop && PRETZEL_API_URL=$BACKEND_URL CLERK_PUBLISHABLE_KEY=<from e2e/.env.e2e> SENTRY_DSN_DESKTOP="" pnpm build`
   Check: `grep -o 'PRETZEL_API_URL.parse("[^"]*")' dist-electron/main.js`.
5. Drive it: `node pretzel-desktop/qa-bridge/cli.mjs <command>` with `goto tray|decision`, `snapshot -i`, `click @eN`, `js "<expr>"`, `screenshot <file>`, `console --errors`, `decision`, and `signin <email> <password>` (the full OAuth round trip against the isolated console). Set `PRETZEL_DECISION_TIMEOUT_MS=12000` in the shell first to shorten timeouts.
6. Enforcement recipe (through the real proxy, no browser needed):
   `curl -x http://127.0.0.1:18888 -k --ssl-no-revoke -H content-type:application/json -X POST https://chatgpt.com/backend-api/conversation -d '{"messages":[{"content":{"parts":["here is ACME_SECRET data"]}}]}'`
   A block returns `403` with header `X-Pretzel-Blocked: 1`; a forwarded request returns the upstream response.
7. Useful scenarios: revoke the token while the app runs (`docker exec <db container> psql -U postgres -d promptshield -c "update device_tokens set revoked_at=now();"`) and watch the "session expired" card; stop the backend before launch and restart it to see "Can't reach server / Retrying"; kill the bridge process tree (`taskkill //PID <pid> //T //F`) to test crash recovery of the OS proxy.
8. Backend tests: `.env.test` overrides `DATABASE_URL` and points at `localhost:5432/promptshield_test`. To use a throwaway database, run vitest with a temporary config that re-overrides `env.DATABASE_URL`.
9. Tear down: `bash scripts/agent-stack-stop.sh <label>`, kill the bridge, verify the registry value `HKCU\...\Internet Settings\ProxyEnable` is 0.

## 8. Open decisions

| Question | Options / notes |
|---|---|
| Should users be able to sign out? | Currently yes, and the console shows it. Admins cannot prevent it. A DLP tool may want a policy flag for org-managed installs. |
| What should the proxy do when signed out or session lost? | Today it keeps intercepting with no policy. Alternatives: stop the proxy and restore the OS proxy until sign-in (safer for user trust, but the user also loses protection state visibility). |
| Warn prompt timeout under a fail-closed org | Implemented as block. Console copy was updated to say so. Confirm this matches what admins expect. |
| Token lifetime | Fixed 90 days, no renewal. A sliding renewal near expiry would avoid the periodic re-sign-in. |
| Report the final outcome (allowed / blocked / timed out) to the audit log | Needs a backend field and a console column. The local tray already records it. |

## 9. Backlog to reach a pilot, in order

**Must do before any pilot user**
1. Run `docs/operations/desktop-validation.md` on a clean Windows machine or VM with a build pointed at **staging**. Windows Sandbox was not available on the dev machine.
2. Decide on code signing (Windows OV/EV certificate) versus documenting the SmartScreen workaround for pilot users.
3. Reproduce and, if real, fix the concurrent-prompt case (5 in section 5).
4. Apply the CA-key isolation for E2E/QA mode and confirm which userData folder a packaged install uses, so QA can never overwrite a real install's CA key.

**Also add to the validation matrix** (these were not in `desktop-validation.md`)
- Session expiry and re-sign-in; sign-out and the console Desktop column.
- Launch with no network, then connect; policy should load within about a minute.
- Unanswered block and warn prompts, and the "automatically" notices.

**Should do**
- Report final outcome to the audit log (section 8).
- Pause / kill switch in the tray (A6), and the proxy-when-signed-out decision.
- Fix backend 500 on non-UUID `ruleId` (003).
- Click through the native tray menu on a real desktop session.
- Refresh `PILOT_ACTION_PLAN.md` (A5 typecheck, A7 timeout copy, and G1 Sentry are done) and `desktop-validation.md` (mentions 2026-09-05 changes only).

**Nice to have**
- Investigate the `ERROR: The system was unable to find the specified registry key or value.` line printed at app start.
- Make the e2e decision hook (`triggerE2eDecision`) resolve a real held request so it can be used for timeout tests.

## 10. Evidence and references

- Commits (all on `master` via PRs #33 and #34): `bae6415`, `72ebb0b`, `4145ee9`, `50d63cf`, `c5d9c6c`, `8858a44`, `a3fdffb`, `9641e7b`, `89786ae`, `0392fc6`.
- Migration: `backend/drizzle/0011_*.sql` (adds nullable `device_tokens.signed_out_at`, no backfill).
- Regression tests: `pretzel-desktop/tests/unit/decision-kind*.test.ts`, `proxy-decision.test.ts`, `policy-sync.test.ts`, `session.test.ts`, `renderer-csp.test.ts`, `report-event.test.ts`; `backend/tests/desktop-session.test.ts`; `pretzel-console/tests/MembersPage.test.tsx`.
- Screenshots from the run were written to `.gstack/qa-reports/screenshots/` (gitignored, local to the machine that ran QA).
- Validation gate: `docs/operations/desktop-validation.md`. Release steps: `docs/operations/release-process.md`.
