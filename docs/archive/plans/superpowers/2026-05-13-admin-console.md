# Admin Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone React + Tailwind web app in `admin/` that lets a law firm IT admin manage matters, publish policy, view history, and check billing status using their admin_token.

**Architecture:** Separate Vite SPA in `admin/` (not the Chrome extension). Authenticates by storing the admin_token in localStorage and sending it as `Authorization: Bearer` on every API call. Four pages rendered via tab state: Matters, Policy, History, Settings. An `api.ts` module provides typed fetch wrappers for all backend endpoints — this is the only testable layer; page components are manual-tested.

**Tech Stack:** React 18, TypeScript 5, Tailwind 3, Vite 5, Vitest 1, no routing library (tab state only), no state management library.

---

## File Map

New files — all under `admin/`:

```
index.html
package.json
tsconfig.json
vite.config.ts
tailwind.config.ts
postcss.config.js
.env.example
src/
  main.tsx              — React entry point
  api.ts                — typed fetch wrappers + token storage
  App.tsx               — auth gate + tab shell
  pages/
    LoginPage.tsx       — admin_token entry + verify
    MattersPage.tsx     — CRUD for client matters
    PolicyPage.tsx      — current policy preview + publish button
    HistoryPage.tsx     — version history + rollback
    SettingsPage.tsx    — tenant info + sign out
tests/
  api.test.ts           — unit tests for api.ts (fetch mock)
```

---

### Task 1: Scaffold admin project

**Files:**
- Create: `admin/package.json`
- Create: `admin/tsconfig.json`
- Create: `admin/vite.config.ts`
- Create: `admin/tailwind.config.ts`
- Create: `admin/postcss.config.js`
- Create: `admin/index.html`
- Create: `admin/.env.example`

- [ ] **Step 1: Create `admin/package.json`**

```json
{
  "name": "promptshield-admin",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^24.1.1",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `admin/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `admin/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
```

- [ ] **Step 4: Create `admin/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config
```

- [ ] **Step 5: Create `admin/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create `admin/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>PromptShield Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `admin/.env.example`**

```
VITE_API_BASE=http://localhost:3000
```

- [ ] **Step 8: Install dependencies**

```bash
cd admin && npm install
```

Expected: `node_modules` populated, no errors.

- [ ] **Step 9: Commit**

```bash
git add admin/package.json admin/tsconfig.json admin/vite.config.ts admin/tailwind.config.ts admin/postcss.config.js admin/index.html admin/.env.example
git commit -m "feat(admin): scaffold Vite + React + Tailwind project"
```

---

### Task 2: API client

