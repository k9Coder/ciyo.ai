# Client-Side & Extension Observability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add production observability to the admin Console (React) and the Pretzel extension so errors and important events are captured and visible without needing server logs.

**Note:** Server-side structured logging is covered by a separate plan (`logger-system.md`). This plan covers the client and extension only.

**Architecture:**
- **Admin Console (React):** Sentry for errors + important events. Free tier, integrates with React error boundaries.
- **Pretzel Extension:** Sentry's browser SDK works in MV3 service workers with some caveats. Use it for unhandled errors in the service worker and content script. For session replay, Sentry's session replay is not available in extensions — skip.

**Tech Stack:** `@sentry/react`, `@sentry/browser` (for extension), Vite env vars

---

## File Map

| Action | Path | What changes |
|--------|------|-------------|
| Modify | `pretzel-console/src/main.tsx` | Init Sentry before React renders |
| Create | `pretzel-console/src/lib/sentry.ts` | Sentry init config |
| Modify | `pretzel-console/src/App.tsx` | Wrap routes in `<Sentry.ErrorBoundary>` |
| Modify | `pretzel-console/.env.example` | Add `VITE_SENTRY_DSN` |
| Modify | `pretzel/src/background/service-worker.ts` | Init Sentry, capture unhandled errors |
| Modify | `pretzel/src/content/content-script.ts` | Capture send-intent errors to Sentry |
| Modify | `pretzel/.env.example` | Add `VITE_SENTRY_DSN_EXTENSION` |

---

## Task 1: Admin Console — Sentry Setup

**Files:**
- Modify: `pretzel-console/src/main.tsx`
- Create: `pretzel-console/src/lib/sentry.ts`
- Modify: `pretzel-console/src/App.tsx`

- [ ] **Step 1: Install Sentry**

```bash
cd pretzel-console && pnpm add @sentry/react
```

- [ ] **Step 2: Create `pretzel-console/src/lib/sentry.ts`**

```typescript
import * as Sentry from '@sentry/react'

export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return  // silently skip in local dev

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,  // 'production' | 'development'
    tracesSampleRate: 0.1,              // 10% of transactions — free tier friendly
    replaysOnErrorSampleRate: 0,        // no session replay on free tier
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Don't send errors from localhost
    beforeSend: (event) => {
      if (window.location.hostname === 'localhost') return null
      return event
    },
  })
}

export { Sentry }
```

- [ ] **Step 3: Init in `main.tsx` before React renders**

```typescript
// pretzel-console/src/main.tsx
import { initSentry } from './lib/sentry'
initSentry()

import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
// ...
```

- [ ] **Step 4: Wrap App in Sentry ErrorBoundary**

In `pretzel-console/src/App.tsx`:
```tsx
import { Sentry } from './lib/sentry'

// Wrap the root JSX:
<Sentry.ErrorBoundary fallback={<p>Something went wrong. Our team has been notified.</p>}>
  <RouterProvider router={router} />
</Sentry.ErrorBoundary>
```

- [ ] **Step 5: Add env var to `.env.example`**

```
VITE_SENTRY_DSN=         # Get from sentry.io → Project Settings → Client Keys
```

- [ ] **Step 6: Manual smoke test**

Build and open the console. Open devtools → Network and confirm no Sentry requests fire on localhost (the `beforeSend` guard). Deploy to staging and confirm errors appear in Sentry dashboard.

- [ ] **Step 7: Commit**

```bash
git add pretzel-console/src/lib/sentry.ts pretzel-console/src/main.tsx pretzel-console/src/App.tsx pretzel-console/.env.example
git commit -m "feat(observability): add Sentry to Pretzel Console"
```

---

## Task 2: Extension — Sentry in Service Worker + Content Script

The Sentry browser SDK works in Chrome extensions but requires a fetch transport workaround because service workers don't have `XMLHttpRequest`. Sentry's `makeFetchTransport` handles this automatically in modern SDK versions (>= 8).

**Files:**
- Modify: `pretzel/src/background/service-worker.ts`
- Modify: `pretzel/src/content/content-script.ts`

- [ ] **Step 1: Install Sentry browser SDK**

```bash
cd pretzel && pnpm add @sentry/browser
```

- [ ] **Step 2: Init Sentry at the top of `service-worker.ts`**

```typescript
import * as Sentry from '@sentry/browser'

// At the very top, before any other logic:
if (import.meta.env.VITE_SENTRY_DSN_EXTENSION) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN_EXTENSION,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,  // no performance tracing in extension
    integrations: [],
  })
}
```

- [ ] **Step 3: Capture errors in the message handler**

In the `chrome.runtime.onMessage.addListener` block, wrap the main handler:

```typescript
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    Sentry.captureException(err, { extra: { messageType: message?.type } })
    sendResponse({ error: 'Internal extension error' })
  })
  return true
})
```

- [ ] **Step 4: Capture send-intent errors in content script**

In `pretzel/src/content/content-script.ts`, in the `catch` block of `onSendIntent`:

```typescript
import * as Sentry from '@sentry/browser'

// In the catch:
} catch (err) {
  Sentry.captureException(err, { tags: { hostname } })
  logger.error("Send-intent handler error:", err)
  return { proceed: true }
}
```

Note: Sentry in the content script uses the page's fetch — this is fine since content scripts run in the page context.

- [ ] **Step 5: Add env var**

In `pretzel/.env.example`:
```
VITE_SENTRY_DSN_EXTENSION=   # Separate Sentry project for the extension
```

- [ ] **Step 6: Build and verify**

```bash
cd pretzel && npm run build
```

Load the extension in Chrome. Trigger a deliberate error (e.g., temporarily throw in the service worker). Check the Sentry dashboard.

- [ ] **Step 7: Commit**

```bash
git add pretzel/src/background/service-worker.ts pretzel/src/content/content-script.ts pretzel/.env.example
git commit -m "feat(observability): add Sentry error capture to extension service worker and content script"
```

---

## Sentry Setup Notes

1. Create two projects on sentry.io (free tier): one for `pretzel-console`, one for `pretzel-extension`.
2. Get the DSN from each project's **Settings → Client Keys (DSN)**.
3. Add the DSNs to your production env vars (Railway for backend, Vercel/wherever for console).
4. The free tier gives 5,000 errors/month — more than enough for pre-launch.
5. Sentry source maps: add `@sentry/vite-plugin` to both Vite configs to get readable stack traces in production (optional but recommended).
