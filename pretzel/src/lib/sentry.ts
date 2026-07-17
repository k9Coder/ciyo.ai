import * as Sentry from '@sentry/browser'
import { env, MODE } from '../env'

export function initSentry(): void {
  const dsn = env.VITE_SENTRY_DSN_EXTENSION
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: MODE,
    tracesSampleRate: 0.1,
    integrations: [],
  })
}

export { Sentry }
