# Microservices HTTP Boundaries — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all cross-domain direct TypeScript imports with internal HTTP calls via a singleton axios client. Every cross-domain call carries a trace ID, tenant ID, initiator ID, and M2M flag — propagated automatically via `AsyncLocalStorage` so callers don't change their signatures. This enforces domain boundaries in code today and makes future extraction to separate processes a one-line config change.

**Architecture decision:** Single deployed process (one ECS task, one Fastify instance, one port). Axios calls loop back to `localhost`. HTTP boundary is architectural, not operational. When separate deployments are needed, change `baseURL` in `internal-client.ts` — nothing else changes.

**Tech stack:** TypeScript, Fastify, Node.js `AsyncLocalStorage`, axios, pino mixin, AWS Secrets Manager (`INTERNAL_SECRET`)

---

## Task 0 — Fix test infrastructure before migration starts ✅

**Problem:** All tests used `buildApp() + app.ready()` which initialises Fastify but never binds to a port. After migration, service functions make internal HTTP calls to `http://127.0.0.1:PORT/internal/v1/...` — ECONNREFUSED with no bound port.

**Files created/modified:**
- Created: `backend/tests/helpers/setup.ts`
- Modified: `backend/.env.test`
- Modified: 20 test files with `buildApp()` pattern
- Modified: `backend/tests/policy-compiler.test.ts` (added app setup)
- Modified: `backend/tests/policy-resolver.test.ts` (added app setup)
- Created: `backend/tests/internal-guard.test.ts`

- [x] **Step 1: Create `backend/tests/helpers/setup.ts`**

