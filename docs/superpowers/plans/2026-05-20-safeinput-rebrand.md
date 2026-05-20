# SafeInput Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the product from PromptShield → SafeInput across the browser extension, admin console, and all string references, applying the new dark/light design system.

**Architecture:** Brand tokens live in `tokens.css` in each surface (extension + admin), imported into the existing root CSS files. Tailwind configs are extended to expose token-based colour utilities. Theme toggle persists to `chrome.storage.sync` in the extension and `localStorage` in the admin.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite, Chrome Extension MV3, Vitest

---

## File Map

| Action | File |
|---|---|
| Create | `public/logo-icon.svg` |
| Create | `public/logo-dark.svg` |
| Create | `public/logo-light.svg` |
| Create | `src/styles/tokens.css` |
| Modify | `src/options/styles.css` |
| Modify | `tailwind.config.ts` |
| Create | `admin/src/styles/tokens.css` |
| Modify | `admin/src/index.css` |
| Modify | `admin/tailwind.config.ts` |
| Create | `src/shared/theme.ts` |
| Create | `admin/src/utils/theme.ts` |
| Modify | `src/popup/Popup.tsx` |
| Modify | `src/popup/index.html` |
| Modify | `src/options/App.tsx` |
| Modify | `src/options/index.html` |
| Modify | `admin/src/components/layout/AppLayout.tsx` |
| Create | `admin/src/pages/DashboardPage.tsx` |
| Modify | `admin/src/App.tsx` |
| Modify | `src/shared/constants.ts` |
| Modify | `manifest.config.ts` |
| Modify | `package.json` |
| Modify | `backend/package.json` |
| Modify | `admin/package.json` |
| Modify | `admin/index.html` |
| Modify | `README.md` |

---

## Task 1: SVG Logo Assets

**Files:**
- Create: `public/logo-icon.svg`
- Create: `public/logo-dark.svg`
- Create: `public/logo-light.svg`

- [ ] **Step 1: Create `public/logo-icon.svg`** — input field + checkmark badge, uses currentColor so it works in both themes

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" fill="none">
  <!-- Input field -->
  <rect x="8" y="24" width="64" height="32" rx="10"
        fill="var(--bg-surface, #0d1525)"
        stroke="var(--brand-primary, #00d4ff)" stroke-width="2"/>
  <!-- Text lines -->
  <rect x="17" y="36" width="26" height="2.5" rx="1.25"
        fill="var(--brand-primary, #00d4ff)" opacity="0.5"/>
  <rect x="17" y="41.5" width="16" height="2.5" rx="1.25"
        fill="var(--brand-primary, #00d4ff)" opacity="0.3"/>
  <!-- Checkmark badge -->
  <circle cx="60" cy="40" r="11"
          fill="var(--brand-primary, #00d4ff)" opacity="0.12"/>
  <circle cx="60" cy="40" r="11"
          stroke="var(--brand-primary, #00d4ff)" stroke-width="2"/>
  <path d="M55.5 40L59 43.5L65.5 37"
        stroke="var(--brand-primary, #00d4ff)" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: Create `public/logo-dark.svg`** — full lockup for dark backgrounds

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48" fill="none">
  <!-- Icon -->
  <rect x="4" y="12" width="40" height="24" rx="7"
        fill="#0d1525" stroke="#00d4ff" stroke-width="2"/>
  <rect x="10" y="21" width="16" height="2" rx="1"
        fill="#00d4ff" opacity="0.5"/>
  <rect x="10" y="25" width="10" height="2" rx="1"
        fill="#00d4ff" opacity="0.3"/>
  <circle cx="36" cy="24" r="7" fill="#00d4ff" opacity="0.12"/>
  <circle cx="36" cy="24" r="7" stroke="#00d4ff" stroke-width="1.5"/>
  <path d="M33 24L35.5 26.5L40 21.5"
        stroke="#00d4ff" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Wordmark -->
  <text x="56" y="30"
        font-family="'Segoe UI', system-ui, sans-serif"
        font-size="18" font-weight="600" letter-spacing="-0.5"
        fill="#ffffff">safe</text>
  <text x="93" y="30"
        font-family="'Segoe UI', system-ui, sans-serif"
        font-size="18" font-weight="600" letter-spacing="-0.5"
        fill="#00d4ff">input</text>
</svg>
```

- [ ] **Step 3: Create `public/logo-light.svg`** — full lockup for light backgrounds

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48" fill="none">
  <!-- Icon -->
  <rect x="4" y="12" width="40" height="24" rx="7"
        fill="#f0f4f8" stroke="#0077aa" stroke-width="2"/>
  <rect x="10" y="21" width="16" height="2" rx="1"
        fill="#0077aa" opacity="0.5"/>
  <rect x="10" y="25" width="10" height="2" rx="1"
        fill="#0077aa" opacity="0.3"/>
  <circle cx="36" cy="24" r="7" fill="#0077aa" opacity="0.1"/>
  <circle cx="36" cy="24" r="7" stroke="#0077aa" stroke-width="1.5"/>
  <path d="M33 24L35.5 26.5L40 21.5"
        stroke="#0077aa" stroke-width="1.8"
        stroke-linecap="round" stroke-linejoin="round"/>
  <!-- Wordmark -->
  <text x="56" y="30"
        font-family="'Segoe UI', system-ui, sans-serif"
        font-size="18" font-weight="600" letter-spacing="-0.5"
        fill="#0a0e1a">safe</text>
  <text x="93" y="30"
        font-family="'Segoe UI', system-ui, sans-serif"
        font-size="18" font-weight="600" letter-spacing="-0.5"
        fill="#0077aa">input</text>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add public/
git commit -m "feat(brand): add SafeInput SVG logo assets"
```

