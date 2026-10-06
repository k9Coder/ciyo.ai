import { initSentry } from './lib/sentry'
import { installClerkSessionRecovery } from './lib/clerkSessionRecovery'
initSentry()
installClerkSessionRecovery()

import LogRocket from 'logrocket'
import { env } from './env'
const LOGROCKET_ID = env.VITE_LOGROCKET_ID
if (LOGROCKET_ID) LogRocket.init(LOGROCKET_ID)

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import { App } from './App'
import { initTheme } from './utils/theme'

initTheme()

const CLERK_KEY = env.VITE_CLERK_PUBLISHABLE_KEY

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Clerk's telemetry beacon injects an inline script and calls out to
        clerk-telemetry.com — both blocked by our CSP (script-src has no
        'unsafe-inline', connect-src doesn't allowlist that domain). It's
        non-essential analytics, so disable it at the source instead of
        loosening the CSP to accommodate it. */}
    <ClerkProvider publishableKey={CLERK_KEY} telemetry={{ disabled: true }}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
)