```typescript
import type { AddressInfo } from 'net'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app.js'

export interface TestApp { app: FastifyInstance; port: number }

export async function startTestApp(): Promise<TestApp> {
  const app = buildApp()
  await app.listen({ port: 0, host: '127.0.0.1' })
  const port = (app.server.address() as AddressInfo).port
  process.env['INTERNAL_API_URL'] = `http://127.0.0.1:${port}`
  return { app, port }
}
```

- [x] **Step 2: Add `INTERNAL_SECRET=test-secret` to `backend/.env.test`**

Vitest loads `.env.test` before any module, so `app.ts` and `internal-client.ts` both read `test-secret` at init time — guard and client use the same value.

- [x] **Step 3: Replace `buildApp() + app.ready()` with `startTestApp()` in 20 test files**

Pattern change in every `beforeAll`:
```typescript
// Before
beforeAll(async () => { app = buildApp(); await app.ready() })
// After
beforeAll(async () => { ({ app } = await startTestApp()) })
```

`supertest(app.server)` continues to work unchanged — it uses the same bound server.

- [x] **Step 4: Add `startTestApp()` to `policy-compiler.test.ts` and `policy-resolver.test.ts`**

These had no app but call `compilePolicy` / `resolveMemberPolicy` which will make HTTP calls post-migration.

- [x] **Step 5: Create `backend/tests/internal-guard.test.ts`**

Three assertions: `/internal/*` without secret → 404, wrong secret → 404, empty secret → 404.

**Note for Task 4:** `internal-client.ts` must read `INTERNAL_API_URL` **lazily** in the request interceptor (not at module init) so tests that set `process.env['INTERNAL_API_URL']` in `startTestApp()` pick up the correct port:

```typescript
// In createClient's request interceptor — NOT at module top level:
client.interceptors.request.use(config => {
  const base = process.env['INTERNAL_API_URL'] ?? 'http://localhost:3000'
  config.baseURL = `${base}${path}`
  // ... rest of headers
  return config
})
```

---

## Cross-domain violations to fix

| Caller | Cross-domain imports |
|---|---|
| `assistant/apply.ts` | rules ×3, subjects ×3, divisions ×2, teams ×2, members ×5 |
| `assistant/service.ts` | divisions, subjects, rules, members |
| `policy/compiler.ts` | subjects, rules |
| `platform/router.ts` | members, divisions, subjects |
| `auth/middleware.ts` | tenants (hot path — add in-memory cache) |
| `billing/service.ts` | tenants |
| `members/service.ts` | users |
| `webhooks/clerk.ts` | users |

No exemptions.

---

## Files to Create

| File | Purpose |
|---|---|
| `backend/src/context/request-context.ts` | AsyncLocalStorage store — traceId, tenantId, initiatorId, isM2M |
| `backend/src/http/internal-client.ts` | Singleton axios clients per domain with header injection interceptors |
| `backend/src/internal/rules.router.ts` | Internal routes for rules domain |
| `backend/src/internal/subjects.router.ts` | Internal routes for subjects domain |
| `backend/src/internal/divisions.router.ts` | Internal routes for divisions domain |
| `backend/src/internal/teams.router.ts` | Internal routes for teams domain |
| `backend/src/internal/members.router.ts` | Internal routes for members domain |
| `backend/src/internal/tenants.router.ts` | Internal routes for tenants domain |
| `backend/src/internal/users.router.ts` | Internal routes for users domain |

## Files to Modify

| File | Change |
|---|---|
| `backend/src/app.ts` | onRequest hook for trace ID + internal route guard |
| `backend/src/logger/index.ts` | pino mixin reads context, adds traceId/tenantId/initiatorId to every log |
| `backend/src/auth/middleware.ts` | tenants → HTTP + in-memory cache |
| `backend/src/assistant/apply.ts` | all 5 service imports → HTTP clients |
| `backend/src/assistant/service.ts` | 4 service imports → HTTP clients |
| `backend/src/policy/compiler.ts` | 2 service imports → HTTP clients |
| `backend/src/platform/router.ts` | 3 service imports → HTTP clients |
| `backend/src/billing/service.ts` | tenants → HTTP client |
| `backend/src/members/service.ts` | users → HTTP client |
| `backend/src/webhooks/clerk.ts` | users → HTTP client |

---

## Task 1 — `backend/src/context/request-context.ts` (new file)

**Files:**
- Create: `backend/src/context/request-context.ts`

- [ ] **Step 1: Create the AsyncLocalStorage context module**

```typescript
import { AsyncLocalStorage } from 'node:async_hooks'

export interface RequestContext {
  traceId:      string
  tenantId?:    string
  initiatorId?: string  // member ID or 'system' for M2M
  isM2M:        boolean
}

export const requestContext = new AsyncLocalStorage<RequestContext>()
export const getContext = (): RequestContext | undefined => requestContext.getStore()
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/context/request-context.ts
git commit -m "feat(context): add AsyncLocalStorage request context for trace propagation"
```

---

## Task 2 — Fastify trace ID hook + internal route guard in `app.ts`

**Files:**
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Add onRequest hook for trace ID**

At the top of `buildApp()`, before any route registration, add:

```typescript
import { randomUUID } from 'node:crypto'
import { requestContext } from './context/request-context.js'

// Runs on every request — generate or forward trace ID, start context
app.addHook('onRequest', (req, _reply, done) => {
  const traceId = (req.headers['x-trace-id'] as string) ?? randomUUID()
  req.headers['x-trace-id'] = traceId
  requestContext.run(
    { traceId, isM2M: req.headers['x-m2m'] === 'true' },
    done
  )
})
```

- [ ] **Step 2: Add internal route guard**

Immediately after the trace ID hook:

```typescript
const INTERNAL_SECRET = process.env['INTERNAL_SECRET'] ?? ''

app.addHook('onRequest', async (req, reply) => {
  if (!req.url.startsWith('/internal/')) return
  if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
    return reply.code(404).send()
  }
})
```

404 (not 401) — gives no information to external callers that the path exists.

- [ ] **Step 3: Register internal routers**

After the existing router registrations, add:

```typescript
import { rulesInternalRouter }     from './internal/rules.router.js'
import { subjectsInternalRouter }  from './internal/subjects.router.js'
import { divisionsInternalRouter } from './internal/divisions.router.js'
import { teamsInternalRouter }     from './internal/teams.router.js'
import { membersInternalRouter }   from './internal/members.router.js'
import { tenantsInternalRouter }   from './internal/tenants.router.js'
import { usersInternalRouter }     from './internal/users.router.js'

app.register(rulesInternalRouter,     { prefix: '/internal/v1/rules' })
app.register(subjectsInternalRouter,  { prefix: '/internal/v1/subjects' })
app.register(divisionsInternalRouter, { prefix: '/internal/v1/divisions' })
app.register(teamsInternalRouter,     { prefix: '/internal/v1/teams' })
app.register(membersInternalRouter,   { prefix: '/internal/v1/members' })
app.register(tenantsInternalRouter,   { prefix: '/internal/v1/tenants' })
app.register(usersInternalRouter,     { prefix: '/internal/v1/users' })
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.ts
git commit -m "feat(app): add trace ID hook, internal route guard, register internal routers"
```

---

## Task 3 — Logger mixin in `backend/src/logger/index.ts`

**Files:**
- Modify: `backend/src/logger/index.ts`

- [ ] **Step 1: Add pino mixin that injects context fields into every log line**

Add import at top:

```typescript
import { getContext } from '../context/request-context.js'
```

Add `mixin` to the pino options object (wherever `pino(...)` is called):

```typescript
mixin: () => {
  const ctx = getContext()
  if (!ctx) return {}
  return {
    traceId:     ctx.traceId,
    tenantId:    ctx.tenantId,
    initiatorId: ctx.initiatorId,
    isM2M:       ctx.isM2M,
  }
},
```

Every `logger.info(...)`, `logger.error(...)`, etc. across the entire codebase now automatically includes `traceId`, `tenantId`, `initiatorId` without any call-site changes.

- [ ] **Step 2: Commit**

```bash
git add backend/src/logger/index.ts
git commit -m "feat(logger): pino mixin injects traceId, tenantId, initiatorId from AsyncLocalStorage"
```

---

## Task 4 — `backend/src/http/internal-client.ts` (new file)

**Files:**
- Create: `backend/src/http/internal-client.ts`

- [ ] **Step 1: Create singleton axios clients**

```typescript
import axios, { type AxiosInstance } from 'axios'
import { getContext } from '../context/request-context.js'
import { logger } from '../logger/index.js'

function createClient(path: string): AxiosInstance {
  const client = axios.create({ timeout: 5000 })

  // baseURL and secret read lazily per-request so tests can set INTERNAL_API_URL
  // dynamically in startTestApp() after the module is already imported.
  client.interceptors.request.use(config => {
    const base   = process.env['INTERNAL_API_URL'] ?? 'http://localhost:3000'
    const secret = process.env['INTERNAL_SECRET']  ?? ''
    config.baseURL = `${base}${path}`
    const ctx = getContext()
    config.headers['X-Internal-Secret'] = secret
    config.headers['X-M2M']             = 'true'
    if (ctx) {
      config.headers['X-Trace-ID']     = ctx.traceId
      config.headers['X-Tenant-ID']    = ctx.tenantId ?? ''
      config.headers['X-Initiator-Id'] = ctx.initiatorId ?? 'system'
    }
    return config
  })

  client.interceptors.response.use(
    res => res,
    err => {
      const code    = err.response?.status ?? 0
      const message = (err.response?.data as { error?: string })?.error ?? err.message
      logger.error('internal http call failed', { code, message, path })
      throw new Error(`[${code}] ${message}`)
    }
  )

  return client
}

export const rulesClient     = createClient('/internal/v1/rules')
export const subjectsClient  = createClient('/internal/v1/subjects')
export const divisionsClient = createClient('/internal/v1/divisions')
export const teamsClient     = createClient('/internal/v1/teams')
export const membersClient   = createClient('/internal/v1/members')
export const tenantsClient   = createClient('/internal/v1/tenants')
export const usersClient     = createClient('/internal/v1/users')
```

- [ ] **Step 2: Install axios if not already a dependency**

```bash
cd backend && pnpm add axios
```

- [ ] **Step 3: Add `INTERNAL_API_URL` and `INTERNAL_SECRET` to `.env.example`**

```
INTERNAL_API_URL=http://localhost:3000
INTERNAL_SECRET=change-me-in-production
```

- [ ] **Step 4: Commit**

```bash
git add backend/src/http/internal-client.ts backend/.env.example backend/package.json backend/pnpm-lock.yaml
git commit -m "feat(http): singleton axios internal clients with trace header injection"
```

---

## Task 5 — Internal routers (7 files)

Each internal router mirrors the existing service functions. All routes require `X-M2M: true` (enforced by the app-level guard in Task 2). `tenantId` comes from `X-Tenant-ID` header.

**Files:**
- Create: `backend/src/internal/rules.router.ts`
- Create: `backend/src/internal/subjects.router.ts`
- Create: `backend/src/internal/divisions.router.ts`
- Create: `backend/src/internal/teams.router.ts`
- Create: `backend/src/internal/members.router.ts`
- Create: `backend/src/internal/tenants.router.ts`
- Create: `backend/src/internal/users.router.ts`

Helper used in all routers — extract tenant from M2M header:

```typescript
function tenantId(req: FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw new Error('missing X-Tenant-ID')
  return id
}
```

- [ ] **Step 1: Create `internal/rules.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import {
  listAllActiveRules,
  createRule,
  updateRule,
  deleteRule,
} from '../rules/service.js'

export async function rulesInternalRouter(app: FastifyInstance) {
  app.get('/', async req => listAllActiveRules(tenantId(req)))

  app.post<{ Body: Parameters<typeof createRule>[2] & { subjectId: string } }>('/', async (req, reply) => {
    const { subjectId, ...payload } = req.body
    await createRule(tenantId(req), subjectId, payload)
    return reply.code(201).send({ ok: true })
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateRule>[2] }>('/:id', async req => {
    await updateRule(tenantId(req), req.params.id, req.body)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteRule(tenantId(req), req.params.id)
    return reply.code(204).send()
  })
}

function tenantId(req: import('fastify').FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw new Error('missing X-Tenant-ID')
  return id
}
```

- [ ] **Step 2: Create `internal/subjects.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { listSubjects, createSubject, updateSubject, deleteSubject } from '../subjects/service.js'

export async function subjectsInternalRouter(app: FastifyInstance) {
  app.get('/', async req => listSubjects(tenantId(req)))

  app.post<{ Body: Parameters<typeof createSubject>[1] }>('/', async (req, reply) => {
    await createSubject(tenantId(req), req.body)
    return reply.code(201).send({ ok: true })
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateSubject>[2] }>('/:id', async req => {
    await updateSubject(tenantId(req), req.params.id, req.body)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteSubject(tenantId(req), req.params.id)
    return reply.code(204).send()
  })
}

function tenantId(req: import('fastify').FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw new Error('missing X-Tenant-ID')
  return id
}
```

- [ ] **Step 3: Create `internal/divisions.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { listDivisions, createDivision, deleteDivision } from '../divisions/service.js'

export async function divisionsInternalRouter(app: FastifyInstance) {
  app.get('/', async req => listDivisions(tenantId(req)))

  app.post<{ Body: Parameters<typeof createDivision>[1] }>('/', async (req, reply) => {
    await createDivision(tenantId(req), req.body)
    return reply.code(201).send({ ok: true })
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteDivision(tenantId(req), req.params.id)
    return reply.code(204).send()
  })
}

function tenantId(req: import('fastify').FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw new Error('missing X-Tenant-ID')
  return id
}
```

- [ ] **Step 4: Create `internal/teams.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { createTeam, deleteTeam } from '../teams/service.js'

export async function teamsInternalRouter(app: FastifyInstance) {
  app.post<{ Body: { divisionId: string } & Parameters<typeof createTeam>[2] }>('/', async (req, reply) => {
    const { divisionId, ...payload } = req.body
    await createTeam(tenantId(req), divisionId, payload)
    return reply.code(201).send({ ok: true })
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteTeam(tenantId(req), req.params.id)
    return reply.code(204).send()
  })
}

function tenantId(req: import('fastify').FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw new Error('missing X-Tenant-ID')
  return id
}
```

- [ ] **Step 5: Create `internal/members.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import {
  listMembers, createMember, updateMember, deleteMember,
  assignTeam, removeTeam,
} from '../members/service.js'

export async function membersInternalRouter(app: FastifyInstance) {
  app.get('/', async req => {
    const rows = await listMembers(tenantId(req))
    return rows.map(({ user: _u, ...m }) => m)
  })

  app.post<{ Body: Parameters<typeof createMember>[1] }>('/', async (req, reply) => {
    const member = await createMember(tenantId(req), req.body)
    return reply.code(201).send(member)
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateMember>[2] }>('/:id', async req => {
    await updateMember(tenantId(req), req.params.id, req.body)
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/:id', async (req, reply) => {
    await deleteMember(tenantId(req), req.params.id)
    return reply.code(204).send()
  })

  app.post<{ Params: { id: string }; Body: { teamId: string } }>('/:id/assign-team', async req => {
    await assignTeam(req.params.id, req.body.teamId, tenantId(req))
    return { ok: true }
  })

  app.post<{ Params: { id: string }; Body: { teamId: string } }>('/:id/remove-team', async req => {
    await removeTeam(req.params.id, req.body.teamId, tenantId(req))
    return { ok: true }
  })
}

function tenantId(req: import('fastify').FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw new Error('missing X-Tenant-ID')
  return id
}
```

- [ ] **Step 6: Create `internal/tenants.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { getTenantById, updateSubscriptionStatus } from '../tenants/service.js'

export async function tenantsInternalRouter(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
    const tenant = await getTenantById(req.params.id)
    if (!tenant) return reply.code(404).send({ error: 'tenant not found' })
    return tenant
  })

  app.patch<{ Params: { id: string }; Body: { status: 'active' | 'past_due' | 'cancelled' } }>(
    '/:id/subscription', async req => {
      await updateSubscriptionStatus(req.params.id, req.body.status)
      return { ok: true }
    }
  )
}
```

- [ ] **Step 7: Create `internal/users.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import {
  getUserByEmail, createUser, updateUserProfile, nullifyClerkId, claimPendingMembers,
} from '../users/service.js'

export async function usersInternalRouter(app: FastifyInstance) {
  app.get<{ Querystring: { email: string } }>('/by-email', async (req, reply) => {
    const user = await getUserByEmail(req.query.email)
    if (!user) return reply.code(404).send({ error: 'user not found' })
    return user
  })

  app.post<{ Body: Parameters<typeof createUser>[0] }>('/', async (req, reply) => {
    const user = await createUser(req.body)
    return reply.code(201).send(user)
  })

  app.patch<{ Params: { id: string }; Body: Parameters<typeof updateUserProfile>[1] }>('/:id', async req => {
    await updateUserProfile(req.params.id, req.body)
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>('/:id/nullify-clerk', async req => {
    await nullifyClerkId(req.params.id)
    return { ok: true }
  })

  app.post<{ Body: { email: string; userId: string } }>('/claim-pending', async req => {
    await claimPendingMembers(req.body.email, req.body.userId)
    return { ok: true }
  })
}
```

- [ ] **Step 8: Commit all internal routers**

```bash
git add backend/src/internal/
git commit -m "feat(internal): add internal HTTP routers for all domains (rules/subjects/divisions/teams/members/tenants/users)"
```

---

## Task 6 — Migrate `auth/middleware.ts` → tenantsClient + cache

**Files:**
- Modify: `backend/src/auth/middleware.ts`

- [ ] **Step 1: Replace `getTenantById` direct import with HTTP client + 30s in-memory cache**

Remove:
```typescript
import { getTenantById } from '../tenants/service.js'
```

Add:
```typescript
import { tenantsClient } from '../http/internal-client.js'
import type { Tenant } from '../db/schema.js'

const _tenantCache = new Map<string, { data: Tenant; expiresAt: number }>()

async function getTenantCached(id: string): Promise<Tenant | null> {
  const hit = _tenantCache.get(id)
  if (hit && hit.expiresAt > Date.now()) return hit.data
  const res = await tenantsClient.get<Tenant>(`/${id}`).catch(e => {
    if ((e as Error).message.startsWith('[404]')) return null
    throw e
  })
  if (!res) return null
  _tenantCache.set(id, { data: res.data, expiresAt: Date.now() + 30_000 })
  return res.data
}
```

Replace every `getTenantById(...)` call in the file with `getTenantCached(...)`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/auth/middleware.ts
git commit -m "feat(auth): getTenantById → internal HTTP + 30s in-memory cache"
```

---

## Task 7 — Migrate `assistant/apply.ts`

**Files:**
- Modify: `backend/src/assistant/apply.ts`

- [ ] **Step 1: Replace all 5 service imports with HTTP clients**

Remove:
```typescript
import { createRule, updateRule, deleteRule } from '../rules/service.js'
import { createSubject, updateSubject, deleteSubject } from '../subjects/service.js'
import { createDivision, deleteDivision } from '../divisions/service.js'
import { createTeam, deleteTeam } from '../teams/service.js'
import { createMember, deleteMember, updateMember, assignTeam, removeTeam } from '../members/service.js'
```

Add:
```typescript
import {
  rulesClient, subjectsClient, divisionsClient, teamsClient, membersClient,
} from '../http/internal-client.js'
```

- [ ] **Step 2: Update `executeActions` — replace each service call with HTTP**

`tenantId` moves from direct argument to `X-Tenant-ID` header (set automatically by the axios interceptor via `AsyncLocalStorage`). But since `executeActions` receives `tenantId` as a parameter and the context may not yet have it set at call time (the context is enriched by auth middleware before reaching the assistant router), enrich the context at the top of `executeActions`:

```typescript
import { getContext } from '../context/request-context.js'

export async function executeActions(tenantId: string, actions: Action[]): Promise<ApplyResult> {
  // Ensure tenantId is in context so internal-client interceptor picks it up
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId
  // ... rest unchanged
```

Each case:

```typescript
case 'create_rule':
  await rulesClient.post('/', {
    subjectId:           action.subjectId,
    kind:                action.kind,
    keywords:            action.keywords ?? null,
    pattern:             action.pattern ?? null,
    destinations:        action.destinations ?? [],
    destinationGroupIds: action.destinationGroupIds ?? [],
    action:              action.action,
    message:             action.message ?? null,
    reportLevel:         action.reportLevel ?? 'none',
  })
  break

case 'update_rule':
  await rulesClient.patch(`/${action.ruleId}`, action.patch)
  break

case 'delete_rule':
  await rulesClient.delete(`/${action.ruleId}`)
  break

case 'create_subject':
  await subjectsClient.post('/', {
    name:        action.name,
    description: action.description ?? null,
    divisionId:  action.divisionId ?? null,
    teamId:      action.teamId ?? null,
  })
  break

case 'update_subject':
  await subjectsClient.patch(`/${action.subjectId}`, action.patch)
  break

case 'delete_subject':
  await subjectsClient.delete(`/${action.subjectId}`)
  break

case 'create_division':
  await divisionsClient.post('/', { name: action.name, slug: toSlug(action.name) })
  break

case 'delete_division':
  await divisionsClient.delete(`/${action.divisionId}`)
  break

case 'create_team':
  await teamsClient.post('/', { divisionId: action.divisionId, name: action.name, slug: toSlug(action.name) })
  break

case 'delete_team':
  await teamsClient.delete(`/${action.teamId}`)
  break

case 'create_member': {
  const res = await membersClient.post<{ id: string }>('/', {
    email:       action.email,
    role:        action.role,
    displayName: action.displayName ?? null,
  })
  if (action.adminDivisionId) {
    await membersClient.patch(`/${res.data.id}`, { adminDivisionId: action.adminDivisionId })
  }
  break
}

case 'delete_member':
  await membersClient.delete(`/${action.memberId}`)
  break

case 'assign_member_team':
  await membersClient.post(`/${action.memberId}/assign-team`, { teamId: action.teamId })
  break

case 'remove_member_team':
  await membersClient.post(`/${action.memberId}/remove-team`, { teamId: action.teamId })
  break
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/assistant/apply.ts
git commit -m "feat(assistant): executeActions → internal HTTP clients (rules/subjects/divisions/teams/members)"
```

---

## Task 8 — Migrate `assistant/service.ts`

**Files:**
- Modify: `backend/src/assistant/service.ts`

- [ ] **Step 1: Replace 4 service imports with HTTP clients in `fetchSnapshot`**

Remove:
```typescript
import { listDivisions } from '../divisions/service.js'
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
import { listMembers } from '../members/service.js'
```

Add:
```typescript
import { divisionsClient, subjectsClient, rulesClient, membersClient } from '../http/internal-client.js'
```

Replace `fetchSnapshot`:

```typescript
async function fetchSnapshot(tenantId: string): Promise<TenantSnapshot> {
  // Ensure context carries tenantId for header injection
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const [divisionsRes, subjectsRes, rulesRes, membersRes] = await Promise.all([
    divisionsClient.get('/'),
    subjectsClient.get('/'),
    rulesClient.get('/?activeOnly=true'),
    membersClient.get('/'),
  ])

  return {
    divisions: divisionsRes.data,
    teams:     [],  // teams come from DB directly — keep as-is for now
    subjects:  subjectsRes.data,
    rules:     rulesRes.data,
    members:   membersRes.data,
  }
}
```

Note: `teams` was fetched directly from `db` in the original. Keep that DB call for now — `teams` doesn't have a cross-domain violation (same module). Add a `GET /internal/v1/teams` route in teams router if needed later.

- [ ] **Step 2: Commit**

```bash
git add backend/src/assistant/service.ts
git commit -m "feat(assistant): fetchSnapshot → internal HTTP clients (divisions/subjects/rules/members)"
```

---

## Task 9 — Migrate `policy/compiler.ts`

**Files:**
- Modify: `backend/src/policy/compiler.ts`

- [ ] **Step 1: Replace 2 service imports with HTTP clients**

Remove:
```typescript
import { listSubjects } from '../subjects/service.js'
import { listAllActiveRules } from '../rules/service.js'
```

Add:
```typescript
import { subjectsClient, rulesClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
```

Replace the `compilePolicy` parallel fetch:

```typescript
export async function compilePolicy(tenantId: string): Promise<PolicyDoc> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const [subjectsRes, rulesRes, allSiteConfigs] = await Promise.all([
    subjectsClient.get('/'),
    rulesClient.get('/?activeOnly=true'),
    db.select().from(siteConfigs).where(eq(siteConfigs.tenantId, tenantId)),
  ])

  const allSubjects: Subject[] = subjectsRes.data
  const allRules: Rule[]       = rulesRes.data

  // ... rest of compilePolicy unchanged
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/policy/compiler.ts
git commit -m "feat(policy): compilePolicy → internal HTTP clients (subjects/rules)"
```

---

## Task 10 — Migrate `platform/router.ts`

**Files:**
- Modify: `backend/src/platform/router.ts`

- [ ] **Step 1: Replace 3 service imports with HTTP clients**

Remove:
```typescript
import { listMembers, createMember, updateMember, deleteMember } from '../members/service.js'
import { listDivisions } from '../divisions/service.js'
import { listSubjects } from '../subjects/service.js'
```

Add:
```typescript
import { membersClient, divisionsClient, subjectsClient } from '../http/internal-client.js'
```

Update each handler to use the corresponding client. `tenantId` is on `req.tenant.id` — set it into context before the call or pass via query/header. Since the auth middleware already enriched the context by the time platform router runs, `X-Tenant-ID` is already set.

Example:
```typescript
// Before
const members = await listMembers(req.tenant.id)

// After
const { data: members } = await membersClient.get('/')
```

Same pattern for `createMember`, `updateMember`, `deleteMember`, `listDivisions`, `listSubjects`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/platform/router.ts
git commit -m "feat(platform): router → internal HTTP clients (members/divisions/subjects)"
```

---

## Task 11 — Migrate `billing/service.ts`

**Files:**
- Modify: `backend/src/billing/service.ts`

- [ ] **Step 1: Replace `updateSubscriptionStatus` direct import with HTTP client**

Remove:
```typescript
import { updateSubscriptionStatus } from '../tenants/service.js'
```

Add:
```typescript
import { tenantsClient } from '../http/internal-client.js'
```

Replace:
```typescript
// Before
await updateSubscriptionStatus(tenantId, status)

// After
await tenantsClient.patch(`/${tenantId}/subscription`, { status })
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/billing/service.ts
git commit -m "feat(billing): updateSubscriptionStatus → internal HTTP client"
```

---

## Task 12 — Migrate `members/service.ts`

**Files:**
- Modify: `backend/src/members/service.ts`

- [ ] **Step 1: Replace `getUserByEmail` import with HTTP client**

Remove:
```typescript
import { getUserByEmail } from '../users/service.js'
```

Add:
```typescript
import { usersClient } from '../http/internal-client.js'
import type { User } from '../db/schema.js'
```

Replace:
```typescript
// Before
const user = await getUserByEmail(email)

// After
const user = await usersClient.get<User>('/by-email', { params: { email } })
  .then(r => r.data)
  .catch(e => {
    if ((e as Error).message.startsWith('[404]')) return null
    throw e
  })
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/members/service.ts
git commit -m "feat(members): getUserByEmail → internal HTTP client"
```

---

## Task 13 — Migrate `webhooks/clerk.ts`

**Files:**
- Modify: `backend/src/webhooks/clerk.ts`

- [ ] **Step 1: Replace user service imports with HTTP clients**

Remove:
```typescript
import { createUser, updateUserProfile, nullifyClerkId, claimPendingMembers } from '../users/service.js'
```

Add:
```typescript
import { usersClient } from '../http/internal-client.js'
```

Replace each call:

```typescript
// createUser
await usersClient.post('/', userData)

// updateUserProfile
await usersClient.patch(`/${userId}`, profileData)

// nullifyClerkId
await usersClient.post(`/${userId}/nullify-clerk`)

// claimPendingMembers
await usersClient.post('/claim-pending', { email, userId })
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/webhooks/clerk.ts
git commit -m "feat(webhooks): clerk user operations → internal HTTP client"
```

---

## Task 14 — `INTERNAL_SECRET` in AWS Secrets Manager (Ryan)

- [ ] **Step 1: Create secret in AWS Secrets Manager**

```bash
aws secretsmanager create-secret \
  --name ciyo/staging/INTERNAL_SECRET \
  --secret-string "$(openssl rand -base64 32)"
```

Repeat for production environment when ready.

- [ ] **Step 2: Inject into ECS task definition**

Add to `containerDefinitions[].secrets`:

```json
{
  "name": "INTERNAL_SECRET",
  "valueFrom": "arn:aws:secretsmanager:REGION:ACCOUNT:secret:ciyo/staging/INTERNAL_SECRET"
}
```

- [ ] **Step 3: Add to `.env.example`**

Already done in Task 4 Step 3.

- [ ] **Step 4: Add ALB rule to block `/internal/*` from external traffic**

In the ALB listener rules, add a rule with highest priority:

```
Condition: path-pattern = /internal/*
Action: Return 404
```

This is defense-in-depth — the Fastify guard already blocks it, but the ALB rule ensures the traffic never reaches the container.

- [ ] **Step 5: Commit Terraform / IaC changes**

```bash
git add infra/
git commit -m "feat(infra): INTERNAL_SECRET in Secrets Manager, ALB rule blocks /internal/*"
```

---

## Task 15 — Datadog facets (Ryan)

- [ ] **Step 1: Add log pipeline facets for `traceId`, `tenantId`, `initiatorId`**

In Datadog → Logs → Pipelines → ciyo-api pipeline, add:

| Attribute | Type | Display name |
|---|---|---|
| `traceId` | String | Trace ID |
| `tenantId` | String | Tenant ID |
| `initiatorId` | String | Initiator |
| `isM2M` | Boolean | M2M |

- [ ] **Step 2: Add monitor for internal call failures**

Alert on: `@message:"internal http call failed"` with level ERROR, threshold ≥ 1 over 5 minutes → PagerDuty.

- [ ] **Step 3: Verify trace correlation**

After deploying, trigger a POST to `/v1/assistant/apply`. In Datadog, filter by the `X-Trace-ID` value from the response headers. Confirm every downstream internal call appears with the same `traceId`.

---

## Task 16 — Verify no remaining cross-domain direct imports

- [ ] **Step 1: Check for remaining violations**

```bash
cd backend && grep -r "from '\.\./[a-z-]*/service" src/ \
  | grep -v "^src/context\|^src/http\|^src/internal\|^src/db\|^src/logger\|^src/types" \
  | grep -v "from '\.\./tenants/service\|from '\.\./users/service" \
  | grep -v "service.ts:"
