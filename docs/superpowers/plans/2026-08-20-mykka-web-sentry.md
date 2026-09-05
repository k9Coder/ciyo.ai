# mykka-web Sentry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add error tracking to the public marketing site (`mykka-web`, Next.js App Router). It currently has LogRocket (session replay) and Vercel Analytics (traffic/web-vitals) but nothing that captures and surfaces JS exceptions or server-side (SSR/route-handler) errors — a broken page ships silently until a human notices.

**Architecture:** `@sentry/nextjs`, free tier, same Sentry org as the other packages (new project: `mykka-web`). Current Sentry-for-Next.js convention (Next 15+, confirmed against `next@16.2.7` in this repo) is three init files plus one instrumentation hook, not the older single `sentry.client.config.ts` pattern:
- `instrumentation-client.ts` — client-side init
- `sentry.server.config.ts` — server (Node runtime) init
- `sentry.edge.config.ts` — edge runtime init
- `instrumentation.ts` — `register()` loads the right config per runtime; exports `onRequestError` so Server Component/route-handler errors are captured too
- `next.config.ts` wrapped in `withSentryConfig` (adds source-map upload + the tunnel route)
- `app/global-error.tsx` — App Router's root error boundary, reports client-side render errors that otherwise only show React's default error screen

**Tech Stack:** `@sentry/nextjs`.

**Quota note:** same shared 5,000 errors/month org-wide free-tier pool as [[2026-08-20-backend-sentry]] and [[2026-08-20-desktop-sentry]]. This is a public, unauthenticated site — a bad bot or scraper hitting a broken route repeatedly could burn quota faster than the other (authenticated, lower-traffic) surfaces. Keep `tracesSampleRate` low (0.1 or less) and consider `beforeSend` filtering for known-noisy errors once live.

---

## File Map

| Action | Path | What changes |
|--------|------|---------------|
| Modify | `mykka-web/lib/env.ts` | Add `NEXT_PUBLIC_SENTRY_DSN` |
| Create | `mykka-web/instrumentation-client.ts` | Client init |
| Create | `mykka-web/sentry.server.config.ts` | Server init |
| Create | `mykka-web/sentry.edge.config.ts` | Edge init |
| Create | `mykka-web/instrumentation.ts` | Runtime dispatch + `onRequestError` |
| Create | `mykka-web/app/global-error.tsx` | Root error boundary |
| Modify | `mykka-web/next.config.ts` | Wrap with `withSentryConfig` |
| Modify | `mykka-web/.env.example` | Document the DSN var |

---

## Task 1: Install + env var

**Files:** Modify `mykka-web/lib/env.ts`, `mykka-web/.env.example`

- [ ] **Step 1: Install**

```bash
cd mykka-web && pnpm add @sentry/nextjs
```

- [ ] **Step 2:** Add to the schema and parse block in `mykka-web/lib/env.ts` (same pattern as the existing `NEXT_PUBLIC_LOGROCKET_ID`):

```ts
const schema = z.object({
  NEXT_PUBLIC_API_BASE: z.string().optional(),
  NEXT_PUBLIC_APP_URL: z.string().default('https://app.mykka.ai'),
  NEXT_PUBLIC_ENV: z.string().optional(),
  NEXT_PUBLIC_PILOT_MODE: z.string().optional(),
  NEXT_PUBLIC_LOGROCKET_ID: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
})

export const env = schema.parse({
  NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_ENV: process.env.NEXT_PUBLIC_ENV,
  NEXT_PUBLIC_PILOT_MODE: process.env.NEXT_PUBLIC_PILOT_MODE,
  NEXT_PUBLIC_LOGROCKET_ID: process.env.NEXT_PUBLIC_LOGROCKET_ID,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
})
```

Public DSN is fine to expose client-side — it's a write-only ingest key, same as the LogRocket ID above it. Server/edge configs below read `process.env.NEXT_PUBLIC_SENTRY_DSN` directly (Next inlines `NEXT_PUBLIC_*` everywhere, so one var covers all three runtimes).

