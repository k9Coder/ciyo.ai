# Org Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a self-serve `/onboarding` route so a newly signed-up CISO can create their Clerk organization and be auto-provisioned as a tenant without any manual steps from SafeInput.

**Architecture:** Three small changes to existing admin files + one new page. `RequireAuth` gets a split check: no org → `/onboarding`, not-admin → `/unauthorized`. `LoginPage` gets the same split. `OnboardingPage` calls Clerk's `createOrganization()` and redirects to dashboard on success. The backend webhook handler that auto-creates the tenant already exists and needs no changes.

**Tech Stack:** React, React Router v6, `@clerk/react` (`useAuth`, `useOrganizationList`), Tailwind CSS, Vitest, `@testing-library/react`

---

## File Map

**Modify:**
- `admin/src/components/layout/RequireAuth.tsx` — split `orgRole` check into `!orgId → /onboarding` and `orgRole !== 'org:admin' → /unauthorized`
- `admin/src/pages/LoginPage.tsx` — fix post-signin redirect to route `!orgId` → `/onboarding`
- `admin/src/App.tsx` — add `/onboarding` route (outside the `RequireAuth` wrapper)

**Create:**
- `admin/src/pages/OnboardingPage.tsx` — branded org creation form
- `admin/tests/RequireAuth.test.tsx` — tests for the split redirect logic
- `admin/tests/OnboardingPage.test.tsx` — tests for the onboarding form

---

## Task 1: Fix RequireAuth — split the org check

**Files:**
- Create: `admin/tests/RequireAuth.test.tsx`
- Modify: `admin/src/components/layout/RequireAuth.tsx`

- [ ] **Step 1: Write the failing tests**

Create `admin/tests/RequireAuth.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@clerk/react', () => ({ useAuth: vi.fn(), }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, Navigate: ({ to }: { to: string }) => <div data-testid={`redirect:${to}`} /> }
})

import { useAuth } from '@clerk/react'
import { RequireAuth } from '../src/components/layout/RequireAuth'

beforeEach(() => vi.clearAllMocks())

describe('RequireAuth', () => {
  it('shows loading when Clerk is not ready', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: false, isSignedIn: false, orgId: null, orgRole: null, getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByText(/loading/i)).toBeInTheDocument()
  })

  it('redirects to /login when not signed in', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false, orgId: null, orgRole: null, getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByTestId('redirect:/login')).toBeInTheDocument()
  })

  it('redirects to /onboarding when signed in but no org', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null, orgRole: null, getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByTestId('redirect:/onboarding')).toBeInTheDocument()
  })

  it('redirects to /unauthorized when has org but not admin', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: 'org_123', orgRole: 'org:member', getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child</div></RequireAuth></MemoryRouter>)
    expect(screen.getByTestId('redirect:/unauthorized')).toBeInTheDocument()
  })

  it('renders children when signed in as org admin', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: 'org_123', orgRole: 'org:admin', getToken: vi.fn() } as any)
    render(<MemoryRouter><RequireAuth><div>child content</div></RequireAuth></MemoryRouter>)
    expect(screen.getByText('child content')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
cd admin && npx vitest run tests/RequireAuth.test.tsx
```

Expected: failures on the `/onboarding` test (currently redirects to `/unauthorized`) and possibly the others.

- [ ] **Step 3: Update RequireAuth.tsx**

Replace the full file content:

