import * as Sentry from '@sentry/browser'

export function initSentry(): void {
  const dsn = import.meta.env['VITE_SENTRY_DSN_EXTENSION'] as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    integrations: [],
  })
}

export { Sentry }
