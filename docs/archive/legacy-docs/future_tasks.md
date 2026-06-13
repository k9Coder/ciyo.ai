# Future Tasks

Items deferred for later — not in current scope but should not be forgotten.

---
## Think about adding a storage of 

## Loading Indicator
- add Loading Indicator nice UI-UX for users in the system.


## Logs!!!
- if one of the things we already have here, denote that and all good, maybe I offered to make it better or I missed that we have it.
- add special logger we will implement and log every request comes into server with Request Start and when it ends with Request Completed or Request Failed, notice I want traceId that "travels" along all the request.
- add special properties we need whene there is error so we will see that in logs where it came from and so on.
- support that we would be using inteegration like idk, logz-io or coralogix, make it very flex so tomorrow I coudl switch to something else, for now free tier only.
- on client side, we need to have LogRocket it's simple, with free tier, and sentry.
- on client side I want that if there is error or info of something important happens  we will log to sentry free tier!!!
- on extension we need to have like a logrocket or some way to monitor, propose stuff.


## Extension — Unsigned-in User Detection

**What:** When an employee has the extension installed but hasn't signed in to Clerk, the admin panel currently has no visibility of this. Need a way for the extension to signal to the backend (and surface in the admin panel) that there is an unsigned/unregistered user on a device.

**Why:** Assumption is employees are always signed in after first sign-in (persistent Clerk session). But edge cases exist — new device, browser reset, cookie clear. Admin should know if coverage has gaps.

**Rough idea:** Extension could send an anonymous ping with a device fingerprint or install ID when it detects no Clerk session, allowing the admin to see "X devices not signed in."
