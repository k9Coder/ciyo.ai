import * as Sentry from '@sentry/react'
import { env, MODE } from '../env'

export function initSentry(): void {
  const dsn = env.VITE_SENTRY_DSN
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: MODE,
    dataCollection: {
      // userInfo: false,    // disable sending user PII
      // httpBodies: [],     // disable capturing request/response bodies
    },
    tracesSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0,   // Clarity handles session replay
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracePropagationTargets: [
      'localhost',
      /^https:\/\/api\.mykka\.ai/,
    ],
    beforeSend: (event) => {
      if (window.location.hostname === 'localhost') return null
      return event
    },
  })
}

export { Sentry }
