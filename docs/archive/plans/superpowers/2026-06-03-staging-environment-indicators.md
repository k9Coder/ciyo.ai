# Staging Environment Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `APP_ENV` env variable to staging configs so each app visually signals when it's running in staging, and the backend logs the environment on startup.

**Architecture:** A single explicit `APP_ENV=staging` var drives all three indicators. Frontend apps read their framework-prefixed variant (`VITE_APP_ENV` / `NEXT_PUBLIC_APP_ENV`) and render an amber badge near the logo. The backend reads `APP_ENV` and appends it to the existing startup log line. Production stays untouched — absent variable means no badge.

**Tech Stack:** Node.js (backend), React + Vite + Vitest (pretzel-console), Next.js (mykka-web)

---

## Files

| Action | File |
|---|---|
| Modify | `backend/.env.staging` |
| Modify | `backend/.env.example` |
| Modify | `backend/src/index.ts` |
| Modify | `pretzel-console/.env.staging` |
| Modify | `pretzel-console/.env.example` |
| Modify | `pretzel-console/src/components/layout/AppLayout.tsx` |
| Create | `pretzel-console/tests/AppLayout.staging.test.tsx` |
| Modify | `mykka-web/.env.staging` |
| Modify | `mykka-web/components/layout/Header.tsx` |

---

### Task 1: Add `APP_ENV` to env files

**Files:**
- Modify: `backend/.env.staging`
- Modify: `backend/.env.example`
- Modify: `pretzel-console/.env.staging`
- Modify: `pretzel-console/.env.example`
- Modify: `mykka-web/.env.staging`

- [ ] **Step 1: Add `APP_ENV=staging` to backend staging env**

Open `backend/.env.staging`. Append this line at the end:

```
APP_ENV=staging
```

- [ ] **Step 2: Document in backend example**

Open `backend/.env.example`. Append at the end:

```
APP_ENV=
```

- [ ] **Step 3: Add `VITE_APP_ENV=staging` to pretzel-console staging env**

Open `pretzel-console/.env.staging`. Append:

```
VITE_APP_ENV=staging
```

- [ ] **Step 4: Document in pretzel-console example**

Open `pretzel-console/.env.example`. Append:

```
VITE_APP_ENV=
```

- [ ] **Step 5: Add `NEXT_PUBLIC_APP_ENV=staging` to mykka-web staging env**

Open `mykka-web/.env.staging`. Append:

```
NEXT_PUBLIC_APP_ENV=staging
```

- [ ] **Step 6: Commit**

```bash
git add backend/.env.staging backend/.env.example \
        pretzel-console/.env.staging pretzel-console/.env.example \
        mykka-web/.env.staging
git commit -m "chore: add APP_ENV=staging to all staging env files"
```

---

### Task 2: Backend — log environment on startup

**Files:**
- Modify: `backend/src/index.ts:7`

- [ ] **Step 1: Update the startup log line**

In `backend/src/index.ts`, replace this line:

```ts
logger.info(`mykka-api starting on :${port}`)
```

With:

```ts
const appEnv = process.env['APP_ENV']
logger.info(`mykka-api starting on :${port}${appEnv ? `  [ENV: ${appEnv}]` : ''}`)
```

- [ ] **Step 2: Verify manually**

Start the backend with `APP_ENV=staging` set and confirm the log output includes `[ENV: staging]`:

```bash
cd backend && APP_ENV=staging pnpm dev
```

Expected first log line: `mykka-api starting on :3000  [ENV: staging]`

Without the var set, it should just log: `mykka-api starting on :3000`

- [ ] **Step 3: Commit**

```bash
git add backend/src/index.ts
git commit -m "feat(backend): log APP_ENV on startup"
```

---

### Task 3: pretzel-console — staging badge in sidebar

**Files:**
- Modify: `pretzel-console/src/components/layout/AppLayout.tsx:63-75`
- Create: `pretzel-console/tests/AppLayout.staging.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `pretzel-console/tests/AppLayout.staging.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@clerk/react', () => ({
  useOrganization: vi.fn(() => ({ organization: null })),
  useUser: vi.fn(() => ({ user: null })),
  UserButton: () => null,
}))
vi.mock('../src/hooks/usePolicyRealtime', () => ({ usePolicyRealtime: vi.fn() }))
vi.mock('../src/components/billing/UpgradeBanner', () => ({
  UpgradeBanner: () => null,
  PlanBadge: () => null,
}))