```

Expected: zero results. Any remaining match is a violation — fix before proceeding.

- [ ] **Step 2: TypeScript compile check**

```bash
cd backend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run unit tests**

```bash
cd backend && pnpm test
```

- [ ] **Step 4: Run E2E suite**

```bash
cd backend && pnpm seed:e2e && pnpm test:e2e
```

Expected: all projects pass. The HTTP boundary is transparent to E2E tests — they call the public `/v1/*` routes exactly as before.

- [ ] **Step 5: Final commit if any fixups needed**

```bash
git add -p
git commit -m "fix: remaining cross-domain direct import violations"
```

---

---

## Task 17 — Extend internal rules router: GET /:id and ?subjectId filter

Two callers need rule lookups the current internal router doesn't expose:
- `events/service.ts` needs a single rule by ID (to read `reportLevel`)
- `subjects/snapshot.ts` needs all rules for a specific `subjectId`

**Files:**
- Modify: `backend/src/rules/service.ts`
- Modify: `backend/src/internal/rules.router.ts`

- [ ] **Step 1: Add `getRuleById` to `backend/src/rules/service.ts`**

```typescript
export async function getRuleById(tenantId: string, id: string): Promise<Rule | null> {
  const [row] = await db.select().from(rules)
    .where(and(eq(rules.id, id), eq(rules.tenantId, tenantId)))
  return row ?? null
}
```

