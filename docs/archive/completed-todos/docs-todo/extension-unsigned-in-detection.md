# Extension — Unsigned-in User Detection

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When an employee's extension is installed but they haven't signed in (or their session expired), the admin Console currently has no visibility of this gap. Surface "unregistered device" signals in the Members page so admins know their coverage has holes.

**Architecture:** The extension detects a missing Clerk session on startup and after each failed detection attempt. When no session is found it fires a lightweight anonymous ping to `POST /v1/devices/anonymous-ping` carrying a stable install-scoped ID (derived from `chrome.storage.local` — not the user's identity). The backend records the `orgToken` tenant + `installId` + last-seen timestamp in a new `anonymous_pings` table. The Members page surfaces a badge: "X unregistered devices detected in the last 7 days."

**Tech Stack:** Chrome MV3 service worker, Fastify, Drizzle ORM, Postgres, React

---

## File Map

| Action | Path | What changes |
|--------|------|-------------|
| Create | `backend/drizzle/XXXX_anonymous_pings.sql` | New table: `anonymous_pings(id, tenant_id, install_id, last_seen_at)` |
| Create | `backend/src/devices/router.ts` | `POST /v1/devices/anonymous-ping` — org-token auth only, upsert on install_id |
| Modify | `backend/src/app.ts` | Register `devicesRouter` |
| Modify | `pretzel/src/background/service-worker.ts` | On startup, check Clerk session; if absent, call `dispatchAnonymousPing()` |
| Create | `pretzel/src/devices/dispatch.ts` | `dispatchAnonymousPing()` — reads orgToken, generates/reads stable installId, POSTs ping |
| Modify | `pretzel-console/src/hooks/useMembers.ts` | Add `useUnregisteredDevices()` hook querying `GET /v1/devices/unregistered-count` |
| Modify | `pretzel-console/src/pages/MembersPage.tsx` | Show "X unregistered devices" badge if count > 0 |

---

## Task 1: Database Schema

- [ ] **Step 1: Generate migration**

```sql
CREATE TABLE "anonymous_pings" (
  "id"           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"    uuid NOT NULL REFERENCES "tenants"("id"),
  "install_id"   text NOT NULL,
  "last_seen_at" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("tenant_id", "install_id")
);
CREATE INDEX ON "anonymous_pings" ("tenant_id", "last_seen_at");
```

- [ ] **Step 2: Apply migration and verify TypeScript compiles**

---

## Task 2: Backend Ping Endpoint

**Files:**
- Create: `backend/src/devices/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create router**

```typescript
// backend/src/devices/router.ts
import type { FastifyInstance } from 'fastify'
import { requireOrgToken } from '../auth/middleware.js'
import { db } from '../db/client.js'
import { anonymousPings } from '../db/schema.js'
import { and, eq, gte, count } from 'drizzle-orm'

export async function devicesRouter(fastify: FastifyInstance) {
  // Extension pings this when no Clerk session found
  fastify.post('/devices/anonymous-ping', { preHandler: requireOrgToken }, async (req, reply) => {
    const { installId } = req.body as { installId: string }
    if (!installId || typeof installId !== 'string') {
      return reply.status(400).send({ error: 'installId required' })
    }
    await db.insert(anonymousPings)
      .values({ tenantId: req.tenant.id, installId, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: [anonymousPings.tenantId, anonymousPings.installId],
        set: { lastSeenAt: new Date() },
      })
    return reply.status(204).send()
  })

  // Console reads this to show the badge count
  fastify.get('/devices/unregistered-count', { preHandler: requireOrgToken }, async (req, reply) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const [row] = await db
      .select({ n: count() })
      .from(anonymousPings)
      .where(and(eq(anonymousPings.tenantId, req.tenant.id), gte(anonymousPings.lastSeenAt, since)))
    return reply.send({ count: row?.n ?? 0 })
  })
}
```

- [ ] **Step 2: Register in `app.ts` and verify TypeScript**

---

## Task 3: Extension — Stable Install ID + Ping Dispatch

**Files:**
- Create: `pretzel/src/devices/dispatch.ts`
- Modify: `pretzel/src/background/service-worker.ts`

- [ ] **Step 1: Create dispatch module**

```typescript
// pretzel/src/devices/dispatch.ts
import { API_BASE } from "@/shared/constants"

async function getOrCreateInstallId(): Promise<string> {
  const stored = await chrome.storage.local.get("installId") as { installId?: string }
  if (stored.installId) return stored.installId
  const id = crypto.randomUUID()
  await chrome.storage.local.set({ installId: id })
  return id
}

async function getOrgToken(): Promise<string | null> {
  const managed = await chrome.storage.managed.get("orgToken").catch(() => ({})) as Record<string, unknown>
  if (typeof managed["orgToken"] === "string") return managed["orgToken"]
  const local = await chrome.storage.local.get("orgToken") as Record<string, unknown>
  return typeof local["orgToken"] === "string" ? local["orgToken"] : null
}

export async function dispatchAnonymousPing(): Promise<void> {
  const token = await getOrgToken()
  if (!token) return  // no org token = can't identify tenant, skip

  const installId = await getOrCreateInstallId()
  await fetch(`${API_BASE}/v1/devices/anonymous-ping`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ installId }),
  }).catch(() => {})  // fire-and-forget
}
```

- [ ] **Step 2: Call from service worker on startup when no Clerk session**

In `pretzel/src/background/service-worker.ts`, in the startup `chrome.runtime.onInstalled` / `onStartup` listener:
```typescript
import { dispatchAnonymousPing } from "../devices/dispatch.js"

// After checking isAuthenticated():
const authed = await isAuthenticated()
if (!authed) {
  void dispatchAnonymousPing()
}
```

---

## Task 4: Console — Unregistered Devices Badge

**Files:**
- Modify: `pretzel-console/src/pages/MembersPage.tsx`

- [ ] **Step 1: Add `useUnregisteredDevices` hook inline and render badge**

```tsx
// In MembersPage.tsx
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

// Inside MembersPage component:
const { data: devicesData } = useQuery({
  queryKey: ['unregistered-devices'],
  queryFn: () => api.get<{ count: number }>('/v1/devices/unregistered-count'),
  staleTime: 60_000,
})
const unregistered = devicesData?.count ?? 0

// In the PageHeader action area or below the title:
{unregistered > 0 && (
  <span style={{
    fontSize: 11, fontWeight: 600, color: 'var(--status-warn)',
    background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 6, padding: '3px 10px',
  }}>
    ⚠ {unregistered} unregistered device{unregistered !== 1 ? 's' : ''} (last 7 days)
  </span>
)}
```

- [ ] **Step 2: TypeScript check + manual smoke test**

```bash
cd backend && npx tsc --noEmit
cd pretzel-console && npx tsc --noEmit
```
