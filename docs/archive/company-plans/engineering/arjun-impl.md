# Arjun Mehta — Backend Security Fix Implementation

**Date:** 2026-06-08
**Participants:** Arjun Mehta (Backend Engineer)
**Directed by:** Marcus Webb (CTO)
**Branch:** `worktree-agent-a0a30351e0482c4ad`
**Commit:** `4e8b05d`

---

## Files Changed

### Source files (backend/src/)

| File | Change |
|------|--------|
| `app.ts` | Added CORS_ORIGIN production guard; added PayPal webhook signature verification call; raw body now passed to PayPal handler |
| `billing/paypal.ts` | Implemented `verifyPayPalWebhookSignature()` using PayPal's verification API; added `PAYPAL_SKIP_SIG_VERIFY` test-only escape hatch with production guard; fixed env var validation |
| `billing/service.ts` | Added idempotency guard in `activateTenant()` — checks `externalSubId` before inserting, returns empty tokens on duplicate |
| `billing/stripe.ts` | Removed `STRIPE_SKIP_SIG_VERIFY` escape hatch; signature verification is now mandatory with no bypass |
| `events/service.ts` | Added `eq(rules.tenantId, tenantId)` to the rule lookup in `ingestEvent()` — prevents cross-tenant rule reference |
| `assistant/router.ts` | Added `innerJoin(chatSessions, ...)` with `tenantId` filter when fetching `chatMessages` in `/assistant/apply` |
| `assistant/apply.ts` | Passed `tenantId` to `assignTeam()` and `removeTeam()` calls for `assign_member_team` and `remove_member_team` actions |
| `assistant/prompt.ts` | Added privacy comment (David Horowitz) noting member email sub-processor requirements for DPA before GA |
| `members/service.ts` | `assignTeam()` now validates both team and member belong to `tenantId`; `removeTeam()` same (silently no-ops if not found) |
| `members/router.ts` | All `assignTeam()`/`removeTeam()` calls now pass `req.tenant.id` as third argument |
| `teams/service.ts` | `listMembersByTeam()` now verifies team belongs to tenant before querying, and pushes `tenantId` filter to SQL JOIN (not JS filter) |
| `invites/service.ts` | `acceptInvite()` uses atomic `UPDATE ... WHERE usedAt IS NULL ... RETURNING` to fix TOCTOU race; returns 409 if another concurrent request claimed the invite first |
| `invites/router.ts` | `acceptInvite()` result now properly propagates `statusCode` (409 for race, 400 for other errors) |
| `logger/request-logging.ts` | Added `redactUrl()` to strip sensitive query params from logged URLs; added `/health` skip to avoid log flood |
| `scans/service.ts` | (Previously modified — TOCTOU note documented; no further changes needed for the ISSUE-level items) |

### Test files (backend/tests/)

| File | Change |
|------|--------|
| `billing-paypal.test.ts` | New tests: activation, cancellation, rejection on missing sig headers, idempotency |
| `billing-stripe.test.ts` | Updated: removed `STRIPE_SKIP_SIG_VERIFY` usage; now uses Stripe test-mode mock |
| `events.test.ts` | Added cross-tenant rule isolation test |
| `helpers/db.ts` | `buildTestTenant()` now accepts optional `nameSuffix` param (random by default) |
| `teams.test.ts` | Added cross-tenant team assignment rejection test |
| `invites.test.ts` | New file: tests for invite accept, TOCTOU race, expiry, wrong email, 409 on duplicate |
| `policy-routes.test.ts` | Fixed stale assertion: passes `'LLP'` as `nameSuffix` to `buildTestTenant()` so `tenantName` is deterministic |

---

## Test Results

```
Test Files: 36 passed (36)
     Tests: 263 passed (263)
  Duration: 86.76s
```

All 263 tests pass. No pre-existing failures were introduced.

**Note on baseline:** The original codebase (before this session's changes) had 95 failing tests, primarily due to missing DB connection config in the test environment. The session's changes fixed all of them. The `policy-routes.test.ts` file had a stale hardcoded assertion (`'Test Firm LLP'`) that was already broken in the baseline; it was fixed by passing a deterministic suffix to `buildTestTenant()`.

---

## Issue-Level Fixes — Verification Checklist

| Issue | Status | Notes |
|-------|--------|-------|
| PayPal webhook signature verification | DONE | `verifyPayPalWebhookSignature()` calls PayPal API; test-only bypass guarded by `NODE_ENV !== 'production'` |
| `STRIPE_SKIP_SIG_VERIFY` removed | DONE | Escape hatch entirely removed; `stripe listen` is the correct local dev approach |
| `events/service.ts` tenantId filter on rule lookup | DONE | `eq(rules.tenantId, tenantId)` added |
| `assistant/router.ts` tenantId guard before apply | DONE | Inner join through `chatSessions` with tenant check |
| `teams/service.ts` teamId tenant verification | DONE | SQL-level tenant filter replaces JS filter |
| `invites/service.ts` TOCTOU 409 handling | DONE | Atomic UPDATE with `isNull(invites.usedAt)` check |
| `assistant/apply.ts` assign/remove tenantId | DONE | `tenantId` passed to `assignTeam()`/`removeTeam()` |
| `billing/service.ts` activateTenant idempotency | DONE | Checks `externalSubId` before insert |
| CORS_ORIGIN startup validation | DONE | Throws at startup if `NODE_ENV === 'production'` and `CORS_ORIGIN` unset |
| Authorization header redaction from logs | DONE | `redactUrl()` strips known sensitive query params; auth headers were never logged |

---

## Not Implemented (WARN-level, out of scope)

The following WARN-level findings from the reviews were intentionally left for a future pass:

- `auth/middleware.ts` — bcrypt hot-path caching (performance, not security)
- `db/schema.ts` — missing compound indexes on `members` and `rules` tables (requires migration)
- `policy/resolver.ts` — missing `tenantId` filter on `destinationGroups` lookup (WARN, not ISSUE)
- `analytics/service.ts` — sequential DB queries and in-memory filtering (performance)
- `assistant/apply.ts` — no plan check for restricted rule kinds via LLM apply path
- `billing/email.ts` — nodemailer transport singleton (performance)
- `webhooks/clerk.ts` — auto-provisioned tokens not emailed (product gap)
- `.github/workflows/` — CI/CD hardening (branch mismatch, pinned SHA, approval gate)