- [ ] **Step 2: Add `listRulesBySubject` to `backend/src/rules/service.ts`**

Already exists as `listRules(tenantId, subjectId)` — no new function needed.

- [ ] **Step 3: Extend `internal/rules.router.ts` with GET /:id and ?subjectId filter**

Add to `rulesInternalRouter`:

```typescript
// GET /internal/v1/rules/:id — single rule lookup
app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
  const rule = await getRuleById(tenantId(req), req.params.id)
  if (!rule) return reply.code(404).send({ error: 'rule not found' })
  return rule
})
```

Update the existing `GET /` handler to support optional `?subjectId` filter:

```typescript
app.get<{ Querystring: { activeOnly?: string; subjectId?: string } }>('/', async req => {
  const tid = tenantId(req)
  if (req.query.subjectId) {
    return listRules(tid, req.query.subjectId)
  }
  if (req.query.activeOnly === 'true') {
    return listAllActiveRules(tid)
  }
  return listAllActiveRules(tid)
})
```

Also add `getRuleById` and `listRules` to the imports at the top of the router.

- [ ] **Step 4: Commit**

```bash
git add backend/src/rules/service.ts backend/src/internal/rules.router.ts
git commit -m "feat(internal/rules): add GET /:id and ?subjectId filter to internal rules router"
```

