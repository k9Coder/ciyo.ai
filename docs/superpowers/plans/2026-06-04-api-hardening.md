# API Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rate limiting, security headers, fix the CORS fallback to a safe default, add Zod runtime validation on the `/assistant/apply` patch body, and fix the trivial email validation in `/auth/join`.

**Architecture:** Use `@fastify/rate-limit` (Redis store for scalability, in-memory for single-node), `@fastify/helmet` for security headers. CORS is hardened to an explicit list with a safe dev fallback. The `update_rule` and `update_subject` action patches in `apply.ts` are validated with Zod schemas matching the DB schema.

**Tech Stack:** Fastify, `@fastify/rate-limit`, `@fastify/helmet`, Zod, existing Drizzle schema.

---

### Task 1: Fix CORS Fallback

**Files:**
- Modify: `backend/src/app.ts`

- [ ] Step 1: Open `backend/src/app.ts` lines 30–33. Current code:
```typescript
void app.register(cors, {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: true,
})
```

The fallback `true` allows any origin when `CORS_ORIGIN` is not set. Replace with an explicit dev-only fallback:
```typescript
const allowedOrigins: string[] | RegExp | boolean = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : (process.env.NODE_ENV === 'test'
      ? true
      : ['http://localhost:5173', 'http://localhost:3001'])

void app.register(cors, {
  origin: allowedOrigins,
  credentials: true,
})
```

- [ ] Step 2: Build and verify no TS errors.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 3: Commit.
```bash
git add backend/src/app.ts
git commit -m "security(cors): replace origin:true fallback with explicit dev allowlist

origin:true allowed any origin when CORS_ORIGIN env var was absent.
Replaces with localhost-only fallback in dev, true only in test."
```

---

### Task 2: Add Security Headers with @fastify/helmet

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/package.json`

- [ ] Step 1: Install `@fastify/helmet`.
```bash
cd backend && pnpm add @fastify/helmet
```

- [ ] Step 2: Add the import and register call in `backend/src/app.ts`. Add after the cors registration:

Add import:
```typescript
import helmet from '@fastify/helmet'
```

Add registration after the cors line:
```typescript
void app.register(helmet, {
  // Allow Clerk's iframe-based sign-in
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
})
```

- [ ] Step 3: Build and start the server locally, then verify headers are present.
```bash
cd backend && pnpm run build && node dist/index.js &
sleep 2
curl -si http://localhost:3000/health | grep -i "x-content-type\|x-frame\|strict-transport"
# Expected output includes:
# x-content-type-options: nosniff
# x-frame-options: SAMEORIGIN
# strict-transport-security: max-age=...
kill %1
```

- [ ] Step 4: Commit.
```bash
git add backend/src/app.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "security: add @fastify/helmet for security headers (nosniff, framing, HSTS)"
```

---

### Task 3: Add Rate Limiting

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/package.json`

- [ ] Step 1: Install `@fastify/rate-limit`.
```bash
cd backend && pnpm add @fastify/rate-limit
```

- [ ] Step 2: Add rate limiting registration in `backend/src/app.ts`. Add after the helmet registration:

Add import:
```typescript
import rateLimit from '@fastify/rate-limit'
```

Add registration:
```typescript
void app.register(rateLimit, {
  global: true,
  max: 200,
  timeWindow: '1 minute',
  // Per-route overrides are applied on routes that need tighter limits
  keyGenerator: (req) => {
    // Use tenant slug from auth header if available, otherwise IP
    const auth = req.headers.authorization ?? ''
    const match = auth.match(/^Bearer ps_(?:live|adm)_([a-z0-9-]+)_/)
    return match?.[1] ?? req.ip
  },
  errorResponseBuilder: (_req, context) => ({
    error: 'Too Many Requests',
    retryAfter: context.after,
  }),
})
```

- [ ] Step 3: Add a tighter limit on the LLM chat endpoint. In `backend/src/assistant/router.ts`, update the `/assistant/chat` route definition:
```typescript
fastify.post('/assistant/chat', {
  preHandler: requireAdminTokenOrClerkAdmin,
  config: {
    rateLimit: {
      max: 20,
      timeWindow: '1 minute',
    },
  },
}, async (req, reply) => {
```

- [ ] Step 4: Verify the rate limit fires after exceeding the threshold.
```bash
cd backend && node dist/index.js &
sleep 2
# Hit the health endpoint 201 times — last one should get 429
for i in $(seq 1 201); do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
  if [ "$STATUS" = "429" ]; then echo "Rate limit hit at request $i"; break; fi
done
kill %1
# Expected output: "Rate limit hit at request 201" (or close to 200)
```

