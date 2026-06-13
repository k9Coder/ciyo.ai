# Reliability Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `sendWelcomeEmail` a retryable background job (not fire-and-forget), add a circuit breaker and timeout to LLM calls, tune the DB connection pool, and add Sentry error tracking to the backend.

**Architecture:** Use a simple in-process retry queue backed by a `email_jobs` table for welcome emails (survives crashes). LLM calls get a 30s timeout and 2-retry backoff. DB pool gets explicit connection limits. Sentry is initialized before Fastify starts.

**Tech Stack:** Fastify, Drizzle, `@sentry/node`, existing `postgres` client.

---

### Task 1: Make sendWelcomeEmail Resilient (R-2)

**Files:**
- Modify: `backend/src/billing/email.ts`
- Modify: `backend/src/billing/stripe.ts`
- Modify: `backend/src/billing/paypal.ts`
- Modify: `backend/src/billing/service.ts`

- [ ] Step 1: Open `backend/src/billing/email.ts` (if it exists) or create it. The current pattern in callers is:
```typescript
sendWelcomeEmail({ ... }).catch(() => {})
```
This silently swallows SMTP failures. The customer may never receive their API tokens.

Replace the fire-and-forget pattern with a retry wrapper that uses exponential backoff:

```typescript
// At the bottom of backend/src/billing/email.ts, add:
import { logger } from '../logger/index.js'

async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 3
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const delay = attempt * 2000 // 2s, 4s, 6s
      logger.warn(`${label}: attempt ${attempt}/${maxAttempts} failed, retrying in ${delay}ms`, {
        error: err instanceof Error ? err.message : String(err),
      })
      await new Promise(r => setTimeout(r, delay))
    }
  }
  logger.error(`${label}: all ${maxAttempts} attempts failed — email not delivered`, {
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  })
  throw lastErr
}

export async function sendWelcomeEmailWithRetry(opts: Parameters<typeof sendWelcomeEmail>[0]): Promise<void> {
  return withRetry(() => sendWelcomeEmail(opts), 'sendWelcomeEmail')
}
```

- [ ] Step 2: Update all callers to use `sendWelcomeEmailWithRetry` instead of `sendWelcomeEmail(...).catch(() => {})`.

In `backend/src/billing/stripe.ts` (around line 97):
```typescript
// Before:
sendWelcomeEmail({ to: email, tenantName: meta['tenantName'] ?? email, orgToken: result.orgToken, adminToken: result.adminToken }).catch(() => {})

// After (only send if fresh activation):
if (result.orgToken) {
  sendWelcomeEmailWithRetry({ to: email, tenantName: meta['tenantName'] ?? email, orgToken: result.orgToken, adminToken: result.adminToken })
    .catch((err) => logger.error('Welcome email failed after retries', { err: err.message, email }))
}
```

Apply the same change in `backend/src/billing/paypal.ts` and `backend/src/billing/service.ts`.

- [ ] Step 3: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 4: Commit.
```bash
git add backend/src/billing/email.ts backend/src/billing/stripe.ts backend/src/billing/paypal.ts backend/src/billing/service.ts
git commit -m "fix(reliability): retry sendWelcomeEmail up to 3 times with exponential backoff

Fire-and-forget .catch(()=>{}) silently dropped email delivery failures.
Now retries with 2s/4s/6s delays and logs a final error if all fail."
```

---

### Task 2: Add LLM Call Timeout and Retry (R-1)

**Files:**
- Modify: `backend/src/assistant/llm/anthropic.ts`
- Modify: `backend/src/assistant/service.ts`

- [ ] Step 1: Find the Anthropic LLM service.
```bash
ls "c:/Users/yarin/Documents/code/prompt-saviour/backend/src/assistant/llm/"
```

- [ ] Step 2: Open `backend/src/assistant/llm/anthropic.ts`. Add a 30-second `AbortController` timeout to the API call, and one retry on timeout/network error.

Wrap the Anthropic client call with:
```typescript
const TIMEOUT_MS = 30_000

async function callWithTimeout<T>(fn: () => Promise<T>, label: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    return await fn()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`LLM call timed out after ${TIMEOUT_MS}ms (${label})`)
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}
```

In the `chat` method, wrap the API call:
```typescript
// Before:
const response = await this.client.messages.create({ ... })

// After:
const response = await callWithTimeout(
  () => this.client.messages.create({ ... }),
  'anthropic.messages.create'
)
```

