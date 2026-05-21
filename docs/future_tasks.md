# Future Tasks

Items deferred for later — not in current scope but should not be forgotten.

---

## Extension — Unsigned-in User Detection

**What:** When an employee has the extension installed but hasn't signed in to Clerk, the admin panel currently has no visibility of this. Need a way for the extension to signal to the backend (and surface in the admin panel) that there is an unsigned/unregistered user on a device.

**Why:** Assumption is employees are always signed in after first sign-in (persistent Clerk session). But edge cases exist — new device, browser reset, cookie clear. Admin should know if coverage has gaps.

**Rough idea:** Extension could send an anonymous ping with a device fingerprint or install ID when it detects no Clerk session, allowing the admin to see "X devices not signed in."
