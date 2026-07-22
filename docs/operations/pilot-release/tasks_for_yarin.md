# Pilot Tasks — Manual / External (Yarin)

**Created:** 2026-07-08
**Source:** `docs/PILOT_MASTER_PLAN_2026-07-07.md` — these are the items that cannot be executed from the repo/agent side: dashboards, accounts, credentials, physical machines, third parties. Everything code-side is tracked in the master plan itself.

Check items off as they land. Ordering inside each section = do top-down.

---

## 1. Render (plan 0.5 + 4.2 + 4.4)

- [ ] Create deploy hooks for the console static site(s) in the Render dashboard, then:
  ```
  gh secret set RENDER_CONSOLE_PROD_DEPLOY_HOOK
  gh secret set RENDER_CONSOLE_STAGING_DEPLOY_HOOK
  ```
  (Deploy pretzel-console workflow has been red on every master push since June 2 because these were never created.)
- [ ] Backend service → Environment, set and redeploy:
  - `PILOT_MODE=true` — **without this, every signup lands on the `free` plan silently: no AI assistant, keyword-only rules**
  - `LLM_PROVIDER=groq`
  - `GROQ_API_KEY=<key>`
  - `ADMIN_BASE_URL=https://console.mykka.ai` — **invite links are generated from this; default is `http://localhost:5173`, i.e. every prod invite link is broken until set**
  - `CORS_ORIGIN=https://console.mykka.ai`
  - `CLERK_SECRET_KEY` + `CLERK_WEBHOOK_SECRET` (production Clerk instance — see §3)
  - `DATABASE_URL` (Neon — see §2)
  - Optional: `ASSISTANT_SEND_PII` stays UNSET (emails are redacted from LLM prompts by default; do not set to true for pilot)
- [ ] Console static site → set `VITE_API_BASE=<prod api url>` and production `VITE_CLERK_PUBLISHABLE_KEY`.
- [ ] Verify SPA rewrite: deep links like `https://console.mykka.ai/invite/<token>` must serve index.html, not 404. Invite flow depends on it.
- [ ] mykka-web (Vercel): set `NEXT_PUBLIC_PILOT_MODE=true` on production only (NOT preview/staging) → pricing page shows pilot banner.

## 2. Neon Postgres (plan 4.1)

- [ ] Create Neon project + production branch/database.
- [ ] Confirm backups/PITR available on the tier; if not, schedule a manual export before pilot start.
- [ ] Run migrations against it BEFORE any user touches it:
  ```
  $env:DATABASE_URL='<neon-connection-string>'; pnpm --dir backend db:migrate; pnpm --dir backend seed:templates
  ```
- [ ] Use the pooled connection string in Render `DATABASE_URL`.

## 3. Clerk production instance (plan 4.3)

- [ ] Create/configure the production Clerk instance.
- [ ] Webhook endpoint → `https://<prod-api-domain>/webhooks/clerk`, subscribe `user.created`, `user.updated`, `user.deleted`; copy the signing secret into Render `CLERK_WEBHOOK_SECRET`.
- [ ] Production publishable key goes to THREE places: console build env, extension prod build (`VITE_CLERK_PUBLISHABLE_KEY`), and desktop release secret `VITE_CLERK_PUBLISHABLE_KEY_PROD`.
- [ ] Also confirm repo secret `PRETZEL_DESKTOP_API_URL` is set (desktop release workflow reads it).

## 4. Apple Developer + Chrome Web Store (plan 2.5 + 6.5) — LONGEST LEAD TIME, START FIRST

- [ ] Enroll in Apple Developer Program ($99/yr, verification can take days). Full-desktop pilot decision makes macOS signing effectively mandatory — unsigned DMGs hit the Gatekeeper "damaged app" wall.
- [ ] After enrollment: create Developer ID Application cert, add signing + notarization to `pretzel-desktop-release.yml` (code side can be prepared on request; the cert/account is yours).
- [ ] Register Chrome Web Store developer account ($5 one-time).
- [ ] Submit extension to CWS once privacy policy is live at `https://mykka.ai/privacy` (review 3–7 days).
- [ ] Windows: unsigned NSIS shows SmartScreen warning — accept for pilot with a note in the onboarding doc, or buy an OV cert (optional).

## 5. Desktop real-machine validation (plan 2.6 / A8) — gate for shipping desktop to any customer

Per platform (macOS arm64, Windows x64, Linux deb/AppImage), on a real machine:

- [ ] Install → CA consent prompt appears → accept → proxy enables.
- [ ] Secret (e.g. AWS key) pasted to ChatGPT/Claude/Gemini → blocked per policy.
- [ ] Benign prompt → normal streamed (SSE) reply, no breakage.
- [ ] Bank website + Gmail → untouched (blind tunnel, no cert warnings).
- [ ] Kill switch (tray) → proxy restored; relaunch after force-kill → proxy restored.
- [ ] Uninstall → system proxy + CA cleaned up.
- [ ] Record results in `docs/operations/desktop-validation.md`.

Warning from local testing: **Windows Defender deletes the freshly built `dist-electron/main.js`** (proxy/CA code trips heuristics). Expect AV friction on customer machines; signing (§4) is the real fix. Budget time for this.

## 6. People / legal / go-live (plan Phase 6 + 8)

- [ ] David Horowitz: legal review of privacy policy (2–3 business days, critical path for CWS).
- [ ] Deploy privacy page to production after approval; verify `https://mykka.ai/privacy` renders.
- [ ] Create `privacy@mykka.ai` alias; Marcus sends a test mail to verify.
- [ ] Uptime monitor (Better Stack free tier) on `https://<prod-api>/health`, alerts to Marcus + Ryan.
- [ ] Name on-call person for pilot week 1.
- [ ] Ben: pilot onboarding doc (1 page), feedback channel, participant list agreed with Ethan, success criteria defined.
- [ ] Final go/no-go checklist sign-off (master plan Phase 8) — includes prod smoke test: signup → tenant on `pilot` plan → org token → onboarding template → extension scan event visible → invite → second user accepts and lands in the right org → 6th assistant prompt of the day returns 429.

## 7. Repo actions needing your approval

- [ ] Merge PR from `fix/pilot-master-plan` once CI is green (proves all four previously-broken pipelines on clean runners).
- [ ] After merge: tag `pretzel-desktop-v*` on a throwaway version to exercise the repaired desktop release workflow end-to-end (it has never successfully run).
- [ ] Decide: delete the empty root `tasks.txt` (untracked).
