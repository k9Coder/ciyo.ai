import * as Sentry from '@sentry/electron/main'

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_DESKTOP
  if (!dsn) return

  Sentry.init({
    dsn,
    // No performance tracing needed for a tray app.
    tracesSampleRate: 0,
  })
}

export { Sentry }
