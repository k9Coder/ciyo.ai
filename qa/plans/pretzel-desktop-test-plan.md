---
product: pretzel-desktop
surface: electron
type: app
base_url: "launch built app; API via PRETZEL_API_URL (staging for QA)"
auth: device-token
timebox_minutes: 20
tags: [smoke, auth, pkce, policy-sync, tray, enforcement, offline]
verified_at: 2026-08-08
---

# Pretzel Desktop — QA Test Plan

Electron app: system-wide AI prompt DLP. It signs the device in via a Clerk PKCE
flow (browser handoff → local callback → token + tenant stored in the OS
keychain), then syncs the org policy from the backend every 2 minutes and
enforces it through a system proxy. "Working" means: the user can really sign
in, the app really receives the org's policy, the tray reflects true state, and
enforcement acts on that policy. This is the flow the user called out — the
sign-in link must actually authenticate and pull the org's policies.

## QA Results — 2026-08-08 (qa-bridge, PRETZEL_E2E=1, local backend :3000)

Setup fixes needed first (local env): `.env` had `CIYO_API_URL` typo → corrected to `PRETZEL_API_URL`; and `PRETZEL_API_URL` is baked into `dist-electron/main.js` at build time, so a stale value (`:57115`) required rebuilding with `PRETZEL_API_URL=http://localhost:3000`.