---

## Task 2: Extension Design Token System

**Files:**
- Create: `src/styles/tokens.css`
- Modify: `src/options/styles.css`
- Modify: `tailwind.config.ts`

- [ ] **Step 1: Create `src/styles/tokens.css`**

```css
/* Dark mode — default */
:root {
  --brand-primary:     #00d4ff;
  --bg-base:           #0a0e1a;
  --bg-surface:        #0d1525;
  --bg-surface-raised: #1a2a3a;
  --border:            #1a2a3a;
  --text-primary:      #ffffff;
  --text-secondary:    #8899aa;
  --text-muted:        #3a5060;
  --status-danger:     #ff4d6a;
  --status-warn:       #ffaa00;
  --status-safe:       #00cc88;
}

/* Light mode */
[data-theme="light"] {
  --brand-primary:     #0077aa;
  --bg-base:           #f0f4f8;
  --bg-surface:        #ffffff;
  --bg-surface-raised: #f8fafc;
  --border:            #dde3ea;
  --text-primary:      #0a0e1a;
  --text-secondary:    #4a6070;
  --text-muted:        #9aacba;
  --status-danger:     #e03050;
  --status-warn:       #cc8800;
  --status-safe:       #00aa66;
}
```

- [ ] **Step 2: Import tokens into `src/options/styles.css`**

Replace the entire file contents with:

```css
@import './tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Update `tailwind.config.ts`** to extend colors with token references

```ts
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      colors: {
        brand:      "var(--brand-primary)",
        "bg-base":  "var(--bg-base)",
        "bg-surf":  "var(--bg-surface)",
        "bg-raised":"var(--bg-surface-raised)",
        border:     "var(--border)",
        "txt-primary":   "var(--text-primary)",
        "txt-secondary": "var(--text-secondary)",
        "txt-muted":     "var(--text-muted)",
        danger: "var(--status-danger)",
        warn:   "var(--status-warn)",
        safe:   "var(--status-safe)",
      },
      fontFamily: {
        sans: ["'Segoe UI'", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Commit**

```bash
git add src/styles/tokens.css src/options/styles.css tailwind.config.ts
git commit -m "feat(brand): add extension design token system"
```

---

## Task 3: Admin Design Token System

**Files:**
- Create: `admin/src/styles/tokens.css`
- Modify: `admin/src/index.css`
- Modify: `admin/tailwind.config.ts`

- [ ] **Step 1: Create `admin/src/styles/tokens.css`** — identical to extension tokens

```css
/* Dark mode — default */
:root {
  --brand-primary:     #00d4ff;
  --bg-base:           #0a0e1a;
  --bg-surface:        #0d1525;
  --bg-surface-raised: #1a2a3a;
  --border:            #1a2a3a;
  --text-primary:      #ffffff;
  --text-secondary:    #8899aa;
  --text-muted:        #3a5060;
  --status-danger:     #ff4d6a;
  --status-warn:       #ffaa00;
  --status-safe:       #00cc88;
}

[data-theme="light"] {
  --brand-primary:     #0077aa;
  --bg-base:           #f0f4f8;
  --bg-surface:        #ffffff;
  --bg-surface-raised: #f8fafc;
  --border:            #dde3ea;
  --text-primary:      #0a0e1a;
  --text-secondary:    #4a6070;
  --text-muted:        #9aacba;
  --status-danger:     #e03050;
  --status-warn:       #cc8800;
  --status-safe:       #00aa66;
}
```

- [ ] **Step 2: Update `admin/src/index.css`** to import tokens

```css
@import './styles/tokens.css';
@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
  background-color: var(--bg-base);
  color: var(--text-primary);
}
```

- [ ] **Step 3: Update `admin/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand:      "var(--brand-primary)",
        "bg-base":  "var(--bg-base)",
        "bg-surf":  "var(--bg-surface)",
        "bg-raised":"var(--bg-surface-raised)",
        border:     "var(--border)",
        "txt-primary":   "var(--text-primary)",
        "txt-secondary": "var(--text-secondary)",
        "txt-muted":     "var(--text-muted)",
        danger: "var(--status-danger)",
        warn:   "var(--status-warn)",
        safe:   "var(--status-safe)",
      },
      fontFamily: {
        sans: ["'Segoe UI'", "system-ui", "-apple-system", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/styles/ admin/src/index.css admin/tailwind.config.ts
git commit -m "feat(brand): add admin design token system"
```

---

## Task 4: Theme Toggle Utilities

**Files:**
- Create: `src/shared/theme.ts`
- Create: `admin/src/utils/theme.ts`
- Create: `src/shared/theme.test.ts`
- Create: `admin/src/utils/theme.test.ts`

- [ ] **Step 1: Write failing test for extension theme utility** at `src/shared/theme.test.ts`

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock chrome.storage.sync
const mockSet = vi.fn()
const mockGet = vi.fn()
vi.stubGlobal('chrome', {
  storage: { sync: { set: mockSet, get: mockGet } },
})

import { getTheme, setTheme, initTheme } from './theme'

describe('extension theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    mockSet.mockReset()
    mockGet.mockReset()
  })

  it('getTheme returns dark by default', () => {
    expect(getTheme()).toBe('dark')
  })

  it('setTheme light sets data-theme attribute', () => {
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('setTheme dark removes data-theme attribute', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
  })

  it('setTheme persists to chrome.storage.sync', () => {
    setTheme('light')
    expect(mockSet).toHaveBeenCalledWith({ theme: 'light' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test src/shared/theme.test.ts
```

Expected: FAIL — `Cannot find module './theme'`

- [ ] **Step 3: Create `src/shared/theme.ts`**

```ts
export type Theme = 'dark' | 'light'

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'
}

export function setTheme(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  chrome.storage.sync.set({ theme })
}

export function initTheme(): void {
  chrome.storage.sync.get('theme', (result) => {
    if (result.theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test src/shared/theme.test.ts
```

Expected: PASS — 4 tests passing

- [ ] **Step 5: Write failing test for admin theme utility** at `admin/src/utils/theme.test.ts`

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { getTheme, setTheme, initTheme } from './theme'

describe('admin theme', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('getTheme returns dark by default', () => {
    expect(getTheme()).toBe('dark')
  })

  it('setTheme light sets attribute and persists', () => {
    setTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('safeinput-theme')).toBe('light')
  })

  it('setTheme dark removes attribute and persists', () => {
    document.documentElement.setAttribute('data-theme', 'light')
    setTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    expect(localStorage.getItem('safeinput-theme')).toBe('dark')
  })

  it('initTheme restores light from localStorage', () => {
    localStorage.setItem('safeinput-theme', 'light')
    initTheme()
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd admin && pnpm test src/utils/theme.test.ts
```

Expected: FAIL — `Cannot find module './theme'`

- [ ] **Step 7: Create `admin/src/utils/theme.ts`**

```ts
export type Theme = 'dark' | 'light'
const STORAGE_KEY = 'safeinput-theme'

export function getTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'
}

export function setTheme(theme: Theme): void {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  } else {
    document.documentElement.removeAttribute('data-theme')
  }
  localStorage.setItem(STORAGE_KEY, theme)
}

export function initTheme(): void {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light') {
    document.documentElement.setAttribute('data-theme', 'light')
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

```bash
cd admin && pnpm test src/utils/theme.test.ts
```

Expected: PASS — 4 tests passing

- [ ] **Step 9: Call `initTheme` in admin entry point** — open `admin/src/main.tsx`, add at the top of the file before the `ReactDOM.createRoot` call:

```ts
import { initTheme } from './utils/theme'
initTheme()
```

- [ ] **Step 10: Commit**

```bash
git add src/shared/theme.ts src/shared/theme.test.ts admin/src/utils/theme.ts admin/src/utils/theme.test.ts admin/src/main.tsx
git commit -m "feat(brand): add theme toggle utilities with tests"
```

---

## Task 5: Extension Popup Rebrand

**Files:**
- Modify: `src/popup/Popup.tsx`
- Modify: `src/popup/index.html`

- [ ] **Step 1: Import tokens in popup** — open `src/popup/Popup.tsx`. Add this import at the top (after existing imports):

```ts
import '../styles/tokens.css'
```

- [ ] **Step 2: Add `LogoIcon` component** — add this component above `SignedOutView` in `src/popup/Popup.tsx`:

```tsx
function LogoIcon({ danger = false, size = 24 }: { danger?: boolean; size?: number }) {
  const color = danger ? 'var(--status-danger)' : 'var(--brand-primary)'
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" fill="none">
      <rect x="8" y="24" width="64" height="32" rx="10"
            fill="var(--bg-surface)" stroke={color} strokeWidth="2"/>
      <rect x="17" y="36" width="26" height="2.5" rx="1.25"
            fill={color} opacity="0.5"/>
      <rect x="17" y="41.5" width="16" height="2.5" rx="1.25"
            fill={color} opacity="0.3"/>
      <circle cx="60" cy="40" r="11" fill={color} opacity="0.12"/>
      <circle cx="60" cy="40" r="11" stroke={color} strokeWidth="2"/>
      {danger ? (
        <>
          <path d="M60 33v8" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="60" cy="46" r="1.5" fill={color}/>
        </>
      ) : (
        <path d="M55.5 40L59 43.5L65.5 37"
              stroke={color} strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round"/>
      )}
    </svg>
  )
}
```

- [ ] **Step 3: Add `Wordmark` component** — add after `LogoIcon`:

```tsx
function Wordmark({ danger = false }: { danger?: boolean }) {
  return (
    <span style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.5px' }}>
      <span style={{ color: 'var(--text-primary)' }}>safe</span>
      <span style={{ color: danger ? 'var(--status-danger)' : 'var(--brand-primary)' }}>input</span>
    </span>
  )
}
```

- [ ] **Step 4: Add `ThemeToggle` component** — add after `Wordmark`:

```tsx
import { getTheme, setTheme } from '@/shared/theme'

function ThemeToggle() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => getTheme())
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }
  return (
    <button onClick={toggle} style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: 'var(--text-muted)', padding: 4,
    }} title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}>
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  )
}
```

- [ ] **Step 5: Replace `SignedOutView`** with new branded version:

```tsx
function SignedOutView() {
  return (
    <div style={{ background: 'var(--bg-base)', minWidth: 320 }}>
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon size={24} />
          <Wordmark />
        </div>
        <ThemeToggle />
      </div>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', margin: 0 }}>
          Sign in to enable policy enforcement for your organization.
        </p>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            width: '100%', padding: '8px 16px',
            background: 'var(--brand-primary)', color: 'var(--bg-base)',
            border: 'none', borderRadius: 6, fontSize: 13,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Sign in via Settings
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Replace the `SignedInView` return JSX** — find the `return (` in `SignedInView` and replace the entire JSX block with:

```tsx
  if (loading) {
    return (
      <div style={{ background: 'var(--bg-base)', width: 320, padding: 24,
                    display: 'flex', justifyContent: 'center' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</span>
      </div>
    )
  }

  const hasEvents = recentEvents.length > 0
  const dangerEvents = recentEvents.filter(e => e.action === 'block')

  return (
    <div style={{ background: 'var(--bg-base)', width: 320, fontFamily: "'Segoe UI', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoIcon size={24} danger={hasEvents} />
          <Wordmark danger={hasEvents} />
        </div>
        <ThemeToggle />
      </div>

      {/* Status banner */}
      <div style={{
        margin: 12, borderRadius: 8, padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: hasEvents ? 'rgba(255,77,106,0.08)' : 'rgba(0,204,136,0.08)',
        border: `1px solid ${hasEvents ? 'rgba(255,77,106,0.25)' : 'rgba(0,204,136,0.25)'}`,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: hasEvents ? 'var(--status-danger)' : 'var(--status-safe)',
        }}/>
        <div>
          <div style={{
            fontSize: 12, fontWeight: 600,
            color: hasEvents ? 'var(--status-danger)' : 'var(--status-safe)',
          }}>
            {hasEvents ? 'Sensitive data detected' : 'All clear'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
            {hasEvents
              ? `${recentEvents.length} issue${recentEvents.length > 1 ? 's' : ''} found`
              : 'No sensitive data detected'}
          </div>
        </div>
      </div>

      {/* Site info */}
      <div style={{
        margin: '0 12px', borderRadius: 8, padding: '9px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-surface)',
      }}>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {hostname || 'No active tab'}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
          background: siteEnabled ? 'rgba(0,212,255,0.12)' : 'rgba(58,80,96,0.3)',
          color: siteEnabled ? 'var(--brand-primary)' : 'var(--text-muted)',
        }}>
          {siteEnabled ? 'ACTIVE' : 'PAUSED'}
        </span>
      </div>

      {/* Recent events list */}
      {hasEvents && (
        <div style={{ margin: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {recentEvents.slice(0, 3).map((ev, i) => (
            <div key={i} style={{
              background: 'var(--bg-surface)', borderRadius: 8,
              padding: '9px 14px',
              borderLeft: `3px solid ${ev.action === 'block' ? 'var(--status-danger)' : 'var(--status-warn)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: ev.action === 'block' ? 'var(--status-danger)' : 'var(--status-warn)',
                }}>
                  {ev.ruleId ?? 'Detection'}
                </span>
                <span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 4,
                  background: ev.action === 'block' ? 'rgba(255,77,106,0.15)' : 'rgba(255,170,0,0.15)',
                  color: ev.action === 'block' ? 'var(--status-danger)' : 'var(--status-warn)',
                }}>
                  {ev.action?.toUpperCase() ?? 'DETECTED'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{
        padding: '10px 16px', marginTop: 8,
        borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          {user?.organizationMemberships?.[0]?.organization?.name ?? 'SafeInput'}
        </span>
        <button
          onClick={() => chrome.runtime.openOptionsPage()}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 10, color: 'var(--brand-primary)',
          }}
        >
          Settings →
        </button>
      </div>
    </div>
  )
