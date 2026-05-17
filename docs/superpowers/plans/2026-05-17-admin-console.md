# Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the PromptShield admin console SPA: left-sidebar React app with 6 pages (Subjects & Rules, Org Structure, Destination Groups, Site Configs, Publish, Settings) consuming the existing Fastify backend.

**Architecture:** React 18 + React Router v6 + TanStack Query v5 + Tailwind. Generic UI component library in `components/ui/`. One React Query hook file per resource. Full rewrite of `admin/src/`. Two small backend additions: `GET /v1/teams/:teamId/members` and `GET /v1/tenant`.

**Tech Stack:** React 18, react-router-dom v6, @tanstack/react-query v5, zod, Tailwind CSS 3, Vitest, @testing-library/react, supertest (backend tests).

---

## File Map

**Create:**
- `admin/src/types.ts` — all shared TS interfaces
- `admin/src/api.ts` — typed fetch functions (rewrite)
- `admin/src/components/ui/Badge.tsx`
- `admin/src/components/ui/EmptyState.tsx`
- `admin/src/components/ui/PageHeader.tsx`
- `admin/src/components/ui/Toggle.tsx`
- `admin/src/components/ui/EntityModal.tsx`
- `admin/src/components/ui/ConfirmModal.tsx`
- `admin/src/components/ui/ToastContainer.tsx`
- `admin/src/components/ui/SplitPane.tsx`
- `admin/src/components/ui/MillerColumns.tsx`
- `admin/src/hooks/useToast.ts`
- `admin/src/hooks/useSubjects.ts`
- `admin/src/hooks/useRules.ts`
- `admin/src/hooks/useDivisions.ts`
- `admin/src/hooks/useTeams.ts`
- `admin/src/hooks/useMembers.ts`
- `admin/src/hooks/useDestinationGroups.ts`
- `admin/src/hooks/useSiteConfigs.ts`
- `admin/src/hooks/usePolicy.ts`
- `admin/src/hooks/useTenant.ts`
- `admin/src/components/layout/AppLayout.tsx`
- `admin/src/components/layout/RequireAuth.tsx`
- `admin/src/pages/SubjectsPage.tsx`
- `admin/src/pages/OrgPage.tsx`
- `admin/src/pages/DestinationsPage.tsx`
- `admin/src/pages/SitesPage.tsx`
- `admin/src/pages/PublishPage.tsx`
- `admin/tests/api.test.ts`
- `admin/tests/MillerColumns.test.tsx`

**Rewrite:** `admin/src/App.tsx`, `admin/src/pages/LoginPage.tsx`, `admin/src/pages/SettingsPage.tsx`

**Delete:** `admin/src/pages/MattersPage.tsx`, `admin/src/pages/PolicyPage.tsx`, `admin/src/pages/HistoryPage.tsx`

**Modify:**
- `admin/package.json` — add deps
- `admin/vite.config.ts` — jsdom test env
- `backend/src/teams/service.ts` — add `listMembersByTeam`
- `backend/src/teams/router.ts` — add `GET /v1/teams/:teamId/members`
- `backend/src/policy/router.ts` — add `GET /v1/tenant`
- `backend/tests/teams.test.ts` — add test for new endpoint

---

### Task 1: Install admin dependencies + configure test environment

**Files:**
- Modify: `admin/package.json`
- Modify: `admin/vite.config.ts`

- [ ] **Step 1: Install packages**

```bash
cd admin
npm install react-router-dom @tanstack/react-query zod
npm install --save-dev @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 2: Update `admin/vite.config.ts`**

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
  },
})
```

- [ ] **Step 3: Create `admin/tests/setup.ts`**

```ts
import '@testing-library/jest-dom'
```

- [ ] **Step 4: Verify install succeeds**

```bash
cd admin && npm run typecheck
```