import { AppLayout } from '../src/components/layout/AppLayout'

afterEach(() => { vi.unstubAllEnvs() })

describe('AppLayout staging badge', () => {
  it('shows STAGING badge when VITE_APP_ENV is staging', () => {
    vi.stubEnv('VITE_APP_ENV', 'staging')
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.getByText('STAGING')).toBeInTheDocument()
  })

  it('hides STAGING badge when VITE_APP_ENV is not set', () => {
    vi.stubEnv('VITE_APP_ENV', '')
    render(<MemoryRouter><AppLayout /></MemoryRouter>)
    expect(screen.queryByText('STAGING')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd pretzel-console && pnpm test -- AppLayout.staging
```

Expected: FAIL — `Unable to find an element with the text: STAGING`

- [ ] **Step 3: Add the staging badge to AppLayout**

In `pretzel-console/src/components/layout/AppLayout.tsx`, find the logo block (around line 63–75):

```tsx
<Link to="/dashboard" style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 10,
                  textDecoration: 'none', cursor: 'pointer' }}>
  <PretzelLogo size={28} />
  <div style={{ lineHeight: 1 }}>
    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
      Pretzel
    </div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.3px' }}>
      by mykka.ai
    </div>
  </div>
</Link>
```

Replace with:

```tsx
<Link to="/dashboard" style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', gap: 10,
                  textDecoration: 'none', cursor: 'pointer' }}>
  <PretzelLogo size={28} />
  <div style={{ lineHeight: 1 }}>
    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
      Pretzel
    </div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.3px' }}>
      by mykka.ai
    </div>
    {import.meta.env['VITE_APP_ENV'] === 'staging' && (
      <div style={{
        display: 'inline-block', marginTop: 5,
        background: '#f59e0b', color: '#fff',
        fontSize: 9, fontWeight: 700, letterSpacing: '0.8px',
        padding: '2px 6px', borderRadius: 4,
      }}>
        STAGING
      </div>
    )}
  </div>
</Link>
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd pretzel-console && pnpm test -- AppLayout.staging
```

Expected: PASS (both tests)

- [ ] **Step 5: Run full test suite to check for regressions**

```bash
cd pretzel-console && pnpm test
```

Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add pretzel-console/src/components/layout/AppLayout.tsx \
        pretzel-console/tests/AppLayout.staging.test.tsx
git commit -m "feat(pretzel-console): show STAGING badge in sidebar when VITE_APP_ENV=staging"
```

---

### Task 4: mykka-web — staging badge in header

**Files:**
- Modify: `mykka-web/components/layout/Header.tsx:21-25`

mykka-web has no unit test infrastructure set up, so we skip a unit test here and verify visually.

- [ ] **Step 1: Add the staging badge to the Header logo**

In `mykka-web/components/layout/Header.tsx`, find the logo `<Link>` (line 21–25):

```tsx
<Link href="/" className="flex items-center gap-2.5 font-bold text-white">
  <span className="text-[#a78bfa]">🥨</span>
  <span className="text-[15px] tracking-tight">Pretzel</span>
  <span className="text-[11px] font-normal text-[#94a3b8]">by mykka.ai</span>
</Link>
```

Replace with:

```tsx
<Link href="/" className="flex items-center gap-2.5 font-bold text-white">
  <span className="text-[#a78bfa]">🥨</span>
  <span className="text-[15px] tracking-tight">Pretzel</span>
  {process.env.NEXT_PUBLIC_APP_ENV === 'staging' && (
    <span className="rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider bg-amber-500 text-white">
      STAGING
    </span>
  )}
  <span className="text-[11px] font-normal text-[#94a3b8]">by mykka.ai</span>
</Link>
```

- [ ] **Step 2: Verify visually**

Ensure staging env is active (run `pnpm set-env:staging` from the monorepo root if not already done), then start mykka-web:

```bash
cd mykka-web && pnpm dev
```

Open `http://localhost:3000` and confirm the amber "STAGING" pill appears next to "Pretzel" in the header. To verify it hides in production, temporarily remove `NEXT_PUBLIC_APP_ENV` from `mykka-web/.env` and restart.

- [ ] **Step 3: Commit**

```bash
git add mykka-web/components/layout/Header.tsx
git commit -m "feat(mykka-web): show STAGING badge in header when NEXT_PUBLIC_APP_ENV=staging"
```