---

## Task 18 — Migrate `events/service.ts` → rulesClient

**Files:**
- Modify: `backend/src/events/service.ts`

- [ ] **Step 1: Replace direct `rules` table query with HTTP client**

Remove:
```typescript
import { events, rules, type Event } from '../db/schema.js'
```

Add:
```typescript
import { events, type Event } from '../db/schema.js'
import { rulesClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import type { Rule } from '../db/schema.js'
```

Replace the rule lookup in `ingestEvent`:

```typescript
export async function ingestEvent(
  tenantId: string,
  ruleId: string,
  memberId: string | null,
  data: { action: 'warn' | 'block'; siteUrl: string; matchedTerm?: string }
): Promise<Event | null> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const rule = await rulesClient.get<Rule>(`/${ruleId}`)
    .then(r => r.data)
    .catch(e => {
      if ((e as Error).message.startsWith('[404]')) return null
      throw e
    })

  if (!rule || rule.tenantId !== tenantId || rule.reportLevel === 'none') return null

  // ... rest unchanged
}
```

Note: the tenant check `rule.tenantId !== tenantId` replaces the old SQL `eq(rules.tenantId, tenantId)` — same security guarantee, now enforced in JS after the HTTP fetch.

- [ ] **Step 2: Commit**

```bash
git add backend/src/events/service.ts
git commit -m "feat(events): ingestEvent rule lookup → internal HTTP client"
```

