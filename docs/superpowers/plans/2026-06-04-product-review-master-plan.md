# Product Review Master Plan — 2026-06-04

This index captures every finding from the five-stakeholder review (CEO, Engineering Manager, Designer, CSO, DevEx). Each row links to a sub-plan with full implementation detail.

Severity key:
- **P0** — Pre-launch blocker. Do not ship without this.
- **P1** — High priority. Fix before first paid customer.
- **P2** — Medium priority. Address in the sprint after launch.
- **P3** — Nice-to-have. Backlog.

---

## P0 — Pre-Launch Blockers

| ID | Category | Description | Sub-Plan | Skip? |
|---|---|---|---|---|
| CRIT-1 | Security | Live secrets committed to git (`backend/.env.staging`): GROQ key, Clerk secret key, Clerk webhook secret. Files not in `.gitignore`. Must rotate all three and scrub history with BFG. | [secrets-rotation](2026-06-04-security-p0-secrets-rotation.md) | Blocker |
| CRIT-2 | Security | PayPal webhook accepts any POST with zero signature verification. `PAYPAL_SKIP_SIG_VERIFY=true` in staging. Anyone can POST fake `BILLING.SUBSCRIPTION.ACTIVATED` → free paid tenant. | [paypal-webhook-auth](2026-06-04-paypal-webhook-auth.md) | Blocker |
| TD-5 | Billing | `user.created` webhook hardcodes `plan: 'pro'` in `backend/src/webhooks/clerk.ts` line 79. `'pro'` is not in the `Plan` type — every self-signup silently gets free limits. | [billing-bugs](2026-06-04-billing-bugs.md) | Blocker |
| CI-1 | DevEx/CI | `pnpm test:e2e` step in `e2e.yml` has no `working-directory: e2e` — runs from repo root where no script exists. CI is silently broken. | [ci-cd-fixes](2026-06-04-ci-cd-fixes.md) | Blocker |
| CI-2 | DevEx/CI | Branch mismatch: `e2e.yml` triggers on `branches: [main]`, deploy workflows on `branches: [master]`. E2E tests never run on deploy pushes. | [ci-cd-fixes](2026-06-04-ci-cd-fixes.md) | Blocker |

---

## P1 — Fix Before First Paid Customer

| ID | Category | Description | Sub-Plan | Skip? |
|---|---|---|---|---|
| HIGH-1 | Security | LLM apply actions pass `patch: Record<string, unknown>` directly to DB with no Zod/runtime validation. Prompt injection could set arbitrary rule fields. | [api-hardening](2026-06-04-api-hardening.md) | P1 |
| HIGH-2 | Security | CORS fallback is `origin: true` when `CORS_ORIGIN` env var is missing (`backend/src/app.ts` line 31). | [api-hardening](2026-06-04-api-hardening.md) | P1 |
| HIGH-3 | Security | Zero rate limiting on any endpoint. No `@fastify/rate-limit`. `/v1/assistant/chat` exposes unlimited LLM spend. | [api-hardening](2026-06-04-api-hardening.md) | P1 |
| HIGH-5 | Security | No security headers. No `@fastify/helmet`. | [api-hardening](2026-06-04-api-hardening.md) | P1 |
| MED-4 | Security | `STRIPE_SKIP_SIG_VERIFY` flag in production code `backend/src/billing/stripe.ts` line 69. | [billing-bugs](2026-06-04-billing-bugs.md) | P1 |
| TD-6 | Reliability | `activateTenant` not idempotent — double webhook delivery hits `slugUniq` constraint, throws unhandled exception. No `ON CONFLICT DO UPDATE`. | [billing-bugs](2026-06-04-billing-bugs.md) | P1 |
| TD-2 | Architecture | `publishPolicy` TOCTOU race — reads `MAX(version)` then inserts `N+1` without a transaction. Two concurrent publishes hit unique constraint. | [publish-race-condition](2026-06-04-publish-race-condition.md) | P1 |
| R-2 | Reliability | `sendWelcomeEmail` is fire-and-forget `.catch(() => {})`. Customer pays → SMTP down → tokens never delivered, error suppressed. | [reliability](2026-06-04-reliability.md) | P1 |
| UX-C1 | UX | No "unpublished changes" indicator. Admin can add rules and not know they are not deployed. | [policy-lifecycle-ux](2026-06-04-policy-lifecycle-ux.md) | P1 |
| UX-C2 | UX | Publish page is not in the sidebar navigation. The most consequential action has no nav path. | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | P1 |
| UX-C3 | UX | Blank Dashboard on first-run — all zeros, no getting-started checklist. | [policy-lifecycle-ux](2026-06-04-policy-lifecycle-ux.md) | P1 |
| S-2 | Product | Hero screenshots are placeholders — conversion killer before any marketing spend. | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | P1 |

---

## P2 — Address in Sprint After Launch

