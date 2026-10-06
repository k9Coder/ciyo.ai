# Pretzel Desktop Auth — Design

Status: approved
Date: 2026-07-23

## Problem

`pretzel-desktop` ships a Clerk PKCE sign-in flow (`electron/auth.ts`) that calls
`{PRETZEL_API_URL}/auth/desktop/authorize` and `POST /auth/desktop/token`. Neither
endpoint exists on the backend — the desktop app cannot complete sign-in today.

## Flow

```
Desktop  → GET {PRETZEL_API_URL}/auth/desktop/authorize?response_type=code&
             redirect_uri=http://127.0.0.1:<port>/callback&code_challenge=&
             code_challenge_method=S256&state=&publishable_key=
Backend  → validates redirect_uri is a 127.0.0.1 loopback and code_challenge_method=S256
         → 302 to {PRETZEL_CONSOLE_URL}/desktop-login?state=&code_challenge=&redirect_uri=
Console  → new unauthenticated route, shows Clerk <SignIn/> (any member role, not admin-gated)
         → once signed in: POST /auth/desktop/authorize/complete (Bearer: Clerk JWT)
              body { state, code_challenge, redirect_uri }
Backend  → resolveClerkJwt (existing) identifies member + tenant
         → mints one-time code, stores in desktop_auth_codes (5 min TTL, single-use)
         → returns { redirectUrl }; console does window.location.href = redirectUrl
Desktop  → local loopback server (already built) receives ?code=&state=
         → POST /auth/desktop/token { code, code_verifier, redirect_uri }
Backend  → validates code not expired/used, redirect_uri matches, SHA256(verifier)==challenge
         → mints device token pd_<deviceTokenId>_<secret>, bcrypt-hashes into device_tokens
         → sets expiresAt = now + 90 days
         → returns { token, tenantId }
Desktop  → stores token in OS keychain (already built), sends as Bearer on /v1/policy forever
             (until expiry, revoke, or local credential wipe)
```

## Components

### Backend: `desktopAuthRouter`
New router, registered in `app.ts`, prefix `/auth/desktop`:
- `GET /authorize` — validates `redirect_uri` is `http://127.0.0.1:*` (reject anything else —
  otherwise this is an open redirect / auth-code leak vector) and `code_challenge_method === 'S256'`.
  Stateless: 302s straight to `{PRETZEL_CONSOLE_URL}/desktop-login` carrying the same query params.
- `POST /authorize/complete` — guarded by `resolveClerkJwt`. Body `{ state, code_challenge, redirect_uri }`.
  Mints a one-time code (32 random bytes, base64url), stores a row in `desktop_auth_codes`, returns
  `{ redirectUrl: "<redirect_uri>?code=<code>&state=<state>" }`.
- `POST /token` — body `{ code, code_verifier, redirect_uri }`. No auth header (the code is the
  credential). Validates: code exists, not expired (5 min TTL), not already used, `redirect_uri`
  matches the stored value exactly, and `SHA256(code_verifier)` base64url equals the stored
  `code_challenge`. Marks the code used, mints the device token, returns `{ token, tenantId }`.

### Backend: `auth/middleware.ts`
New `resolveDeviceToken(request, reply, token)`, parallel to the existing `resolveOrgToken`:
- Parse `pd_<deviceTokenId>_<secret>`.
- `SELECT * FROM device_tokens WHERE id = deviceTokenId`.
- Reject if missing, `revokedAt` set, or `expiresAt < now` (401, distinct message so the desktop
  app can tell "sign in again" apart from other auth failures).
- `bcrypt.compare(secret, tokenHash)`.
- Load `member`/`tenant` the same way `resolveClerkJwt` does; set `request.member`, `request.user`,
  `request.tenant`, `request.tokenPrefix = 'pd'`.
- Update `lastUsedAt` (best-effort, non-blocking).

Wired into `requireOrgTokenOrClerkAuth` (the guard already on `GET /v1/policy`) as a new branch:
`ps_` → `resolveOrgToken`, `pd_` → `resolveDeviceToken`, else → `resolveClerkJwt`.

### Database (Drizzle migration)
- `desktop_auth_codes`: `id`, `code` (unique), `memberId` (fk members), `tenantId`, `codeChallenge`,
  `redirectUri`, `expiresAt`, `usedAt` (nullable). Transient — safe to hard-delete rows past `expiresAt`
  in a future cleanup pass; not required for correctness now (lookups always check `usedAt`/`expiresAt`).
- `device_tokens`: `id` (uuid, doubles as the token's public `deviceTokenId`), `memberId` (fk members),
  `tenantId`, `tokenHash`, `createdAt`, `expiresAt` (createdAt + 90 days), `lastUsedAt` (nullable),
  `revokedAt` (nullable — no revoke endpoint/UI built yet, column exists for future use).

### Console: `pretzel-console`
One new route, `/desktop-login`. Deliberately **not** behind `RequireAuth`'s `org:admin` check —
monitored non-admin employees must be able to complete this. Reads `state`/`code_challenge`/`redirect_uri`
from the query string, shows Clerk's sign-in if signed out, then calls the backend `complete` endpoint
and redirects.

### Desktop: `pretzel-desktop`
No changes to the PKCE/callback-server/keychain code — it already matches this contract exactly.
One small addition to `electron/policy-sync.ts`: on a `401` response from `/v1/policy`, call
`clearCredentials()` (already exported from `auth.ts`) so `isAuthenticated()` goes false and the
app re-prompts sign-in on next check, instead of silently going stale for up to 90 days.

## Error handling
- Bad/missing `redirect_uri` or wrong `code_challenge_method` at `/authorize` → 400, no redirect.
- Expired/used/mismatched code at `/token` → 400 with a generic "invalid or expired code" message
  (don't leak which specific check failed).
- Expired or revoked device token on `/v1/policy` → 401 with a distinct reason the desktop app can
  use to trigger a re-auth prompt (vs. e.g. network errors, which should keep the last known policy).

## Environments
Both staging and production need:
1. `PRETZEL_CONSOLE_URL` env var on the backend service:
   - staging: `https://pretzel-console-staging.onrender.com`
   - production: `https://pretzel-console.mykka.ai`
2. The new migration run against each environment's DB (staging + prod Neon).
3. `pretzel-console` deployed with the new `/desktop-login` route.
4. `CLERK_SECRET_KEY` already set on the backend for both envs (existing dependency of `resolveClerkJwt`,
   unchanged by this work — just confirming it's present).

## Out of scope
- Revoke endpoint / console UI for killing a specific device token (schema supports it; not built now).
- Chrome extension (`pretzel/`) — does not use this loopback flow, unaffected by this work.
- Raising Clerk to a `pk_live_` production instance — separate, already-tracked decision (see
  `pretzel-desktop/.env.prod` comment), not part of this change.