```tsx
import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@clerk/react'
import { setTokenGetter } from '../../api'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, orgId, orgRole, getToken } = useAuth()

  useEffect(() => {
    if (isSignedIn) setTokenGetter(getToken)
    else setTokenGetter(null)
    return () => setTokenGetter(null)
  }, [isSignedIn, getToken])

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>
  if (!isSignedIn) return <Navigate to="/login" replace />
  if (!orgId) return <Navigate to="/onboarding" replace />
  if (orgRole !== 'org:admin') return <Navigate to="/unauthorized" replace />
  return <>{children}</>
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

```bash
npx vitest run tests/RequireAuth.test.tsx
```

Expected: 5/5 PASS.

- [ ] **Step 5: Commit**

```bash
cd ..
git add admin/src/components/layout/RequireAuth.tsx admin/tests/RequireAuth.test.tsx
git commit -m "fix(admin): split RequireAuth check — no org → /onboarding, not-admin → /unauthorized"
```

---

## Task 2: Fix LoginPage — handle no-org post-signin redirect

**Files:**
- Modify: `admin/src/pages/LoginPage.tsx`

No new test needed here — the existing redirect logic is a one-liner and covered by the `RequireAuth` tests above. The `LoginPage` redirect is a fast-path convenience; `RequireAuth` is the authoritative gate.

- [ ] **Step 1: Update the navigate call in LoginPage.tsx**

Current line 12:
```tsx
navigate(orgRole === 'org:admin' ? '/subjects' : '/unauthorized', { replace: true })
```

Replace with (also destructure `orgId` from `useAuth`):
```tsx
const { isLoaded, isSignedIn, orgId, orgRole } = useAuth()
// ...
navigate(!orgId ? '/onboarding' : orgRole === 'org:admin' ? '/dashboard' : '/unauthorized', { replace: true })
```

Full updated file:

```tsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useClerk } from '@clerk/react'