---

## Task 19 — Migrate `scans/service.ts` → tenantsClient

**Files:**
- Modify: `backend/src/scans/service.ts`

- [ ] **Step 1: Replace direct `tenants` table query with HTTP client**

Remove:
```typescript
import { scans, tenants } from '../db/schema.js'
```

Add:
```typescript
import { scans } from '../db/schema.js'
import { tenantsClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import type { Tenant } from '../db/schema.js'
```

Replace the tenant lookup in `recordScan`:

```typescript
export async function recordScan(
  tenantId: string,
  memberId: string | null
): Promise<{ blocked: boolean; remaining: number }> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const tenant = await tenantsClient.get<Tenant>(`/${tenantId}`)
    .then(r => r.data)
    .catch(e => {
      if ((e as Error).message.startsWith('[404]')) return null
      throw e
    })

  if (!tenant) return { blocked: false, remaining: -1 }

  // ... rest unchanged — replace `tenant.plan` references with `tenant.plan`
}
```

`tenantsClient` uses the same 30s in-memory cache set up in Task 6 — no extra latency on repeated calls within the same request window.

- [ ] **Step 2: Commit**

```bash
git add backend/src/scans/service.ts
git commit -m "feat(scans): recordScan tenant plan lookup → internal HTTP client"
```

---

## Task 20 — Migrate `subjects/snapshot.ts` → rulesClient

**Files:**
- Modify: `backend/src/subjects/snapshot.ts`

- [ ] **Step 1: Replace direct `rules` table query with HTTP client**

Remove:
```typescript
import { subjects, rules, subjectVersions, type SubjectSnapshot } from '../db/schema.js'
```

Add:
```typescript
import { subjects, subjectVersions, type SubjectSnapshot } from '../db/schema.js'
import { rulesClient } from '../http/internal-client.js'
import { getContext } from '../context/request-context.js'
import type { Rule } from '../db/schema.js'
```

Replace the rules fetch in `snapshotSubject`:

```typescript
export async function snapshotSubject(
  tenantId: string,
  subjectId: string,
  source: 'pre_ai_apply' | 'rollback',
  conversationMsgId?: string,
): Promise<void> {
  const ctx = getContext()
  if (ctx && !ctx.tenantId) ctx.tenantId = tenantId

  const [subject] = await db
    .select()
    .from(subjects)
    .where(and(eq(subjects.id, subjectId), eq(subjects.tenantId, tenantId)))

  if (!subject) return

  const currentRules = await rulesClient
    .get<Rule[]>(`/?subjectId=${subjectId}`)
    .then(r => r.data)

  // ... rest unchanged
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/subjects/snapshot.ts
git commit -m "feat(subjects): snapshotSubject rules fetch → internal HTTP client"
```

---

## Header contract (reference)

Every internal request carries:

| Header | Source | Purpose |
|---|---|---|
| `X-Trace-ID` | `requestContext.traceId` | Links all logs across one request lineage |
| `X-M2M` | `"true"` | Signals machine-to-machine — skip Clerk auth |
| `X-Internal-Secret` | `process.env.INTERNAL_SECRET` | Authenticates internal caller |
| `X-Tenant-ID` | `requestContext.tenantId` | Tenant scope for the receiving service |
| `X-Initiator-Id` | `requestContext.initiatorId` | Original member ID or `"system"` |

