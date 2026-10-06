# Backend Sentry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Sentry error tracking to the backend API (Fastify). Currently the backend has structured pino logs (`src/logger/`) but nothing forwards unhandled/5xx errors anywhere alerting fires from — they sit in Railway log output until someone goes looking.

**Architecture:** `@sentry/node`, free tier, same Sentry org as the existing `pretzel-extension`/`pretzel-console` projects (new project: `pretzel-backend`). Init happens once at process start, before any other import (`src/index.ts` top). Reporting is wired into the app's *existing* single `setErrorHandler` in `src/app.ts` — no new middleware, no Fastify plugin package needed. Only `statusCode >= 500` (or untagged) errors are sent, matching `buildErrorBody()`'s own threshold — expected 4xx (validation, auth, not-found) never touch the quota.

**Tech Stack:** `@sentry/node` (server-side only, no browser/tracing integrations needed for a JSON API).

**Quota note:** Sentry's free Developer plan gives 5,000 errors/month **shared across the whole org**, not per project. With extension + console + this backend all reporting into one org, watch usage after rollout — at pilot-stage traffic this should be nowhere close, but it's not a per-project allowance.

---

## File Map

| Action | Path | What changes |
|--------|------|---------------|
| Modify | `backend/src/env.ts` | Add `SENTRY_DSN` (optional) |
| Create | `backend/src/sentry.ts` | Sentry init |
| Modify | `backend/src/index.ts` | Call `initSentry()` as the very first line |
| Modify | `backend/src/app.ts` | `Sentry.captureException` in the existing error handler |
| Modify | `backend/.env.example` | Document `SENTRY_DSN` |

---

## Task 1: Env var

**Files:** Modify `backend/src/env.ts`

- [ ] **Step 1:** Add to the "Optional / defaulted" block (near the other optional vars, alphabetically is fine):

```ts
SENTRY_DSN: z.string().optional(),
```

No other change — the existing `env.SENTRY_DSN` proxy access works automatically once it's in `schema.shape`.

---

## Task 2: Install + init module

**Files:** Create `backend/src/sentry.ts`

- [ ] **Step 1: Install**

```bash
cd backend && pnpm add @sentry/node
```

- [ ] **Step 2: Create `backend/src/sentry.ts`**

```ts
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
```

---

## Task 3: Init before anything else

**Files:** Modify `backend/src/index.ts`

- [ ] **Step 1:** `Sentry.init()` must run before other modules that might throw at import time. Add as the first two lines, ahead of the existing imports:

```ts
import { initSentry } from './sentry.js'
initSentry()

import { buildApp } from './app.js'
import { logger } from './logger/index.js'
import { pingDb } from './db/client.js'
import { scheduleRetentionPurge } from './scans/service.js'
import { env } from './env.js'
```

- [ ] **Step 2:** Also capture the fatal DB-connect failure path (currently only logged, then `process.exit(1)` — worth having in Sentry since it means the whole service failed to boot):

```ts
} catch (err) {
  logger.error('database connection failed — check DATABASE_URL', { error: (err as Error).message })
  Sentry.captureException(err)
  await Sentry.flush(2000)
  process.exit(1)
}
```

(needs `import { Sentry } from './sentry.js'` added alongside the `initSentry` import)

---

## Task 4: Wire into the existing error handler

**Files:** Modify `backend/src/app.ts`

- [ ] **Step 1:** Import Sentry and report inside the existing centralized handler — do not add a second error-handling path:

```ts
import { Sentry } from './sentry.js'
```

```ts
app.setErrorHandler((err, req, reply) => {
  const statusCode = (err as { statusCode?: number }).statusCode ?? 500
  logger.error('Unhandled error', { message: err.message, stack: err.stack, statusCode })
  // Only 5xx (server-fault) errors go to Sentry — 4xx are expected traffic
  // (bad input, auth failures, 404s) and would just burn the shared org quota.
  if (statusCode >= 500) {
    Sentry.captureException(err, { extra: { traceId: req.headers['x-trace-id'], url: req.url } })
  }
  const traceId = req.headers['x-trace-id'] as string | undefined
  return reply.status(statusCode).send(buildErrorBody(statusCode, err.message, traceId))
})
```

---

## Task 5: Env example + docs

**Files:** Modify `backend/.env.example`

- [ ] **Step 1:** Add near the other optional/observability vars:

```
SENTRY_DSN=                        # Sentry → pretzel-backend project → Settings → Client Keys (leave blank to disable)
```

---

## Task 6: Smoke test + commit

- [ ] **Step 1:** Create the `pretzel-backend` project on sentry.io (free tier, same org as extension/console), grab its DSN.
- [ ] **Step 2:** Set `SENTRY_DSN` locally, `pnpm dev`, hit an endpoint that 500s (or temporarily `throw new Error('smoke test')` in a route), confirm the event lands in the Sentry dashboard, then revert the temporary throw.
- [ ] **Step 3:** Add `SENTRY_DSN` to the Railway production/staging env vars.
- [ ] **Step 4: Commit**

```bash
git add backend/src/env.ts backend/src/sentry.ts backend/src/index.ts backend/src/app.ts backend/.env.example
git commit -m "feat(observability): add Sentry error tracking to backend"
```
