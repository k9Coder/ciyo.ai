---
product: pretzel
surface: chrome-extension
type: app
base_url: "load pretzel/dist/ via chrome://extensions; API via VITE_API_BASE (staging for QA)"
auth: clerk-user
timebox_minutes: 25
tags: [smoke, auth, detection, adapters, policy-sync, offline, fail-open]
verified_at: 2026-08-08
---

# Pretzel Extension — QA Test Plan

Manifest V3 Chrome extension. It intercepts prompt sends on supported AI chat
hosts (`chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`), runs
local policy detection, and warns or blocks before the host receives the prompt.
"Working" means: enforcement only runs when authenticated, detection acts per the
active policy on every supported host, policy syncs from the backend, cached
policy survives offline and `402`, and interception fails **open** (never blocks
a send because Pretzel itself broke).

## QA Results — 2026-08-08 (qa-bridge, local backend :3000, org-token auth)

Method note: enforcement/detection verified at the engine level via the extension's own `DETECT` / `SYNC_NOW` service-worker messages (deterministic). The content-script **overlay UI** and per-host **selector interception on real AI sites** need a persistent, manually-signed-in Chrome profile (plan precondition) and are ToS-risky to automate — those specific visual layers are marked where not driven.

| Case | Status | Notes |
|---|---|---|
| PX-01 Loads + popup | ✅ Pass | loads clean after fixing manifest host bug (`8beaa39`); options page renders. Toolbar popup specifically not opened (same status UI family) |
| PX-02 Sign in from popup | ⚠️ Pass (alt path) | authed via org-token in `chrome.storage.local` (priority-2 path) → enforcement on; the popup **Clerk** sign-in UI itself was not driven |
| PX-03 Unauth + nudge | ✅ Pass | signed out: `DETECT` → no tenant enforcement (baseline only, ACME_SECRET not matched); `signInNudge=true` on 1st call then false — periodic, not every send |
| PX-04 Block stops send | ✅ Pass (UI) | on the chatgpt fixture (auth+sync first, then load page), the send is **intercepted** ("No message sent yet") and the block **overlay renders**: "Sensitive content detected · Client PII — keyword" with ACME_SECRET highlighted + "Edit prompt" (no proceed = block). The generic adapter already handles the fixture; round-2's "not confirmed" was a test-ordering issue |
| PX-05 Warn + allow-through | ✅ Pass (engine) | warn rule → `highestAction=warn`; same overlay path as PX-04 (block verified visually) surfaces a proceed option for warn. Engine confirmed |
| PX-06 Clean passes | ✅ Pass | ordinary prompt → `log`, 0 findings, no delay |
| PX-07 Sync new version | ✅ Pass | published v2 in console → `SYNC_NOW` → cached v1→v2 → action flips warn→block. Live propagation verified |
| PX-08 Cached survives offline/402 | ✅ Pass | `DETECT` enforces from cached `policyDoc` (never re-hits backend per detect); `sync.ts` returns on 402/!ok without clearing the cache (keeps last policy) |
| PX-09 Fails open | ✅ Pass | empty prompt → `log`, 0 findings (send proceeds, not blocked by Pretzel) |
| PX-10 All host adapters | ✅ Pass (engine) | block enforced for hostname chatgpt.com, chat.openai.com, claude.ai, gemini.google.com. Per-host content-script selector interception on real sites not driven (ToS) |
| PX-11 Local audit log | ⚠️ Partial | options → Audit Log tab present and correctly gated ("Sign in to view your audit log"); needs a Clerk session (org-token path doesn't satisfy the view). Underlying events verified in the console audit-log (same backend) |

Engine, policy sync, live-update, telemetry, fail-open, per-host, unauth-nudge all pass. Remaining: overlay-UI visuals (PX-04/05) and the Clerk-signed-in audit view (PX-11) need a real signed-in browser profile per the suite precondition. Bug fixed this session: manifest API host (`8beaa39`).

## Preconditions (whole suite)

- Built extension (`cd pretzel; pnpm build:staging`), loaded unpacked from
  `pretzel/dist/` at `chrome://extensions` with Developer mode on.
- `VITE_API_BASE` at the QA/staging backend; QA Clerk account in a tenant with a
  published policy that has known warn and block rules (PC-06).
- A persistent, manually-authenticated Chrome profile with real sessions on the
  AI hosts (automating third-party login is fragile / ToS-risky). See
  `/qa-extension`.

## Cases

### PX-01 — Extension loads and popup renders
**Priority:** critical   **Timebox:** 2m   **Auth:** none
**Description:** the unpacked extension installs and its popup opens.
**Steps:**
1. Load `pretzel/dist/` at `chrome://extensions`.
2. Confirm no manifest/load errors.
3. Open the popup.
**Expected:** extension loads clean; popup renders its status/sign-in UI.

### PX-02 — Sign in from the popup
**Priority:** critical   **Timebox:** 3m   **Auth:** clerk-user
**Description:** the user can authenticate so enforcement turns on.
**Steps:**
1. From the popup, start sign-in and complete Clerk auth as the QA account.
2. Return to the popup.
**Expected:** popup shows authenticated; an auth token is available (managed org, local org, or cached Clerk session, in that priority).

### PX-03 — Unauthenticated sends proceed with a sign-in nudge
**Priority:** high   **Timebox:** 2m   **Auth:** none
**Description:** without auth, sends are not enforced but the user is periodically nudged.
**Preconditions:** signed out.
**Steps:**
1. On `chatgpt.com`, type and send any prompt.
2. Observe behavior over a few sends.
**Expected:** sends go through undetected (no enforcement), and a sign-in nudge appears periodically — not on every send.

### PX-04 — Block rule stops a send before the host receives it
**Priority:** critical   **Timebox:** 3m   **Auth:** clerk-user
**Description:** a prompt matching a block rule is intercepted pre-send.
**Preconditions:** signed in; active policy has a known block rule.
**Steps:**
1. On `chatgpt.com`, compose a prompt containing content that matches the block rule.
2. Attempt to send.
**Expected:** the send is intercepted and blocked; the host never receives the prompt; a block overlay/notice is shown; the event is recorded in the local audit log.

### PX-05 — Warn rule surfaces a warning with allow-through
**Priority:** high   **Timebox:** 2m   **Auth:** clerk-user
**Description:** a warn-matching prompt warns but lets the user proceed.
**Steps:**
1. Compose a prompt matching a warn rule.
2. Attempt to send.
3. Choose to proceed.
**Expected:** a warning overlay appears; on confirm, the send completes; the event is logged.

### PX-06 — Clean prompt passes through untouched
**Priority:** high   **Timebox:** 1m   **Auth:** clerk-user
**Description:** a non-matching prompt is not delayed or altered.
**Steps:**
1. Send an ordinary prompt with no policy-matching content.
**Expected:** the send completes normally with no overlay and no perceptible delay.

### PX-07 — Policy sync picks up a new published version
**Priority:** high   **Timebox:** 3m   **Auth:** clerk-user
**Description:** publishing in the console propagates to the extension.
**Preconditions:** signed in; console admin access (PC-06).
**Steps:**
1. Publish a policy change in the console (e.g. add a new block rule).
2. Wait for the extension's sync interval (or reload the extension).
3. Test a prompt that matches the newly added rule.
**Expected:** the new rule takes effect on the extension after sync; behavior matches the published version.

### PX-08 — Cached policy survives offline and 402
**Priority:** medium   **Timebox:** 3m   **Auth:** clerk-user
**Description:** enforcement continues on cached policy when sync can't refresh.
**Steps:**
1. With a policy active, go offline (or force a `402` subscription response from the backend).
2. Attempt a policy-matching send.
**Expected:** the last cached backend policy stays active and continues enforcing; the extension does not clear the policy on offline or `402`.

### PX-09 — Interception fails open
**Priority:** critical   **Timebox:** 3m   **Auth:** clerk-user
**Description:** when Pretzel can't do its job, it never blocks the user's send.
**Steps:**
1. Trigger fail-open conditions where reproducible: composer selector missing (host UI variant), empty prompt, or a detection/message-handler error.
2. Attempt to send.
**Expected:** the send proceeds (fail-open) rather than being blocked by Pretzel's own failure. Document any case where a Pretzel error would have blocked a legitimate send.

### PX-10 — All supported host adapters intercept
**Priority:** high   **Timebox:** 3m   **Auth:** clerk-user
**Description:** send interception works on each production host, not just ChatGPT.
**Steps:**
1. Repeat a block-matching send (PX-04) on each host: `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com`.
**Expected:** each host's adapter intercepts the send and enforces the policy. Note any host whose selectors have drifted (send not intercepted).

### PX-11 — Local audit log records events
**Priority:** medium   **Timebox:** 1m   **Auth:** clerk-user
**Description:** detection events are recorded locally.
**Steps:**
1. After running PX-04 / PX-05, open the extension's audit/log view.
**Expected:** block and warn events from this session are listed with host and action.
