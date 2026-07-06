# Pilot Readiness Review — ciyo.ai / Pretzel

Date: 2026-07-06
Scope: extension (`pretzel`), backend, `pretzel-console`, `pretzel-desktop`, `@ciyo/detect`, CI/deploy, marketing site.
Method: code read against `docs/CURRENT_STATE.md` and `docs/KNOWN_ISSUES.md`.

## Verdict

The **extension + backend + console** path is close to pilot-ready with a handful of real gaps to close.
**pretzel-desktop is NOT pilot-ready** — its enforcement is non-functional and it MITMs all traffic. Ship the pilot on the extension only; keep desktop out.

---

## P0 — block the pilot

### 1. Desktop enforcement is dead code (never blocks)
`pretzel-desktop/electron/proxy.ts:96-98`
- `detectPrompt` is **async** (`packages/detect/src/detection/engine.ts` awaits `sha256`) but the proxy calls it synchronously: `const result = detectPrompt(...)`. `result` is a Promise.
- It then reads `result.action` — the field does not exist. The real field is `highestAction` (`packages/detect/src/detection/types.ts:29`). Promise `.action` is always `undefined`, so `if (result.action === 'block' ...)` is never true. **Every request forwards unchecked.**
- `inputType: 'text'` is not a valid `InputType` (`'prompt' | 'file'`); no `hostname` is passed, so `policy.perSite[undefined]`.
- Net: the desktop app provides zero DLP while presenting itself as protection. That is worse than no product for a pilot.

### 2. Desktop MITMs every host with a locally-trusted CA
`pretzel-desktop/electron/proxy.ts:64-124`, `system-proxy.ts`, `ca.ts`
- The proxy signs a cert for **any** CONNECT host (no allowlist) and installs a system-wide proxy. It will intercept banking, email, corporate SSO — everything, not just AI sites.
- It buffers the full body then re-emits — breaks streaming/SSE (which is exactly how ChatGPT/Claude respond), websockets, and any cert-pinned client.
- `promptDecision` can resolve twice (user decision + 30s timeout) and the timeout fails **open**.
- This is a prototype (`version: 0.1.0`). Do not put it on a pilot customer's machine.

### 3. Prompt-text interception depends entirely on fragile DOM hooks
`pretzel/src/content/fetch-interceptor.ts:118-120`, `content-script.ts:76`
- The MAIN-world fetch/XHR interceptor only inspects **multipart/form-data file uploads**. JSON prompt bodies pass straight through (see the code comment "handled by the button-click path for now").
- So the actual prompt text is only scanned via the site-specific button/Enter-key DOM adapter (`adapters/chatgpt.ts` etc.). If the site changes its DOM, or the user sends via a path the adapter doesn't hook (keyboard shortcut, programmatic submit, a new UI), the send **silently fails open** — no scan, no log, no error.
- For a DLP product this is the core efficacy risk. Recommend: also parse JSON request bodies in the interceptor for the three known hosts so enforcement doesn't hinge on DOM selectors.

---

## P1 — fix before or during pilot

### 4. Fail-open everywhere is silent
`fetch-interceptor.ts:60-63` (5s timeout → proceed), `content-script.ts:71` (bridge error → proceed), `service-worker.ts` (unauth → `log`).
- Reasonable default, but there is no signal to the admin when enforcement is degraded. A customer running a "blocking" policy has no way to know detection silently stopped working. Add fail-open telemetry (count of timeouts/errors) surfaced in the console, and let orgs opt into fail-closed (`loadPolicy` already supports `CLOSED_POLICY`, but nothing sets `failMode: closed` from the wire policy for the missing-DOM case).

### 5. Deploy runs migrations AFTER the image goes live
`.github/workflows/backend-deploy.yml:107-133` (also in KNOWN_ISSUES)
- The Render deploy POST fires, then migrations run. New code can serve against the old schema during rollout; a non-additive migration breaks prod. The "additive-only" rule is a convention with no enforcement. For a pilot, either gate deploy on migration success first, or add a migration-safety check.

### 6. AI-assistant apply bypasses plan gating for rule kinds
`backend/src/assistant/apply.ts:24-37` → `internal/rules.router.ts` → `rules/service.ts:createRule` (no plan check).
- The public route `rules/router.ts:25` enforces `isRuleKindAllowed(plan, kind)`. The assistant path does not. A free/starter tenant can have the assistant create `pattern`/`entropy`/`score` rules it shouldn't have. Monetization leak, not a security hole (seat limits *are* enforced on the assistant `create_member` path via `members/service.ts:44`). Add the same rule-kind check in `createRule` or the internal router.