```

- [ ] **Step 7: Update `src/popup/index.html`** — set background colour so the popup doesn't flash white

Open `src/popup/index.html` and add inside `<head>`:

```html
<style>
  html, body { background: #0a0e1a; margin: 0; padding: 0; }
</style>
```

- [ ] **Step 8: Build and manually verify popup**

```bash
pnpm build
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions`. Open the popup — verify dark mode renders correctly with SafeInput branding.

- [ ] **Step 9: Commit**

```bash
git add src/popup/Popup.tsx src/popup/index.html
git commit -m "feat(brand): rebrand extension popup to SafeInput"
```

---

## Task 6: Extension Options Page Rebrand

**Files:**
- Modify: `src/options/App.tsx`
- Modify: `src/options/index.html`

- [ ] **Step 1: Update `src/options/index.html`** — change title and add base style

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>SafeInput Settings</title>
    <style>html, body { background: #0a0e1a; margin: 0; }</style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/options/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Update `src/options/App.tsx`** — replace the page header section. Find the existing header/logo div in the App component and replace it with:

```tsx
{/* Header */}
<header style={{
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 24px', borderBottom: '1px solid var(--border)',
  background: 'var(--bg-surface)',
}}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
    <svg width="28" height="28" viewBox="0 0 80 80" fill="none">
      <rect x="8" y="24" width="64" height="32" rx="10"
            fill="var(--bg-base)" stroke="var(--brand-primary)" strokeWidth="2"/>
      <rect x="17" y="36" width="26" height="2.5" rx="1.25"
            fill="var(--brand-primary)" opacity="0.5"/>
      <circle cx="60" cy="40" r="11"
              fill="var(--brand-primary)" opacity="0.12"/>
      <circle cx="60" cy="40" r="11"
              stroke="var(--brand-primary)" strokeWidth="2"/>
      <path d="M55.5 40L59 43.5L65.5 37"
            stroke="var(--brand-primary)" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.5px' }}>
        <span style={{ color: 'var(--text-primary)' }}>safe</span>
        <span style={{ color: 'var(--brand-primary)' }}>input</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)',
                    letterSpacing: '2.5px', textTransform: 'uppercase', marginTop: 2 }}>
        AI Prompt Protection
      </div>
    </div>
  </div>
  <ThemeToggleButton />