**Files:**
- Create: `admin/src/api.ts`
- Create: `admin/tests/api.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// admin/tests/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const store: Record<string, string> = {}
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = v },
  removeItem: (k: string) => { delete store[k] },
})

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { setToken, getToken, clearToken, api, AdminApiError } = await import('../src/api.js')

function ok(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    statusText: 'OK',
  })
}

function err(status: number, body: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
    statusText: 'Error',
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  Object.keys(store).forEach(k => delete store[k])
})

describe('token helpers', () => {
  it('setToken / getToken round-trip', () => {
    setToken('ps_adm_acme_abc123')
    expect(getToken()).toBe('ps_adm_acme_abc123')
  })

  it('clearToken removes the stored token', () => {
    setToken('ps_adm_acme_abc123')
    clearToken()
    expect(getToken()).toBeNull()
  })
})

describe('api.matters.list', () => {
  it('calls GET /v1/matters with Bearer header', async () => {
    setToken('ps_adm_acme_token')
    mockFetch.mockReturnValueOnce(ok([]))
    await api.matters.list()
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters'),
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer ps_adm_acme_token' }),
      })
    )
  })

  it('throws AdminApiError on 401', async () => {
    setToken('bad')
    mockFetch.mockReturnValueOnce(err(401, { error: 'Unauthorized' }))
    await expect(api.matters.list()).rejects.toBeInstanceOf(AdminApiError)
    await expect(api.matters.list().catch(e => (e as AdminApiError).status)).resolves.toBe(401)
  })
})

describe('api.matters.create', () => {
  it('calls POST /v1/matters with body', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ id: '1', clientName: 'Acme' }))
    await api.matters.create({ clientName: 'Acme', matterNumber: 'AC-001' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ clientName: 'Acme', matterNumber: 'AC-001' }),
      })
    )
  })
})

describe('api.matters.update', () => {
  it('calls PATCH /v1/matters/:id', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ id: 'abc', clientName: 'New' }))
    await api.matters.update('abc', { clientName: 'New' })
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters/abc'),
      expect.objectContaining({ method: 'PATCH' })
    )
  })
})

describe('api.matters.remove', () => {
  it('calls DELETE /v1/matters/:id', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce({ ok: true, status: 204, json: () => Promise.resolve(undefined), statusText: 'No Content' })
    await api.matters.remove('abc')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/matters/abc'),
      expect.objectContaining({ method: 'DELETE' })
    )
  })
})

describe('api.policy.publish', () => {
  it('calls POST /v1/policy/publish', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ version: 3 }))
    const res = await api.policy.publish()
    expect(res.version).toBe(3)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/policy/publish'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('api.policy.rollback', () => {
  it('calls POST /v1/policy/rollback/:version', async () => {
    setToken('tok')
    mockFetch.mockReturnValueOnce(ok({ version: 4 }))
    await api.policy.rollback(2)
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/policy/rollback/2'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})
```

Run: `cd admin && npm test`
Expected: FAIL — `../src/api.js` not found.

- [ ] **Step 2: Create `admin/src/api.ts`**

```typescript
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.['VITE_API_BASE'])
  ? (import.meta.env['VITE_API_BASE'] as string)
  : 'http://localhost:3000'

const TOKEN_KEY = 'ps_admin_token'

export class AdminApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'AdminApiError'
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

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

export interface Matter {
  id: string
  tenantId: string
  clientName: string
  matterName: string | null
  matterNumber: string | null
  opposingParties: string[]
  active: boolean
  createdAt: string
}

export interface CreateMatterInput {
  clientName: string
  matterName?: string
  matterNumber?: string
  opposingParties?: string[]
}

export interface PolicyInfo {
  version: number
  policy: unknown
  tenantName: string
  plan: string
  expiresAt: string | null
  warning?: string
}

export interface HistoryEntry {
  version: number
  publishedAt: string
}

export const api = {
  matters: {
    list: () => request<Matter[]>('GET', '/v1/matters'),
    create: (data: CreateMatterInput) => request<Matter>('POST', '/v1/matters', data),
    update: (id: string, data: Partial<CreateMatterInput & { active: boolean }>) =>
      request<Matter>('PATCH', `/v1/matters/${id}`, data),
    remove: (id: string) => request<void>('DELETE', `/v1/matters/${id}`),
  },
  policy: {
    get: () => request<PolicyInfo>('GET', '/v1/policy'),
    publish: () => request<{ version: number }>('POST', '/v1/policy/publish', {}),
    history: () => request<HistoryEntry[]>('GET', '/v1/policy/history'),
    rollback: (version: number) =>
      request<{ version: number }>('POST', `/v1/policy/rollback/${version}`),
  },
}
```

- [ ] **Step 3: Run tests**

Run: `cd admin && npm test`
Expected: all 10 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add admin/src/api.ts admin/tests/api.test.ts
git commit -m "feat(admin): typed API client with token storage"
```

---

### Task 3: App shell, main entry, Tailwind styles, and LoginPage

**Files:**
- Create: `admin/src/main.tsx`
- Create: `admin/src/index.css`
- Create: `admin/src/App.tsx`
- Create: `admin/src/pages/LoginPage.tsx`

- [ ] **Step 1: Create `admin/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 2: Create `admin/src/main.tsx`**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import { App } from './App'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 3: Create `admin/src/pages/LoginPage.tsx`**

