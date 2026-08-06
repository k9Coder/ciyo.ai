/**
 * Clerk's background session `touch()` (focus/interval keepalive) 404s when
 * the session was invalidated server-side (revoked, expired, signed out in
 * another tab) while clerk-js still held it in memory. clerk-js only calls
 * its own `handleUnauthenticated()` recovery for error shapes its internal
 * classifier recognizes; this one it doesn't, so it rethrows instead —
 * leaving the app in a dead, unrecoverable auth state with no console error
 * (unhandled promise rejection) until the user manually reloads.
 *
 * Install a global listener to force the same recovery clerk-js would have
 * done: drop the stale session and send the user back to /login.
 *
 * GUARD: a hard navigation to an unmapped URL (full page reload, e.g. typing
 * a stale/typo'd route) makes clerk-js re-initialize from scratch. A
 * `touch()` call queued from just before the reload can resolve into this
 * same "No session was found" rejection during that re-init window even
 * though the session is perfectly valid — without a check here, that false
 * positive force-logs-out a user who never actually lost their session, on
 * literally any mistyped URL. Cross-check clerk-js's own live session state
 * before acting: only treat this as a real revocation if `window.Clerk`
 * itself currently agrees there's no session.
 */
const SESSION_NOT_FOUND = /No session was found with id/

export function installClerkSessionRecovery(): void {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    if (!SESSION_NOT_FOUND.test(message)) return

    const clerk = (window as unknown as { Clerk?: { session?: unknown } }).Clerk
    if (clerk?.session) {
      // clerk-js still has a live session — this was a stale/transient
      // rejection racing a fresh init, not a real revocation. Swallow it.
      event.preventDefault()
      return
    }

    event.preventDefault()
    if (window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  })
}
