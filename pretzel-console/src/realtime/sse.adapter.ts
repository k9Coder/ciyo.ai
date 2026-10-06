import { API_BASE } from '../lib/api'
import type { IRealtimeSubscriber } from './types'

// SECURITY NOTE: The auth token must NOT be passed as a query parameter in the
// EventSource URL. Doing so exposes the token in server access logs, browser
// history, Sentry / LogRocket breadcrumbs, and referrer headers.
//
// TODO (ISSUE #security/sse-token-in-url): Implement a short-lived SSE ticket
// endpoint on the backend:
//   POST /v1/events/ticket → { ticket: "<one-time-uuid>", expiresIn: 60 }
// Then open EventSource as:
//   new EventSource(`${API_BASE}/v1/events?ticket=${ticket}`)
// The ticket is exchanged server-side for the real JWT, is single-use, and
// expires after 60 s — leaking it is low-risk compared to leaking the primary
// Clerk JWT.
//
// Until /v1/events/ticket is implemented, we keep ?token= but deliberately
// avoid logging the URL in error-tracking calls.

export class SSESubscriber implements IRealtimeSubscriber {
  subscribe(getToken: () => Promise<string>, onUpdate: () => void, onDegraded?: () => void): () => void {
    let es: EventSource | null = null
    let closed = false
    let retryDelay = 1_000
    const MAX_DELAY = 30_000
    // Consecutive-failure cap: without this, a connection that can never
    // succeed (e.g. caller stuck outside onboarding, or sustained 429s) would
    // retry forever for as long as the tab stays open, adding permanent
    // background load to the same rate-limit bucket as everything else.
    const MAX_CONSECUTIVE_FAILURES = 6
    let consecutiveFailures = 0

    const connect = async () => {
      // Guard: if cleanup already ran while we were awaiting getToken, bail out
      // to prevent leaking an EventSource that will never be closed.
      if (closed) return

      const token = await getToken()

      // Second guard after the await — cleanup may have fired during the async gap.
      if (closed) return

      es = new EventSource(`${API_BASE}/v1/events?token=${token}`)

      es.addEventListener('message', onUpdate)

      es.addEventListener('open', () => {
        // Reset backoff and failure count on a successful connection.
        retryDelay = 1_000
        consecutiveFailures = 0
      })

      es.addEventListener('error', async () => {
        if (closed) return

        // readyState === 2 (CLOSED) means the server closed the connection or
        // returned a non-2xx status (e.g. 401 token expired, 429 rate limited)
        // — the browser will NOT auto-retry, so we own reconnection below.
        // readyState === 0 (CONNECTING) covers two cases: we're mid-handshake
        // on a fresh attempt, or the underlying transport failed outright
        // (e.g. ERR_CONNECTION_REFUSED, nothing listening on the host) — for
        // that second case the browser silently auto-reconnects forever on
        // its own timer (~1-3s) without ever surfacing readyState CLOSED, so
        // the failure count must still advance here or the cap below never
        // triggers and this retries indefinitely with nothing shown to the
        // user.
        consecutiveFailures += 1

        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
          // Give up. Whatever is failing (stuck auth state, sustained rate
          // limiting, unreachable server) isn't going to resolve itself by
          // retrying faster — a fresh page load (which callers get after
          // fixing the underlying issue) will start a new subscription with
          // a clean counter. Force-close so the browser's own auto-reconnect
          // (readyState CONNECTING case) stops too.
          closed = true
          es?.close()
          es = null
          onDegraded?.()
          return
        }

        if (es?.readyState === EventSource.CLOSED) {
          es.close()
          es = null

          await new Promise(r => setTimeout(r, retryDelay))
          retryDelay = Math.min(retryDelay * 2, MAX_DELAY)

          if (!closed) connect()
        }
        // else: readyState CONNECTING — browser is already retrying on its
        // own timer, nothing more to do here besides the count above.
      })
    }

    connect()

    return () => {
      closed = true
      es?.close()
      es = null
    }
  }
}