| ID | Category | Description | Sub-Plan | Skip? |
|---|---|---|---|---|
| HIGH-4 | Security | PayPal `custom_id` parsed without validation — combined with CRIT-2, enables arbitrary tenant slug injection. | [paypal-webhook-auth](2026-06-04-paypal-webhook-auth.md) | P2 |
| MED-1 | GDPR | `matchedTerm` stored server-side for `reportLevel: "rich"` — PII at rest, no encryption, no GDPR retention/erasure. | [gdpr-compliance](2026-06-04-gdpr-compliance.md) | P2 |
| MED-3 | Security | Email validation is `email.includes('@')` — `backend/src/auth/join.ts` line 8. | [api-hardening](2026-06-04-api-hardening.md) | P2 |
| MED-6 | Security | Invite tokens stored as plaintext (should be bcrypt-hashed like org tokens). | [seat-enforcement](2026-06-04-seat-enforcement.md) | P2 |
| TD-3 | Performance | bcrypt on every token auth request — ~100ms at cost 10 per request. Needs token caching with TTL. | [api-hardening](2026-06-04-api-hardening.md) | P2 |
| TD-4 | Performance | `getAnalyticsDaily` fetches all events in memory then filters in JS. Needs `GROUP BY date_trunc('day', occurred_at)`. | [analytics-performance](2026-06-04-analytics-performance.md) | P2 |
| R-1 | Reliability | No circuit breaker or retry on LLM calls. `AnthropicLlmService.chat` has no timeout/retry/fallback. | [reliability](2026-06-04-reliability.md) | P2 |
| R-3 | Reliability | No DB connection pool config — default 10 connections, no statement/idle timeout. | [reliability](2026-06-04-reliability.md) | P2 |
| SR-1 | Scalability | In-process SSE `policyBus` doesn't survive horizontal scaling. Fix: Redis pub/sub or Postgres LISTEN/NOTIFY. | [publish-race-condition](2026-06-04-publish-race-condition.md) | P2 |
| UX-C4 | UX | Extension sign-in path broken — popup says "Sign in via Settings" which opens Options page. No direct Clerk sign-in in popup. | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | P2 |
| UX-C5 | UX | No connection between AI Assistant apply and Subjects page — no link to created subject, no prompt to publish. | [policy-lifecycle-ux](2026-06-04-policy-lifecycle-ux.md) | P2 |
| QW-1 | UX | Login/Onboarding brand mismatch — uses Tailwind `bg-blue-600` while rest of app uses `var(--brand-primary)` (#7c6aff). | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | P2 |
| QW-2 | UX | `window.confirm` in SettingsPage token rotation — replace with `<ConfirmModal>`. | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | P2 |
| QW-3 | UX | Hover-only Edit/Delete buttons invisible to keyboard/touch. Need always-visible `...` menu. | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | P2 |
| QW-6 | UX | "Subjects" vs "Policies" naming inconsistency — nav says "Policies", page says "Subjects & Rules". | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | P2 |
| CI-3 | DevEx/CI | `pretzel-release.yml` doesn't run `pnpm test` — detection logic ships without unit test CI gate. | [ci-cd-fixes](2026-06-04-ci-cd-fixes.md) | P2 |
| CI-4 | DevEx/CI | `railway.toml` uses `npm ci` not `pnpm install`. Inconsistent with rest of stack. | [ci-cd-fixes](2026-06-04-ci-cd-fixes.md) | P2 |
| SF-3 | DevEx | Zod v3/v4 mismatch — `backend`/`pretzel` on `^3.23.8`, `pretzel-console` on `^4.4.3`. | [developer-experience](2026-06-04-developer-experience.md) | P2 |
| MED-5 | Security | `isPlatformAdmin` flag changes have no audit log. | [api-hardening](2026-06-04-api-hardening.md) | P2 |
| Seat | Billing | `createMember` enforces seat limit but `importMembers` bypasses it entirely. | [seat-enforcement](2026-06-04-seat-enforcement.md) | P2 |

---

## P3 — Backlog / Nice-to-Have

| ID | Category | Description | Sub-Plan | Skip? |
|---|---|---|---|---|
| MED-2 | Security | `clerkSessionToken` in `chrome.storage.local` unencrypted. | None yet | Optional |
| MED-7 | Security | `X-Tenant-Slug` header is user-controlled, enables org slug enumeration. | [api-hardening](2026-06-04-api-hardening.md) | Optional |
| TD-1 | Architecture | Policy schema divergence — extension's local `Policy` type and backend's `PolicyDoc` are different formats. | [developer-experience](2026-06-04-developer-experience.md) | Optional |
| SR-2 | Scalability | Analytics queries will blow up — 6 sequential `COUNT(*)` + in-memory aggregation. | [analytics-performance](2026-06-04-analytics-performance.md) | Optional |
| SR-3 | Scalability | `events`/`scans` tables grow unboundedly — no TTL/retention. | [gdpr-compliance](2026-06-04-gdpr-compliance.md) | Optional |
| SR-4 | Scalability | No debounce on `compilePolicy` — rapid publishes trigger full read burst. | [publish-race-condition](2026-06-04-publish-race-condition.md) | Optional |
| R-4 | Reliability | Migrations not automated in Docker/Render deploy workflows. | [ci-cd-fixes](2026-06-04-ci-cd-fixes.md) | Optional |
| R-5 | Reliability | No Sentry on backend. | [reliability](2026-06-04-reliability.md) | Optional |
| QW-4 | UX | "ONLINE" badge in AI Assistant header — meaningless, always online. | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | Optional |
| QW-5 | UX | Hero placeholder image — "Extension screenshot placeholder" text still in `Hero.tsx`. | [ux-quick-wins](2026-06-04-ux-quick-wins.md) | Optional |
| QW-7 | UX | Popup "Sensitive data detected" shows historical events as active threat — wording/color should distinguish. | None yet | Optional |
| M-3 | UX | Destination Group IDs field shows raw UUID input — should be multi-select of named groups. | None yet | Optional |
| M-4 | UX | Entropy/score rule config shows raw JSON field. Needs structured inputs. | None yet | Optional |
| L-1 | UX | Entire console uses `style={{ }}` inline objects. No shared `Button`, `FormField`, `Table`. | None yet | Optional |
| SF-1 | DevEx | No Clerk test user provisioning script. New dev must manually create test user in Clerk dashboard. | [developer-experience](2026-06-04-developer-experience.md) | Optional |
| SF-2 | DevEx | 6-step manual chain to run cross-service E2E. No `pnpm e2e:local` orchestration. | [developer-experience](2026-06-04-developer-experience.md) | Optional |
| SF-4 | DevEx | No `pnpm-workspace.yaml` — non-standard, no shared dep hoisting. | [developer-experience](2026-06-04-developer-experience.md) | Optional |
| DX-2 | DevEx | Create `packages/shared` (`@ciyo/types`) with `PolicyDoc`, rule/subject Zod schemas. Eliminates type drift. | [developer-experience](2026-06-04-developer-experience.md) | Optional |
| S-1 | Product | Chrome-only is a sales ceiling. Edge extension = same codebase, 2-3 weeks. | None yet | Optional |
| S-4 | Product | Starter→Business pricing gap is 7.6x jump. | None yet | Optional |
| S-6 | Product | SIEM webhook (POST events to configurable URL) — most-asked enterprise requirement. | [enterprise-features](2026-06-04-enterprise-features.md) | Optional |
| S-7 | Product | Chrome Enterprise / MDM force-install via JAMF/Intune. Unlocks 500+ seat market. | [enterprise-features](2026-06-04-enterprise-features.md) | Optional |
| S-3 | Product | SOC 2 "in progress" undated. Start audit process. | None yet | Optional |
| S-8 | Product | Cut PayPal billing — double maintenance burden for minimal enterprise value. | None yet | Optional |

---

## Sub-Plan File Index

| File | Area | Priority |
|---|---|---|
| [2026-06-04-security-p0-secrets-rotation.md](2026-06-04-security-p0-secrets-rotation.md) | Secrets / Git History | P0 |
| [2026-06-04-paypal-webhook-auth.md](2026-06-04-paypal-webhook-auth.md) | Security / Billing | P0 |
| [2026-06-04-billing-bugs.md](2026-06-04-billing-bugs.md) | Billing Correctness | P0/P1 |
| [2026-06-04-api-hardening.md](2026-06-04-api-hardening.md) | Security / API | P1 |
| [2026-06-04-ci-cd-fixes.md](2026-06-04-ci-cd-fixes.md) | CI/CD | P0/P2 |
| [2026-06-04-ux-quick-wins.md](2026-06-04-ux-quick-wins.md) | UX | P1/P2 |
| [2026-06-04-policy-lifecycle-ux.md](2026-06-04-policy-lifecycle-ux.md) | UX / Policy | P1/P2 |
| [2026-06-04-publish-race-condition.md](2026-06-04-publish-race-condition.md) | Architecture | P1/P2 |
| [2026-06-04-reliability.md](2026-06-04-reliability.md) | Reliability | P1/P2 |
| [2026-06-04-billing-bugs.md](2026-06-04-billing-bugs.md) | Billing | P1 |
| [2026-06-04-analytics-performance.md](2026-06-04-analytics-performance.md) | Performance | P2 |
| [2026-06-04-gdpr-compliance.md](2026-06-04-gdpr-compliance.md) | GDPR | P2 |
| [2026-06-04-seat-enforcement.md](2026-06-04-seat-enforcement.md) | Billing / Security | P2 |
| [2026-06-04-developer-experience.md](2026-06-04-developer-experience.md) | DevEx | P2/P3 |
| [2026-06-04-enterprise-features.md](2026-06-04-enterprise-features.md) | Product / Enterprise | P3 |