- [ ] Step 5: Commit.
```bash
git add backend/src/app.ts backend/src/assistant/router.ts backend/package.json backend/pnpm-lock.yaml
git commit -m "security: add @fastify/rate-limit — 200 req/min global, 20 req/min on /assistant/chat"
```

---

### Task 4: Add Zod Validation on /assistant/apply Patch

**Files:**
- Modify: `backend/src/assistant/apply.ts`

- [ ] Step 1: The `update_rule` and `update_subject` actions pass `action.patch` directly to `updateRule`/`updateSubject` without any validation. Add Zod schemas for valid patch shapes.

In `backend/src/assistant/apply.ts`, add at the top:
```typescript
import { z } from 'zod'

const updateRulePatchSchema = z.object({
  kind:                z.enum(['keyword', 'pattern', 'entropy', 'score']).optional(),
  keywords:            z.array(z.string().max(200)).max(50).optional(),
  pattern:             z.string().max(500).optional(),
  destinations:        z.array(z.string().max(500)).max(100).optional(),
  destinationGroupIds: z.array(z.string().uuid()).max(100).optional(),
  action:              z.enum(['warn', 'block']).optional(),
  message:             z.string().max(1000).optional().nullable(),
  reportLevel:         z.enum(['none', 'minimal', 'medium', 'rich']).optional(),
  active:              z.boolean().optional(),
}).strict()

const updateSubjectPatchSchema = z.object({
  name:        z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  active:      z.boolean().optional(),
}).strict()
```

- [ ] Step 2: Apply validation in the `update_rule` and `update_subject` cases. Replace the existing case blocks:

```typescript
case 'update_rule': {
  const parseResult = updateRulePatchSchema.safeParse(action.patch)
  if (!parseResult.success) {
    errors.push(`update_rule: invalid patch — ${parseResult.error.message}`)
    break
  }
  await updateRule(tenantId, action.ruleId, parseResult.data as Parameters<typeof updateRule>[2])
  applied.push(action)
  break
}

case 'update_subject': {
  const parseResult = updateSubjectPatchSchema.safeParse(action.patch)
  if (!parseResult.success) {
    errors.push(`update_subject: invalid patch — ${parseResult.error.message}`)
    break
  }
  await updateSubject(tenantId, action.subjectId, parseResult.data as Parameters<typeof updateSubject>[2])
  applied.push(action)
  break
}
```

- [ ] Step 3: Build.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
# Expected: (empty)
```

- [ ] Step 4: Run assistant-related tests.
```bash
cd backend && pnpm test -- --reporter=verbose assistant
# Expected: all pass
```

- [ ] Step 5: Commit.
```bash
git add backend/src/assistant/apply.ts
git commit -m "security: add Zod validation on assistant apply patch fields

Prevents prompt injection from setting arbitrary DB fields via
update_rule or update_subject patches. Uses strict() to reject
unknown keys."
```

---

### Task 5: Fix Email Validation in /auth/join

**Files:**
- Modify: `backend/src/auth/join.ts`

- [ ] Step 1: Open `backend/src/auth/join.ts` line 8. Current code:
```typescript
if (!email || !email.includes('@')) {
  return reply.status(400).send({ error: 'Valid email required' })
}
```

Replace with a proper validation using the standard `z.string().email()`:
```typescript
import { z } from 'zod'

const joinBodySchema = z.object({
  email: z.string().email('Valid email required'),
})
```

And update the route handler:
```typescript
export async function joinRouter(fastify: FastifyInstance): Promise<void> {
  fastify.post('/auth/join', { preHandler: requireOrgToken }, async (req, reply) => {
    const parseResult = joinBodySchema.safeParse(req.body)
    if (!parseResult.success) {
      return reply.status(400).send({ error: parseResult.error.errors[0]?.message ?? 'Valid email required' })
    }
    const { email } = parseResult.data
    const existing = await getMemberByEmail(req.tenant.id, email)
    if (existing) return reply.status(200).send(existing)
    const member = await createMember(req.tenant.id, { email, role: 'member' })
    return reply.status(201).send(member)
  })
}
```

- [ ] Step 2: Build and run join-related tests.
```bash
cd backend && pnpm run build 2>&1 | grep -i error
cd backend && pnpm test -- --reporter=verbose join
# Expected: no TS errors, all tests pass
```

- [ ] Step 3: Commit.
```bash
git add backend/src/auth/join.ts
git commit -m "security: use z.string().email() for join route — reject 'notanemail@'"
```
