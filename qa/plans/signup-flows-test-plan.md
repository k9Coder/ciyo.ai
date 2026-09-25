---
product: pretzel
surface: console + chrome-extension
type: browser
base_url: "staging console (QA_CONSOLE_URL) + the extension loaded from pretzel/dist pointed at staging"
auth: none (every case starts signed out as a brand-new person)
timebox_minutes: 30
tags: [signup, onboarding, auth, enrollment, extension, console]
verified_at: 2026-09-25
---

# New-user sign-up — QA Test Plan

Four flows a brand-new person can take, and the promise each one makes. The point of the whole plan is
one sentence: **a new person fills in Clerk's form once and is in — no "now sign in again", no dead end.**

|  | No organisation yet | Existing organisation (an admin already added their email) |
|---|---|---|
| **Console** | SU-01 — gets their own org, lands in the onboarding wizard | SU-02 — joins the company org; admin -> Overview, member -> "You're all set" |
| **Extension** | SU-03 — told to ask their admin; nothing is created | SU-04 — signed in after one sign-up, company org selected |

"Existing organisation" always means: the admin used **People -> Members -> Add member** with that exact
email *before* the person signed up. Anyone else is "no organisation".

## Preconditions (whole suite)

- A staging console, and a QA **admin** account for it (see `qa/README.md`; never a customer account).
- Test people use Clerk's test convention: `qa-<something>+clerk_test@example.com`. On the dev/staging Clerk
  instance no email code is asked; if one is, it is `424242`. Password: anything Clerk accepts.
- For SU-03/SU-04: the extension built against staging (`pnpm build` in `pretzel/` with staging env) and loaded
  unpacked from `chrome://extensions`, in a **fresh Chrome profile** (so no earlier Clerk session leaks in).
- Cleanup after every case (staging is shared): remove the member row (People -> Members -> Remove) and delete
  the test user in the Clerk dashboard. SU-01 leaves an organisation behind — see its cleanup note.
- Automated coverage for the same flows lives in `e2e/` (local) and `journeys/console/signup-existing-org.spec.ts`
  (SU-02, member case). This plan is what a human or `/qa` runs on top of that.

## Cases

### SU-01 — Console, no organisation: own org and onboarding
**Priority:** critical   **Timebox:** 5m   **Auth:** none
**Description:** a stranger signs up on the console with an email nobody added and ends up with a working personal org.
**Preconditions:** an email that is NOT under any org's Members list.
**Steps:**
1. Open the console `/login` in a signed-out browser. Click **Sign in with Clerk**.
2. In the Clerk modal click **Sign up**. Enter the email and a password. Click **Continue**. Do nothing else.
**Expected:** the browser lands on `/onboarding/profile` ("Set up your DLP policy") by itself. It never shows
"Couldn't load your account", never asks to sign in again. Pick a profession: the wizard finishes and lands on
the Overview, in an org named after the person ("<Name>'s Organization"), as Super Admin.
**Cleanup:** the personal org stays in staging data (a platform admin can remove it); delete the Clerk user.

### SU-02 — Console, existing organisation: joins the company org
**Priority:** critical   **Timebox:** 5m   **Auth:** none (admin only for setup)
**Description:** an admin-added person signs up once and lands where their role says, inside the company org.
**Preconditions:** as the QA admin, add the test email under **People -> Members** with role **Member**.
**Steps:**
1. In a signed-out browser open `/login` -> **Sign in with Clerk** -> **Sign up** -> email + password -> **Continue**.
2. (Variant) Repeat with a second email added as **Super Admin**.
**Expected:** Member: lands on `/unauthorized` with "You're all set" (protection runs in the extension / desktop
app; the console is for admins). Super Admin: lands on the Overview showing the **company** org name in the
sidebar (not a new personal org) with the welcome banner. Neither sees an error or a second sign-in.
As the admin, the row now shows the person as a member (no longer pending).

### SU-03 — Extension, no organisation: told to ask the admin
**Priority:** high   **Timebox:** 5m   **Auth:** none
**Description:** the extension never creates organisations; a stranger gets a clear message, not a broken state.
**Preconditions:** the extension loaded (fresh profile). An email nobody added.
**Steps:**
1. Open the extension's **options page** (right-click the toolbar icon -> Options), tab **Account**.
2. Click **Create an account**. Enter the email + password. Click **Continue**.
**Expected:** the page shows "No account found for this email — ask your admin to add you." and the sign-in
form again (the message must still be visible, not wiped by the page reloading). The person is **not** signed
in, the popup still says "Sign in to turn on protection", and no organisation exists for them (check People ->
Members of the QA org: no new row).

### SU-04 — Extension, existing organisation: one sign-up and they are in
**Priority:** critical   **Timebox:** 8m   **Auth:** none (admin only for setup)
**Description:** the headline promise: sign up from the extension, be signed in, no second step.
**Preconditions:** as the QA admin, add the test email under People -> Members (Member). Extension loaded, fresh profile.
**Steps:**
1. Options page -> **Account** -> **Create an account** -> email + password -> **Continue**. This is the only form.
2. Without touching anything else, look at the Account tab, then open the toolbar **popup**.
3. Open a supported AI site (e.g. chatgpt.com) and type a prompt that breaks a rule the QA org has.
**Expected:** after step 1 the Account tab shows the person's email and a **Sign out** button (no sign-in form, no
error page, no ERR_FILE_NOT_FOUND / "blocked" tab). The popup shows the signed-in view for the company org. On the
AI site the company rule is enforced (the block/warn overlay appears). The Members list shows the person as enrolled.
**Also try (same case):** if the admin-added email already has a Clerk account, **Sign in** instead of Create — same result.
**Production note:** on production the Account tab also offers **Continue with Google** (a device flow through the
console's `/extension-login` page). It must end the same way: signed in on the first attempt, company org selected.

### SU-05 — Sign-up while Clerk's webhook is slow (regression guard)
**Priority:** high   **Timebox:** 4m   **Auth:** none
**Description:** the Clerk -> backend webhook lags a brand-new sign-up; the first calls must still succeed.
**Preconditions:** a staging environment where you can observe webhook delivery (Clerk dashboard -> Webhooks), or
simply run SU-02 and SU-04 several times in a row with fresh emails.
**Steps:**
1. Run SU-04 (or SU-02 Super Admin) with a fresh email, immediately after clicking **Continue** on sign-up.
**Expected:** never "Couldn't load your account" (console) and never "Not enrolled"/"User not found" (extension,
console `/extension-login`), regardless of whether the webhook has landed yet. If it ever happens, note the time
and file it: it means just-in-time provisioning failed (Clerk API unreachable, or the email was unverified on production).

### SU-06 — Email typed with different letter case
**Priority:** medium   **Timebox:** 3m   **Auth:** admin (setup)
**Description:** the admin's typing must not decide whether a person can join.
**Steps:**
1. As the QA admin add `Qa.Case.Test+clerk_test@Example.com`. Then run SU-02 signing up with `qa.case.test+clerk_test@example.com`.
**Expected:** joins the company org exactly as in SU-02.
