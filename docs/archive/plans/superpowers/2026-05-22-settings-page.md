# Settings Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the read-only Settings page to support editing the organisation name and rotating API tokens (org token and admin token).

**Architecture:** The existing `GET /v1/tenant` endpoint (in `backend/src/policy/router.ts`) returns id, name, slug, plan, subscriptionStatus. This plan adds a dedicated `backend/src/tenants/router.ts` with `PATCH /v1/tenant` (update name only — slug is immutable, changing it would break existing tokens) and `POST /v1/tenant/rotate-org-token` / `POST /v1/tenant/rotate-admin-token`. Rotation generates a new secret, hashes and stores it, then returns the raw token one time. The frontend shows the new token in a copy banner that dismisses on user action — the raw token is never stored and can never be retrieved again.

**Tech Stack:** Drizzle ORM + bcryptjs (backend), React 18, @tanstack/react-query v5 (admin), Vitest + Supertest (backend tests)

**Key constraint:** `slug` is embedded in every token (`ps_live_<slug>_<secret>`). Changing the slug would immediately invalidate all org tokens. We update `name` only, not `slug`.

---

### Task 1: Backend — tenant service functions

**Files:**
- Modify: `backend/src/tenants/service.ts`
- Test: `backend/tests/settings.test.ts` (write first to drive implementation)

- [ ] **Step 1: Write the failing test in `backend/tests/settings.test.ts`**

```ts
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import supertest from 'supertest'
import { truncateAll, buildTestTenant } from './helpers/db.js'
import { db } from '../src/db/client.js'
import { tenants } from '../src/db/schema.js'
import { eq } from 'drizzle-orm'
import { buildApp } from '../src/app.js'
import { parseToken, compareToken } from '../src/auth/tokens.js'
import type { FastifyInstance } from 'fastify'

let app: FastifyInstance
let tenantId: string
let adminToken: string

beforeAll(async () => { app = buildApp(); await app.ready() })
beforeEach(async () => {
  await truncateAll()
  const t = await buildTestTenant()
  tenantId = t.tenantId
  adminToken = t.adminToken
})
afterAll(async () => { await app.close() })

describe('PATCH /v1/tenant', () => {
  it('updates the name', async () => {
    const res = await supertest(app.server)
      .patch('/v1/tenant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'New Firm Name' })
    expect(res.status).toBe(200)
    expect(res.body.name).toBe('New Firm Name')
    const [row] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId))
    expect(row!.name).toBe('New Firm Name')
  })

  it('returns 400 when name is missing', async () => {
    const res = await supertest(app.server)
      .patch('/v1/tenant')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
    expect(res.status).toBe(400)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).patch('/v1/tenant').send({ name: 'x' })
    expect(res.status).toBe(401)
  })
})

describe('POST /v1/tenant/rotate-org-token', () => {
  it('returns a new org token and invalidates the old one', async () => {
    const res = await supertest(app.server)
      .post('/v1/tenant/rotate-org-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()
    expect(res.status).toBe(200)
    expect(typeof res.body.token).toBe('string')
    expect(res.body.token).toMatch(/^ps_live_/)

    // Verify the returned token is well-formed
    const parsed = parseToken(res.body.token)
    expect(parsed).not.toBeNull()
    expect(parsed!.prefix).toBe('ps_live')

    // Verify the hash in the DB matches the new secret
    const [row] = await db.select({ orgTokenHash: tenants.orgTokenHash }).from(tenants).where(eq(tenants.id, tenantId))
    expect(await compareToken(parsed!.secret, row!.orgTokenHash)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/tenant/rotate-org-token').send()
    expect(res.status).toBe(401)
  })
})

describe('POST /v1/tenant/rotate-admin-token', () => {
  it('returns a new admin token', async () => {
    const res = await supertest(app.server)
      .post('/v1/tenant/rotate-admin-token')
      .set('Authorization', `Bearer ${adminToken}`)
      .send()
    expect(res.status).toBe(200)
    expect(res.body.token).toMatch(/^ps_adm_/)

    const parsed = parseToken(res.body.token)
    expect(parsed!.prefix).toBe('ps_adm')

    const [row] = await db.select({ adminTokenHash: tenants.adminTokenHash }).from(tenants).where(eq(tenants.id, tenantId))
    expect(await compareToken(parsed!.secret, row!.adminTokenHash)).toBe(true)
  })

  it('returns 401 without auth', async () => {
    const res = await supertest(app.server).post('/v1/tenant/rotate-admin-token').send()
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx vitest run tests/settings.test.ts
```