---

## Task 21 — Migrate `members/service.ts` → tenantsClient for seat limit

**Files:**
- Modify: `backend/src/members/service.ts`

- [ ] **Step 1: Replace `tenants` table query in `createMember` with HTTP client**

`members/service.ts` already imports `tenantsClient` from Task 12. Add it to the top if not already present.

In `createMember`, replace:

```typescript
const [tenant] = await db
  .select({ plan: tenants.plan })
  .from(tenants)
  .where(eq(tenants.id, tenantId))
```

With:

```typescript
const tenant = await tenantsClient.get<{ plan: string }>(`/${tenantId}`)
  .then(r => r.data)
  .catch(() => null)
```

Remove `tenants` from the schema import in `members/service.ts`.

- [ ] **Step 2: Commit**

```bash
git add backend/src/members/service.ts
git commit -m "feat(members): createMember seat limit tenant lookup → internal HTTP client"
```

---

## Task 22 — Resolve `memberTeams` ownership: break members↔teams bidirectional cycle

**Decision:** `members` domain owns `memberTeams`. `listMembersByTeam` moves from `teams` to `members`. `members` → `teams` auth checks use `teamsClient`.

**Files:**
- Modify: `backend/src/teams/service.ts`
- Modify: `backend/src/members/service.ts`
- Modify: `backend/src/internal/teams.router.ts`
- Modify: `backend/src/internal/members.router.ts`
- Modify: `backend/src/http/internal-client.ts`

- [ ] **Step 1: Add `GET /:id` to `internal/teams.router.ts`**

Add single-team lookup so members domain can verify team ownership:

```typescript
import { listTeams, createTeam, deleteTeam, getTeamById } from '../teams/service.js'

app.get<{ Params: { id: string } }>('/:id', async (req, reply) => {
  const team = await getTeamById(tenantId(req), req.params.id)
  if (!team) return reply.code(404).send({ error: 'team not found' })
  return team
})
```

Add `getTeamById` to `teams/service.ts`:

```typescript
export async function getTeamById(tenantId: string, id: string): Promise<Team | null> {
  const [row] = await db.select().from(teams)
    .where(and(eq(teams.id, id), eq(teams.tenantId, tenantId)))
  return row ?? null
}
```

- [ ] **Step 2: Move `listMembersByTeam` from `teams/service.ts` to `members/service.ts`**

Remove from `teams/service.ts`:
```typescript
export async function listMembersByTeam(tenantId: string, teamId: string): Promise<Member[]> { ... }
```
Also remove `members` from the import in `teams/service.ts` — no longer needed.

Add to `members/service.ts`:

```typescript
export async function listMembersByTeam(tenantId: string, teamId: string): Promise<MemberRow[]> {
  // Verify team belongs to tenant via HTTP
  const team = await teamsClient.get(`/${teamId}`)
    .then(r => r.data)
    .catch(e => {
      if ((e as Error).message.startsWith('[404]')) return null
      throw e
    })
  if (!team) return []

  const rows = await db
    .select({ member: members, user: users })
    .from(memberTeams)
    .innerJoin(members, and(eq(members.id, memberTeams.memberId), eq(members.tenantId, tenantId)))
    .leftJoin(users, eq(users.id, members.userId))
    .where(eq(memberTeams.teamId, teamId))
  return rows.map(r => ({
    ...r.member,
    user: r.user
      ? { email: r.user.email, firstName: r.user.firstName, lastName: r.user.lastName, avatarUrl: r.user.avatarUrl }
      : null,
  }))
}
```

- [ ] **Step 3: Replace `teams` table auth checks in `assignTeam`/`removeTeam` with HTTP**

In `members/service.ts`, `assignTeam` and `removeTeam` currently query `teams` table directly. Replace:

```typescript
// Before
const [team] = await db.select({ id: teams.id }).from(teams)
  .where(and(eq(teams.id, teamId), eq(teams.tenantId, tenantId)))
if (!team) throw Object.assign(new Error('Team not found'), { statusCode: 404 })

// After
const team = await teamsClient.get(`/${teamId}`)
  .then(r => r.data)
  .catch(e => {
    if ((e as Error).message.startsWith('[404]')) throw Object.assign(new Error('Team not found'), { statusCode: 404 })
    throw e
  })
```

Same pattern for `removeTeam` (but returns silently instead of throwing).

Remove `teams` from the schema import in `members/service.ts`.

- [ ] **Step 4: Add `?teamId` filter to `GET /internal/v1/members`**

Update `internal/members.router.ts`:

```typescript
app.get<{ Querystring: { teamId?: string } }>('/', async req => {
  const tid = tenantId(req)
  if (req.query.teamId) {
    const rows = await listMembersByTeam(tid, req.query.teamId)
    return rows.map(({ user: _u, ...m }) => m)
  }
  const rows = await listMembers(tid)
  return rows.map(({ user: _u, ...m }) => m)
})
```

- [ ] **Step 5: Update any caller of `listMembersByTeam` in `teams/router.ts` to use `membersClient`**

Find the teams router endpoint that calls `listMembersByTeam`. Replace:

```typescript
// Before
const members = await listMembersByTeam(req.tenant.id, req.params.id)

// After
const { data: members } = await membersClient.get(`/?teamId=${req.params.id}`)
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/teams/service.ts backend/src/members/service.ts \
        backend/src/internal/teams.router.ts backend/src/internal/members.router.ts \
        backend/src/teams/router.ts
git commit -m "feat(members/teams): move memberTeams ownership to members domain, break bidirectional cycle"
```

---

## Task 23 — `audit-log` and `analytics`: document as deliberate named exception

**Decision:** Read-only aggregation services are exempt from the HTTP boundary requirement. They JOIN across domain tables for reporting but never write to foreign tables. This is a named architectural exception — not a violation.

**Files:**
- Modify: `backend/src/audit-log/service.ts`
- Modify: `backend/src/analytics/service.ts`

- [ ] **Step 1: Add exception comment to `audit-log/service.ts`**

Add at the top of the file after imports:

```typescript
// DELIBERATE EXCEPTION — microservices HTTP boundary (ADR 2026-06-27)
// This service joins across members, rules, and subjects tables for reporting.
// Read-only. Never writes to foreign domain tables.
// Future: replace with a dedicated reporting store fed by an event stream.
```

- [ ] **Step 2: Add exception comment to `analytics/service.ts`**

