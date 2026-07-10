# Pilot Security Fix Plan — LLM-executable

Created: 2026-07-10
Source: `docs/PILOT_SECURITY_REVIEW_2026-07-08.md`. This file is the code-side execution plan — every ticket here is doable by an LLM agent in-repo (edit + test + verify), no dashboards or physical machines. Manual/external counterparts (Render env, private networking) live in `docs/PILOT_ACTION_PLAN.md` Track H.

Status key: ☐ todo · ◐ in progress · ☑ done. Do in listed order — S1 and S2 are pilot blockers.

---

## S1 (C-1) — Lock down the internal API surface ☐  [CRITICAL, blocker]

Problem: `/internal/*` shares the public `0.0.0.0` listener and is gated only by `x-internal-secret === INTERNAL_SECRET`, where `INTERNAL_SECRET = process.env[...] ?? ''`. Empty/absent secret → an internet caller reaches privileged internal routes that trust `X-Tenant-ID` with no membership check.

Code steps (backend):
1. **Boot guard** in `src/app.ts` (mirror the existing `CORS_ORIGIN` guard at `app.ts:42`): if `NODE_ENV==='production'` and `!INTERNAL_SECRET || INTERNAL_SECRET.length < 32` → `throw new Error('INTERNAL_SECRET must be set (>=32 chars) in production')`. App refuses to boot misconfigured.
2. **Reject empty/missing header before compare** in the `/internal/` onRequest hook (`app.ts:63-68`): if the header is absent or empty string → `404`. Never let `'' === ''` pass.
3. **Constant-time compare**: replace `req.headers['x-internal-secret'] !== INTERNAL_SECRET` with a `crypto.timingSafeEqual` over equal-length buffers (guard length first to avoid throw).
4. **Strip inbound internal/M2M headers on the public path** (fixes M-4 too): in the same public-request hook, delete `x-internal-secret`, `x-m2m`, `x-tenant-id`, `x-initiator-id` from any request whose URL does NOT start with `/internal/` before `requestContext.run`, so a public caller can't spoof `isM2M`/initiator/tenant.
5. **Network isolation (real fix)**: bind internal routes to a second Fastify instance on `127.0.0.1` only. Extract internal router registration into `buildInternalApp()`; `index.ts` listens the public app on `0.0.0.0:PORT` and the internal app on `127.0.0.1:INTERNAL_PORT`. `internal-client.ts` `INTERNAL_API_URL` already defaults to `http://localhost:3000` — point it at the internal port. Keep the secret check as defense-in-depth. If a same-process single-listener is required for the pilot host, at minimum ship steps 1–4 and track isolation as a fast-follow.

Tests: `backend/tests/internal-guard.test.ts` extends — assert empty header → 404, wrong-length secret → 404, valid secret → passes; public request with spoofed `x-tenant-id`/`x-m2m` has them stripped. Boot-guard unit test: `buildApp()` throws when prod + empty secret.
Verify: `pnpm --dir backend test`; grep confirms no route path both public and reading `x-tenant-id` as trusted.
Effort: ~1 day (½ day if isolation deferred).

## S2 (H-1) — Global + per-route rate limiting ☐  [blocker]

Problem: no throttle anywhere → auth brute-force with bcrypt CPU amplification, invite enumeration, LLM cost-DoS, ingest/storage flooding.

Code steps (backend):
1. Add `@fastify/rate-limit`; register global default in `app.ts` (e.g. `max: 100, timeWindow: '1 minute'`), keyed by `X-Tenant-Id` header when present else IP (handle corporate NAT). Exclude `/health`.
2. Per-route tighter buckets via route `config.rateLimit`:
   - auth-bearing + `GET /v1/invites/:token`: ~10/min per IP.
   - `POST /v1/invites/:token/accept`: ~10/min per user.
   - `POST /v1/assistant/chat`: ~5/min per tenant (on top of the daily plan cap).
   - `POST /v1/events` `/v1/scans` `/v1/telemetry/enforcement`: per-token burst cap (e.g. 60/min per tenant).
   - webhooks: modest per-IP cap to blunt signature-fail spam.
