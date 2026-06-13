# SSE Policy Realtime Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GET /v1/events` as a Server-Sent Events endpoint so the pretzel-console is pushed a notification whenever the active policy is republished, without polling.

**Architecture:** The backend already has a `policyBus` EventEmitter (`backend/src/events/policy-bus.ts`) that fires `policy:updated:{tenantId}` on every `publishPolicy` call — no changes to the service layer are needed. The new endpoint authenticates via a Clerk JWT in the `?token=` query parameter (the browser's `EventSource` API cannot set `Authorization` headers), hijacks the Fastify reply to hold the connection open, subscribes to `policyBus` for the resolved tenant, and writes an SSE `data:` frame on each event. A 25 s heartbeat comment keeps proxies and browsers from timing out. The listener and interval are removed when the client disconnects. CORS headers are written manually because `reply.hijack()` bypasses `@fastify/cors`'s `onSend` hook.

**Tech Stack:** Fastify v4 (`reply.hijack()`), `@clerk/backend` (`verifyToken`), Drizzle ORM, Node.js `EventEmitter` (existing `policyBus`), Vitest, supertest, Node.js `http` module (for SSE streaming test)

---

## Why this feature exists

The pretzel-console added `SSESubscriber` (commit `70ddb09`) which opens `EventSource(`${API_BASE}/v1/events?token=${token}`)` on every authenticated page load. The backend never had a matching GET endpoint — the events router only has `POST /events` for ingestion from the extension. Every page load therefore logs a CORS-blocked 404 in the console and the console never knows when to refetch the policy after an admin publishes changes.

---

## Files

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `backend/src/auth/middleware.ts` | Export `resolveClerkJwt` so it can be called with a query-param token |
| Modify | `backend/src/events/router.ts` | Add `GET /events` SSE handler |
| Create | `backend/tests/sse-events.test.ts` | Auth rejection cases + streaming + policyBus notification |

`policy/service.ts` already calls `policyBus.emit()`. `policy-bus.ts` is already correct.

---

## Task 1: Write failing tests

**Files:**
- Create: `backend/tests/sse-events.test.ts`

- [ ] **Step 1: Create the test file**

```typescript
// backend/tests/sse-events.test.ts
import http from 'http'
import type { AddressInfo } from 'net'
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest'
import { truncateAll, buildTestTenant, buildTestUser } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { members } from '../src/db/schema.js'
import { publishPolicy } from '../src/policy/service.js'
import { buildApp } from '../src/app.js'
import type { FastifyInstance } from 'fastify'

const MOCK_CLERK_USER_ID = 'user_sse_alice'
const MOCK_JWT           = 'eyJhbGciOiJSUzI1NiJ9.sse.mock'

const { mockVerifyToken } = vi.hoisted(() => ({
  mockVerifyToken: vi.fn().mockResolvedValue({ sub: MOCK_CLERK_USER_ID }),
}))
vi.mock('@clerk/backend', () => ({ verifyToken: mockVerifyToken }))

let app: FastifyInstance
let tenantId: string
let port: number

beforeAll(async () => {
  app = buildApp()
  await app.ready()
  await app.listen({ port: 0, host: '127.0.0.1' })
  port = (app.server.address() as AddressInfo).port
})

beforeEach(async () => {
  await truncateAll()
  mockVerifyToken.mockResolvedValue({ sub: MOCK_CLERK_USER_ID })
  const t = await buildTestTenant('ssefirm')
  tenantId  = t.tenantId
  const user = await buildTestUser(MOCK_CLERK_USER_ID, 'sse@acme.com')
  await db.insert(members).values({ tenantId, userId: user.id, email: 'sse@acme.com', role: 'member' })
})

afterAll(async () => { await app.close() })

// ── Helper: open a raw SSE connection and return the IncomingMessage ──────────
function openSSE(token: string): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const req = http.get(
      `http://127.0.0.1:${port}/v1/events?token=${token}`,
      (res) => resolve(res),
    )
    req.on('error', reject)
    setTimeout(() => reject(new Error('SSE connect timeout')), 3000)
  })
}

// ── Auth rejection cases ──────────────────────────────────────────────────────

describe('GET /v1/events — auth', () => {
  it('returns 401 when no token query param is provided', async () => {
    const res = await openSSE('')
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when the Clerk JWT is invalid', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('bad jwt'))
    const res = await openSSE('bad.jwt.token')
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when the user has no DB row', async () => {
    mockVerifyToken.mockResolvedValueOnce({ sub: 'user_nobody' })
    const res = await openSSE(MOCK_JWT)
    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when the user has no member row', async () => {
    await db.delete(members)
    const res = await openSSE(MOCK_JWT)
    expect(res.statusCode).toBe(401)
  })
})

// ── SSE stream cases ──────────────────────────────────────────────────────────