Expected: all tests fail with 404.

- [ ] **Step 3: Add service functions to `backend/src/tenants/service.ts`**

Append these three functions to the existing file (which already has `getTenantBySlug` and `updateSubscriptionStatus`):

```ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, type Tenant } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'

export async function updateTenantName(tenantId: string, name: string): Promise<Tenant> {
  const [row] = await db
    .update(tenants)
    .set({ name })
    .where(eq(tenants.id, tenantId))
    .returning()
  return row!
}

export async function rotateOrgToken(tenantId: string, slug: string): Promise<string> {
  const secret = generateSecret()
  await db.update(tenants).set({ orgTokenHash: await hashToken(secret) }).where(eq(tenants.id, tenantId))
  return formatToken('ps_live', slug, secret)
}

export async function rotateAdminToken(tenantId: string, slug: string): Promise<string> {
  const secret = generateSecret()
  await db.update(tenants).set({ adminTokenHash: await hashToken(secret) }).where(eq(tenants.id, tenantId))
  return formatToken('ps_adm', slug, secret)
}
```

Note: `getTenantBySlug` and `updateSubscriptionStatus` already exist in the file — do not duplicate them. Only append the three new functions. Make sure the imports for `generateSecret`, `formatToken`, `hashToken` are added to the existing import block (they may not be there yet).

The file currently imports only `eq` from drizzle-orm, `db`, and `tenants/Tenant`. The full import block should be:

```ts
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { tenants, type Tenant } from '../db/schema.js'
import { generateSecret, formatToken, hashToken } from '../auth/tokens.js'
```

---

### Task 2: Backend — tenants router and registration

**Files:**
- Create: `backend/src/tenants/router.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Create `backend/src/tenants/router.ts`**

```ts
import type { FastifyInstance } from 'fastify'
import { requireAdminTokenOrClerkAdmin } from '../auth/middleware.js'
import { updateTenantName, rotateOrgToken, rotateAdminToken } from './service.js'

export async function tenantsRouter(fastify: FastifyInstance): Promise<void> {
  fastify.patch('/tenant', { preHandler: requireAdminTokenOrClerkAdmin }, async (req, reply) => {
    const { name } = req.body as { name?: string }
    if (!name?.trim()) return reply.status(400).send({ error: 'name is required' })
    const tenant = await updateTenantName(req.tenant.id, name.trim())
    const { id, name: n, slug, plan, subscriptionStatus } = tenant
    return { id, name: n, slug, plan, subscriptionStatus }
  })

  fastify.post('/tenant/rotate-org-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const token = await rotateOrgToken(req.tenant.id, req.tenant.slug)
    return { token }
  })

  fastify.post('/tenant/rotate-admin-token', { preHandler: requireAdminTokenOrClerkAdmin }, async (req) => {
    const token = await rotateAdminToken(req.tenant.id, req.tenant.slug)
    return { token }
  })
}
```

- [ ] **Step 2: Register the router in `backend/src/app.ts`**

Add import (with the other router imports):
```ts
import { tenantsRouter } from './tenants/router.js'
```

Add registration (inside `buildApp()`):
```ts
void app.register(tenantsRouter, { prefix: '/v1' })
```

Note: `GET /v1/tenant` already exists in `policyRouter`. The new `PATCH /v1/tenant` and `POST /v1/tenant/rotate-*` routes have different HTTP methods/paths — no conflict.

- [ ] **Step 3: Run the settings tests**

```bash
cd backend && npx vitest run tests/settings.test.ts
```

Expected: all tests pass.

- [ ] **Step 4: Run the full test suite**

```bash
cd backend && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/tenants/service.ts backend/src/tenants/router.ts backend/src/app.ts backend/tests/settings.test.ts
git commit -m "feat(api): add PATCH /v1/tenant and token rotation endpoints"
```

---

### Task 3: Frontend — API client and hook mutations

**Files:**
- Modify: `admin/src/api.ts`
- Modify: `admin/src/hooks/useTenant.ts`

- [ ] **Step 1: Extend the `tenant` section in `admin/src/api.ts`**

Replace the current `tenant` block:
```ts
  tenant: {
    get: () => request<TenantInfo>('GET', '/v1/tenant'),
  },
```

With:
```ts
  tenant: {
    get:              ()           => request<TenantInfo>('GET', '/v1/tenant'),
    update:           (name: string) => request<TenantInfo>('PATCH', '/v1/tenant', { name }),
    rotateOrgToken:   ()           => request<{ token: string }>('POST', '/v1/tenant/rotate-org-token'),
    rotateAdminToken: ()           => request<{ token: string }>('POST', '/v1/tenant/rotate-admin-token'),
  },
