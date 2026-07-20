# Billing Scan Limit Warning Email — Alert Admin at 80% Monthly Scan Usage

**Owner suggestion:** Arjun Mehta (Backend)
**Priority:** 🟡 Pre-launch
**Effort:** ~3–4 hours

---

## Context

Each plan has a monthly scan limit (defined in `backend/src/billing/limits.ts`). When a tenant hits 100% they get `blocked: true` from `recordScan()` — the extension stops detecting.

The admin has no warning before hitting the wall. Desired behavior: when monthly scan usage crosses 80% of the plan limit, send a one-time warning email.

`recordScan()` in `backend/src/scans/service.ts` already calculates `remaining`. It returns `{ blocked, remaining }`. At the 80% threshold, `remaining / limit ≤ 0.2` — this is the trigger point.

Similar to the seat warning, use a `scan_warning_email_sent_at` timestamp on `tenants` to prevent duplicate emails within the same billing month. Reset logic: the warning resets at the start of each calendar month (when the monthly scan count resets to 0).

---

## Acceptance criteria

- [ ] After `db.insert(scans)` in `recordScan()`: if `remaining / limit ≤ 0.20` AND today's month is different from `scanWarningEmailSentAt` month (or it's null): send warning email
- [ ] Add `scan_warning_email_sent_at` column to `tenants` table (nullable timestamptz)
- [ ] Generate migration for the new column
- [ ] `sendScanLimitWarningEmail(to, tenantName, used, limit, percent)` function in `backend/src/billing/email.ts`
- [ ] Plan `free` (unlimited scans, limit = -1): skip — no warning possible
- [ ] Fire-and-forget — email failure does NOT block scan recording
- [ ] Unit test: scan at 81% → warning email called
- [ ] Unit test: second scan that same month still at 81% → no duplicate email
- [ ] Unit test: plan with limit = -1 → no warning email ever
- [ ] `pnpm test` passes

---

## Files to touch

| Action | File | Change |
|---|---|---|
| Modify | `backend/src/db/schema.ts` | Add `scanWarningEmailSentAt` column to `tenants` table |
| Create | `backend/drizzle/XXXX_scan_warning_email.sql` | Migration |
| Modify | `backend/src/scans/service.ts` | After successful insert: check remaining ratio, conditionally send email |
| Modify | `backend/src/billing/email.ts` | Add `sendScanLimitWarningEmail()` function |
| Modify | `backend/tests/scans.test.ts` | Add tests for warning trigger, dedup, unlimited-plan skip |

---

## Email copy

```
Subject: You're approaching your monthly scan limit on Pretzel

Hi {tenantName},

Your Pretzel workspace has used {percent}% of its monthly scan allowance.

Current usage: {used} of {limit} scans this month

When you reach the limit, Pretzel will stop monitoring new AI sessions
until your plan resets next month.

To get unlimited scans, upgrade to the Business plan:
{ADMIN_BASE_URL}/settings/billing

— The Pretzel team at mykka.ai
```

---

## Implementation note — getting the admin's email for the warning

`recordScan()` currently only receives `tenantId` and `memberId`. To send an email, we need the tenant's billing contact email. Options:

1. **Add a `billingEmail` column to `tenants`** — populated at checkout from `session.customer_email` (Stripe) or `parsed.email` (PayPal). **Recommended** — clean, easy to query.
2. **Look up the super_admin member** — query `members` for `role = 'super_admin'` for the tenant and email them. Works but is an extra DB query per scan.

Option 1 is the right call. Add `billing_email` nullable text to `tenants` and populate it in `billing/service.ts` → `activateTenant()`.

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: email admin when monthly scan usage hits 80% of plan limit**
>
> Admins get no warning before the scan limit wall. When hit, detection silently stops for the rest of the month. Need a one-time monthly warning email at 80%.
>
> Engineering work (Arjun, ~4 hours):
> 1. Add `scan_warning_email_sent_at` (nullable timestamptz) to `tenants` table + migration.
> 2. Add `billing_email` (nullable text) to `tenants` table — populate in `billing/service.ts → activateTenant()` from the checkout email.
> 3. In `backend/src/scans/service.ts → recordScan()`: after insert, check `remaining / limit ≤ 0.20`. If true and warning not sent this calendar month: call `sendScanLimitWarningEmail()` fire-and-forget, update `scanWarningEmailSentAt`.
> 4. Skip if `limit === -1` (unlimited plan).
> 5. `sendScanLimitWarningEmail()` in `backend/src/billing/email.ts`.
> 6. Tests in `backend/tests/scans.test.ts`.
>
> Run `pnpm seed:e2e` after migrations, then `pnpm test`. Note: this is related to the data retention work in `legal-data-retention.md` — coordinate with David on the billing_email field before shipping.