</header>
```

Add the `ThemeToggleButton` component near the top of the file:

```tsx
import { getTheme, setTheme } from '@/shared/theme'

function ThemeToggleButton() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => getTheme())
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }
  return (
    <button onClick={toggle} style={{
      padding: '6px 12px', borderRadius: 6, cursor: 'pointer',
      background: 'var(--bg-surface-raised)', border: '1px solid var(--border)',
      color: 'var(--text-secondary)', fontSize: 12,
    }}>
      {theme === 'dark' ? '☀ Light' : '🌙 Dark'}
    </button>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/options/App.tsx src/options/index.html
git commit -m "feat(brand): rebrand extension options page to SafeInput"
```

---

## Task 7: Admin Layout Rebrand

**Files:**
- Modify: `admin/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Replace `AppLayout.tsx`** entirely with the new branded sidebar layout:

```tsx
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useOrganization, useUser, UserButton } from '@clerk/clerk-react'
import { ToastContainer } from '../ui/ToastContainer'
import { getTheme, setTheme } from '../../utils/theme'
import { useState } from 'react'

const NAV = [
  { to: '/dashboard',  label: 'Dashboard',  icon: '▦' },
  { to: '/subjects',   label: 'Policies',   icon: '⊡' },
  { to: '/org',        label: 'Teams',      icon: '⊞' },
  { to: '/members',    label: 'Members',    icon: '◎' },
  { to: '/audit',      label: 'Audit Log',  icon: '≡' },
  { to: '/settings',   label: 'Settings',   icon: '⚙' },
]

function ThemeToggle() {
  const [theme, setThemeState] = useState<'dark' | 'light'>(() => getTheme())
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    setThemeState(next)
  }
  return (
    <button onClick={toggle} title="Toggle theme" style={{
      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
      color: 'var(--text-muted)', fontSize: 14, lineHeight: 1,
    }}>
      {theme === 'dark' ? '☀' : '🌙'}
    </button>
  )
}

export function AppLayout() {
  const navigate = useNavigate()
  const { organization } = useOrganization()
  const { user } = useUser()

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg-base)',
                  fontFamily: "'Segoe UI', system-ui, sans-serif", overflow: 'hidden' }}>

      {/* Sidebar */}
      <aside style={{
        width: 210, flexShrink: 0, background: 'var(--bg-surface)',
        borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
      }}>
        {/* Logo */}
        <div style={{ padding: '18px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="22" height="22" viewBox="0 0 80 80" fill="none">
            <rect x="8" y="24" width="64" height="32" rx="10"
                  fill="var(--bg-base)" stroke="var(--brand-primary)" strokeWidth="2.5"/>
            <rect x="17" y="36" width="22" height="2" rx="1"
                  fill="var(--brand-primary)" opacity="0.5"/>
            <circle cx="60" cy="40" r="10" fill="var(--brand-primary)" opacity="0.12"/>
            <circle cx="60" cy="40" r="10" stroke="var(--brand-primary)" strokeWidth="2"/>
            <path d="M56 40L59 43L65 37" stroke="var(--brand-primary)" strokeWidth="2"
                  strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.5px' }}>
            <span style={{ color: 'var(--text-primary)' }}>safe</span>
            <span style={{ color: 'var(--brand-primary)' }}>input</span>
          </span>
        </div>

        {/* Org badge */}
        {organization && (
          <div style={{
            margin: '10px 10px 4px', background: 'var(--bg-surface-raised)',
            borderRadius: 8, padding: '8px 12px', border: '1px solid var(--border)',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 9,
                          letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Organization
            </div>
            <div style={{ color: 'var(--text-primary)', fontSize: 12,
                          fontWeight: 600, marginTop: 3 }}>
              {organization.name}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ padding: 8, flex: 1 }}>
          {NAV.map(({ to, label, icon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '8px 12px', borderRadius: 6, marginBottom: 2,
              textDecoration: 'none', fontSize: 12, transition: 'all 0.1s',
              background: isActive ? 'var(--bg-surface-raised)' : 'transparent',
              color: isActive ? 'var(--brand-primary)' : 'var(--text-muted)',
              fontWeight: isActive ? 600 : 400,
              border: isActive ? '1px solid var(--border)' : '1px solid transparent',
            })}>
              <span style={{ fontSize: 13 }}>{icon}</span>
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div style={{
          padding: '12px 16px', borderTop: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <UserButton afterSignOutUrl="/login" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: 'var(--text-primary)', fontSize: 11,
                          fontWeight: 600, overflow: 'hidden',
                          textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.fullName ?? user?.primaryEmailAddress?.emailAddress}
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: 9 }}>Admin</div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          padding: '14px 24px', borderBottom: '1px solid var(--border)',
          background: 'var(--bg-surface)', display: 'flex',
          justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <ThemeToggle />
        </div>

        {/* Page content */}
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg-base)' }}>
          <Outlet />
        </div>
      </div>

      <ToastContainer />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add admin/src/components/layout/AppLayout.tsx
git commit -m "feat(brand): rebrand admin sidebar layout to SafeInput"
```

---

## Task 8: Admin Dashboard Page

**Files:**
- Create: `admin/src/pages/DashboardPage.tsx`
- Modify: `admin/src/App.tsx`

- [ ] **Step 1: Create `admin/src/pages/DashboardPage.tsx`**

```tsx
import { useOrganization } from '@clerk/clerk-react'

const MOCK_STATS = {
  scanned: 48291,
  blocked: 1042,
  activeUsers: 312,
  totalUsers: 340,
  coverage: 94,
  activeRules: 21,
}

const MOCK_INCIDENTS = [
  { user: 'j.smith@acme.com', type: 'API Key — OpenAI',       status: 'BLOCKED', when: '2m ago' },
  { user: 'm.lee@acme.com',   type: 'PII — Credit Card',      status: 'WARNED',  when: '14m ago' },
  { user: 'r.patel@acme.com', type: 'Internal IP',            status: 'BLOCKED', when: '1h ago' },
  { user: 'a.chen@acme.com',  type: 'SSH Private Key',        status: 'BLOCKED', when: '2h ago' },
  { user: 't.garcia@acme.com',type: 'High-entropy token',     status: 'WARNED',  when: '3h ago' },
]

const MOCK_CHART = [
  { day: 'Mon', blocked: 22, warned: 14 },
  { day: 'Tue', blocked: 32, warned: 18 },
  { day: 'Wed', blocked: 18, warned: 10 },
  { day: 'Thu', blocked: 42, warned: 22 },
  { day: 'Fri', blocked: 28, warned: 16 },
  { day: 'Sat', blocked: 12, warned:  8 },
  { day: 'Sun', blocked: 10, warned:  6 },
]

const MOCK_THREATS = [
  { label: 'API Keys',      pct: 48, color: 'var(--status-danger)' },
  { label: 'PII',           pct: 27, color: 'var(--status-warn)' },
  { label: 'Private Keys',  pct: 14, color: 'var(--brand-primary)' },
  { label: 'Internal IPs',  pct: 11, color: 'var(--text-muted)' },
]

const MAX_CHART = 50

function StatusBadge({ status }: { status: string }) {
  const isBlocked = status === 'BLOCKED'
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 3,
      background: isBlocked ? 'rgba(224,48,80,0.12)' : 'rgba(204,136,0,0.12)',
      color: isBlocked ? 'var(--status-danger)' : 'var(--status-warn)',
    }}>
      {status}
    </span>
  )
}

export function DashboardPage() {
  const { organization } = useOrganization()

  return (
    <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column',
                  gap: 14, minHeight: '100%' }}>

      {/* Page title */}
      <div>
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 600,
                     color: 'var(--text-primary)' }}>Dashboard</h1>
        <p style={{ margin: '3px 0 0', fontSize: 11,
                    color: 'var(--text-muted)' }}>Last 30 days · {organization?.name ?? 'All teams'}</p>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Prompts Scanned', value: MOCK_STATS.scanned.toLocaleString(),
            sub: '↑ 12% vs last month', subColor: 'var(--status-safe)' },
          { label: 'Threats Blocked', value: MOCK_STATS.blocked.toLocaleString(),
            sub: '↑ 8% vs last month', subColor: 'var(--status-danger)',
            valColor: 'var(--status-danger)' },
          { label: 'Active Users',
            value: MOCK_STATS.activeUsers.toString(),
            sub: `of ${MOCK_STATS.totalUsers} licensed`, subColor: 'var(--brand-primary)' },
          { label: 'Policy Coverage', value: `${MOCK_STATS.coverage}%`,
            sub: `${MOCK_STATS.activeRules} rules active`, subColor: 'var(--text-muted)',
            valColor: 'var(--brand-primary)' },
        ].map(({ label, value, sub, subColor, valColor }) => (
          <div key={label} style={{
            background: 'var(--bg-surface)', borderRadius: 10,
            padding: '16px', border: '1px solid var(--border)',
          }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 9,
                          textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</div>
            <div style={{ color: valColor ?? 'var(--text-primary)',
                          fontSize: 26, fontWeight: 700, margin: '6px 0 4px',
                          lineHeight: 1 }}>{value}</div>
            <div style={{ color: subColor, fontSize: 10 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                    border: '1px solid var(--border)', overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
            Threat Activity — Last 7 Days
          </span>
          <div style={{ display: 'flex', gap: 16 }}>
            {[['var(--status-danger)', 'Blocked'], ['var(--status-warn)', 'Warned']].map(([c, l]) => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c }}/>
                <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'flex-end',
                      gap: 8, height: 120 }}>
          {MOCK_CHART.map(({ day, blocked, warned }) => {
            const blockedH = Math.round((blocked / MAX_CHART) * 80)
            const warnedH  = Math.round((warned  / MAX_CHART) * 80)
            return (
              <div key={day} style={{ flex: 1, display: 'flex', flexDirection: 'column',
                                      alignItems: 'center', gap: 2 }}>
                <div style={{ width: '50%', display: 'flex', flexDirection: 'column',
                              gap: 1, alignItems: 'center' }}>
                  <div style={{ width: '100%', height: warnedH,
                                background: 'var(--status-warn)', borderRadius: '2px 2px 0 0' }}/>
                  <div style={{ width: '100%', height: blockedH,
                                background: 'var(--status-danger)', borderRadius: '0 0 2px 2px' }}/>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 10, marginTop: 6 }}>{day}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Bottom two-column */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, flex: 1 }}>

        {/* Incidents table */}
        <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                      border: '1px solid var(--border)', overflow: 'hidden',
                      display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
              Recent Incidents
            </span>
            <span style={{ color: 'var(--brand-primary)', fontSize: 11, cursor: 'pointer' }}>
              View all →
            </span>
          </div>
          <div style={{ padding: '6px 16px', display: 'grid',
                        gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8,
                        background: 'var(--bg-surface-raised)',
                        borderBottom: '1px solid var(--border)' }}>
            {['User','Type','Status','When'].map(h => (
              <span key={h} style={{ color: 'var(--text-muted)', fontSize: 9,
                                     textTransform: 'uppercase', letterSpacing: '0.8px' }}>{h}</span>
            ))}
          </div>
          {MOCK_INCIDENTS.map((row, i) => (
            <div key={i} style={{
              padding: '9px 16px', display: 'grid',
              gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr', gap: 8, alignItems: 'center',
              borderBottom: i < MOCK_INCIDENTS.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{row.user}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{row.type}</span>
              <StatusBadge status={row.status} />
              <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>{row.when}</span>
            </div>
          ))}
        </div>

        {/* Right widgets */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Threat breakdown */}
          <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                        border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text-primary)', fontSize: 13, fontWeight: 600 }}>
                Threat Breakdown
              </span>
            </div>
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MOCK_THREATS.map(({ label, pct, color }) => (
                <div key={label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>{label}</span>
                    <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>{pct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--bg-surface-raised)', borderRadius: 3 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top sites + Policy health */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, flex: 1 }}>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                          border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Top Sites</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { site: 'chatgpt.com', count: '21.4k', color: 'var(--brand-primary)' },
                  { site: 'claude.ai',   count: '18.2k', color: 'var(--text-muted)' },
                  { site: 'gemini.google', count: '8.6k', color: 'var(--border)' },
                ].map(({ site, count, color }) => (
                  <div key={site} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color }}/>
                      <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{site}</span>
                    </div>
                    <span style={{ color: 'var(--text-primary)', fontSize: 10, fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 10,
                          border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--text-primary)', fontSize: 11, fontWeight: 600 }}>Policy Health</span>
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>Teams</span>
                  <span style={{ background: 'rgba(0,212,255,0.12)', color: 'var(--brand-primary)',
                                  fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>8/9</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>Rules on</span>
                  <span style={{ background: 'rgba(0,212,255,0.12)', color: 'var(--brand-primary)',
                                  fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 600 }}>21/24</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>Last sync</span>
                  <span style={{ color: 'var(--status-safe)', fontSize: 10, fontWeight: 600 }}>4m ago</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Register `DashboardPage` in `admin/src/App.tsx`**

Add the import:
```ts
import { DashboardPage } from './pages/DashboardPage'
```

Inside the `<Routes>` block, change the default redirect and add the dashboard route:
```tsx
<Route index element={<Navigate to="/dashboard" replace />} />
<Route path="/dashboard" element={<DashboardPage />} />
```

Keep all existing routes unchanged.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/DashboardPage.tsx admin/src/App.tsx
git commit -m "feat(brand): add SafeInput admin dashboard page"
```

---

## Task 9: String Replacements

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `manifest.config.ts`
- Modify: `package.json`
- Modify: `backend/package.json`
- Modify: `admin/package.json`
- Modify: `admin/index.html`
- Modify: `README.md`

- [ ] **Step 1: Update `src/shared/constants.ts`**

Replace the entire file with:

```ts
export const EXTENSION_NAME = "SafeInput";
export const EXTENSION_VERSION = "2.0.0";

/** Backend API */
export const API_BASE = import.meta.env.VITE_API_BASE as string | undefined ?? "https://api.safeinput.ai";
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

/** Chrome storage keys
 * NOTE: promptshield_* keys are kept for backwards-compatibility with existing installs.
 * New keys use safeinput_ prefix.
 */
export const STORAGE_POLICY_KEY = "promptshield_policy";
export const STORAGE_SITE_OVERRIDES_KEY = "promptshield_site_overrides";

/** IndexedDB — kept as-is to preserve existing audit history on upgrades */
export const AUDIT_DB_NAME = "promptshield_audit";
export const AUDIT_DB_VERSION = 1;
export const AUDIT_STORE_NAME = "events";

/** Sentinel attribute set on programmatically re-fired events to avoid recursion */
export const SEND_SENTINEL_ATTR = "data-safeinput-approved";

/** Snippet context window (chars either side of a match) */
export const SNIPPET_CONTEXT_CHARS = 20;
```

> **Note:** `STORAGE_POLICY_KEY`, `STORAGE_SITE_OVERRIDES_KEY`, and `AUDIT_DB_NAME` intentionally keep `promptshield_` prefix to avoid wiping existing users' stored policies and audit history on upgrade. Only `SEND_SENTINEL_ATTR` is changed as it is a transient DOM attribute.

- [ ] **Step 2: Update `manifest.config.ts`**

Change:
```ts
name: "PromptShield",
version: "0.1.0",
description: "Browser-based DLP for LLM chat interfaces",
```

To:
```ts
name: "SafeInput",
version: "2.0.0",
description: "AI prompt protection — detects secrets and PII before they leave your browser.",
```

- [ ] **Step 3: Update `package.json` (root)**

Change `"name"` field to `"safeinput"`.

- [ ] **Step 4: Update `backend/package.json`**

Change `"name"` field to `"safeinput-backend"`.

- [ ] **Step 5: Update `admin/package.json`**

Change `"name"` field to `"safeinput-admin"`.

- [ ] **Step 6: Update `admin/index.html`**

Change `<title>PromptShield Admin</title>` to `<title>SafeInput Admin</title>`.

- [ ] **Step 7: Update `README.md`** — change the first line from `# PromptShield` to `# SafeInput` and update the description paragraph to reflect the new name.

- [ ] **Step 8: Run the straggler grep**

```bash
grep -r "PromptShield\|promptshield\|prompt-shield\|prompt_shield" \
  --include="*.ts" --include="*.tsx" --include="*.html" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=dist \
  .
```

Expected: Only the intentionally kept storage/DB key strings in `constants.ts` (those are fine — see the note above). Fix any others found.

- [ ] **Step 9: Commit**

```bash
git add src/shared/constants.ts manifest.config.ts package.json \
        backend/package.json admin/package.json admin/index.html README.md
git commit -m "feat(brand): rename PromptShield → SafeInput across all string references"
```

---

## Task 10: Build & Smoke Test

- [ ] **Step 1: Run the full test suite**

```bash
pnpm test
```

Expected: All tests pass (including the 8 new theme toggle tests).

- [ ] **Step 2: Build the extension**

```bash
pnpm build
```

Expected: No TypeScript errors, `dist/` directory created.

- [ ] **Step 3: Build the admin**

```bash
cd admin && pnpm build
```

Expected: No TypeScript errors, `admin/dist/` directory created.

- [ ] **Step 4: Load extension and verify dark mode**

1. Go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", select `dist/`
2. Click the SafeInput extension icon — verify popup shows dark background `#0a0e1a`, cyan logo, wordmark `safe`(white)`input`(cyan)
3. Navigate to `chatgpt.com` — verify extension is ACTIVE
4. Open Options page — verify SafeInput header, dark background, theme toggle button visible

- [ ] **Step 5: Verify light mode on extension**

1. In extension popup, click the ☀ toggle
2. Verify background changes to `#f0f4f8`, logo changes to dark + `#0077aa` accent
3. Close and reopen popup — verify light mode persists

- [ ] **Step 6: Verify admin console**

```bash
cd admin && pnpm dev
```

Open `http://localhost:5173` — verify:
- Login page renders with SafeInput branding
- After login: sidebar shows SafeInput logo + org name
- Dashboard page loads with stats, chart, incidents table
- Theme toggle in top-right works, persists on reload

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(brand): SafeInput rebrand complete — dark/light mode, new logo, admin dashboard"
```