describe('GET /v1/events — SSE stream', () => {
  it('opens a 200 text/event-stream connection', async () => {
    const res = await openSSE(MOCK_JWT)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/event-stream')
    expect(res.headers['cache-control']).toBe('no-cache')
    res.destroy()
  })

  it('sends a data frame when publishPolicy fires for the same tenant', async () => {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('no SSE frame received')), 3000)

      http.get(
        `http://127.0.0.1:${port}/v1/events?token=${MOCK_JWT}`,
        async (res) => {
          res.once('data', (chunk: Buffer) => {
            clearTimeout(timeout)
            const frame = chunk.toString()
            expect(frame).toMatch(/^data:/)
            res.destroy()
            resolve()
          })

          // Trigger the policy update after the connection is open
          await publishPolicy(tenantId, { version: 1 as const, tenantId, subjects: [], siteConfigs: {} })
        },
      ).on('error', reject)
    })
  })

  it('does NOT send a frame when a different tenant publishes', async () => {
    const other = await buildTestTenant('otherfirm')

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, 500) // pass after 500 ms with no data

      http.get(
        `http://127.0.0.1:${port}/v1/events?token=${MOCK_JWT}`,
        async (res) => {
          res.on('data', (chunk: Buffer) => {
            // Skip the initial `: connected` comment frame
            if (chunk.toString().startsWith(':')) return
            clearTimeout(timeout)
            res.destroy()
            reject(new Error('received unexpected data frame for wrong tenant'))
          })

          await publishPolicy(other.tenantId, { version: 1 as const, tenantId: other.tenantId, subjects: [], siteConfigs: {} })
        },
      ).on('error', reject)
    })
  })
})
```

- [ ] **Step 2: Run tests to confirm they all fail**

```
cd backend && pnpm test sse-events
```

Expected: all tests fail — `GET /v1/events` currently returns 404.

---

## Task 2: Implement the SSE endpoint

**Files:**
- Modify: `backend/src/auth/middleware.ts`
- Modify: `backend/src/events/router.ts`

- [ ] **Step 3: Export `resolveClerkJwt` from `middleware.ts`**

`resolveClerkJwt` already has the right signature `(req, reply, token)` — it just isn't exported. Change `async function resolveClerkJwt` to `export async function resolveClerkJwt` on line 37 of `backend/src/auth/middleware.ts`.

```typescript
// backend/src/auth/middleware.ts  — only this line changes
export async function resolveClerkJwt(
  request: FastifyRequest,
  reply: FastifyReply,
  token: string
): Promise<void> {
```

- [ ] **Step 4: Add the GET /events SSE handler inside `eventsRouter`**

The full file after the change:

```typescript
import type { FastifyInstance } from 'fastify'
import { resolveClerkJwt, requireOrgTokenOrClerkAuth } from '../auth/middleware.js'
import { ingestEvent } from './service.js'
import { policyBus, policyUpdatedEvent } from './policy-bus.js'

export async function eventsRouter(fastify: FastifyInstance): Promise<void> {

  // ── SSE: real-time policy-updated notifications ───────────────────────────
  // EventSource cannot set custom headers, so the Clerk JWT arrives as ?token=
  fastify.get('/events', async (req, reply) => {
    const { token } = req.query as { token?: string }
    if (!token) return reply.status(401).send({ error: 'Missing token query param' })

    await resolveClerkJwt(req, reply, token)
    if (reply.sent) return  // 401 already written by the helper

    // Hand the raw socket to us; Fastify will not touch the response again.
    reply.hijack()
    const res = reply.raw

    // Write SSE headers manually — @fastify/cors onSend does not run after hijack.
    res.writeHead(200, {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',
      'Access-Control-Allow-Origin': req.headers.origin ?? '*',
      'Access-Control-Allow-Credentials': 'true',
    })

    // Initial comment frame confirms the connection to the client.
    res.write(': connected\n\n')

    const send = () => res.write('data: {}\n\n')
    const event = policyUpdatedEvent(member.tenantId)
    policyBus.on(event, send)

    // Keep-alive ping every 25 s — avoids proxy/browser idle timeout.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 25_000)

    req.raw.on('close', () => {
      clearInterval(heartbeat)
      policyBus.off(event, send)
    })
  })

  // ── Ingest event from extension ───────────────────────────────────────────
  fastify.post('/events', { preHandler: requireOrgTokenOrClerkAuth }, async (req, reply) => {
    const body = req.body as {
      ruleId: string
      action: 'warn' | 'block'
      siteUrl: string
      matchedTerm?: string
    }

    if (!body.ruleId || !body.action || !body.siteUrl) {
      return reply.status(400).send({ error: 'ruleId, action, and siteUrl are required' })
    }

    const memberId = req.member?.id ?? null
    const event = await ingestEvent(req.tenant.id, body.ruleId, memberId, {
      action:      body.action,
      siteUrl:     body.siteUrl,
      matchedTerm: body.matchedTerm,
    })

    if (!event) return reply.status(204).send()
    return reply.status(201).send({ id: event.id })
  })
}
```

- [ ] **Step 5: Run the tests**

```
cd backend && pnpm test sse-events
```

Expected: all 7 tests pass.

- [ ] **Step 6: Run the full test suite to check for regressions**

```
cd backend && pnpm test
```

Expected: all existing tests still pass.

- [ ] **Step 7: Commit**

```
git add backend/src/auth/middleware.ts backend/src/events/router.ts backend/tests/sse-events.test.ts
git commit -m "feat(backend): add GET /v1/events SSE endpoint for real-time policy notifications"
```

---

## Self-review

**Spec coverage:**
- ✓ Endpoint authenticates via `?token=` Clerk JWT (EventSource cannot set headers)
- ✓ Auth delegated to exported `resolveClerkJwt` — no duplicated verification logic
- ✓ Returns 401 for missing/invalid token, unknown user, unenrolled user
- ✓ Writes `text/event-stream` headers and stays open
- ✓ Sends `data: {}` frame on `policy:updated:{tenantId}` bus event
- ✓ Does not leak events across tenants (per-tenant event key)
- ✓ Heartbeat prevents proxy timeout
- ✓ Cleans up `policyBus` listener and interval on client disconnect
- ✓ CORS headers written manually (hijack bypasses `@fastify/cors` `onSend`)
- ✓ `POST /events` (extension ingestion) is unchanged

**Placeholder scan:** None found — all steps contain complete code.

**Type consistency:** `policyUpdatedEvent` returns `string` and is used identically in both `policyBus.on` and `policyBus.off`. `send` is `() => void` in both calls. No drift.