export function LoginPage() {
  const { isLoaded, isSignedIn, orgId, orgRole } = useAuth()
  const { openSignIn } = useClerk()
  const navigate = useNavigate()

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return
    navigate(!orgId ? '/onboarding' : orgRole === 'org:admin' ? '/dashboard' : '/unauthorized', { replace: true })
  }, [isLoaded, isSignedIn, orgId, orgRole, navigate])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold">SI</div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">SafeInput Admin</h1>
            <p className="text-sm text-gray-500">Sign in with your organization account</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          {!isLoaded ? (
            <p className="text-sm text-gray-500 text-center">Loading…</p>
          ) : (
            <button
              onClick={() => openSignIn()}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
            >
              Sign in with Clerk
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Run all admin tests to confirm nothing broke**

```bash
cd admin && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
cd ..
git add admin/src/pages/LoginPage.tsx
git commit -m "fix(admin): redirect to /onboarding after sign-in when no org exists"
```

---

## Task 3: Create OnboardingPage

**Files:**
- Create: `admin/tests/OnboardingPage.test.tsx`
- Create: `admin/src/pages/OnboardingPage.tsx`

- [ ] **Step 1: Write the failing tests**

Create `admin/tests/OnboardingPage.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockNavigate = vi.fn()
const mockCreateOrganization = vi.fn()

vi.mock('@clerk/react', () => ({ useAuth: vi.fn(), useOrganizationList: vi.fn() }))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => mockNavigate }
})

import { useAuth, useOrganizationList } from '@clerk/react'
import { OnboardingPage } from '../src/pages/OnboardingPage'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useOrganizationList).mockReturnValue({ isLoaded: true, createOrganization: mockCreateOrganization } as any)
})

describe('OnboardingPage', () => {
  it('redirects to /login when not signed in', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: false, orgId: null } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('redirects to /dashboard when already has an org', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: 'org_existing' } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('renders the org creation form when signed in with no org', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    expect(screen.getByPlaceholderText(/company name/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create organization/i })).toBeInTheDocument()
  })

  it('auto-generates slug from company name', () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/company name/i), { target: { value: 'Acme Law LLP' } })
    expect(screen.getByDisplayValue('acme-law-llp')).toBeInTheDocument()
  })

  it('calls createOrganization with name and slug on submit', async () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    mockCreateOrganization.mockResolvedValue({ id: 'org_new' })
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/company name/i), { target: { value: 'Acme Law LLP' } })
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }))
    await waitFor(() => expect(mockCreateOrganization).toHaveBeenCalledWith({ name: 'Acme Law LLP', slug: 'acme-law-llp' }))
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard', { replace: true })
  })

  it('shows an error message when org creation fails', async () => {
    vi.mocked(useAuth).mockReturnValue({ isLoaded: true, isSignedIn: true, orgId: null } as any)
    mockCreateOrganization.mockRejectedValue(new Error('Slug already taken'))
    render(<MemoryRouter><OnboardingPage /></MemoryRouter>)
    fireEvent.change(screen.getByPlaceholderText(/company name/i), { target: { value: 'Acme Law LLP' } })
    fireEvent.click(screen.getByRole('button', { name: /create organization/i }))
    await waitFor(() => expect(screen.getByText(/slug already taken/i)).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the tests — confirm they fail**

```bash
cd admin && npx vitest run tests/OnboardingPage.test.tsx
```

Expected: all 6 fail — `OnboardingPage` module not found.

- [ ] **Step 3: Create OnboardingPage.tsx**

Create `admin/src/pages/OnboardingPage.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, useOrganizationList } from '@clerk/react'
import { toSlug } from '../api'

export function OnboardingPage() {
  const { isLoaded, isSignedIn, orgId } = useAuth()
  const { isLoaded: listLoaded, createOrganization } = useOrganizationList()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isLoaded) return
    if (!isSignedIn) navigate('/login', { replace: true })
    else if (orgId) navigate('/dashboard', { replace: true })
  }, [isLoaded, isSignedIn, orgId, navigate])

  function handleNameChange(value: string) {
    setName(value)
    if (!slugTouched) setSlug(toSlug(value))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !slug.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await createOrganization({ name: name.trim(), slug: slug.trim() })
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isLoaded || !listLoaded) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Loading…</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center text-white font-bold">SI</div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">SafeInput Admin</h1>
            <p className="text-sm text-gray-500">Set up your organization</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Create your organization</h2>
          <p className="text-sm text-gray-500 mb-6">You can invite your team after setup.</p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company name</label>
              <input
                type="text"
                placeholder="Company name  e.g. Acme Law LLP"
                value={name}
                onChange={e => handleNameChange(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                type="text"
                placeholder="acme-law-llp"
                value={slug}
                onChange={e => { setSlug(e.target.value); setSlugTouched(true) }}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-500"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={submitting || !name.trim() || !slug.trim()}
              className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? 'Creating…' : 'Create organization'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run the tests — confirm they pass**

```bash
npx vitest run tests/OnboardingPage.test.tsx
```

Expected: 6/6 PASS.

- [ ] **Step 5: Run full admin test suite**

```bash
npx vitest run
```

Expected: all tests pass (existing + new).

- [ ] **Step 6: Commit**

```bash
cd ..
git add admin/src/pages/OnboardingPage.tsx admin/tests/OnboardingPage.test.tsx
git commit -m "feat(admin): add OnboardingPage — self-serve org creation"
```

---

## Task 4: Wire up the /onboarding route

**Files:**
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Add the route and import**

Replace `admin/src/App.tsx` with:

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/layout/RequireAuth'
import { LoginPage } from './pages/LoginPage'
import { UnauthorizedPage } from './pages/UnauthorizedPage'
import { OnboardingPage } from './pages/OnboardingPage'
import { DashboardPage } from './pages/DashboardPage'
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
          <Route path="/login"        element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />
          <Route path="/onboarding"   element={<OnboardingPage />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard"    element={<DashboardPage />} />
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

- [ ] **Step 2: Run full admin test suite**

```bash
cd admin && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add admin/src/App.tsx
git commit -m "feat(admin): add /onboarding route to app router"
```

---

## Task 5: Manual smoke test

No automated test can cover the full Clerk integration. Run this manually with a real Clerk dev environment.

**Prerequisites:**
- `admin/.env` has `VITE_CLERK_PUBLISHABLE_KEY` pointing to your dev Clerk app
- Backend running with `CLERK_WEBHOOK_SECRET` configured and webhook pointed at your backend
- `cd admin && npm run dev`

**Checklist:**

- [ ] Visit `http://localhost:5173` — should redirect to `/login`
- [ ] Sign up with a fresh email (no existing org)
- [ ] After sign-in, should land on `/onboarding`
- [ ] Enter a company name — slug should auto-populate in kebab-case
- [ ] Click "Create organization" — should briefly show "Creating…", then redirect to `/dashboard`
- [ ] Check Clerk dashboard — new org should exist with your user as Admin
- [ ] Check backend DB — `tenants` table should have a new row; `members` table should have your user with `role = 'super_admin'`
- [ ] Sign out and sign back in — should go straight to `/dashboard` (no `/onboarding` this time)
- [ ] Test the 1-org guard: while signed in with an org, visit `/onboarding` directly — should redirect to `/dashboard`