```

- [ ] **Step 2: Extend `admin/src/hooks/useTenant.ts` with mutations**

Replace the full contents of `admin/src/hooks/useTenant.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useTenant() {
  return useQuery({ queryKey: ['tenant'], queryFn: api.tenant.get })
}

export function useTenantMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['tenant'] })

  const updateName = useMutation({
    mutationFn: (name: string) => api.tenant.update(name),
    onSuccess: () => { inv(); toast('Organisation name updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })

  // No toast on success — the caller shows the token banner.
  const rotateOrgToken = useMutation({
    mutationFn: api.tenant.rotateOrgToken,
    onError: (e: Error) => toast(e.message, 'error'),
  })

  const rotateAdminToken = useMutation({
    mutationFn: api.tenant.rotateAdminToken,
    onError: (e: Error) => toast(e.message, 'error'),
  })

  return { updateName, rotateOrgToken, rotateAdminToken }
}
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/api.ts admin/src/hooks/useTenant.ts
git commit -m "feat(admin): add tenant update and token rotation to api + useTenantMutations hook"
```

---

### Task 4: Frontend — rewrite SettingsPage

**Files:**
- Modify: `admin/src/pages/SettingsPage.tsx`

The new page has two sections:
1. **Organisation** — name (editable inline), slug (read-only), plan, subscription status
2. **API Tokens** — org token card with Rotate button, admin token card with Rotate button. After rotation a `NewTokenBanner` component shows the raw token with a Copy button and a Dismiss button. The banner disappears on dismiss — the token is shown exactly once.

- [ ] **Step 1: Replace the full contents of `admin/src/pages/SettingsPage.tsx`**

```tsx
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { useTenant, useTenantMutations } from '../hooks/useTenant'

export function SettingsPage() {
  const { data: tenant, isLoading, isError } = useTenant()
  const { updateName, rotateOrgToken, rotateAdminToken } = useTenantMutations()

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue]     = useState('')

  const [newOrgToken, setNewOrgToken]     = useState<string | null>(null)
  const [newAdminToken, setNewAdminToken] = useState<string | null>(null)

  function startEditName() {
    setNameValue(tenant?.name ?? '')
    setEditingName(true)
  }

  function saveName(e: React.FormEvent) {
    e.preventDefault()
    if (!nameValue.trim()) return
    updateName.mutate(nameValue.trim(), { onSuccess: () => setEditingName(false) })
  }

  function handleRotateOrg() {
    if (!window.confirm('Rotate the org token? All devices using the current token will stop working until updated.')) return
    rotateOrgToken.mutate(undefined, { onSuccess: data => setNewOrgToken(data.token) })
  }

  function handleRotateAdmin() {
    if (!window.confirm('Rotate the admin token? The current admin token will stop working immediately.')) return
    rotateAdminToken.mutate(undefined, { onSuccess: data => setNewAdminToken(data.token) })
  }

  const sectionStyle: React.CSSProperties = {
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: 24, maxWidth: 560,
    display: 'flex', flexDirection: 'column', gap: 16,
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
  }

  const inputStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px',
    fontSize: 13, background: 'var(--bg-base)', color: 'var(--text-primary)',
  }

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHeader title="Settings" />

      {/* Organisation */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Organisation</h2>

        {isLoading && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>Loading…</p>}
        {isError   && <p style={{ fontSize: 13, color: 'var(--status-danger)', margin: 0 }}>Could not load tenant info.</p>}

        {tenant && (
          <>
            {/* Name (editable) */}
            <div style={rowStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>Name</span>
              {editingName ? (
                <form onSubmit={saveName} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    value={nameValue} onChange={e => setNameValue(e.target.value)}
                    autoFocus style={inputStyle}
                  />
                  <button
                    type="submit" disabled={updateName.isPending}
                    style={{
                      background: 'var(--brand-primary)', color: '#fff', border: 'none',
                      borderRadius: 6, padding: '5px 12px', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    {updateName.isPending ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button" onClick={() => setEditingName(false)}
                    style={{
                      background: 'transparent', border: '1px solid var(--border)',
                      color: 'var(--text-muted)', borderRadius: 6,
                      padding: '5px 12px', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{tenant.name}</span>
                  <button
                    onClick={startEditName}
                    style={{
                      background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                      padding: '3px 10px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
                    }}
                  >
                    Edit
                  </button>
                </span>
              )}
            </div>

            {/* Read-only rows */}
            {([
              ['Slug',  tenant.slug,  true],
              ['Plan',  tenant.plan,  false],
            ] as [string, string, boolean][]).map(([label, value, mono]) => (
              <div key={label} style={rowStyle}>
                <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                <span style={{
                  color: 'var(--text-primary)', fontWeight: 500, textTransform: 'capitalize',
                  fontFamily: mono ? 'monospace' : undefined,
                }}>
                  {value}
                </span>
              </div>
            ))}

            {/* Subscription status */}
            <div style={rowStyle}>
              <span style={{ color: 'var(--text-secondary)' }}>Subscription status</span>
              <span style={{
                color: tenant.subscriptionStatus === 'active'   ? 'var(--status-safe)'   :
                       tenant.subscriptionStatus === 'past_due' ? 'var(--status-warn)'   : 'var(--status-danger)',
                fontWeight: 600, textTransform: 'capitalize',
              }}>
                {tenant.subscriptionStatus.replace('_', ' ')}
              </span>
            </div>
          </>
        )}
      </div>

      {/* API Tokens */}
      <div style={sectionStyle}>
        <h2 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>API Tokens</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
          Rotating a token immediately invalidates the current one.
          Copy the new token when shown — it will not be displayed again.
        </p>

        <TokenCard
          title="Org Token"
          description="Deployed to member devices via MDM or manual config"
          isPending={rotateOrgToken.isPending}
          onRotate={handleRotateOrg}
          newToken={newOrgToken}
          onDismiss={() => setNewOrgToken(null)}
        />
        <TokenCard
          title="Admin Token"
          description="Used by this admin dashboard and CI/CD integrations"
          isPending={rotateAdminToken.isPending}
          onRotate={handleRotateAdmin}
          newToken={newAdminToken}
          onDismiss={() => setNewAdminToken(null)}
        />
      </div>
    </div>
  )
}

function TokenCard({
  title, description, isPending, onRotate, newToken, onDismiss,
}: {
  title: string; description: string; isPending: boolean
  onRotate: () => void; newToken: string | null; onDismiss: () => void
}) {
  return (
    <div style={{
      background: 'var(--bg-base)', border: '1px solid var(--border)',
      borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{title}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{description}</div>
        </div>
        <button
          onClick={onRotate} disabled={isPending}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 12px', fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)',
            opacity: isPending ? 0.5 : 1,
          }}
        >
          {isPending ? 'Rotating…' : 'Rotate'}
        </button>
      </div>
      {newToken && <NewTokenBanner token={newToken} onDismiss={onDismiss} />}
    </div>
  )
}

function NewTokenBanner({ token, onDismiss }: { token: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard.writeText(token).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{
      background: 'rgba(0,180,80,0.08)', border: '1px solid rgba(0,180,80,0.25)',
      borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <p style={{ margin: 0, fontSize: 11, color: 'var(--status-safe)', fontWeight: 600 }}>
        New token generated. Copy it now — it will not be shown again.
      </p>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <code style={{
          flex: 1, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all',
          color: 'var(--text-primary)', background: 'var(--bg-surface)',
          padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border)',
        }}>
          {token}
        </code>
        <button
          onClick={copy}
          style={{
            background: copied ? 'var(--status-safe)' : 'var(--brand-primary)',
            color: '#fff', border: 'none', borderRadius: 6,
            padding: '5px 12px', fontSize: 12, cursor: 'pointer', flexShrink: 0,
            transition: 'background 0.15s',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button
          onClick={onDismiss}
          style={{
            background: 'none', border: '1px solid var(--border)', borderRadius: 6,
            padding: '5px 10px', fontSize: 12, cursor: 'pointer',
            color: 'var(--text-muted)', flexShrink: 0,
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Start admin dev server and verify**

```bash
cd admin && npm run dev
```

Navigate to `http://localhost:5173/settings`. Verify:
1. Organisation name, slug, plan, subscription status all display
2. Clicking "Edit" next to Name shows an inline form; saving updates the name immediately
3. "Rotate" button on Org Token shows a confirm dialog, then reveals the new token in a green banner
4. "Copy" in the banner copies the token to clipboard and briefly shows "Copied!"
5. "Dismiss" removes the banner
6. Admin Token card works the same way

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/SettingsPage.tsx
git commit -m "feat(admin): rewrite SettingsPage with name editing and token rotation"
```