### 7. AI-generated regex is compiled and run in the user's browser
`assistant/apply.ts` create_rule with `kind: 'pattern'` → stored → shipped in policy → `@ciyo/detect` runs it.
- The assistant can author arbitrary regex (see the credit-card example in `assistant/prompt.ts:107`). A catastrophic-backtracking pattern would cause ReDoS in every user's content script. Add a regex safety/complexity check (or timeout the matcher) on rule ingest.

### 8. Member PII sent to third-party LLMs
`backend/src/assistant/prompt.ts:27-37` (documented in-code)
- Member emails are embedded in the system prompt sent to Anthropic/OpenAI/Groq. Before onboarding a real pilot customer you need DPAs with those providers and sub-processor disclosure, or pseudonymize (the code note says emails add no functional value — the AI only needs IDs). Cheap fix, real compliance exposure.

### 9. Scans/audit data has no retention or erasure path
`backend/src/scans/service.ts:8-20` (documented TODO)
- `scans` grows unbounded; deleted members leave behind behavioral rows. GDPR storage-limitation / erasure problem the moment a pilot customer is in the EU. Also the marketing site promises a "rolling 90-day window" (`CONTENT_CLAIMS.md:65`) that nothing enforces.

---

## P2 — cleanup / smaller risk

- **Managed-storage schema mismatch** (KNOWN_ISSUES, still true): `managed_schema.json` defines only `promptshield_policy`, but `auth.ts` / `service-worker.ts` read `orgToken` from `chrome.storage.managed`. Enterprise MDM token auth won't work as documented — the whole "employee can't bypass org policy with a personal login" guarantee (`auth.ts:6-9`) depends on a key the schema doesn't declare.
- **Unenforced policy fields** (KNOWN_ISSUES): `destinations`, `allowSendAnywayWithReason`, `perSite.defaultAction`, `auditRetentionDays` parsed but not fully enforced. Admin console will let admins set things the extension ignores.
- **Console ↔ Stripe dead path** (KNOWN_ISSUES): console calls Stripe portal while Stripe routes are disabled (`app.ts:33,77-80`); PayPal is the live provider. Any billing-portal button errors.
- **Console Docker broken** (KNOWN_ISSUES): compose maps `5173:80`, nginx listens on `8080`; CSP blocks the local API. Full-stack local demo won't work out of the box.
- **Console nav gaps** (KNOWN_ISSUES): destinations/sites/publish routes exist but aren't in the sidebar.
- **Marketing overclaims** (`CONTENT_CLAIMS.md`): "200+ companies," "every prompt," "all AI sites," SSO/SAML/SIEM/on-prem, unsourced statistics, `eu-west-1` mislabeled "Frankfurt," "SOC 2 in progress." Several are provably inconsistent with the code (universal interception is false — see #3; only 3 hosts are supported per `manifest.config.ts:8-13`). Pilot customers will read these; legal/accuracy risk.
- **Repo hygiene**: `AGENTS.md` claims "no `pnpm-workspace.yaml`" but one now exists at root listing all packages — stale doc. Nine `worktree-agent-*` branches linger on origin.

---

## Positives (don't regress these)

- Backend auth model is sound: token format parsed and tenant-selected before bcrypt compare (`auth/tokens.ts`, `auth/middleware.ts`); internal routes gated by `x-internal-secret` returning 404; MDM token correctly prioritized over personal Clerk session in `getAuthToken`.
- Tenant scoping is consistently applied in service queries (`and(eq(tenants...), ...)`), and the assistant `apply`/`revert` paths re-check `tenant.id`.
- PayPal webhook signature is verified before processing; the skip flag throws in production (`billing/paypal.ts:46-51`).
- CORS refuses to default to wildcard in production (`app.ts:39-42`).
- Policy snapshots are immutable + versioned with rollback; extension validates the wire policy with zod before caching (`policy/sync.ts`, `loader.ts`).

---

## Recommended pilot cut

1. **Ship extension + backend + console only.** Pull desktop from the pilot entirely.
2. Close #3 (parse JSON bodies for the 3 known hosts) so enforcement isn't DOM-only.
3. Do #8 (pseudonymize member emails) and #6/#7 (rule-kind gate + regex safety) — all small.
4. Add fail-open telemetry (#4) so you can see if detection silently breaks at a customer.
5. Fix #5 (migrate-before-live) before the first customer-facing deploy.
6. Reconcile marketing claims to the 3-host reality and the actual retention behavior.