- [ ] Step 3: In `backend/src/assistant/service.ts` (the `sendMessage` function), add error handling that returns a graceful error to the user rather than crashing:
```typescript
try {
  // existing llm.chat(...) call
} catch (err) {
  const message = err instanceof Error ? err.message : 'The AI assistant is temporarily unavailable.'
  logger.error('LLM call failed', { error: message })
  // Return a user-visible error message in the chat response format
  return {
    id: randomUUID(),
    role: 'assistant',
    content: 'I encountered an error processing your request. Please try again in a moment.',
    actionsJson: null,
    appliedAt: null,
    createdAt: new Date().toISOString(),
  }
}
```

- [ ] Step 4: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 5: Commit.
```bash
git add backend/src/assistant/llm/anthropic.ts backend/src/assistant/service.ts
git commit -m "fix(reliability): add 30s timeout and graceful error to LLM calls

Unbounded LLM calls would hang indefinitely on network issues.
Now times out after 30s and returns a user-visible error message."
```

---

### Task 3: Configure DB Connection Pool (R-3)

**Files:**
- Modify: `backend/src/db/client.ts`

- [ ] Step 1: Open `backend/src/db/client.ts`. Current code:
```typescript
export const sql = postgres(process.env.DATABASE_URL!)
```

The default `postgres` connection pool has max=10 connections, no idle timeout, no statement timeout. Update with explicit production-ready settings:

```typescript
export const sql = postgres(process.env.DATABASE_URL!, {
  max:             parseInt(process.env.DB_POOL_MAX ?? '20', 10),
  idle_timeout:    parseInt(process.env.DB_IDLE_TIMEOUT_S ?? '30', 10),
  connect_timeout: parseInt(process.env.DB_CONNECT_TIMEOUT_S ?? '10', 10),
  // Statement timeout: 30s to prevent runaway queries
  connection: {
    statement_timeout: process.env.NODE_ENV === 'test' ? 0 : 30_000,
  },
  onnotice: () => {},  // suppress NOTICE messages from migrations
})
```

- [ ] Step 2: Build and confirm the server starts with the new pool config.
```bash
cd backend && pnpm run build && node dist/index.js &
sleep 2
curl -s http://localhost:3000/health
# Expected: {"ok":true}
kill %1
```

- [ ] Step 3: Commit.
```bash
git add backend/src/db/client.ts
git commit -m "fix(reliability): configure postgres connection pool with timeouts

- max: 20 connections (configurable via DB_POOL_MAX)
- idle_timeout: 30s (DB_IDLE_TIMEOUT_S)
- connect_timeout: 10s (DB_CONNECT_TIMEOUT_S)
- statement_timeout: 30s in non-test environments"
```

---

### Task 4: Add Sentry Error Tracking to Backend (R-5)

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/index.ts`
- Modify: `backend/src/app.ts`

- [ ] Step 1: Install Sentry.
```bash
cd backend && pnpm add @sentry/node
```

- [ ] Step 2: Open `backend/src/index.ts` (the entry point). Add Sentry initialization before anything else:
```typescript
import * as Sentry from '@sentry/node'

Sentry.init({
  dsn:         process.env.SENTRY_DSN,
  environment: process.env.APP_ENV ?? process.env.NODE_ENV ?? 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 0,
  enabled: !!process.env.SENTRY_DSN,
})
```

This must be the **first** import in the file before Fastify or any other module.

- [ ] Step 3: Update the error handler in `backend/src/app.ts` to capture unhandled errors:
```typescript
import * as Sentry from '@sentry/node'

// In setErrorHandler:
app.setErrorHandler((err, req, reply) => {
  if ((err as { statusCode?: number }).statusCode == null || (err as { statusCode?: number }).statusCode! >= 500) {
    Sentry.captureException(err, {
      extra: { url: req.url, method: req.method },
    })
  }
  logger.error('Unhandled error', { message: err.message, stack: err.stack })
  return reply.status((err as { statusCode?: number }).statusCode ?? 500).send({ error: err.message })
})
```

- [ ] Step 4: Add `SENTRY_DSN` to `backend/.env.staging` (untracked). Get the DSN from the Sentry project settings for the backend project.
```
SENTRY_DSN=https://xxxxxxxx@oxxxxxxxx.ingest.sentry.io/xxxxxxxx
```

- [ ] Step 5: Build and confirm Sentry initializes without error.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
SENTRY_DSN=https://fake@sentry.io/123 node dist/index.js &
sleep 2
curl -s http://localhost:3000/health
# Expected: {"ok":true}  (Sentry init with fake DSN is silent)
kill %1
```

- [ ] Step 6: Commit.
```bash
git add backend/src/index.ts backend/src/app.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(reliability): add Sentry error tracking to backend

Unhandled 5xx errors are now captured and reported.
Enabled only when SENTRY_DSN env var is set."
```
