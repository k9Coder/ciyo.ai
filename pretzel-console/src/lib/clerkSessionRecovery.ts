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
 */
const SESSION_NOT_FOUND = /No session was found with id/

export function installClerkSessionRecovery(): void {
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message = reason instanceof Error ? reason.message : String(reason)
    if (!SESSION_NOT_FOUND.test(message)) return

    event.preventDefault()
    if (window.location.pathname !== '/login') {
      window.location.assign('/login')
    }
  })
}
