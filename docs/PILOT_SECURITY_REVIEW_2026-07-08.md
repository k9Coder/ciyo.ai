# Pilot Security Review — 2026-07-08

Scope: exploitable vulnerabilities across backend API, auth/token model, multi-tenant isolation, extension, and desktop proxy on branch `fix/pilot-master-plan`. Ranked by exploitability × impact. Every item verified against code today.

Threat model for a pilot: external internet attacker (backend is `listen 0.0.0.0`), malicious/curious pilot employee (holds an org token + Clerk login), and a compromised org token (org tokens ship to every browser in a tenant — treat as semi-public).

Severity legend: **CRITICAL** = remote full compromise / cross-tenant. **HIGH** = account/tenant abuse or data leak. **MEDIUM** = DoS / info disclosure / defense-in-depth gap. **LOW** = hardening.

---

## CRITICAL

### C-1. Internal API is internet-exposed, gated only by a secret that defaults to empty

Files: `backend/src/index.ts:25` (`host: '0.0.0.0'`), `backend/src/app.ts:62-68`, `backend/src/http/internal-client.ts:10`, every `backend/src/internal/*.router.ts`.

The whole app — public `/v1/*` AND privileged `/internal/*` — listens on one public port. `/internal/*` routes do **no auth beyond one header check**: `if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) return 404`, where `INTERNAL_SECRET = process.env['INTERNAL_SECRET'] ?? ''`. Internal routes then trust the `X-Tenant-ID` header outright — `membersInternalRouter` will `createMember(role:'super_admin')` into **any** tenant id, with no membership verification (`internal/members.router.ts:22-25`, `tid()` just reads the header).

Exploit:
- If `INTERNAL_SECRET` is unset in prod (nothing forces it — unlike `CORS_ORIGIN`, which throws at boot if missing, `app.ts:42`), it is `''`. An attacker sends `POST https://api.ciyo.ai/internal/v1/members/` with `X-Internal-Secret:` (empty value) + `X-Tenant-ID: <victim-tenant-uuid>` + `{"email":"attacker@evil.com","role":"super_admin"}` → mints themselves a super_admin in the victim tenant. From there: read every member, rule, scan; rewrite policy; disable enforcement org-wide.
- The empty-header match works because absent header is `undefined` (`undefined !== ''` → blocked) but an explicitly-sent empty header is `''` (`'' !== ''` → **passes**).
- Even with a secret set, comparison is `!==` (not constant-time) and the internal surface is reachable from the internet — pure defense-in-depth failure.

Fix (do all):
1. Boot guard mirroring CORS: `if (NODE_ENV==='production' && (!INTERNAL_SECRET || INTERNAL_SECRET.length < 32)) throw`. Reject empty/short secrets explicitly.
2. Constant-time compare (`crypto.timingSafeEqual`) and reject when the header is missing/empty before comparing.
3. Network isolation is the real fix: run the internal API on a **separate localhost-only listener/port** (second Fastify instance bound to `127.0.0.1`), or put `/internal/*` behind Render private networking. The main-mesh design assumes internal ≠ internet-reachable; today it is.

---

## HIGH

### H-1. No rate limiting anywhere on the API

Files: `backend/package.json` (no `@fastify/rate-limit`), `backend/src/app.ts` (none registered). Confirmed across every route.

Every endpoint is unthrottled. Concrete abuse:
- **Auth brute force / credential stuffing** on `resolveOrgToken` and `resolveClerkJwt` — unlimited guesses. Org token secret is 32 base64url chars (high entropy, so brute force is slow) but there is nothing stopping millions of attempts, and each does a bcrypt compare = CPU amplification (cheap request → expensive server work = **algorithmic DoS**).
- **Invite token enumeration** — public `GET /v1/invites/:token` (H-2) with no throttle.
- **LLM cost-DoS** — `/assistant/chat` is capped per *day per tenant* only on metered plans; a business-plan tenant (unlimited) or any window before the counter check can be hammered; each call spends Groq/OpenAI tokens on your account. No per-IP/per-minute ceiling.
- **Ingest flooding** — `/v1/events`, `/v1/scans`, `/v1/telemetry/enforcement` accept a row per call from any holder of an org token. A leaked org token → unbounded writes → DB storage/cost exhaustion (retention purge is 90d, far too slow to matter).
- **Webhook replay/flood** — `/webhooks/clerk`, `/webhooks/paypal` are signature-verified (good) but unthrottled; malformed-signature spam still burns svix/bcrypt/verify cycles.

Fix: register `@fastify/rate-limit` globally with a sane default (e.g. 100 req/min/IP), then tighter per-route buckets: auth-bearing routes and `/invites/:token` at ~10/min/IP, `/assistant/chat` at ~5/min/tenant on top of the daily cap, ingest routes at a per-token burst limit. Key by `X-Tenant-Id`/token where IP is shared (corporate NAT). Add `bodyLimit` tightening per route (see M-2).

### H-2. Public invite-preview endpoint leaks tenant + restricted email and confirms token validity

File: `backend/src/invites/router.ts:35-41`, `service.ts getInvitePreview`.

`GET /v1/invites/:token` is unauthenticated and returns `{ tenantName, role, email, expiresAt, valid }`. Combined with no rate limit (H-1): an attacker who obtains/guesses a token learns the organization name and the **specific email address the invite is locked to** (useful for targeted phishing: "your ciyo invite for <Company>"). 404-vs-200 also oracle-confirms token existence.

