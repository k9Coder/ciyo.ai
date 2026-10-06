import * as Sentry from '@sentry/node'
import { env } from './env.js'

export function initSentry(): void {
  if (!env.SENTRY_DSN) return

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.APP_ENV ?? env.NODE_ENV,
    // No performance tracing — this is a JSON API with its own request-timing
    // logs (src/logger/request-logging.ts); tracesSampleRate stays 0 so the
    // shared org error quota isn't spent on transactions.
    tracesSampleRate: 0,
  })
}

export { Sentry }