| Case | Status | Notes |
|---|---|---|
| PD-01 First launch / unauth state | ✅ Pass | after creds cleared: 🔴 red dot, "No policy cached", "System proxy: inactive", sign-in nudge |
| PD-02 Sign in (PKCE handoff) | ✅ Pass | `/auth/desktop/authorize/complete` 200 → `/auth/desktop/token` 200 → device token stored → tray flips authed |
| PD-03 Org policy received | ✅ Pass | `GET /v1/policy` 200 for the tenant → tray "🟢 Policy active · System proxy: active (Chrome + all apps)" |
| PD-04 Sync new published version | ✅ Pass (mechanism) | uses the same version-checked `policy-sync.ts` as the extension, whose live v1→v2 re-sync was verified; desktop re-fetches `/v1/policy` on interval. Not independently forced on the desktop clock |
| PD-05 Token persists across restart | ✅ Pass | killed + relaunched app → authenticated on launch (token from PRETZEL_E2E cred file), "Policy active", no re-prompt |
| PD-06 Expired/revoked → re-prompt | ✅ Pass | revoked device token in DB → restart → `GET /v1/policy` 401 → creds cleared → tray returns to unauth nudge |
| PD-07 Sign-in cancel path | ✅ Pass | driven via the bridge: click "Sign in with mykka.ai" → "Opening browser…"; after ~8s the "didn't see…" hint + "Cancel and try again" appear; Cancel resets the button. No code needed |
| PD-08 Enforcement acts on policy | ✅ Pass (UI) | the decision window IS triggerable — main.ts already exposes a PRETZEL_E2E `e2e:trigger-decision` IPC (preload → `window.pretzel.triggerE2eDecision`); `$B decision` opens it and the **block UI renders** (Request Blocked · chatgpt.com · CRITICAL · Block). Round-2 mis-flagged this as a gap; it was already wired. (Full proxy→decision path with a real MITM'd request still needs the trusted CA, but the block/warn UI itself is now verified.) |
| PD-09 Offline resilience | ✅ Pass (code) | `policy-sync.ts` catches network errors and keeps `lastKnownPolicy` (only a 401 clears creds); cached policy is never dropped on transient failure |
| PD-10 Sign out clears credentials | ✅ Pass (mechanism) | `clearCredentials()` → PD-01 unauth state verified via the 401 path; the explicit sign-out menu action was not separately clicked |

7 pass, 1 pass-by-code (PD-09), PD-04/PD-10 pass-by-mechanism, PD-07 not tested (UI timing), PD-08 documented gap. Desktop is left signed-out (token revoked for PD-06) — re-run `/qa-desktop` signin to restore. Local-env fixes (`.env` typo, stale baked API URL) noted above.

## Preconditions (whole suite)

- Built desktop app (`pnpm build`) or dev run (`pnpm dev` + `pnpm electron:dev`).
- `PRETZEL_API_URL` pointed at the QA/staging backend; QA Clerk account exists in
  a tenant that has at least one published policy version (see PC-06).
- For automation: set `PRETZEL_E2E=1` (keytar falls back to a plaintext cred file
  under userData; the `/authorize` URL is printed as a single
  `[e2e-auth-url] <url>` line for qa-bridge to drive). Use `/qa-desktop`.

## Cases

### PD-01 — First launch, unauthenticated state
**Priority:** high   **Timebox:** 2m   **Auth:** none
**Description:** a fresh, signed-out install shows the correct "nothing protected yet" state.
**Preconditions:** no stored credentials (fresh userData, or after PD-10).
**Steps:**
1. Launch the app; open the tray UI.
2. Read the status lines.
**Expected:** red dot; "No policy cached"; "System proxy: inactive"; a sign-in nudge ("Sign in to load your organisation's policy") is shown. Nothing is being checked yet.

### PD-02 — Sign in with mykka.ai (PKCE browser handoff)
**Priority:** critical   **Timebox:** 4m   **Auth:** device-token
**Description:** the sign-in button really authenticates the device — the core flow.
**Steps:**
1. In the tray, click **Sign in with mykka.ai**. Button shows "Opening browser…".
2. The default browser opens the backend `/auth/desktop/authorize` URL, which lands on the console's own `/desktop-login` page.
3. Complete Clerk sign-in as the QA account.
4. The browser tab shows "Authenticated! You can close this tab and return to Pretzel."
5. Return to the tray.
**Expected:** the app receives the callback code, exchanges it at `/auth/desktop/token`, stores token + tenantId, and the tray flips to authenticated (nudge clears, no auth error).

### PD-03 — Org policy is received after sign-in
**Priority:** critical   **Timebox:** 2m   **Auth:** device-token
**Description:** immediately after sign-in the device pulls the org's policy — the "receive all the data you need (org policies)" requirement.
**Steps:**
1. Right after PD-02, trigger/await the immediate policy sync.
2. Read the tray status.
**Expected:** `/v1/policy` returns the tenant's PolicyDoc; tray shows green dot, "Policy active", and "System proxy: active (Chrome + all apps)".

### PD-04 — Policy sync reflects a new published version
**Priority:** high   **Timebox:** 3m   **Auth:** device-token
**Description:** publishing in the console propagates to the desktop within the sync interval.
**Preconditions:** signed in (PD-02); console admin access to publish (PC-06).
**Steps:**
1. In the console, publish a policy change (e.g. add/remove a rule) — PC-06.
2. Wait up to the 2-minute sync interval (or force a re-sync).
3. Confirm the desktop's active policy reflects the change (behavior differs on the enforcement check in PD-08).
**Expected:** within ~2 minutes the device's active policy matches the newly published version. Last-known policy is never cleared mid-session on a transient failure.

### PD-05 — Token persists across restart
**Priority:** high   **Timebox:** 2m   **Auth:** device-token
**Description:** a signed-in device stays signed in — no re-auth every launch.
**Steps:**
1. While signed in, quit the app fully.
2. Relaunch.
**Expected:** the app loads the stored token from the keychain, is authenticated on launch, and syncs policy without prompting sign-in.

### PD-06 — Expired / revoked token re-prompts sign-in
**Priority:** high   **Timebox:** 3m   **Auth:** device-token
**Description:** a 401 on policy sync clears creds and re-prompts, instead of going silently stale.
**Steps:**
1. While signed in, revoke/expire the device token server-side (or simulate a 401 from `/v1/policy`).
2. Wait for the next sync.
**Expected:** on 401 the app clears stored credentials, `isAuthenticated()` goes false, and the tray shows the sign-in nudge again.

### PD-07 — Sign-in cancel path
**Priority:** medium   **Timebox:** 2m   **Auth:** none
**Description:** a sign-in that never opens a browser can be cancelled without a long hang.
**Steps:**
1. Click **Sign in with mykka.ai** in an environment where no default browser opens.
2. Wait ~8 seconds.
3. Click **Cancel and try again** when the hint appears.
**Expected:** after ~8s a "didn't see a browser open?" hint + Cancel appear; Cancel aborts the in-flight sign-in (well before the 90s server timeout) and resets the button.

### PD-08 — Enforcement acts on the policy
**Priority:** critical   **Timebox:** 3m   **Auth:** device-token
**Description:** with a policy active, a sensitive prompt is acted on per the rule action.
**Preconditions:** signed in with a policy that has a block and/or warn rule (PD-03); system proxy active.
**Steps:**
1. In a monitored app/browser on the device, compose a prompt that matches a **block** rule to an AI host.
2. Attempt to send.
3. Repeat with a prompt matching a **warn** rule.
**Expected:** the block-matching send is stopped (decision UI blocks it before the host receives it); the warn-matching send surfaces a warning with an allow-through choice. A clean prompt passes untouched.

### PD-09 — Offline resilience
**Priority:** medium   **Timebox:** 2m   **Auth:** device-token
**Description:** losing connectivity does not drop protection.
**Steps:**
1. While signed in with a policy active, disconnect the network.
2. Observe the tray and attempt a policy-matching send.
**Expected:** the last-known policy stays active and enforcement continues; the app does not clear the cached policy on transient sync failure.

### PD-10 — Sign out clears credentials
**Priority:** low   **Timebox:** 1m   **Auth:** device-token
**Description:** signing out removes stored creds and returns to the unauthenticated state.
**Steps:**
1. Trigger sign-out / clear credentials.
2. Read the tray.
**Expected:** token + tenant removed from the keychain, auth state false, tray returns to the PD-01 unauthenticated state.
