# Seat Limit Warning Email — Alert Admin at 80% Seat Usage

**Owner suggestion:** Arjun Mehta (Backend)
**Priority:** 🟡 Pre-launch
**Effort:** ~3–4 hours

---

## Context

When a tenant approaches their seat limit, the admin currently has no warning until they hit the wall and get a 403. They only discover the limit when a new member invite fails.

Desired behavior: when the org's active member count crosses 80% of their plan's seat limit, send a one-time warning email to the tenant's billing contact (the email used at checkout).

Seat limits by plan (from `backend/src/billing/limits.ts`):
- `free`: check what the current limit is (likely 3–5)
- `starter`: whatever the starter limit is
- `business`: whatever the business limit is

The warning should only fire once per billing period (not on every member add after 80%). A simple mechanism: store a `seatWarningEmailSentAt` timestamp on the `tenants` table. Only send if null or older than 30 days.

---

## Acceptance criteria

- [ ] When `addMember()` or bulk `importMembers()` in `backend/src/members/service.ts` succeeds, check if current member count / seat limit ≥ 0.8
- [ ] If yes AND tenant has not received a warning in the last 30 days: send the warning email
- [ ] Add `seat_warning_email_sent_at` column to `tenants` table (nullable timestamptz)
- [ ] Generate a migration for the new column
- [ ] `sendSeatLimitWarningEmail(to, tenantName, currentCount, seatLimit)` function in `backend/src/billing/email.ts` (or a new `backend/src/members/email.ts`)
- [ ] Fire-and-forget — email failure does NOT block member creation
- [ ] Unit test: member add crossing 80% → warning email called
- [ ] Unit test: member add crossing 80% again within 30 days → no duplicate email
- [ ] `pnpm test` passes

---

## Files to touch

| Action | File | Change |
|---|---|---|
| Modify | `backend/src/db/schema.ts` | Add `seatWarningEmailSentAt` column to `tenants` table |
| Create | `backend/drizzle/XXXX_seat_warning_email.sql` | Migration adding the column |
| Modify | `backend/src/members/service.ts` | After successful insert: check seat ratio, conditionally send email |
| Modify | `backend/src/billing/email.ts` | Add `sendSeatLimitWarningEmail()` function |
| Modify | `backend/tests/members.test.ts` | Add tests for warning trigger logic |

---

## Email copy

```
Subject: You're approaching your seat limit on Pretzel

Hi {tenantName},

Your Pretzel workspace is approaching its seat limit.

Current usage: {currentCount} of {seatLimit} seats ({percent}% full)

When you reach the limit, new member invitations will be blocked.
To add more seats, upgrade your plan in the billing settings.

Manage your plan: {ADMIN_BASE_URL}/settings/billing

— The Pretzel team at ciyo.ai
```

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: email admin when seat usage hits 80% of plan limit**
>
> Admins currently get no warning before hitting the seat wall — they only discover the limit when a member invite fails. We need a one-time warning email at 80% usage.
>
> Engineering work (Arjun, ~4 hours):
> 1. Add `seat_warning_email_sent_at` nullable column to `tenants` table + migration.
> 2. In `backend/src/members/service.ts` after `addMember()` / `importMembers()`: count current members, compare to plan limit from `billing/limits.ts`. If ≥ 80% AND `seatWarningEmailSentAt` is null or > 30 days ago: send email fire-and-forget, update `seatWarningEmailSentAt`.
> 3. `sendSeatLimitWarningEmail()` function in `backend/src/billing/email.ts`.
> 4. Tests in `backend/tests/members.test.ts`.
>
> Seat limits by plan are in `backend/src/billing/limits.ts`. Run `pnpm seed:e2e` after migration, then `pnpm test`.
