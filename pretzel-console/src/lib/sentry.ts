import * as Sentry from '@sentry/react'

export function initSentry(): void {
  const dsn = import.meta.env['VITE_SENTRY_DSN'] as string | undefined
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,   // Clarity handles session replay
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/api\.ciyo\.ai/,
    ],
    beforeSend: (event) => {
      if (window.location.hostname === 'localhost') return null
      return event
    },
  })
}

export { Sentry }