Expected: exits 0 (may have errors from old stubs — that's fine; just verifying packages resolve).

- [ ] **Step 5: Commit**

```bash
git add admin/package.json admin/package-lock.json admin/vite.config.ts admin/tests/setup.ts
git commit -m "chore(admin): add router, react-query, zod, testing-library"
```

---

### Task 2: Backend — team-members endpoint + tenant endpoint

**Files:**
- Modify: `backend/src/teams/service.ts`
- Modify: `backend/src/teams/router.ts`
- Modify: `backend/src/policy/router.ts`
- Modify: `backend/tests/teams.test.ts`

- [ ] **Step 1: Write failing test in `backend/tests/teams.test.ts`**

Add after the existing DELETE describe block:

```ts
describe('GET /v1/teams/:teamId/members', () => {
  it('returns members assigned to the team', async () => {
    const { body: team } = await supertest(app.server)
      .post(`/v1/divisions/${divisionId}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Trial', slug: 'trial' })
    const { body: member } = await supertest(app.server)
      .post('/v1/members')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'jane@example.com', displayName: 'Jane' })
    await supertest(app.server)
      .post(`/v1/members/${member.id as string}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ teamId: team.id as string })

    const res = await supertest(app.server)
      .get(`/v1/teams/${team.id as string}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
    expect(res.body[0].email).toBe('jane@example.com')
  })

  it('returns empty array for team with no members', async () => {
    const { body: team } = await supertest(app.server)
      .post(`/v1/divisions/${divisionId}/teams`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Empty', slug: 'empty' })
    const res = await supertest(app.server)
      .get(`/v1/teams/${team.id as string}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && npm test -- --reporter=verbose tests/teams.test.ts
```

Expected: FAIL — `GET /v1/teams/:teamId/members` returns 404.

- [ ] **Step 3: Add `listMembersByTeam` to `backend/src/teams/service.ts`**

Add after the existing `deleteTeam` function:

```ts
import { memberTeams, members } from '../db/schema.js'

export async function listMembersByTeam(tenantId: string, teamId: string) {
  return db
    .select({ member: members })
    .from(memberTeams)
    .innerJoin(members, eq(members.id, memberTeams.memberId))
    .where(eq(memberTeams.teamId, teamId))
    .then(rows => rows.map(r => r.member).filter(m => m.tenantId === tenantId))
}
```

Note: `members` and `memberTeams` are already imported in the schema file; add them to the import at the top of `teams/service.ts`:

```ts
import { db } from '../db/client.js'
import { eq } from 'drizzle-orm'
import { teams, type Team, type NewTeam } from '../db/schema.js'
import { memberTeams, members } from '../db/schema.js'
```

- [ ] **Step 4: Add route to `backend/src/teams/router.ts`**

Add inside `teamsRouter` before the closing brace:

```ts
import { listTeams, createTeam, updateTeam, deleteTeam, listMembersByTeam } from './service.js'

// ... existing routes ...

fastify.get('/teams/:teamId/members', { preHandler: requireAdminToken }, async (req) => {
  const { teamId } = req.params as { teamId: string }
  return listMembersByTeam(req.tenant.id, teamId)
})
```

- [ ] **Step 5: Add `GET /v1/tenant` to `backend/src/policy/router.ts`**

Add inside `policyRouter` after the rollback route:

```ts
fastify.get('/tenant', { preHandler: requireAdminToken }, async (req) => {
  const { id, name, slug, plan, subscriptionStatus } = req.tenant
  return { id, name, slug, plan, subscriptionStatus }
})
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && npm test -- --reporter=verbose tests/teams.test.ts
```

Expected: all tests PASS including the two new ones.

- [ ] **Step 7: Commit**

```bash
git add backend/src/teams/service.ts backend/src/teams/router.ts backend/src/policy/router.ts backend/tests/teams.test.ts
git commit -m "feat(backend): GET /v1/teams/:teamId/members + GET /v1/tenant"
```

---

### Task 3: admin/src/types.ts

**Files:**
- Create: `admin/src/types.ts`

- [ ] **Step 1: Create the file**

```ts
// admin/src/types.ts

export interface Subject {
  id: string
  tenantId: string
  divisionId: string | null
  teamId: string | null
  name: string
  description: string | null
  active: boolean
  createdAt: string
}

export interface Rule {
  id: string
  tenantId: string
  subjectId: string
  kind: 'keyword' | 'pattern' | 'entropy' | 'score'
  keywords: string[] | null
  pattern: string | null
  destinations: string[]
  destinationGroupIds: string[]
  action: 'warn' | 'block'
  message: string | null
  active: boolean
  createdAt: string
}

export interface Division {
  id: string
  tenantId: string
  name: string
  slug: string
  createdAt: string
}

export interface Team {
  id: string
  tenantId: string
  divisionId: string
  name: string
  slug: string
  createdAt: string
}

export interface Member {
  id: string
  tenantId: string
  email: string
  displayName: string | null
  firstName: string | null
  lastName: string | null
  role: 'super_admin' | 'division_admin' | 'member'
  clerkId: string | null
  createdAt: string
}

export interface DestinationGroup {
  id: string
  tenantId: string
  divisionId: string | null
  teamId: string | null
  name: string
  domains: string[]
  createdAt: string
}

export interface SiteConfig {
  id: string
  tenantId: string
  domain: string
  inputSelector: string
  sendButtonSelector: string
  createdAt: string
}

export interface PolicyInfo {
  version: number
  policy: unknown
  tenantName: string
  plan: string
  expiresAt: string | null
  warning?: string
}

export interface PolicyHistoryEntry {
  id: string
  version: number
  publishedAt: string
}

export interface TenantInfo {
  id: string
  name: string
  slug: string
  plan: string
  subscriptionStatus: string
}
```

- [ ] **Step 2: Typecheck**

```bash
cd admin && npm run typecheck
```

Expected: no errors from types.ts.

- [ ] **Step 3: Commit**

```bash
git add admin/src/types.ts
git commit -m "feat(admin): shared TypeScript types"
```

---

### Task 4: admin/src/api.ts rewrite

**Files:**
- Modify: `admin/src/api.ts`

- [ ] **Step 1: Write the failing test first**

Create `admin/tests/api.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api, AdminApiError, setToken } from '../src/api'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
  setToken('ps_adm_test_abc123')
})

function okJson(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('api.subjects.list', () => {
  it('calls GET /v1/subjects with auth header', async () => {
    mockFetch.mockReturnValueOnce(okJson([{ id: '1', name: 'Test' }]))
    const result = await api.subjects.list()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/subjects'),
      expect.objectContaining({ method: 'GET', headers: expect.objectContaining({ Authorization: 'Bearer ps_adm_test_abc123' }) })
    )
    expect(result).toHaveLength(1)
  })
})

describe('api error handling', () => {
  it('throws AdminApiError on non-2xx', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve(new Response(JSON.stringify({ error: 'Not found' }), { status: 404 })))
    await expect(api.subjects.list()).rejects.toBeInstanceOf(AdminApiError)
  })

  it('AdminApiError has correct status', async () => {
    mockFetch.mockReturnValueOnce(Promise.resolve(new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })))
    await expect(api.subjects.list()).rejects.toMatchObject({ status: 403 })
  })
})
```

- [ ] **Step 2: Run test to see it fail (missing api methods)**

```bash
cd admin && npm test -- tests/api.test.ts
```

Expected: FAIL — `api.subjects` is undefined.

- [ ] **Step 3: Rewrite `admin/src/api.ts`**

```ts
import type {
  Subject, Rule, Division, Team, Member,
  DestinationGroup, SiteConfig, PolicyInfo, PolicyHistoryEntry, TenantInfo,
} from './types'

const API_BASE = (import.meta.env?.['VITE_API_BASE'] as string | undefined) ?? 'http://localhost:3000'
const TOKEN_KEY = 'ps_admin_token'

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
  }
}

export function setToken(token: string): void { localStorage.setItem(TOKEN_KEY, token) }
export function getToken(): string | null { return localStorage.getItem(TOKEN_KEY) }
export function clearToken(): void { localStorage.removeItem(TOKEN_KEY) }

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({ error: res.statusText })) as { error?: string }
    throw new AdminApiError(res.status, json.error ?? res.statusText)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const api = {
  subjects: {
    list: () => request<Subject[]>('GET', '/v1/subjects'),
    create: (data: { name: string; description?: string; divisionId?: string; teamId?: string }) =>
      request<Subject>('POST', '/v1/subjects', data),
    update: (id: string, data: Partial<{ name: string; description: string; active: boolean; divisionId: string; teamId: string }>) =>
      request<Subject>('PATCH', `/v1/subjects/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/subjects/${id}`),
  },
  rules: {
    list: (subjectId: string) => request<Rule[]>('GET', `/v1/subjects/${subjectId}/rules`),
    create: (subjectId: string, data: {
      kind: Rule['kind']; action: Rule['action']
      keywords?: string[]; pattern?: string; message?: string
      destinationGroupIds?: string[]
    }) => request<Rule>('POST', `/v1/subjects/${subjectId}/rules`, data),
    update: (id: string, data: Partial<{
      kind: Rule['kind']; action: Rule['action']
      keywords: string[]; pattern: string; message: string
      destinationGroupIds: string[]; active: boolean
    }>) => request<Rule>('PATCH', `/v1/rules/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/rules/${id}`),
  },
  divisions: {
    list: () => request<Division[]>('GET', '/v1/divisions'),
    create: (name: string) => request<Division>('POST', '/v1/divisions', { name, slug: toSlug(name) }),
    update: (id: string, name: string) => request<Division>('PATCH', `/v1/divisions/${id}`, { name, slug: toSlug(name) }),
    remove: (id: string) => request<void>('DELETE', `/v1/divisions/${id}`),
  },
  teams: {
    list: (divisionId: string) => request<Team[]>('GET', `/v1/divisions/${divisionId}/teams`),
    create: (divisionId: string, name: string) =>
      request<Team>('POST', `/v1/divisions/${divisionId}/teams`, { name, slug: toSlug(name) }),
    update: (id: string, name: string) => request<Team>('PATCH', `/v1/teams/${id}`, { name, slug: toSlug(name) }),
    remove: (id: string) => request<void>('DELETE', `/v1/teams/${id}`),
    members: (teamId: string) => request<Member[]>('GET', `/v1/teams/${teamId}/members`),
  },
  members: {
    list: () => request<Member[]>('GET', '/v1/members'),
    create: (data: { email: string; displayName?: string; role?: Member['role'] }) =>
      request<Member>('POST', '/v1/members', data),
    update: (id: string, data: Partial<{ displayName: string; role: Member['role'] }>) =>
      request<Member>('PATCH', `/v1/members/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/members/${id}`),
    assignTeam: (memberId: string, teamId: string) =>
      request<void>('POST', `/v1/members/${memberId}/teams`, { teamId }),
    removeTeam: (memberId: string, teamId: string) =>
      request<void>('DELETE', `/v1/members/${memberId}/teams/${teamId}`),
  },
  destinationGroups: {
    list: () => request<DestinationGroup[]>('GET', '/v1/destination-groups'),
    create: (data: { name: string; domains: string[]; divisionId?: string; teamId?: string }) =>
      request<DestinationGroup>('POST', '/v1/destination-groups', data),
    update: (id: string, data: Partial<{ name: string; domains: string[] }>) =>
      request<DestinationGroup>('PATCH', `/v1/destination-groups/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/destination-groups/${id}`),
  },
  siteConfigs: {
    list: () => request<SiteConfig[]>('GET', '/v1/site-configs'),
    create: (data: { domain: string; inputSelector: string; sendButtonSelector: string }) =>
      request<SiteConfig>('POST', '/v1/site-configs', data),
    update: (domain: string, data: Partial<{ inputSelector: string; sendButtonSelector: string }>) =>
      request<SiteConfig>('PATCH', `/v1/site-configs/${domain}`, data),
    remove: (domain: string) => request<void>('DELETE', `/v1/site-configs/${domain}`),
  },
  policy: {
    get: () => request<PolicyInfo>('GET', '/v1/policy'),
    publish: () => request<{ version: number }>('POST', '/v1/policy/publish', {}),
    history: () => request<PolicyHistoryEntry[]>('GET', '/v1/policy/history'),
    rollback: (version: number) => request<{ version: number }>('POST', `/v1/policy/rollback/${version}`),
  },
  tenant: {
    get: () => request<TenantInfo>('GET', '/v1/tenant'),
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd admin && npm test -- tests/api.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add admin/src/api.ts admin/src/types.ts admin/tests/api.test.ts
git commit -m "feat(admin): typed api client + shared types"
```

---

### Task 5: UI atoms — Badge, EmptyState, PageHeader, Toggle

**Files:**
- Create: `admin/src/components/ui/Badge.tsx`
- Create: `admin/src/components/ui/EmptyState.tsx`
- Create: `admin/src/components/ui/PageHeader.tsx`
- Create: `admin/src/components/ui/Toggle.tsx`

- [ ] **Step 1: Create `admin/src/components/ui/Badge.tsx`**

```tsx
type BadgeVariant = 'keyword' | 'pattern' | 'entropy' | 'score' | 'warn' | 'block' | 'global' | 'division' | 'team'

const STYLES: Record<BadgeVariant, string> = {
  keyword:  'bg-amber-100 text-amber-800',
  pattern:  'bg-red-100 text-red-800',
  entropy:  'bg-violet-100 text-violet-800',
  score:    'bg-blue-100 text-blue-800',
  warn:     'bg-yellow-100 text-yellow-800',
  block:    'bg-red-200 text-red-900',
  global:   'bg-gray-100 text-gray-700',
  division: 'bg-indigo-100 text-indigo-800',
  team:     'bg-teal-100 text-teal-800',
}

interface Props {
  variant: BadgeVariant
  children: React.ReactNode
}

export function Badge({ variant, children }: Props) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STYLES[variant]}`}>
      {children}
    </span>
  )
}
```

- [ ] **Step 2: Create `admin/src/components/ui/EmptyState.tsx`**

```tsx
interface Props {
  title: string
  description?: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {description && <p className="text-xs text-gray-400 mt-1">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `admin/src/components/ui/PageHeader.tsx`**

```tsx
interface Props {
  title: string
  action?: React.ReactNode
}

export function PageHeader({ title, action }: Props) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
      {action}
    </div>
  )
}
```

- [ ] **Step 4: Create `admin/src/components/ui/Toggle.tsx`**

```tsx
interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}

export function Toggle({ checked, onChange, disabled, label }: Props) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 ${
        checked ? 'bg-blue-600' : 'bg-gray-300'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
```

- [ ] **Step 5: Typecheck**

```bash
cd admin && npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Commit**

```bash
git add admin/src/components/
git commit -m "feat(admin): Badge, EmptyState, PageHeader, Toggle UI atoms"
```

---

### Task 6: EntityModal + ConfirmModal

**Files:**
- Create: `admin/src/components/ui/EntityModal.tsx`
- Create: `admin/src/components/ui/ConfirmModal.tsx`

- [ ] **Step 1: Create `admin/src/components/ui/EntityModal.tsx`**

```tsx
import { useEffect } from 'react'

interface Props {
  open: boolean
  title: string
  onClose: () => void
  onSave: () => void
  saving?: boolean
  children: React.ReactNode
}

export function EntityModal({ open, title, onClose, onSave, saving, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">{title}</h2>
        <div className="space-y-4">{children}</div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `admin/src/components/ui/ConfirmModal.tsx`**

```tsx
import { EntityModal } from './EntityModal'

interface Props {
  open: boolean
  message: string
  onClose: () => void
  onConfirm: () => void
  confirming?: boolean
}

export function ConfirmModal({ open, message, onClose, onConfirm, confirming }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
        <p className="text-sm text-gray-700 mb-6">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {confirming ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd admin && npm run typecheck
git add admin/src/components/ui/EntityModal.tsx admin/src/components/ui/ConfirmModal.tsx
git commit -m "feat(admin): EntityModal + ConfirmModal"
```

---

### Task 7: useToast + ToastContainer

**Files:**
- Create: `admin/src/hooks/useToast.ts`
- Create: `admin/src/components/ui/ToastContainer.tsx`

- [ ] **Step 1: Create `admin/src/hooks/useToast.ts`**

```ts
import { useState, useCallback } from 'react'

export interface Toast {
  id: string
  message: string
  variant: 'success' | 'error'
}

let toastListener: ((t: Toast) => void) | null = null

export function useToast() {
  const toast = useCallback((message: string, variant: Toast['variant'] = 'success') => {
    toastListener?.({ id: crypto.randomUUID(), message, variant })
  }, [])
  return { toast }
}

export function useToastStore() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = useCallback((t: Toast) => {
    setToasts(prev => [...prev, t])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== t.id)), 3000)
  }, [])

  useState(() => { toastListener = addToast })

  return toasts
}
```

- [ ] **Step 2: Create `admin/src/components/ui/ToastContainer.tsx`**

```tsx
import { useToastStore } from '../../hooks/useToast'

export function ToastContainer() {
  const toasts = useToastStore()
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`px-4 py-3 rounded-lg shadow-lg text-sm text-white ${
            t.variant === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/hooks/useToast.ts admin/src/components/ui/ToastContainer.tsx
git commit -m "feat(admin): useToast + ToastContainer"
```

---

### Task 8: SplitPane + MillerColumns

**Files:**
- Create: `admin/src/components/ui/SplitPane.tsx`
- Create: `admin/src/components/ui/MillerColumns.tsx`
- Create: `admin/tests/MillerColumns.test.tsx`

- [ ] **Step 1: Write failing test for MillerColumns**

Create `admin/tests/MillerColumns.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MillerColumns } from '../src/components/ui/MillerColumns'
import type { MillerColumnDef } from '../src/components/ui/MillerColumns'

const cols: MillerColumnDef[] = [
  {
    title: 'Divisions',
    items: [{ id: 'div-1', label: 'Legal' }, { id: 'div-2', label: 'Corporate' }],
    selectedId: null,
    onSelect: vi.fn(),
  },
  {
    title: 'Teams',
    items: [{ id: 'team-1', label: 'Trial', sublabel: '3 members' }],
    selectedId: null,
    onSelect: vi.fn(),
  },
]

describe('MillerColumns', () => {
  it('renders all column titles', () => {
    render(<MillerColumns columns={cols} />)
    expect(screen.getByText('Divisions')).toBeInTheDocument()
    expect(screen.getByText('Teams')).toBeInTheDocument()
  })

  it('renders items in each column', () => {
    render(<MillerColumns columns={cols} />)
    expect(screen.getByText('Legal')).toBeInTheDocument()
    expect(screen.getByText('Trial')).toBeInTheDocument()
  })

  it('calls onSelect when item is clicked', () => {
    const onSelect = vi.fn()
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: null,
      onSelect,
    }]
    render(<MillerColumns columns={c} />)
    fireEvent.click(screen.getByText('Legal'))
    expect(onSelect).toHaveBeenCalledWith('div-1')
  })

  it('highlights selected item', () => {
    const c: MillerColumnDef[] = [{
      title: 'Divisions',
      items: [{ id: 'div-1', label: 'Legal' }],
      selectedId: 'div-1',
      onSelect: vi.fn(),
    }]
    render(<MillerColumns columns={c} />)
    const item = screen.getByText('Legal').closest('button')
    expect(item?.className).toMatch(/bg-blue/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd admin && npm test -- tests/MillerColumns.test.tsx
```

Expected: FAIL — `MillerColumns` not found.

- [ ] **Step 3: Create `admin/src/components/ui/SplitPane.tsx`**

```tsx
interface Props {
  left: React.ReactNode
  right: React.ReactNode
  leftWidth?: number
}

export function SplitPane({ left, right, leftWidth = 260 }: Props) {
  return (
    <div className="flex h-full min-h-0">
      <div
        style={{ width: leftWidth, minWidth: leftWidth }}
        className="flex flex-col border-r border-gray-200 overflow-y-auto"
      >
        {left}
      </div>
      <div className="flex-1 overflow-y-auto">{right}</div>
    </div>
  )
}
```

- [ ] **Step 4: Create `admin/src/components/ui/MillerColumns.tsx`**

```tsx
import { EmptyState } from './EmptyState'

export interface MillerColumnItem {
  id: string
  label: string
  sublabel?: string
}

export interface MillerColumnDef {
  title: string
  items: MillerColumnItem[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAdd?: () => void
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  loading?: boolean
}

interface Props {
  columns: MillerColumnDef[]
}

export function MillerColumns({ columns }: Props) {
  return (
    <div className="flex h-full divide-x divide-gray-200">
      {columns.map((col, i) => (
        <div key={i} className="flex flex-col w-64 min-w-0 overflow-y-auto">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {col.title}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {col.loading ? (
              <div className="p-4 text-sm text-gray-400">Loading…</div>
            ) : col.items.length === 0 ? (
              <EmptyState title={`No ${col.title.toLowerCase()}`} />
            ) : (
              col.items.map(item => (
                <div
                  key={item.id}
                  className={`group flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-gray-50 ${
                    col.selectedId === item.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <button
                    className="flex-1 text-left min-w-0"
                    onClick={() => col.onSelect(item.id)}
                  >
                    <div className={`text-sm truncate ${col.selectedId === item.id ? 'text-blue-700 font-medium' : 'text-gray-800'}`}>
                      {item.label}
                    </div>
                    {item.sublabel && (
                      <div className="text-xs text-gray-400 truncate">{item.sublabel}</div>
                    )}
                  </button>
                  {(col.onEdit || col.onDelete) && (
                    <div className="hidden group-hover:flex items-center gap-1 ml-2 shrink-0">
                      {col.onEdit && (
                        <button
                          onClick={e => { e.stopPropagation(); col.onEdit!(item.id) }}
                          className="p-1 text-gray-400 hover:text-blue-600 rounded"
                          title="Edit"
                        >
                          ✎
                        </button>
                      )}
                      {col.onDelete && (
                        <button
                          onClick={e => { e.stopPropagation(); col.onDelete!(item.id) }}
                          className="p-1 text-gray-400 hover:text-red-600 rounded"
                          title="Delete"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {col.onAdd && (
            <div className="border-t border-gray-100 p-2">
              <button
                onClick={col.onAdd}
                className="w-full text-left text-sm text-blue-600 hover:text-blue-800 px-2 py-1.5 rounded hover:bg-blue-50"
              >
                + Add
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd admin && npm test -- tests/MillerColumns.test.tsx
```

Expected: all 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add admin/src/components/ui/SplitPane.tsx admin/src/components/ui/MillerColumns.tsx admin/tests/MillerColumns.test.tsx
git commit -m "feat(admin): SplitPane + MillerColumns components"
```

---

### Task 9: React Query hooks

**Files:**
- Create: `admin/src/hooks/useSubjects.ts`
- Create: `admin/src/hooks/useRules.ts`
- Create: `admin/src/hooks/useDivisions.ts`
- Create: `admin/src/hooks/useTeams.ts`
- Create: `admin/src/hooks/useMembers.ts`
- Create: `admin/src/hooks/useDestinationGroups.ts`
- Create: `admin/src/hooks/useSiteConfigs.ts`
- Create: `admin/src/hooks/usePolicy.ts`
- Create: `admin/src/hooks/useTenant.ts`

- [ ] **Step 1: Create `admin/src/hooks/useSubjects.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useSubjects() {
  return useQuery({ queryKey: ['subjects'], queryFn: api.subjects.list })
}

export function useSubjectMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['subjects'] })

  const create = useMutation({
    mutationFn: api.subjects.create,
    onSuccess: () => { inv(); toast('Subject created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.subjects.update>[1] }) =>
      api.subjects.update(id, data),
    onSuccess: () => { inv(); toast('Subject updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.subjects.remove,
    onSuccess: () => { inv(); toast('Subject deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
```

- [ ] **Step 2: Create `admin/src/hooks/useRules.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useRules(subjectId: string | null) {
  return useQuery({
    queryKey: ['rules', subjectId],
    queryFn: () => api.rules.list(subjectId!),
    enabled: !!subjectId,
  })
}

export function useRuleMutations(subjectId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['rules', subjectId] })

  const create = useMutation({
    mutationFn: (data: Parameters<typeof api.rules.create>[1]) => api.rules.create(subjectId!, data),
    onSuccess: () => { inv(); toast('Rule created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.rules.update>[1] }) =>
      api.rules.update(id, data),
    onSuccess: () => { inv(); toast('Rule updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.rules.remove,
    onSuccess: () => { inv(); toast('Rule deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
```

- [ ] **Step 3: Create `admin/src/hooks/useDivisions.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useDivisions() {
  return useQuery({ queryKey: ['divisions'], queryFn: api.divisions.list })
}

export function useDivisionMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['divisions'] })

  const create = useMutation({
    mutationFn: (name: string) => api.divisions.create(name),
    onSuccess: () => { inv(); toast('Division created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.divisions.update(id, name),
    onSuccess: () => { inv(); toast('Division updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.divisions.remove,
    onSuccess: () => { inv(); toast('Division deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
```

- [ ] **Step 4: Create `admin/src/hooks/useTeams.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useTeams(divisionId: string | null) {
  return useQuery({
    queryKey: ['teams', divisionId],
    queryFn: () => api.teams.list(divisionId!),
    enabled: !!divisionId,
  })
}

export function useTeamMembers(teamId: string | null) {
  return useQuery({
    queryKey: ['team-members', teamId],
    queryFn: () => api.teams.members(teamId!),
    enabled: !!teamId,
  })
}

export function useTeamMutations(divisionId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['teams', divisionId] })

  const create = useMutation({
    mutationFn: (name: string) => api.teams.create(divisionId!, name),
    onSuccess: () => { inv(); toast('Team created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.teams.update(id, name),
    onSuccess: () => { inv(); toast('Team updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => { inv(); return api.teams.remove(id) },
    onSuccess: () => { inv(); toast('Team deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
```

- [ ] **Step 5: Create `admin/src/hooks/useMembers.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useMemberMutations(teamId: string | null) {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['team-members', teamId] })

  const create = useMutation({
    mutationFn: async (data: { email: string; displayName?: string }) => {
      const member = await api.members.create(data)
      if (teamId) await api.members.assignTeam(member.id, teamId)
      return member
    },
    onSuccess: () => { inv(); toast('Member added') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: (memberId: string) => teamId
      ? api.members.removeTeam(memberId, teamId)
      : api.members.remove(memberId),
    onSuccess: () => { inv(); toast('Member removed') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, remove }
}
```

- [ ] **Step 6: Create `admin/src/hooks/useDestinationGroups.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useDestinationGroups() {
  return useQuery({ queryKey: ['destination-groups'], queryFn: api.destinationGroups.list })
}

export function useDestinationGroupMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['destination-groups'] })

  const create = useMutation({
    mutationFn: api.destinationGroups.create,
    onSuccess: () => { inv(); toast('Group created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.destinationGroups.update>[1] }) =>
      api.destinationGroups.update(id, data),
    onSuccess: () => { inv(); toast('Group updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.destinationGroups.remove,
    onSuccess: () => { inv(); toast('Group deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
```

- [ ] **Step 7: Create `admin/src/hooks/useSiteConfigs.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function useSiteConfigs() {
  return useQuery({ queryKey: ['site-configs'], queryFn: api.siteConfigs.list })
}

export function useSiteConfigMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()
  const inv = () => qc.invalidateQueries({ queryKey: ['site-configs'] })

  const create = useMutation({
    mutationFn: api.siteConfigs.create,
    onSuccess: () => { inv(); toast('Site config created') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const update = useMutation({
    mutationFn: ({ domain, data }: { domain: string; data: Parameters<typeof api.siteConfigs.update>[1] }) =>
      api.siteConfigs.update(domain, data),
    onSuccess: () => { inv(); toast('Site config updated') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: api.siteConfigs.remove,
    onSuccess: () => { inv(); toast('Site config deleted') },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { create, update, remove }
}
```

- [ ] **Step 8: Create `admin/src/hooks/usePolicy.ts`**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './useToast'

export function usePolicy() {
  return useQuery({ queryKey: ['policy'], queryFn: api.policy.get })
}

export function usePolicyHistory() {
  return useQuery({ queryKey: ['policy-history'], queryFn: api.policy.history })
}

export function usePolicyMutations() {
  const qc = useQueryClient()
  const { toast } = useToast()

  const publish = useMutation({
    mutationFn: api.policy.publish,
    onSuccess: ({ version }) => {
      qc.invalidateQueries({ queryKey: ['policy'] })
      qc.invalidateQueries({ queryKey: ['policy-history'] })
      toast(`Policy published (v${version})`)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  const rollback = useMutation({
    mutationFn: api.policy.rollback,
    onSuccess: ({ version }) => {
      qc.invalidateQueries({ queryKey: ['policy'] })
      qc.invalidateQueries({ queryKey: ['policy-history'] })
      toast(`Rolled back to v${version}`)
    },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  return { publish, rollback }
}
```

- [ ] **Step 9: Create `admin/src/hooks/useTenant.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'

export function useTenant() {
  return useQuery({ queryKey: ['tenant'], queryFn: api.tenant.get })
}
```

- [ ] **Step 10: Typecheck + commit**

```bash
cd admin && npm run typecheck
git add admin/src/hooks/
git commit -m "feat(admin): React Query hooks for all resources"
```

---

### Task 10: AppLayout + RequireAuth

**Files:**
- Create: `admin/src/components/layout/AppLayout.tsx`
- Create: `admin/src/components/layout/RequireAuth.tsx`

- [ ] **Step 1: Create `admin/src/components/layout/AppLayout.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router-dom'
import { clearToken } from '../../api'
import { ToastContainer } from '../ui/ToastContainer'
import { useNavigate } from 'react-router-dom'

const NAV = [
  { to: '/subjects',     label: 'Subjects & Rules' },
  { to: '/org',          label: 'Org Structure' },
  { to: '/destinations', label: 'Destination Groups' },
  { to: '/sites',        label: 'Site Configs' },
  { to: '/publish',      label: 'Publish' },
  { to: '/settings',     label: 'Settings' },
]

export function AppLayout() {
  const navigate = useNavigate()

  function handleSignOut() {
    clearToken()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-52 shrink-0 bg-slate-800 flex flex-col">
        <div className="px-4 py-5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-red-500 rounded flex items-center justify-center text-white text-xs font-bold">PS</div>
            <span className="text-white font-semibold text-sm">PromptShield</span>
          </div>
        </div>
        <nav className="flex-1 px-2 space-y-0.5">
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-slate-700 text-white font-medium'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-500 hover:text-slate-300"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="p-8">
          <Outlet />
        </div>
      </main>
      <ToastContainer />
    </div>
  )
}
```

- [ ] **Step 2: Create `admin/src/components/layout/RequireAuth.tsx`**

```tsx
import { Navigate } from 'react-router-dom'
import { getToken } from '../../api'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />
  return <>{children}</>
}
```

- [ ] **Step 3: Typecheck + commit**

```bash
cd admin && npm run typecheck
git add admin/src/components/layout/
git commit -m "feat(admin): AppLayout sidebar + RequireAuth guard"
```

---

### Task 11: LoginPage rewrite + App.tsx router

**Files:**
- Modify: `admin/src/pages/LoginPage.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/main.tsx`

- [ ] **Step 1: Rewrite `admin/src/pages/LoginPage.tsx`**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { setToken, api, AdminApiError } from '../api'

export function LoginPage() {
  const [token, setTokenInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    try {
      setToken(token.trim())
      await api.subjects.list()
      navigate('/subjects')
    } catch (err) {
      setToken('')
      setError(
        err instanceof AdminApiError && (err.status === 401 || err.status === 403)
          ? 'Invalid token — must start with ps_adm_ and match your organisation.'
          : 'Could not reach the server. Is the backend running?'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold">PS</div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">PromptShield Admin</h1>
            <p className="text-sm text-gray-500">Enter your admin token to continue</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">Admin token</label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={e => setTokenInput(e.target.value)}
              placeholder="ps_adm_yourfirm_..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoComplete="current-password"
            />
          </div>
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
          <button
            type="submit"
            disabled={loading || !token.trim()}
            className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Rewrite `admin/src/App.tsx`**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/layout/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { OrgPage } from './pages/OrgPage'
import { DestinationsPage } from './pages/DestinationsPage'
import { SitesPage } from './pages/SitesPage'
import { PublishPage } from './pages/PublishPage'
import { SettingsPage } from './pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/subjects" replace />} />
            <Route path="/subjects"     element={<SubjectsPage />} />
            <Route path="/org"          element={<OrgPage />} />
            <Route path="/destinations" element={<DestinationsPage />} />
            <Route path="/sites"        element={<SitesPage />} />
            <Route path="/publish"      element={<PublishPage />} />
            <Route path="/settings"     element={<SettingsPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 3: Create stub pages so App.tsx compiles**

Create these files as stubs (they will be replaced in later tasks):

`admin/src/pages/SubjectsPage.tsx`:
```tsx
export function SubjectsPage() { return <div>Subjects</div> }
```

`admin/src/pages/OrgPage.tsx`:
```tsx
export function OrgPage() { return <div>Org</div> }
```

`admin/src/pages/DestinationsPage.tsx`:
```tsx
export function DestinationsPage() { return <div>Destinations</div> }
```

`admin/src/pages/SitesPage.tsx`:
```tsx
export function SitesPage() { return <div>Sites</div> }
```

`admin/src/pages/PublishPage.tsx`:
```tsx
export function PublishPage() { return <div>Publish</div> }
```

- [ ] **Step 4: Delete old pages that are no longer needed**

```bash
cd admin && rm src/pages/MattersPage.tsx src/pages/PolicyPage.tsx src/pages/HistoryPage.tsx
```

- [ ] **Step 5: Typecheck**

```bash
cd admin && npm run typecheck
```

Expected: exits 0.

- [ ] **Step 6: Verify dev server starts**

```bash
cd admin && npm run dev
```

Open http://localhost:5173 — should show login page. Sign in with a `ps_adm_` token → should navigate to `/subjects` showing "Subjects" stub.

- [ ] **Step 7: Commit**

```bash
git add admin/src/
git commit -m "feat(admin): router + app shell + login page"
```

---

### Task 12: SubjectsPage

**Files:**
- Modify: `admin/src/pages/SubjectsPage.tsx`

- [ ] **Step 1: Implement `admin/src/pages/SubjectsPage.tsx`**

```tsx
import { useState } from 'react'
import { SplitPane } from '../components/ui/SplitPane'
import { PageHeader } from '../components/ui/PageHeader'
import { Badge } from '../components/ui/Badge'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useSubjects, useSubjectMutations } from '../hooks/useSubjects'
import { useRules, useRuleMutations } from '../hooks/useRules'
import type { Subject, Rule } from '../types'

// ── Subject form ──────────────────────────────────────────────────────────────
function SubjectForm({
  value, onChange,
}: {
  value: { name: string; description: string }
  onChange: (v: { name: string; description: string }) => void
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
          placeholder="e.g. Litigation Docs"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          rows={2}
          value={value.description}
          onChange={e => onChange({ ...value, description: e.target.value })}
        />
      </div>
    </>
  )
}

// ── Rule form ─────────────────────────────────────────────────────────────────
function RuleForm({
  value, onChange,
}: {
  value: { kind: Rule['kind']; action: Rule['action']; keywords: string; pattern: string; message: string; destinationGroupIds: string }
  onChange: (v: typeof value) => void
}) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Kind</label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            value={value.kind}
            onChange={e => onChange({ ...value, kind: e.target.value as Rule['kind'] })}
          >
            <option value="keyword">keyword</option>
            <option value="pattern">pattern</option>
            <option value="entropy">entropy</option>
            <option value="score">score</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Action</label>
          <select
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            value={value.action}
            onChange={e => onChange({ ...value, action: e.target.value as Rule['action'] })}
          >
            <option value="warn">warn</option>
            <option value="block">block</option>
          </select>
        </div>
      </div>

      {value.kind === 'keyword' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Keywords (comma-separated)</label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            rows={3}
            value={value.keywords}
            onChange={e => onChange({ ...value, keywords: e.target.value })}
            placeholder="attorney-client, privileged, confidential"
          />
        </div>
      )}

      {value.kind === 'pattern' && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Regex pattern</label>
          <input
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            value={value.pattern}
            onChange={e => onChange({ ...value, pattern: e.target.value })}
            placeholder="sk-[A-Za-z0-9]{20,}"
          />
        </div>
      )}

      {(value.kind === 'entropy' || value.kind === 'score') && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Config JSON (advanced — stored as JSONB)
          </label>
          <textarea
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            rows={4}
            value={value.keywords}
            onChange={e => onChange({ ...value, keywords: e.target.value })}
            placeholder='{"threshold": 4.5}'
          />
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Message (optional)</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          value={value.message}
          onChange={e => onChange({ ...value, message: e.target.value })}
          placeholder="Sensitive content detected"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Destination Group IDs (comma-separated UUIDs, optional)
        </label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.destinationGroupIds}
          onChange={e => onChange({ ...value, destinationGroupIds: e.target.value })}
          placeholder="uuid1, uuid2"
        />
      </div>
    </>
  )
}

// ── Rules panel ───────────────────────────────────────────────────────────────
function RulesPanel({ subject }: { subject: Subject }) {
  const { data: rules = [], isLoading } = useRules(subject.id)
  const mutations = useRuleMutations(subject.id)

  const blankRule = { kind: 'keyword' as Rule['kind'], action: 'warn' as Rule['action'], keywords: '', pattern: '', message: '', destinationGroupIds: '' }
  const [modal, setModal] = useState<{ open: boolean; editing: Rule | null; form: typeof blankRule }>({
    open: false, editing: null, form: blankRule,
  })
  const [deleting, setDeleting] = useState<Rule | null>(null)

  function openNew() {
    setModal({ open: true, editing: null, form: blankRule })
  }
  function openEdit(rule: Rule) {
    setModal({
      open: true,
      editing: rule,
      form: {
        kind: rule.kind,
        action: rule.action,
        keywords: rule.keywords?.join(', ') ?? '',
        pattern: rule.pattern ?? '',
        message: rule.message ?? '',
        destinationGroupIds: rule.destinationGroupIds.join(', '),
      },
    })
  }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  function buildPayload(form: typeof blankRule) {
    return {
      kind: form.kind,
      action: form.action,
      keywords: form.kind === 'keyword' ? form.keywords.split(',').map(s => s.trim()).filter(Boolean) : undefined,
      pattern: form.kind === 'pattern' ? form.pattern.trim() || undefined : undefined,
      message: form.message.trim() || undefined,
      destinationGroupIds: form.destinationGroupIds.split(',').map(s => s.trim()).filter(Boolean),
    }
  }

  async function handleSave() {
    const payload = buildPayload(modal.form)
    if (modal.editing) {
      await mutations.update.mutateAsync({ id: modal.editing.id, data: payload })
    } else {
      await mutations.create.mutateAsync(payload)
    }
    closeModal()
  }

  if (isLoading) return <div className="p-6 text-sm text-gray-400">Loading rules…</div>

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-gray-900">Rules — {subject.name}</h2>
        <button
          onClick={openNew}
          className="text-sm font-medium text-blue-600 hover:text-blue-800"
        >
          + Add rule
        </button>
      </div>

      {rules.length === 0 ? (
        <EmptyState title="No rules yet" action={{ label: '+ Add rule', onClick: openNew }} />
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div
              key={rule.id}
              className="flex items-start justify-between p-3 bg-white border border-gray-200 rounded-lg group"
            >
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={rule.kind}>{rule.kind}</Badge>
                <Badge variant={rule.action}>{rule.action}</Badge>
                <span className="text-sm text-gray-700 font-mono">
                  {rule.kind === 'keyword' ? rule.keywords?.join(', ') : rule.pattern ?? '—'}
                </span>
              </div>
              <div className="hidden group-hover:flex items-center gap-2 ml-2 shrink-0">
                <button onClick={() => openEdit(rule)} className="text-xs text-blue-600 hover:text-blue-800">Edit</button>
                <button onClick={() => setDeleting(rule)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit rule' : 'New rule'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <RuleForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete this ${deleting?.kind} rule? This cannot be undone.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await mutations.remove.mutateAsync(deleting!.id)
          setDeleting(null)
        }}
        confirming={mutations.remove.isPending}
      />
    </div>
  )
}

// ── Subjects list ─────────────────────────────────────────────────────────────
export function SubjectsPage() {
  const { data: subjects = [], isLoading } = useSubjects()
  const mutations = useSubjectMutations()

  const blank = { name: '', description: '' }
  const [selected, setSelected] = useState<Subject | null>(null)
  const [modal, setModal] = useState<{ open: boolean; editing: Subject | null; form: typeof blank }>({
    open: false, editing: null, form: blank,
  })
  const [deleting, setDeleting] = useState<Subject | null>(null)

  function openNew() { setModal({ open: true, editing: null, form: blank }) }
  function openEdit(s: Subject) { setModal({ open: true, editing: s, form: { name: s.name, description: s.description ?? '' } }) }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  async function handleSave() {
    if (modal.editing) {
      await mutations.update.mutateAsync({ id: modal.editing.id, data: modal.form })
    } else {
      await mutations.create.mutateAsync(modal.form)
    }
    closeModal()
  }

  const left = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-700">Subjects</span>
        <button onClick={openNew} className="text-xs font-medium text-blue-600 hover:text-blue-800">+ New</button>
      </div>
      {isLoading ? (
        <div className="p-4 text-sm text-gray-400">Loading…</div>
      ) : subjects.length === 0 ? (
        <EmptyState title="No subjects" action={{ label: '+ New subject', onClick: openNew }} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          {subjects.map(s => (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 group ${
                selected?.id === s.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className={`text-sm font-medium truncate ${selected?.id === s.id ? 'text-blue-700' : 'text-gray-800'}`}>
                {s.name}
              </div>
              {s.description && <div className="text-xs text-gray-400 truncate">{s.description}</div>}
              <div className="hidden group-hover:flex gap-2 mt-1">
                <span onClick={e => { e.stopPropagation(); openEdit(s) }} className="text-xs text-blue-600 hover:text-blue-800">Edit</span>
                <span onClick={e => { e.stopPropagation(); setDeleting(s) }} className="text-xs text-red-500 hover:text-red-700">Delete</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const right = selected
    ? <RulesPanel subject={selected} />
    : <EmptyState title="Select a subject" description="Choose a subject on the left to view and manage its rules." />

  return (
    <>
      <PageHeader title="Subjects & Rules" action={
        <button onClick={openNew} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
          + New subject
        </button>
      } />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        <SplitPane left={left} right={right} />
      </div>

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit subject' : 'New subject'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <SubjectForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete subject "${deleting?.name}" and all its rules? This cannot be undone.`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          await mutations.remove.mutateAsync(deleting!.id)
          if (selected?.id === deleting?.id) setSelected(null)
          setDeleting(null)
        }}
        confirming={mutations.remove.isPending}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd admin && npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke test**

Start backend (`cd backend && npm run dev`) and admin (`cd admin && npm run dev`). Sign in → go to Subjects & Rules. Create a subject. Select it. Add a keyword rule. Verify rule appears in the list. Edit the rule. Delete it.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/SubjectsPage.tsx
git commit -m "feat(admin): SubjectsPage with master/detail + rule modal"
```

---

### Task 13: OrgPage

**Files:**
- Modify: `admin/src/pages/OrgPage.tsx`

- [ ] **Step 1: Implement `admin/src/pages/OrgPage.tsx`**

```tsx
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { MillerColumns } from '../components/ui/MillerColumns'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useDivisions, useDivisionMutations } from '../hooks/useDivisions'
import { useTeams, useTeamMembers, useTeamMutations } from '../hooks/useTeams'
import { useMemberMutations } from '../hooks/useMembers'

function NameForm({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        value={value}
        onChange={e => onChange(e.target.value)}
        autoFocus
      />
    </div>
  )
}

function MemberForm({
  value, onChange,
}: {
  value: { email: string; displayName: string }
  onChange: (v: { email: string; displayName: string }) => void
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
        <input
          type="email"
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          value={value.email}
          onChange={e => onChange({ ...value, email: e.target.value })}
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Display name (optional)</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          value={value.displayName}
          onChange={e => onChange({ ...value, displayName: e.target.value })}
        />
      </div>
    </>
  )
}

type ModalState =
  | { type: 'none' }
  | { type: 'division'; id: string | null; name: string }
  | { type: 'team'; id: string | null; name: string }
  | { type: 'member'; id: string | null; email: string; displayName: string }

type ConfirmState =
  | { type: 'none' }
  | { type: 'division'; id: string; name: string }
  | { type: 'team'; id: string; name: string }
  | { type: 'member'; id: string; label: string }

export function OrgPage() {
  const [selectedDivisionId, setSelectedDivisionId] = useState<string | null>(null)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [modal, setModal] = useState<ModalState>({ type: 'none' })
  const [confirm, setConfirm] = useState<ConfirmState>({ type: 'none' })

  const { data: divisions = [], isLoading: loadingDivs } = useDivisions()
  const { data: teams = [], isLoading: loadingTeams } = useTeams(selectedDivisionId)
  const { data: members = [], isLoading: loadingMembers } = useTeamMembers(selectedTeamId)

  const divMutations = useDivisionMutations()
  const teamMutations = useTeamMutations(selectedDivisionId)
  const memberMutations = useMemberMutations(selectedTeamId)

  function closeModal() { setModal({ type: 'none' }) }
  function closeConfirm() { setConfirm({ type: 'none' }) }

  async function handleSave() {
    if (modal.type === 'division') {
      if (modal.id) await divMutations.update.mutateAsync({ id: modal.id, name: modal.name })
      else await divMutations.create.mutateAsync(modal.name)
    } else if (modal.type === 'team') {
      if (modal.id) await teamMutations.update.mutateAsync({ id: modal.id, name: modal.name })
      else await teamMutations.create.mutateAsync(modal.name)
    } else if (modal.type === 'member') {
      if (!modal.id) {
        await memberMutations.create.mutateAsync({ email: modal.email, displayName: modal.displayName || undefined })
      }
    }
    closeModal()
  }

  async function handleConfirmDelete() {
    if (confirm.type === 'division') await divMutations.remove.mutateAsync(confirm.id)
    else if (confirm.type === 'team') await teamMutations.remove.mutateAsync(confirm.id)
    else if (confirm.type === 'member') await memberMutations.remove.mutateAsync(confirm.id)
    closeConfirm()
  }

  const isSaving =
    divMutations.create.isPending || divMutations.update.isPending ||
    teamMutations.create.isPending || teamMutations.update.isPending ||
    memberMutations.create.isPending

  const isDeleting =
    divMutations.remove.isPending || teamMutations.remove.isPending || memberMutations.remove.isPending

  const columns = [
    {
      title: 'Divisions',
      items: divisions.map(d => ({ id: d.id, label: d.name })),
      selectedId: selectedDivisionId,
      onSelect: (id: string) => { setSelectedDivisionId(id); setSelectedTeamId(null) },
      onAdd: () => setModal({ type: 'division', id: null, name: '' }),
      onEdit: (id: string) => {
        const d = divisions.find(x => x.id === id)
        if (d) setModal({ type: 'division', id, name: d.name })
      },
      onDelete: (id: string) => {
        const d = divisions.find(x => x.id === id)
        if (d) setConfirm({ type: 'division', id, name: d.name })
      },
      loading: loadingDivs,
    },
    {
      title: 'Teams',
      items: teams.map(t => ({ id: t.id, label: t.name })),
      selectedId: selectedTeamId,
      onSelect: setSelectedTeamId,
      onAdd: selectedDivisionId ? () => setModal({ type: 'team', id: null, name: '' }) : undefined,
      onEdit: (id: string) => {
        const t = teams.find(x => x.id === id)
        if (t) setModal({ type: 'team', id, name: t.name })
      },
      onDelete: (id: string) => {
        const t = teams.find(x => x.id === id)
        if (t) setConfirm({ type: 'team', id, name: t.name })
      },
      loading: loadingTeams,
    },
    {
      title: 'Members',
      items: members.map(m => ({
        id: m.id,
        label: m.displayName ?? m.email,
        sublabel: m.email !== (m.displayName ?? '') ? m.email : undefined,
      })),
      selectedId: null,
      onSelect: () => {},
      onAdd: selectedTeamId ? () => setModal({ type: 'member', id: null, email: '', displayName: '' }) : undefined,
      onDelete: (id: string) => {
        const m = members.find(x => x.id === id)
        if (m) setConfirm({ type: 'member', id, label: m.displayName ?? m.email })
      },
      loading: loadingMembers,
    },
  ]

  const modalTitle =
    modal.type === 'division' ? (modal.id ? 'Edit division' : 'New division') :
    modal.type === 'team'     ? (modal.id ? 'Edit team'     : 'New team')     :
    modal.type === 'member'   ? 'Add member' : ''

  const confirmMessage =
    confirm.type === 'division' ? `Delete division "${confirm.name}"?` :
    confirm.type === 'team'     ? `Delete team "${confirm.name}"?` :
    confirm.type === 'member'   ? `Remove "${confirm.label}" from this team?` : ''

  return (
    <>
      <PageHeader title="Org Structure" />
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden" style={{ height: 'calc(100vh - 200px)' }}>
        <MillerColumns columns={columns} />
      </div>

      <EntityModal
        open={modal.type !== 'none'}
        title={modalTitle}
        onClose={closeModal}
        onSave={handleSave}
        saving={isSaving}
      >
        {modal.type === 'division' && (
          <NameForm label="Division name" value={modal.name} onChange={name => setModal(m => ({ ...m as typeof modal & { type: 'division' }, name }))} />
        )}
        {modal.type === 'team' && (
          <NameForm label="Team name" value={modal.name} onChange={name => setModal(m => ({ ...m as typeof modal & { type: 'team' }, name }))} />
        )}
        {modal.type === 'member' && (
          <MemberForm
            value={{ email: modal.email, displayName: modal.displayName }}
            onChange={v => setModal(m => ({ ...m as typeof modal & { type: 'member' }, ...v }))}
          />
        )}
      </EntityModal>

      <ConfirmModal
        open={confirm.type !== 'none'}
        message={confirmMessage}
        onClose={closeConfirm}
        onConfirm={handleConfirmDelete}
        confirming={isDeleting}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck**

```bash
cd admin && npm run typecheck
```

Expected: exits 0.

- [ ] **Step 3: Manual smoke test**

With backend running: navigate to Org Structure. Create a division. Select it. Create a team. Select the team. Add a member. Verify member appears in the third column.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/OrgPage.tsx
git commit -m "feat(admin): OrgPage with 3-column Miller drill-down"
```

---

### Task 14: DestinationsPage

**Files:**
- Modify: `admin/src/pages/DestinationsPage.tsx`

- [ ] **Step 1: Implement `admin/src/pages/DestinationsPage.tsx`**

```tsx
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useDestinationGroups, useDestinationGroupMutations } from '../hooks/useDestinationGroups'
import type { DestinationGroup } from '../types'

const blank = { name: '', domains: '' }

function GroupForm({ value, onChange }: { value: typeof blank; onChange: (v: typeof blank) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          value={value.name}
          onChange={e => onChange({ ...value, name: e.target.value })}
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Domains (one per line)</label>
        <textarea
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          rows={4}
          value={value.domains}
          onChange={e => onChange({ ...value, domains: e.target.value })}
          placeholder="chatgpt.com&#10;claude.ai&#10;gemini.google.com"
        />
      </div>
    </>
  )
}

export function DestinationsPage() {
  const { data: groups = [], isLoading } = useDestinationGroups()
  const mutations = useDestinationGroupMutations()
  const [modal, setModal] = useState<{ open: boolean; editing: DestinationGroup | null; form: typeof blank }>({
    open: false, editing: null, form: blank,
  })
  const [deleting, setDeleting] = useState<DestinationGroup | null>(null)

  function openNew() { setModal({ open: true, editing: null, form: blank }) }
  function openEdit(g: DestinationGroup) {
    setModal({ open: true, editing: g, form: { name: g.name, domains: g.domains.join('\n') } })
  }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  async function handleSave() {
    const domains = modal.form.domains.split('\n').map(s => s.trim()).filter(Boolean)
    if (modal.editing) {
      await mutations.update.mutateAsync({ id: modal.editing.id, data: { name: modal.form.name, domains } })
    } else {
      await mutations.create.mutateAsync({ name: modal.form.name, domains })
    }
    closeModal()
  }

  return (
    <>
      <PageHeader
        title="Destination Groups"
        action={
          <button onClick={openNew} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            + New group
          </button>
        }
      />

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="No destination groups"
          description="Group LLM destinations together to apply rules to sets of sites."
          action={{ label: '+ New group', onClick: openNew }}
        />
      ) : (
        <div className="grid gap-3">
          {groups.map(g => (
            <div key={g.id} className="flex items-start justify-between p-4 bg-white border border-gray-200 rounded-xl">
              <div>
                <div className="font-medium text-gray-900">{g.name}</div>
                <div className="text-sm text-gray-500 mt-0.5">{g.domains.join(', ') || 'No domains'}</div>
              </div>
              <div className="flex gap-3 shrink-0 ml-4">
                <button onClick={() => openEdit(g)} className="text-sm text-blue-600 hover:text-blue-800">Edit</button>
                <button onClick={() => setDeleting(g)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit group' : 'New destination group'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <GroupForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete destination group "${deleting?.name}"?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await mutations.remove.mutateAsync(deleting!.id); setDeleting(null) }}
        confirming={mutations.remove.isPending}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd admin && npm run typecheck
git add admin/src/pages/DestinationsPage.tsx
git commit -m "feat(admin): DestinationsPage CRUD"
```

---

### Task 15: SitesPage

**Files:**
- Modify: `admin/src/pages/SitesPage.tsx`

- [ ] **Step 1: Implement `admin/src/pages/SitesPage.tsx`**

```tsx
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { EntityModal } from '../components/ui/EntityModal'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { useSiteConfigs, useSiteConfigMutations } from '../hooks/useSiteConfigs'
import type { SiteConfig } from '../types'

const blank = { domain: '', inputSelector: '', sendButtonSelector: '' }

function SiteForm({ value, onChange }: { value: typeof blank; onChange: (v: typeof blank) => void }) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.domain}
          onChange={e => onChange({ ...value, domain: e.target.value })}
          placeholder="chat.openai.com"
          autoFocus
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Input selector (CSS)</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.inputSelector}
          onChange={e => onChange({ ...value, inputSelector: e.target.value })}
          placeholder="#prompt-textarea"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Send button selector (CSS)</label>
        <input
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          value={value.sendButtonSelector}
          onChange={e => onChange({ ...value, sendButtonSelector: e.target.value })}
          placeholder="button[data-testid='send-button']"
        />
      </div>
    </>
  )
}

export function SitesPage() {
  const { data: configs = [], isLoading } = useSiteConfigs()
  const mutations = useSiteConfigMutations()
  const [modal, setModal] = useState<{ open: boolean; editing: SiteConfig | null; form: typeof blank }>({
    open: false, editing: null, form: blank,
  })
  const [deleting, setDeleting] = useState<SiteConfig | null>(null)

  function openNew() { setModal({ open: true, editing: null, form: blank }) }
  function openEdit(c: SiteConfig) {
    setModal({ open: true, editing: c, form: { domain: c.domain, inputSelector: c.inputSelector, sendButtonSelector: c.sendButtonSelector } })
  }
  function closeModal() { setModal(m => ({ ...m, open: false })) }

  async function handleSave() {
    const { domain, inputSelector, sendButtonSelector } = modal.form
    if (modal.editing) {
      await mutations.update.mutateAsync({ domain: modal.editing.domain, data: { inputSelector, sendButtonSelector } })
    } else {
      await mutations.create.mutateAsync({ domain, inputSelector, sendButtonSelector })
    }
    closeModal()
  }

  return (
    <>
      <PageHeader
        title="Site Configs"
        action={
          <button onClick={openNew} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            + New site
          </button>
        }
      />

      {isLoading ? (
        <div className="text-sm text-gray-400">Loading…</div>
      ) : configs.length === 0 ? (
        <EmptyState
          title="No site configs"
          description="Add custom CSS selectors for sites not covered by built-in adapters."
          action={{ label: '+ New site', onClick: openNew }}
        />
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-3">Domain</th>
                <th className="px-4 py-3">Input selector</th>
                <th className="px-4 py-3">Send button selector</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {configs.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono font-medium text-gray-900">{c.domain}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 max-w-xs truncate">{c.inputSelector}</td>
                  <td className="px-4 py-3 font-mono text-gray-600 max-w-xs truncate">{c.sendButtonSelector}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-3 justify-end">
                      <button onClick={() => openEdit(c)} className="text-blue-600 hover:text-blue-800">Edit</button>
                      <button onClick={() => setDeleting(c)} className="text-red-500 hover:text-red-700">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <EntityModal
        open={modal.open}
        title={modal.editing ? 'Edit site config' : 'New site config'}
        onClose={closeModal}
        onSave={handleSave}
        saving={mutations.create.isPending || mutations.update.isPending}
      >
        <SiteForm value={modal.form} onChange={form => setModal(m => ({ ...m, form }))} />
      </EntityModal>

      <ConfirmModal
        open={!!deleting}
        message={`Delete site config for "${deleting?.domain}"?`}
        onClose={() => setDeleting(null)}
        onConfirm={async () => { await mutations.remove.mutateAsync(deleting!.domain); setDeleting(null) }}
        confirming={mutations.remove.isPending}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd admin && npm run typecheck
git add admin/src/pages/SitesPage.tsx
git commit -m "feat(admin): SitesPage CRUD"
```

---

### Task 16: PublishPage

**Files:**
- Modify: `admin/src/pages/PublishPage.tsx`

- [ ] **Step 1: Implement `admin/src/pages/PublishPage.tsx`**

```tsx
import { useState } from 'react'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/EmptyState'
import { ConfirmModal } from '../components/ui/ConfirmModal'
import { usePolicy, usePolicyHistory, usePolicyMutations } from '../hooks/usePolicy'

export function PublishPage() {
  const { data: policy, isLoading: loadingPolicy } = usePolicy()
  const { data: history = [], isLoading: loadingHistory } = usePolicyHistory()
  const { publish, rollback } = usePolicyMutations()
  const [rollbackVersion, setRollbackVersion] = useState<number | null>(null)

  return (
    <>
      <PageHeader title="Publish" />

      {/* Current state */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-900">Current published policy</h2>
            {loadingPolicy ? (
              <p className="text-sm text-gray-400 mt-1">Loading…</p>
            ) : policy ? (
              <p className="text-sm text-gray-500 mt-1">Version {policy.version} · {policy.tenantName} · {policy.plan}</p>
            ) : (
              <p className="text-sm text-gray-400 mt-1">No policy published yet</p>
            )}
          </div>
          <button
            onClick={() => publish.mutate()}
            disabled={publish.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {publish.isPending ? 'Publishing…' : 'Publish now'}
          </button>
        </div>
        {policy?.warning && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
            ⚠ {policy.warning === 'subscription_expiring' ? 'Subscription expiring soon' : policy.warning}
          </div>
        )}
      </div>

      {/* History */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Published versions</h2>
        </div>
        {loadingHistory ? (
          <div className="p-6 text-sm text-gray-400">Loading…</div>
        ) : history.length === 0 ? (
          <EmptyState title="No versions yet" description="Publish your first policy to see history here." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                <th className="px-6 py-3">Version</th>
                <th className="px-6 py-3">Published at</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {history.map(h => (
                <tr key={h.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">v{h.version}</td>
                  <td className="px-6 py-3 text-gray-500">
                    {new Date(h.publishedAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => setRollbackVersion(h.version)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      Rollback to this
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmModal
        open={rollbackVersion !== null}
        message={`Roll back to v${rollbackVersion}? This will republish that snapshot as the current policy.`}
        onClose={() => setRollbackVersion(null)}
        onConfirm={async () => {
          await rollback.mutateAsync(rollbackVersion!)
          setRollbackVersion(null)
        }}
        confirming={rollback.isPending}
      />
    </>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd admin && npm run typecheck
git add admin/src/pages/PublishPage.tsx
git commit -m "feat(admin): PublishPage with history + rollback"
```

---

### Task 17: SettingsPage

**Files:**
- Modify: `admin/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Implement `admin/src/pages/SettingsPage.tsx`**

```tsx
import { PageHeader } from '../components/ui/PageHeader'
import { useTenant } from '../hooks/useTenant'

export function SettingsPage() {
  const { data: tenant, isLoading, isError } = useTenant()

  return (
    <>
      <PageHeader title="Settings" />

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4 max-w-lg">
        <h2 className="font-semibold text-gray-900">Organisation</h2>

        {isLoading && <p className="text-sm text-gray-400">Loading…</p>}
        {isError && <p className="text-sm text-red-500">Could not load tenant info.</p>}

        {tenant && (
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">Name</dt>
              <dd className="text-gray-900 font-medium">{tenant.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Slug</dt>
              <dd className="text-gray-900 font-mono">{tenant.slug}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Plan</dt>
              <dd className="text-gray-900 capitalize">{tenant.plan}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Subscription status</dt>
              <dd className={`font-medium capitalize ${
                tenant.subscriptionStatus === 'active' ? 'text-green-600' :
                tenant.subscriptionStatus === 'past_due' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {tenant.subscriptionStatus.replace('_', ' ')}
              </dd>
            </div>
          </dl>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Typecheck + commit**

```bash
cd admin && npm run typecheck
git add admin/src/pages/SettingsPage.tsx
git commit -m "feat(admin): SettingsPage showing tenant info"
```

---

### Task 18: Final tests + full typecheck

**Files:**
- Verify: all tests pass
- Verify: typecheck clean

- [ ] **Step 1: Run all admin tests**

```bash
cd admin && npm test
```

Expected: `api.test.ts` (3 tests) + `MillerColumns.test.tsx` (4 tests) all PASS.

- [ ] **Step 2: Run all backend tests**

```bash
cd backend && npm test
```

Expected: all tests PASS including the new `GET /v1/teams/:teamId/members` tests.

- [ ] **Step 3: Full admin typecheck**

```bash
cd admin && npm run typecheck
```

Expected: 0 errors.

- [ ] **Step 4: End-to-end smoke test**

With backend running (`cd backend && npm run dev`), start admin (`cd admin && npm run dev`):

1. Open http://localhost:5173 → redirected to /login
2. Enter a valid `ps_adm_` token → navigates to /subjects
3. Create a subject, add rules of each kind
4. Go to Org Structure → create division, team, add member
5. Go to Destination Groups → create a group with a domain
6. Go to Site Configs → create a site config
7. Go to Publish → click "Publish now" → see v1 in history
8. Go to Settings → see tenant name and plan

- [ ] **Step 5: Commit final state**

```bash
git add -A
git commit -m "feat(admin): complete admin console implementation"
```
