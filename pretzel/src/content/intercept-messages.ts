/** Shared message type constants for the fetch-interceptor ↔ content-script protocol. */
export const MSG_INTERCEPT    = "MYKKA_INTERCEPT";
export const MSG_DECISION     = "MYKKA_DECISION";
export const MSG_UNLOCK_FETCH = "MYKKA_UNLOCK_FETCH";
/** MAIN → ISOLATED: enforcement degraded (e.g. detection decision timed out). */
export const MSG_DEGRADED     = "MYKKA_DEGRADED";
