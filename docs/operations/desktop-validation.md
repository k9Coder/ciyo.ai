---
status: draft
owner: repository
verified_at: 2026-09-05
sources:
  - docs/operations/pilot-release/tasks_for_yarin.md (§5)
  - docs/PILOT_ACTION_PLAN.md (A6, A8)
  - pretzel-desktop/electron/ca.ts
  - pretzel-desktop/electron/system-proxy.ts
  - pretzel-desktop/electron/proxy-watchdog.ts
---

# Desktop Real-Machine Validation

Gate for shipping pretzel-desktop to any pilot user. Nothing here can be validated by an agent — it needs a real OS, a real network stack, and real ChatGPT/Claude/Gemini traffic. Record results in the table at the bottom after each run.

**Do not run this on your daily-driver machine first.** It installs a root/system CA cert and an OS-wide proxy. Use a VM or spare machine you can wipe.

## Pre-reqs per platform

| Platform | Machine | Build |
|---|---|---|
| Windows | Windows 10/11 x64, real or VM (VMware/Hyper-V/VirtualBox — proxy+CA behavior differs on real hardware vs some sandboxes, prefer real hardware for the final signoff run) | `pnpm --dir pretzel-desktop build:win` unsigned NSIS installer |
| macOS | macOS arm64 (Apple Silicon — that's the pilot's actual target), real hardware preferred | `pnpm --dir pretzel-desktop build:mac` unsigned `.dmg`/`.app` |

Point the build at **staging**, not production, unless this is the final pre-launch signoff run (`electron.vite.config.ts` bakes `PRETZEL_API_URL` at build time — rebuild to change it).

## Test matrix (run identically on both platforms)

### 1. Install + first-run trust flow
- Run the installer/DMG. Launch the app.
- **Windows:** expect no signature — SmartScreen "Windows protected your PC" appears. Click "More info" → "Run anyway". Record whether the warning text matches what's in the onboarding doc.
- **macOS:** expect Gatekeeper to refuse the default double-click ("app is damaged and can't be opened" — this is the unsigned-app message, not a real corruption). Right-click → Open → confirm in the dialog. If it still refuses, `xattr -cr /Applications/Pretzel.app` is the documented workaround — confirm it actually works on a clean machine before trusting it as the fallback instruction.
- App prompts for CA install (`ca.ts installCACert`) → expect an OS elevation prompt (UAC on Windows, admin password on macOS). Accept.
- **Pass:** app reaches a running state with the tray icon visible and CA installed. **Fail:** silent crash, hang on the elevation prompt, or CA install throws with no user-visible error (this was flagged as a known gap in A6 — today it throws on a normal non-elevated context instead of guiding the user).

### 2. System proxy enable/disable
- Confirm OS proxy settings (Windows: Settings → Network → Proxy; macOS: System Settings → Network → Proxy) now point at the app's local proxy port after enabling protection.
- Toggle protection off via the tray → confirm OS proxy settings revert to their pre-install state (not just "off," but the *original* values — if you had a corporate/VPN proxy configured before install, confirm it's restored, not wiped).

### 3. Blocking behavior (the actual product)
Against **live** ChatGPT, Claude.ai, and Gemini (not staging mocks — this is the one step that must hit the real hosts):
- Paste a fake-but-shaped secret (an AWS-looking key, e.g. `AKIAIOSFODNN7EXAMPLE`) into the prompt box on each of the three sites → expect the decision window (`decision-window.ts`) to pop and block/hold the request per policy.
- Send a benign prompt on each site → expect a normal reply, and confirm **streaming** works (SSE tokens arrive incrementally, not all at once at the end — this is the A3/A8 residual that was never proven against real hosts).
- **Pass:** all three sites block the secret and stream the benign reply normally. **Fail:** any site's request goes through unblocked, hangs, or streaming is buffered/broken.

### 4. Non-AI traffic is untouched
- Visit a bank site (or any site with a real cert) and Gmail → confirm no certificate warnings, no interception. This is the "blind tunnel" — non-allowlisted hosts should pass through without the app touching TLS at all.
- **Fail condition:** any cert warning on a non-AI-host site means the proxy is intercepting outside its allowlist — treat as a P0, this breaks the "we don't touch your other traffic" trust claim in the security page.

### 5. Kill switch + crash recovery
- Tray → pause/kill switch → confirm proxy stops and traffic flows direct.
- Re-enable → confirm it resumes.
- **Force-kill the process** (Task Manager "End task" / macOS `kill -9` on the main process, not a graceful quit) while protection is active → relaunch the app → confirm `proxy-watchdog.ts` / `proxy-sentinel.ts` detects the stale OS proxy setting and either restores protection or clears the dangling proxy config so the machine isn't left with a broken proxy pointing at a dead process. **This is the scenario A6 called out as needing a watchdog** since SIGKILL can't be caught by the app's own exit handlers.

### 6. Uninstall cleanup
- Uninstall via the OS's normal path (Windows "Apps & Features", macOS drag-to-Trash + any uninstall script it ships).
- Confirm: OS proxy settings cleared, CA cert removed from the system/keychain trust store (`certmgr.msc` on Windows, Keychain Access on macOS — check both the CA is gone AND nothing was left "untrusted but present").
- **Fail condition:** leftover CA cert or proxy setting after uninstall is a real security residue on the user's machine, not just a cosmetic bug.

### 7. Crash/error visibility (Sentry, added 2026-09-05)
- Deliberately trigger a renderer error (e.g. via devtools console `throw new Error('validation-test')` in the decision-ui window) and an uncaught main-process exception if you have a debug hook for it.
- Confirm the event shows up in the Sentry project for pretzel-desktop (org `ciyoai`) within a couple minutes, tagged with OS + app version.
- This closes the "desktop has nothing" gap from the 2026-07-08 observability audit — confirm it's actually true on a real machine, not just in dev.

## Known friction to expect (not blockers, just don't mistake them for new bugs)

- Windows Defender may delete the freshly built `dist-electron/main.js` before you even get to test — proxy/CA code trips AV heuristics. If the build itself gets quarantined, that's expected today; code-signing (Apple Developer cert / a Windows OV cert) is the real fix, not a workaround worth building.
- Unsigned apps on both platforms mean every pilot user hits step 1's friction personally. Decide whether the onboarding doc's workaround instructions are good enough for pilot scale before treating code-signing as optional.

## Results log

| Date | Platform | Build (staging/prod) | Tester | Pass/Fail per section (1-7) | Notes / bugs filed |
|---|---|---|---|---|---|
| | | | | | |
