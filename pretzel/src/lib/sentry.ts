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
    // @sentry/browser refuses to initialize inside a chrome-extension://
    // context by default (logs "You cannot use Sentry.init() in a browser
    // extension" and no-ops) — this is a real content-script/background
    // script, so the check is a false positive here. This is Sentry's own
    // documented opt-out for extension authors who know what they're doing.
    skipBrowserExtensionCheck: true,
  })
}

export { Sentry }