```tsx
import React, { useState } from 'react'
import { setToken, api, AdminApiError } from '../api'

interface Props {
  onLogin: () => void
}

export function LoginPage({ onLogin }: Props) {
  const [token, setTokenInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!token.trim()) return
    setLoading(true)
    setError(null)
    try {
      setToken(token.trim())
      await api.matters.list()
      onLogin()
    } catch (err) {
      setToken('')
      if (err instanceof AdminApiError) {
        setError(err.status === 401 || err.status === 403
          ? 'Invalid token — check it starts with ps_adm_ and belongs to your organisation.'
          : `Server error (${err.status}): ${err.message}`)
      } else {
        setError('Could not reach the server. Is the backend running?')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold">
            PS
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">PromptShield Admin</h1>
            <p className="text-sm text-gray-500">Enter your admin token to continue</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
              Admin token
            </label>
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

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

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

- [ ] **Step 4: Create `admin/src/App.tsx`**

```tsx
import React, { useState } from 'react'
import { getToken, clearToken } from './api'
import { LoginPage } from './pages/LoginPage'
import { MattersPage } from './pages/MattersPage'
import { PolicyPage } from './pages/PolicyPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'

type Tab = 'matters' | 'policy' | 'history' | 'settings'

const TABS: { id: Tab; label: string }[] = [
  { id: 'matters', label: 'Matters' },
  { id: 'policy', label: 'Policy' },
  { id: 'history', label: 'History' },
  { id: 'settings', label: 'Settings' },
]