Same comment block at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add backend/src/audit-log/service.ts backend/src/analytics/service.ts
git commit -m "docs(audit-log,analytics): document deliberate cross-domain read exception per ADR 2026-06-27"
```

---

## Task 24 — Move `policy/resolver.ts` logic to `members` domain

**Decision:** `resolveMemberPolicy` is members-domain logic (what policy applies to a member based on team memberships). Move it. Policy domain calls members domain via HTTP.

**Files:**
- Create: `backend/src/members/resolver.ts`
- Create: `backend/src/internal/destination-groups.router.ts`
- Modify: `backend/src/http/internal-client.ts`
- Modify: `backend/src/internal/members.router.ts`
- Modify: `backend/src/policy/resolver.ts`

- [ ] **Step 1: Add `destinationGroupsClient` to `internal-client.ts`**

```typescript
export const destinationGroupsClient = createClient('/internal/v1/destination-groups')
```

- [ ] **Step 2: Create `backend/src/internal/destination-groups.router.ts`**

```typescript
import type { FastifyInstance } from 'fastify'
import { listDestinationGroups } from '../destination-groups/service.js'

export async function destinationGroupsInternalRouter(app: FastifyInstance) {
  app.get('/', async req => listDestinationGroups(tenantId(req)))
}

function tenantId(req: import('fastify').FastifyRequest): string {
  const id = req.headers['x-tenant-id'] as string
  if (!id) throw new Error('missing X-Tenant-ID')
  return id
}
```

Check `destination-groups/service.ts` for the correct export name — adjust if needed.

Register in `app.ts`:

```typescript
import { destinationGroupsInternalRouter } from './internal/destination-groups.router.js'
app.register(destinationGroupsInternalRouter, { prefix: '/internal/v1/destination-groups' })
```

- [ ] **Step 3: Create `backend/src/members/resolver.ts`**

Move all logic from `policy/resolver.ts` here, replacing the two direct DB queries with HTTP calls:

```typescript
import { eq, inArray } from 'drizzle-orm'
import { db } from '../db/client.js'
import { memberTeams } from '../db/schema.js'
import { teamsClient, destinationGroupsClient } from '../http/internal-client.js'
import type { PolicyDoc, RulePolicy, SubjectPolicy } from '../policy/compiler.js'

// ... copy ResolvedRulePolicy, ResolvedSubjectPolicy, ResolvedPolicy interfaces

export async function resolveMemberPolicy(
  tenantId: string,
  memberId: string,
  snapshot: PolicyDoc,
): Promise<ResolvedPolicy> {
  // memberTeams is owned by members domain — direct DB access is correct here
  const teamRows = await db
    .select({ teamId: memberTeams.teamId })
    .from(memberTeams)
    .where(eq(memberTeams.memberId, memberId))
  const memberTeamIds = new Set(teamRows.map(r => r.teamId))

  // teams domain — HTTP call replaces direct DB query
  let memberDivisionIds = new Set<string>()
  if (memberTeamIds.size > 0) {
    const divRows = await teamsClient
      .get<Array<{ id: string; divisionId: string }>>('/', {
        params: { ids: [...memberTeamIds].join(',') }
      })
      .then(r => r.data)
    memberDivisionIds = new Set(divRows.map(r => r.divisionId))
  }

  // ... policy filtering logic unchanged from original ...

  // destination-groups domain — HTTP call replaces direct DB query
  const allGroupIds = [...new Set([...byKey.values()].flatMap(e => e.rule.destinationGroupIds ?? []))]
  const groupDomainsMap: Record<string, string[]> = {}
  if (allGroupIds.length > 0) {
    const groups = await destinationGroupsClient
      .get<Array<{ id: string; domains: string[] }>>('/')
      .then(r => r.data)
    for (const g of groups.filter(g => allGroupIds.includes(g.id))) {
      groupDomainsMap[g.id] = g.domains ?? []
    }
  }

  // ... result assembly unchanged ...
}
```

Note: `memberTeams` is now owned by `members` domain — that direct DB query is correct, not a violation.

- [ ] **Step 4: Add `GET /internal/v1/teams?ids=` filter to teams router**

`members/resolver.ts` needs team → divisionId mapping for a set of team IDs. Add query param support:

In `teams/service.ts`:
```typescript
export async function getTeamsByIds(tenantId: string, ids: string[]): Promise<Team[]> {
  if (ids.length === 0) return []
  return db.select().from(teams)
    .where(and(eq(teams.tenantId, tenantId), inArray(teams.id, ids)))
}
```

In `internal/teams.router.ts`:
```typescript
app.get<{ Querystring: { ids?: string } }>('/', async req => {
  if (req.query.ids) {
    const ids = req.query.ids.split(',').filter(Boolean)
    return getTeamsByIds(tenantId(req), ids)
  }
  return listTeams(tenantId(req), req.query.divisionId ?? '')
})
```

- [ ] **Step 5: Add `POST /resolve-policy` to `internal/members.router.ts`**

```typescript
import { resolveMemberPolicy } from '../members/resolver.js'
import type { PolicyDoc } from '../policy/compiler.js'

app.post<{ Body: { memberId: string; snapshot: PolicyDoc } }>('/resolve-policy', async req => {
  return resolveMemberPolicy(tenantId(req), req.body.memberId, req.body.snapshot)
})
```

- [ ] **Step 6: Replace `policy/resolver.ts` with HTTP call**

```typescript
import { membersClient } from '../http/internal-client.js'
import type { PolicyDoc } from './compiler.js'
import type { ResolvedPolicy } from '../members/resolver.js'

export async function resolveMemberPolicy(
  tenantId: string,
  memberId: string,
  snapshot: PolicyDoc,
): Promise<ResolvedPolicy> {
  const { data } = await membersClient.post<ResolvedPolicy>('/resolve-policy', {
    memberId,
    snapshot,
  })
  return data
}

export type { ResolvedPolicy, ResolvedRulePolicy, ResolvedSubjectPolicy } from '../members/resolver.js'
```

All callers of `resolveMemberPolicy` via the policy module continue to work — same function signature, same return type.

- [ ] **Step 7: Commit**

```bash
git add backend/src/members/resolver.ts \
        backend/src/internal/destination-groups.router.ts \
        backend/src/internal/members.router.ts \
        backend/src/http/internal-client.ts \
        backend/src/policy/resolver.ts \
        backend/src/teams/service.ts \
        backend/src/internal/teams.router.ts \
        backend/src/app.ts
git commit -m "feat(members): move resolveMemberPolicy to members domain, policy/resolver → HTTP client"
```

---

## Future extraction (when needed)

When a domain is ready to become a separate deployed process:

1. Change `baseURL` in `internal-client.ts` for that domain's client
2. Deploy the domain as a separate ECS service
3. Update ALB to route that domain's `/internal/v1/<domain>/*` to the new service
4. Nothing else changes — callers, headers, error handling all stay the same
