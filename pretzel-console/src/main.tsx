import { initSentry } from './lib/sentry'
initSentry()

import LogRocket from 'logrocket'
const LOGROCKET_ID = import.meta.env['VITE_LOGROCKET_ID'] as string | undefined
if (LOGROCKET_ID) LogRocket.init(LOGROCKET_ID)

import React from 'react'
import ReactDOM from 'react-dom/client'
import { ClerkProvider } from '@clerk/react'
import './index.css'
import { App } from './App'
import { initTheme } from './utils/theme'

initTheme()

const CLERK_KEY = import.meta.env['VITE_CLERK_PUBLISHABLE_KEY'] as string

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ClerkProvider publishableKey={CLERK_KEY}>
      <App />
    </ClerkProvider>
  </React.StrictMode>
)
