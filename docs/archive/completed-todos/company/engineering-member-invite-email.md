# Member Invite — Auto-Send Email on Invite Creation

**Owner suggestion:** Arjun Mehta (Backend)
**Priority:** 🟡 Pre-launch — table stakes for B2B SaaS
**Effort:** ~half day

---

## Context

Right now when an admin creates an invite via `POST /v1/invites`, no email is sent. The admin must manually copy the invite link from the API response and paste it to the invitee. This is a usability gap — every B2B SaaS sends invite emails automatically.

The invite link structure is: `${ADMIN_BASE_URL}/invite?token=${token}`  
The invite TTL is 72 hours.

Email transport already exists in `backend/src/billing/email.ts` (`nodemailer` via SMTP). A new `sendInviteEmail()` function needs to be created and called from the invites router.

---

## Acceptance criteria

- [ ] When `POST /v1/invites` is called with a non-null `email` field, an invite email is sent to that address
- [ ] Email contains: inviting org name, invitee's role, the invite link (`ADMIN_BASE_URL/invite?token=...`), and expiry date (72h from now)
- [ ] If `email` is null (open invite link), no email is sent — that's intentional
- [ ] Email sending is fire-and-forget — a failed email does NOT cause the invite creation to fail (wrap in `.catch(() => {})`)
- [ ] `ADMIN_BASE_URL` env var is used for the link base (already exists in `invites/router.ts:5`)
- [ ] Unit test: invite created with email → `sendInviteEmail` called with correct args
- [ ] Unit test: invite created without email → no email sent
- [ ] `pnpm test` passes

---

## Files to touch

| Action | File | Change |
|---|---|---|
| Create | `backend/src/invites/email.ts` | `sendInviteEmail(to, tenantName, role, inviteUrl, expiresAt)` |
| Modify | `backend/src/invites/router.ts` | After `createInvite()`, if `body.email` is set: call `sendInviteEmail()` fire-and-forget |
| Modify | `backend/tests/invites.test.ts` | Add tests for email send / no-email cases (mock nodemailer) |

---

## Email copy

```
Subject: You've been invited to join {tenantName} on Pretzel

{tenantName} has invited you to join their Pretzel workspace as a {role}.

Accept your invitation (expires in 72 hours):
{inviteUrl}

If you weren't expecting this invitation, you can ignore this email.

— The Pretzel team at ciyo.ai
```

---

## Prompt to CTO (copy-paste to staff:marcus-webb)

> **Task: auto-send email when admin creates a member invite**
>
> Currently `POST /v1/invites` creates an invite but sends no email. Admin must manually share the link. This is a basic UX gap — every B2B SaaS sends invite emails.
>
> Fix (Arjun, ~half day):
> 1. Create `backend/src/invites/email.ts` with `sendInviteEmail()` using the existing nodemailer transport from `billing/email.ts`.
> 2. In `backend/src/invites/router.ts`, after `createInvite()` returns, if `body.email` is set: call `sendInviteEmail()` fire-and-forget (don't let email failure block invite creation).
>
> Email body is in the acceptance criteria doc. Tests in `backend/tests/invites.test.ts`. Half-day effort. Must pass `pnpm test` before merging.