3. Ensure a `429` JSON shape consistent with existing error bodies; set `Retry-After`.
Tests: unit/integration hitting a route past its limit → 429; under limit → passes; keying by tenant vs IP verified.
Verify: `pnpm --dir backend test`; manual burst check on one route.
Effort: ½–1 day.

## S3 (H-2) — Trim public invite-preview payload ☐  [HIGH]

Problem: unauth `GET /v1/invites/:token` returns `email` (the restricted address) and 404-oracles token existence.
Code steps: in `invites/service.ts getInvitePreview` / `router.ts:36`, drop `email` from the unauthenticated response (accept flow re-checks server-side anyway); return a uniform `{ valid:false }`-style body for missing/expired/invalid instead of 404 to reduce the oracle. Pair with S2 rate limit.
Tests: preview response has no `email`; invalid + expired + unknown all return the same generic shape.
Effort: 1–2h.

## S4 (H-3 / N1) — Deterministic membership + correct tenant selection ☐  [HIGH]

Already specified in `docs/PILOT_READINESS_REPORT_2026-07-08.md` (N1) and master plan Phase 1. Security framing: prevents cross-tenant policy misassignment / data landing in the wrong tenant.
Code steps: `me/router.ts` — add deterministic `ORDER BY` and/or an `autoProvisioned`/`joinedAt` signal; `pretzel/src/auth/tenant.ts` — prefer the non-auto-provisioned (invited) membership, never overwrite an existing *valid* selection on refresh; add the promised extension selector. Extend `backend/e2e/invites.spec.ts` to assert the served policy matches the invited tenant.
Effort: ~½ day (shared with the Phase 1 invite work).

## S5 (M-1) — Security headers ☐  [MEDIUM]

Code steps: add `@fastify/helmet` to the backend (HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`). Add HSTS + `nosniff` + a strict CSP to `pretzel-console/nginx.conf` (SPA). Confirm nothing breaks Clerk/Sentry origins in the CSP.
Tests: response-header assertion on `/health` and one API route.
Effort: ~½ day.

## S6 (M-2) — Validate + bound ingest input ☐  [MEDIUM]

Code steps: in `events/router.ts` and `scans`/`telemetry` — validate `siteUrl` is a URL and cap length; cap `matchedTerm` (≤256 chars); set a small per-route `bodyLimit` (e.g. 16 KB). (React already escapes in the console audit view — no `dangerouslySetInnerHTML` found — so this is storage-integrity + DoS, not XSS.)
Tests: oversized/invalid payload → 400; valid → 201/200.
Effort: ~2–3h.

## S7 (M-3) — Generic 5xx error responses ☐  [MEDIUM]

Code steps: `app.ts` `setErrorHandler` — keep full server-side log; for `statusCode >= 500` or untagged errors return `{ error: 'Internal error', traceId }`; only pass through `err.message` for errors carrying an explicit 4xx `statusCode`.
Tests: forced internal throw → response has no driver/internal string, includes traceId; tagged 400 still returns its message.
Effort: 1–2h.

## S8 (L-1) — Cache desktop per-host certs ☐  [LOW]

Code steps: `pretzel-desktop` proxy — memoize `signHostCert(hostname)` results by hostname (Map) so repeated CONNECTs to the same host don't regenerate a 2048-bit keypair each time; optionally move keygen off the connection hot path. Prevents local CPU-DoS via CONNECT fan-out.
Tests: unit — two calls for the same hostname return the cached cert / call keygen once.
Effort: ~2–3h.

---

Sequencing: S1 → S2 first (blockers), then S3, then S5–S7 as one backend hardening PR, S4 with the Phase 1 invite work, S8 with the desktop track. S1 code guard is inert until `INTERNAL_SECRET` is actually set in Render (Action Plan Track H1) — ship both together.