- [ ] **Step 3:** Add to `mykka-web/.env.example` near `NEXT_PUBLIC_LOGROCKET_ID`:

```
NEXT_PUBLIC_SENTRY_DSN=            # Sentry → mykka-web project → Settings → Client Keys
```

---

## Task 2: Client init

**Files:** Create `mykka-web/instrumentation-client.ts`

- [ ] **Step 1:**

```ts
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV,
    tracesSampleRate: 0.1,
    // LogRocket already covers session replay — don't double up.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })
}
```

---

## Task 3: Server + edge init

**Files:** Create `mykka-web/sentry.server.config.ts`, `mykka-web/sentry.edge.config.ts`

- [ ] **Step 1: `mykka-web/sentry.server.config.ts`**

```ts
import * as Sentry from '@sentry/nextjs'

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_ENV,
    tracesSampleRate: 0.1,
  })
}
```

- [ ] **Step 2: `mykka-web/sentry.edge.config.ts`** — identical content to the server config above (edge runtime needs its own file even though the init call is the same).

---

## Task 4: Instrumentation hook

**Files:** Create `mykka-web/instrumentation.ts`

- [ ] **Step 1:**

```ts
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config')
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Captures errors thrown in Server Components, Route Handlers, and middleware
// that never reach the client — instrumentation-client.ts only sees browser-side errors.
export const onRequestError = Sentry.captureRequestError
```

---

## Task 5: Root error boundary

**Files:** Create `mykka-web/app/global-error.tsx`

- [ ] **Step 1:** App Router swallows render errors into its default error UI unless a `global-error.tsx` exists at the root to report them:

```tsx
'use client'

import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string }
}) {
  useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html>
      <body>
        <h1>Something went wrong</h1>
      </body>
    </html>
  )
}
```

---

## Task 6: Wrap next.config.ts

**Files:** Modify `mykka-web/next.config.ts`

- [ ] **Step 1:** Wrap the existing export — keep `output: 'standalone'` and the redirect rule untouched:

```ts
import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  output: 'standalone',
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.mykka.ai' }],
        destination: 'https://mykka.ai/:path*',
        permanent: true,
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  org: "<sentry-org-slug>",
  project: "mykka-web",
  // Source maps: upload during build for readable stack traces, then delete
  // from the client bundle so they aren't served publicly.
  widenClientFileUpload: true,
  disableLogger: true,
  // Skip source-map upload locally (no SENTRY_AUTH_TOKEN in dev).
  silent: !process.env.CI,
});
```

Fill in the real `org` slug once the Sentry project exists. Source-map upload during build needs a `SENTRY_AUTH_TOKEN` (build-time secret, not `NEXT_PUBLIC_*`) in CI/Vercel — without it the build still works, source maps just aren't uploaded.

---

## Task 7: Smoke test + commit

- [ ] **Step 1:** Create the `mykka-web` project on sentry.io (free tier, same org), grab its DSN and the org slug for Task 6.
- [ ] **Step 2:** Set `NEXT_PUBLIC_SENTRY_DSN` locally, `pnpm build && pnpm start`, throw a deliberate error in a page component, confirm it lands in the Sentry dashboard, revert.
- [ ] **Step 3:** Add `NEXT_PUBLIC_SENTRY_DSN` (and `SENTRY_AUTH_TOKEN` for source maps, if using) to the Vercel/hosting env vars.
- [ ] **Step 4: Commit**

```bash
git add mykka-web/lib/env.ts mykka-web/instrumentation-client.ts mykka-web/sentry.server.config.ts mykka-web/sentry.edge.config.ts mykka-web/instrumentation.ts mykka-web/app/global-error.tsx mykka-web/next.config.ts mykka-web/.env.example
git commit -m "feat(observability): add Sentry error tracking to mykka-web"
```