Fix: keep the endpoint (the landing page needs it) but (a) rate-limit hard, (b) drop `email` from the unauthenticated payload — the accept flow already re-checks email server-side, so the preview doesn't need to echo it; (c) return a generic shape for invalid/expired rather than 404 to reduce the oracle.

### H-3. Cross-tenant policy misassignment (isolation bug, = report N1)

Files: `backend/src/me/router.ts:28-33` (no ORDER BY), `pretzel/src/auth/tenant.ts:86-90` (picks `memberships[0]`).

Already in `PILOT_READINESS_REPORT_2026-07-08.md` as a correctness bug, but it is also a **tenant-isolation defect**: an invited employee's extension enforces and reports into their auto-provisioned personal tenant, not the employer's — the employer's DLP is silently off and the employee's scan data lands in a tenant the employer can't see. Fix per that report (deterministic ordering + prefer invited tenant + never overwrite a valid selection).

---

## MEDIUM

### M-1. No HTTP security headers

File: `backend/src/app.ts` — no `@fastify/helmet`. Responses lack HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/frame-ancestors CSP, `Referrer-Policy`. The console SPA is served separately (nginx) but the API and any HTML error surface benefit. Missing HSTS on the API allows TLS-strip on first contact from the desktop/extension.

Fix: register `@fastify/helmet` on the backend; add HSTS + `nosniff` + a strict CSP in the console `nginx.conf` (currently only serves the SPA).

### M-2. Ingest input is unvalidated and unbounded

Files: `backend/src/events/router.ts:7-16` (`siteUrl`, `matchedTerm` free strings), `backend/src/scans/router.ts`, assistant `message`. Only presence is checked; no length/format caps, and Fastify's default 1 MB body applies. A caller can store 1 MB `matchedTerm` rows repeatedly (storage bloat, compounds H-1), and `siteUrl`/`matchedTerm` are later rendered in the console audit log — **verify the console escapes them** (React escapes by default, but confirm no `dangerouslySetInnerHTML` in the audit view) or it is stored XSS against an admin.

Fix: length-cap and validate `siteUrl` (must be a URL) and `matchedTerm` (e.g. ≤256 chars) at ingest; set a small per-route `bodyLimit` (e.g. 16 KB) on ingest/telemetry routes.

### M-3. Error handler returns raw internal messages to clients

File: `backend/src/app.ts:142-145` — `reply.send({ error: err.message })` on any unhandled error. Leaks DB/driver/internal-path strings (e.g. constraint names, `[404] ...` internal-client messages) to callers, aiding recon.

Fix: log full error server-side (already done), return a generic `{ error: 'Internal error', traceId }` for 5xx; only pass through messages for explicitly-tagged 4xx (`statusCode` present).

### M-4. `X-M2M` and internal headers are client-settable on the public port

Files: `app.ts:59` (`isM2M: req.headers['x-m2m'] === 'true'`), internal routers trust `X-Tenant-ID`/`X-Initiator-Id`. Because internal and public share a listener (C-1), a public caller can set `X-M2M: true` to alter logging/PII-redaction behavior, or (if C-1's secret is weak) spoof `X-Initiator-Id`. Low impact while C-1's secret holds; disappears once internal is network-isolated.

Fix: strip `x-internal-secret`, `x-m2m`, `x-tenant-id`, `x-initiator-id` from any request arriving on the public path before context runs; only honor them on the isolated internal listener.

---

## LOW / hardening

- **L-1 Desktop per-CONNECT RSA keygen** (`ca.ts:54-56` via `proxy.ts`): each intercepted host synchronously generates a 2048-bit keypair. A malicious page fanning out CONNECTs to many distinct monitored subdomains can peg the user's CPU. Cache signed host certs by hostname; generate off the main path.
- **L-2 Fail-open proxy on crash** (already A6): if the desktop app dies, system proxy may be left pointing at a dead port (traffic broken) or enforcement silently off. Restore-on-launch + watchdog — tracked.
- **L-3 Org token is a shared per-tenant secret in every browser.** One leak = tenant-wide impersonation for `/events`,`/scans`,`/v1` reads. Acceptable for pilot; post-pilot move to per-device tokens or short-lived derived creds. Pair with H-1 rate limits to blunt a leaked token.
- **L-4 bcrypt cost 10 for tokens** (`tokens.ts:29`) — fine for high-entropy secrets; no action.
- **L-5 CA install has no consent/elevation UX** (A6) — a UX/safety gap, not directly exploitable.

---

## Priority order (security)

1. **C-1** — set + enforce a strong `INTERNAL_SECRET` in Render **before any deploy**, then network-isolate `/internal/*`. This is a full-compromise hole the moment the app is public with an unset/weak secret. (½ day; the env var is immediate, isolation is the follow-up.)
2. **H-1** — add `@fastify/rate-limit` globally + per-route buckets. Directly the "we need a rate limiter" ask; also the multiplier that makes C-1/H-2 brute-forceable. (½–1 day.)
3. **H-2** — trim invite-preview payload + rate-limit. (1–2h, folds into H-1.)
4. **H-3** — the N1 tenant-isolation fix (already scheduled).
5. **M-1/M-2/M-3** — helmet, ingest validation + bodyLimit, generic 5xx. One backend PR. (½ day.)
6. **M-4** then **L-1/L-2** as the internal-isolation and desktop work lands.

Note: much of C-1's real-world exposure depends on the Render env config that only Yarin can set (`tasks_for_yarin.md`). Add `INTERNAL_SECRET` (32+ random bytes) to that checklist as **critical**, alongside `PILOT_MODE`/`ADMIN_BASE_URL`.