export function App() {
  const [authed, setAuthed] = useState(() => getToken() !== null)
  const [activeTab, setActiveTab] = useState<Tab>('matters')

  function handleSignOut() {
    clearToken()
    setAuthed(false)
  }

  if (!authed) {
    return <LoginPage onLogin={() => setAuthed(true)} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center gap-3">
          <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            PS
          </div>
          <h1 className="text-xl font-semibold text-gray-900">PromptShield Admin</h1>
          <button
            onClick={handleSignOut}
            className="ml-auto text-xs text-gray-500 hover:text-gray-800"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {activeTab === 'matters' && <MattersPage />}
        {activeTab === 'policy' && <PolicyPage />}
        {activeTab === 'history' && <HistoryPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>
    </div>
  )
}
```

- [ ] **Step 5: Create stub pages** so the app compiles

Create `admin/src/pages/MattersPage.tsx`:
```tsx
import React from 'react'
export function MattersPage() { return <div>Matters</div> }
```

Create `admin/src/pages/PolicyPage.tsx`:
```tsx
import React from 'react'
export function PolicyPage() { return <div>Policy</div> }
```

Create `admin/src/pages/HistoryPage.tsx`:
```tsx
import React from 'react'
export function HistoryPage() { return <div>History</div> }
```

Create `admin/src/pages/SettingsPage.tsx`:
```tsx
import React from 'react'
export function SettingsPage() { return <div>Settings</div> }
```

- [ ] **Step 6: Verify app builds**

```bash
cd admin && npm run build
```

Expected: `dist/` created, no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add admin/src/
git commit -m "feat(admin): app shell, auth gate, and login page"
```

---

### Task 4: Matters page

**Files:**
- Modify: `admin/src/pages/MattersPage.tsx` (replace stub)

- [ ] **Step 1: Replace `admin/src/pages/MattersPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { api, AdminApiError, type Matter, type CreateMatterInput } from '../api'

type Status = { kind: 'idle' } | { kind: 'error'; msg: string } | { kind: 'success'; msg: string }

interface EditState {
  matterId: string
  clientName: string
  matterName: string
  matterNumber: string
  opposingParties: string
}

export function MattersPage() {
  const [matters, setMatters] = useState<Matter[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<EditState | null>(null)

  // Add form state
  const [addClient, setAddClient] = useState('')
  const [addMatterName, setAddMatterName] = useState('')
  const [addMatterNumber, setAddMatterNumber] = useState('')
  const [addOpposing, setAddOpposing] = useState('')

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      setMatters(await api.matters.list())
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to load' })
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!addClient.trim()) return
    try {
      const data: CreateMatterInput = {
        clientName: addClient.trim(),
        ...(addMatterName.trim() ? { matterName: addMatterName.trim() } : {}),
        ...(addMatterNumber.trim() ? { matterNumber: addMatterNumber.trim() } : {}),
        ...(addOpposing.trim()
          ? { opposingParties: addOpposing.split(',').map(s => s.trim()).filter(Boolean) }
          : {}),
      }
      const created = await api.matters.create(data)
      setMatters(prev => [created, ...prev])
      setAddClient(''); setAddMatterName(''); setAddMatterNumber(''); setAddOpposing('')
      setShowAdd(false)
      setStatus({ kind: 'success', msg: 'Matter added.' })
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to add' })
    }
  }

  async function handleDeactivate(id: string) {
    try {
      await api.matters.update(id, { active: false })
      setMatters(prev => prev.filter(m => m.id !== id))
      setStatus({ kind: 'success', msg: 'Matter deactivated.' })
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed' })
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault()
    if (!editing) return
    try {
      const updated = await api.matters.update(editing.matterId, {
        clientName: editing.clientName,
        matterName: editing.matterName || undefined,
        matterNumber: editing.matterNumber || undefined,
        opposingParties: editing.opposingParties
          ? editing.opposingParties.split(',').map(s => s.trim()).filter(Boolean)
          : [],
      })
      setMatters(prev => prev.map(m => m.id === updated.id ? updated : m))
      setEditing(null)
      setStatus({ kind: 'success', msg: 'Matter updated.' })
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed' })
    }
  }

  const filtered = matters.filter(m =>
    m.clientName.toLowerCase().includes(search.toLowerCase()) ||
    (m.matterNumber ?? '').toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Client Matters</h2>
          <p className="text-sm text-gray-500 mt-0.5">Active matters are compiled into the detection policy.</p>
        </div>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
        >
          {showAdd ? 'Cancel' : '+ Add matter'}
        </button>
      </div>

      {status.kind !== 'idle' && (
        <div className={`p-3 rounded-lg text-sm border ${
          status.kind === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {status.msg}
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-gray-800">New matter</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client name *</label>
              <input value={addClient} onChange={e => setAddClient(e.target.value)} required
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Matter number</label>
              <input value={addMatterNumber} onChange={e => setAddMatterNumber(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Matter name</label>
              <input value={addMatterName} onChange={e => setAddMatterName(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Opposing parties (comma-separated)</label>
              <input value={addOpposing} onChange={e => setAddOpposing(e.target.value)}
                placeholder="Acme Inc, Widget Corp"
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)}
              className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit"
              className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
              Add
            </button>
          </div>
        </form>
      )}

      <div>
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by client name or matter number…"
          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
        />

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-gray-400">{search ? 'No matches.' : 'No active matters. Add one above.'}</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(m => (
              <div key={m.id}>
                {editing?.matterId === m.id ? (
                  <form onSubmit={handleEdit} className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Client name *</label>
                        <input value={editing.clientName}
                          onChange={e => setEditing(p => p && ({ ...p, clientName: e.target.value }))}
                          required className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Matter number</label>
                        <input value={editing.matterNumber}
                          onChange={e => setEditing(p => p && ({ ...p, matterNumber: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Matter name</label>
                        <input value={editing.matterName}
                          onChange={e => setEditing(p => p && ({ ...p, matterName: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Opposing parties</label>
                        <input value={editing.opposingParties}
                          onChange={e => setEditing(p => p && ({ ...p, opposingParties: e.target.value }))}
                          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button type="button" onClick={() => setEditing(null)}
                        className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
                        Cancel
                      </button>
                      <button type="submit"
                        className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">
                        Save
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{m.clientName}</p>
                      <div className="flex flex-wrap gap-3 mt-0.5 text-xs text-gray-500">
                        {m.matterNumber && <span>#{m.matterNumber}</span>}
                        {m.matterName && <span>{m.matterName}</span>}
                        {m.opposingParties.length > 0 && (
                          <span>vs. {m.opposingParties.join(', ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <button
                        onClick={() => setEditing({
                          matterId: m.id,
                          clientName: m.clientName,
                          matterName: m.matterName ?? '',
                          matterNumber: m.matterNumber ?? '',
                          opposingParties: m.opposingParties.join(', '),
                        })}
                        className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => void handleDeactivate(m.id)}
                        className="text-xs text-red-600 hover:text-red-800 px-2 py-1 rounded"
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd admin && npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/MattersPage.tsx
git commit -m "feat(admin): matters page — add, edit, deactivate, search"
```

---

### Task 5: Policy page

**Files:**
- Modify: `admin/src/pages/PolicyPage.tsx` (replace stub)

- [ ] **Step 1: Replace `admin/src/pages/PolicyPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { api, AdminApiError, type PolicyInfo } from '../api'

type Status = { kind: 'idle' } | { kind: 'error'; msg: string } | { kind: 'success'; msg: string }

export function PolicyPage() {
  const [info, setInfo] = useState<PolicyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      setInfo(await api.policy.get())
    } catch (e) {
      if (e instanceof AdminApiError && e.status === 404) {
        setInfo(null)
      } else {
        setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to load policy' })
      }
    } finally {
      setLoading(false)
    }
  }

  async function handlePublish() {
    setPublishing(true)
    setStatus({ kind: 'idle' })
    try {
      const result = await api.policy.publish()
      setStatus({ kind: 'success', msg: `Version ${result.version} published successfully.` })
      await load()
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Publish failed' })
    } finally {
      setPublishing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Policy</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Publishing compiles your current matters into a new policy version and pushes it to all machines within 30 minutes.
          </p>
        </div>
        <button
          onClick={handlePublish}
          disabled={publishing}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
        >
          {publishing ? 'Publishing…' : 'Publish new version'}
        </button>
      </div>

      {status.kind !== 'idle' && (
        <div className={`p-3 rounded-lg text-sm border ${
          status.kind === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {status.msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : info === null ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-500">
          No policy published yet. Click "Publish new version" to create the first version from your current matters.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 mb-1">Current version</p>
              <p className="text-2xl font-bold text-gray-900">v{info.version}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 mb-1">Organisation</p>
              <p className="text-sm font-semibold text-gray-900">{info.tenantName}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex-1">
              <p className="text-xs text-gray-500 mb-1">Plan</p>
              <p className="text-sm font-semibold text-gray-900 capitalize">{info.plan}</p>
            </div>
          </div>

          {info.warning === 'subscription_expiring' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 font-medium">
              Subscription expiring soon — renew to avoid policy delivery interruption.
            </div>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Compiled policy JSON</p>
            <textarea
              readOnly
              value={JSON.stringify(info.policy, null, 2)}
              className="w-full h-[50vh] font-mono text-xs border border-gray-200 rounded-xl p-4 bg-gray-50 resize-y focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd admin && npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/PolicyPage.tsx
git commit -m "feat(admin): policy page — current version preview and publish button"
```

---

### Task 6: History page

**Files:**
- Modify: `admin/src/pages/HistoryPage.tsx` (replace stub)

- [ ] **Step 1: Replace `admin/src/pages/HistoryPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { api, AdminApiError, type HistoryEntry } from '../api'

type Status = { kind: 'idle' } | { kind: 'error'; msg: string } | { kind: 'success'; msg: string }

export function HistoryPage() {
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [rollingBack, setRollingBack] = useState<number | null>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })

  useEffect(() => { void load() }, [])

  async function load() {
    setLoading(true)
    try {
      setHistory(await api.policy.history())
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Failed to load history' })
    } finally {
      setLoading(false)
    }
  }

  async function handleRollback(version: number) {
    if (!window.confirm(`Roll back to version ${version}? This will publish it as a new version.`)) return
    setRollingBack(version)
    setStatus({ kind: 'idle' })
    try {
      const result = await api.policy.rollback(version)
      setStatus({ kind: 'success', msg: `Rolled back to v${version} — published as v${result.version}.` })
      await load()
    } catch (e) {
      setStatus({ kind: 'error', msg: e instanceof AdminApiError ? e.message : 'Rollback failed' })
    } finally {
      setRollingBack(null)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Policy History</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          All published policy versions, newest first. Roll back to re-publish any past version.
        </p>
      </div>

      {status.kind !== 'idle' && (
        <div className={`p-3 rounded-lg text-sm border ${
          status.kind === 'success'
            ? 'bg-green-50 border-green-200 text-green-800'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {status.msg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : history.length === 0 ? (
        <p className="text-sm text-gray-400">No policy versions published yet.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Version</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Published</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {history.map((entry, i) => (
                <tr key={entry.version} className={`border-b border-gray-50 ${i === 0 ? 'bg-blue-50' : ''}`}>
                  <td className="px-4 py-3 font-semibold text-gray-900">
                    v{entry.version}
                    {i === 0 && (
                      <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">
                        current
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(entry.publishedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {i > 0 && (
                      <button
                        onClick={() => void handleRollback(entry.version)}
                        disabled={rollingBack === entry.version}
                        className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-50"
                      >
                        {rollingBack === entry.version ? 'Rolling back…' : 'Roll back'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd admin && npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/HistoryPage.tsx
git commit -m "feat(admin): history page — version table and rollback"
```

---

### Task 7: Settings page

**Files:**
- Modify: `admin/src/pages/SettingsPage.tsx` (replace stub)

- [ ] **Step 1: Replace `admin/src/pages/SettingsPage.tsx`**

```tsx
import React, { useEffect, useState } from 'react'
import { api, AdminApiError, clearToken, type PolicyInfo } from '../api'

export function SettingsPage() {
  const [info, setInfo] = useState<PolicyInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.policy.get()
      .then(setInfo)
      .catch(e => setError(e instanceof AdminApiError ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  function handleSignOut() {
    clearToken()
    window.location.reload()
  }

  const statusColor: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    past_due: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-700',
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
        <p className="text-sm text-gray-500 mt-0.5">Organisation info and billing status.</p>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      ) : info === null ? (
        <p className="text-sm text-gray-400">No policy data available.</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Organisation</span>
            <span className="text-sm font-medium text-gray-900">{info.tenantName}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Plan</span>
            <span className="text-sm font-medium text-gray-900 capitalize">{info.plan}</span>
          </div>
          <div className="px-5 py-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">Policy version</span>
            <span className="text-sm font-medium text-gray-900">v{info.version}</span>
          </div>
          {info.expiresAt && (
            <div className="px-5 py-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">Renewal / expiry</span>
              <span className="text-sm font-medium text-gray-900">
                {new Date(info.expiresAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {info.warning === 'subscription_expiring' && (
            <div className="px-5 py-4">
              <div className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${statusColor['past_due'] ?? ''}`}>
                Subscription expiring soon
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pt-4 border-t border-gray-200">
        <button
          onClick={handleSignOut}
          className="px-4 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
cd admin && npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/SettingsPage.tsx
git commit -m "feat(admin): settings page — tenant info, billing status, sign out"
```

---

### Task 8: Final verification and full test run

**Files:** No new files.

- [ ] **Step 1: Run the full test suite**

```bash
cd admin && npm test
```

Expected: all tests PASS (10 tests in api.test.ts).

- [ ] **Step 2: Run typecheck**

```bash
cd admin && npm run typecheck
```

Expected: no TypeScript errors.

- [ ] **Step 3: Smoke-test the dev server**

```bash
cd admin && npm run dev
```

Open http://localhost:5173. Expected:
- Login page renders with PS logo and token input
- Entering an invalid token shows an error message
- If the backend is running (port 3000) and you have a real `ps_adm_` token, all four tabs load correctly

- [ ] **Step 4: Final commit**

```bash
git add admin/
git commit -m "feat(admin): complete admin console — matters, policy, history, settings"
```
