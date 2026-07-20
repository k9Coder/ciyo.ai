# UX Quick Wins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement six high-visibility UX fixes: fix brand color on login/onboarding, add Publish to sidebar nav, replace `window.confirm` with a modal, fix hover-only buttons, fix "ONLINE" badge, and resolve the "Subjects vs Policies" naming inconsistency.

**Architecture:** All changes are in `pretzel-console/src/`. No backend changes required. Each fix is isolated to its component file.

**Tech Stack:** React, TypeScript, CSS-in-JS (inline styles matching existing patterns).

---

### Task 1: Fix Brand Color on Login and Onboarding Pages (QW-1)

**Files:**
- Modify: `pretzel-console/src/pages/LoginPage.tsx`
- Modify: `pretzel-console/src/pages/OnboardingPage.tsx`

- [ ] Step 1: Open `pretzel-console/src/pages/LoginPage.tsx`. The sign-in button uses Tailwind `bg-blue-600` and `hover:bg-blue-700`. The rest of the app uses `var(--brand-primary)` (#7c6aff).

Replace the button className:
```tsx
// Before:
className="w-full py-2 px-4 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"

// After:
style={{
  width: '100%', padding: '8px 16px',
  background: 'var(--brand-primary)', color: '#fff',
  fontSize: 14, fontWeight: 500, borderRadius: 8, border: 'none',
  cursor: 'pointer', transition: 'opacity 0.15s',
}}
onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
```

Also replace the outer container — change `className="min-h-screen bg-gray-50 flex items-center justify-center px-4"` to use CSS-in-JS consistent with the rest of the app:
```tsx
<div style={{
  minHeight: '100vh', background: 'var(--bg-base)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px',
}}>
```

Replace `className="w-full max-w-md"` → `style={{ width: '100%', maxWidth: 420 }}`

Replace `className="bg-white rounded-xl border border-gray-200 p-6 space-y-4"` →
```tsx
style={{
  background: 'var(--bg-surface)', borderRadius: 12,
  border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 16,
}}
```

- [ ] Step 2: Apply the same pattern to `pretzel-console/src/pages/OnboardingPage.tsx`. Find any `bg-blue-` or `text-blue-` Tailwind classes and replace with inline styles using `var(--brand-primary)`. Also replace any `bg-gray-50`, `bg-white`, `border-gray-200` with var equivalents.

- [ ] Step 3: Run component tests.
```bash
cd pretzel-console && pnpm test -- --reporter=verbose Login Onboarding
# Expected: all tests pass
```

- [ ] Step 4: Commit.
```bash
git add pretzel-console/src/pages/LoginPage.tsx pretzel-console/src/pages/OnboardingPage.tsx
git commit -m "fix(ux): align login/onboarding brand color with rest of app

Was using Tailwind bg-blue-600 (#2563eb) while rest of app uses
var(--brand-primary) (#7c6aff). Also converted Tailwind classes to
inline styles consistent with the codebase pattern."
```

---

### Task 2: Add Publish to Sidebar Navigation (UX-C2)

**Files:**
- Modify: `pretzel-console/src/components/layout/AppLayout.tsx`

- [ ] Step 1: Open `pretzel-console/src/components/layout/AppLayout.tsx`. The `NAV` array at line 10 does not include `/publish`. Add it after the Subjects/Policies entry:

Current NAV array:
```typescript
const NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: '▦', ai: false, dividerAbove: false },
  { to: '/subjects', label: 'Policies', icon: '⊡', ai: false, dividerAbove: false },
  { to: '/org', label: 'Teams', icon: '⊞', ai: false, dividerAbove: false },
  { to: '/members', label: 'Members', icon: '◎', ai: false, dividerAbove: false },
  { to: '/audit', label: 'Audit Log', icon: '≡', ai: false, dividerAbove: false },
  { to: '/assistant', label: 'AI Assistant', icon: null, ai: true, dividerAbove: true },
  { to: '/settings', label: 'Settings', icon: '⚙', ai: false, dividerAbove: false },
]
```

Replace with:
```typescript
const NAV = [
  { to: '/dashboard',  label: 'Dashboard',   icon: '▦',  ai: false, dividerAbove: false },
  { to: '/subjects',   label: 'Policies',     icon: '⊡',  ai: false, dividerAbove: false },
  { to: '/publish',    label: 'Publish',      icon: '↑',  ai: false, dividerAbove: false },
  { to: '/org',        label: 'Teams',        icon: '⊞',  ai: false, dividerAbove: false },
  { to: '/members',    label: 'Members',      icon: '◎',  ai: false, dividerAbove: false },
  { to: '/audit',      label: 'Audit Log',    icon: '≡',  ai: false, dividerAbove: false },
  { to: '/assistant',  label: 'AI Assistant', icon: null, ai: true,  dividerAbove: true  },
  { to: '/settings',   label: 'Settings',     icon: '⚙',  ai: false, dividerAbove: false },
]
```

- [ ] Step 2: Build the app and verify the Publish link appears in the sidebar.
```bash
cd pretzel-console && pnpm run build 2>&1 | tail -5
# Expected: build completes without errors
```

- [ ] Step 3: Commit.
```bash
git add pretzel-console/src/components/layout/AppLayout.tsx
git commit -m "fix(ux): add Publish to sidebar navigation

The most consequential action (publishing policy to extension) had
no nav path. Admin had to know to type /publish directly."
```

---

### Task 3: Replace window.confirm with ConfirmModal (QW-2)

**Files:**
- Create: `pretzel-console/src/components/ui/ConfirmModal.tsx`
- Modify: `pretzel-console/src/pages/SettingsPage.tsx`

- [ ] Step 1: Create `pretzel-console/src/components/ui/ConfirmModal.tsx`:
```tsx
import type { ReactNode } from 'react'

interface ConfirmModalProps {
  open:         boolean
  title:        string
  message:      ReactNode
  confirmLabel?: string
  cancelLabel?:  string
  destructive?:  boolean
  onConfirm:    () => void
  onCancel:     () => void
}

export function ConfirmModal({
  open, title, message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  destructive  = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: 'var(--bg-surface)', borderRadius: 12,
          border: '1px solid var(--border)', padding: 24, maxWidth: 420, width: '90%',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}
        onClick={e => e.stopPropagation()}
      >
        <h2 id="confirm-modal-title" style={{ margin: 0, fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          {title}
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
              background: 'var(--bg-base)', border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: '7px 16px', borderRadius: 6, fontSize: 13,
              fontWeight: 600, cursor: 'pointer', border: 'none',
              background: destructive ? 'var(--status-danger)' : 'var(--brand-primary)',
              color: '#fff',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] Step 2: Update `pretzel-console/src/pages/SettingsPage.tsx` to use the modal. Replace the two `window.confirm` calls:

Add import:
```tsx
import { ConfirmModal } from '../components/ui/ConfirmModal'
```

Add state:
```tsx
const [confirmOrgRotate, setConfirmOrgRotate]     = useState(false)
const [confirmAdminRotate, setConfirmAdminRotate] = useState(false)
```

Replace `handleRotateOrg`:
```tsx
function handleRotateOrg() {
  setConfirmOrgRotate(true)
}
```

Replace `handleRotateAdmin`:
```tsx
function handleRotateAdmin() {
  setConfirmAdminRotate(true)
}
```

Add modals in the JSX return, after `<PageHeader>`:
```tsx
<ConfirmModal
  open={confirmOrgRotate}
  title="Rotate Org Token?"
  message="All devices using the current token will stop working until updated."
  confirmLabel="Rotate Token"
  destructive
  onConfirm={() => {
    setConfirmOrgRotate(false)
    rotateOrgToken.mutate(undefined, { onSuccess: data => setNewOrgToken(data.token) })
  }}
  onCancel={() => setConfirmOrgRotate(false)}
/>
<ConfirmModal
  open={confirmAdminRotate}
  title="Rotate Admin Token?"
  message="The current admin token will stop working immediately."
  confirmLabel="Rotate Token"
  destructive
  onConfirm={() => {
    setConfirmAdminRotate(false)
    rotateAdminToken.mutate(undefined, { onSuccess: data => setNewAdminToken(data.token) })
  }}
  onCancel={() => setConfirmAdminRotate(false)}
/>
```

- [ ] Step 3: Run tests.
```bash
cd pretzel-console && pnpm test -- --reporter=verbose Settings
# Expected: all pass
```

- [ ] Step 4: Commit.
```bash
git add pretzel-console/src/components/ui/ConfirmModal.tsx pretzel-console/src/pages/SettingsPage.tsx
git commit -m "fix(ux): replace window.confirm with ConfirmModal for token rotation

window.confirm is synchronous, unstyled, and blocks the main thread.
ConfirmModal matches app design and is accessible (role=dialog, aria-modal)."
```

---

### Task 4: Fix "ONLINE" Badge and Naming Inconsistency (QW-4, QW-6)

**Files:**
- Modify: `pretzel-console/src/components/layout/AppLayout.tsx`

- [ ] Step 1: Find where the "ONLINE" badge is rendered. Search the assistant-related components:
```bash
grep -r "ONLINE" pretzel-console/src/ --include="*.tsx"
```

- [ ] Step 2: Remove the "ONLINE" badge entirely from wherever it appears. It is always true and provides no useful signal. Simply delete the JSX element that renders it.

- [ ] Step 3: Fix the "Subjects vs Policies" naming inconsistency. In `AppLayout.tsx` the nav label is `'Policies'` (line 12). This is correct for the nav. The actual page `SubjectsPage.tsx` likely has a title saying "Subjects & Rules". Standardize to "Policies" throughout.

Search for the page heading:
```bash
grep -n "Subjects\|Policies" pretzel-console/src/pages/SubjectsPage.tsx | head -20
```

In `SubjectsPage.tsx`, change any `<PageHeader title="Subjects" />` or `<PageHeader title="Subjects & Rules" />` to `<PageHeader title="Policies" />`.

- [ ] Step 4: Commit.
```bash
git add pretzel-console/src/components/layout/AppLayout.tsx pretzel-console/src/pages/SubjectsPage.tsx
# Add any other modified files
git commit -m "fix(ux): remove meaningless ONLINE badge; standardize 'Subjects' → 'Policies'

ONLINE badge was always shown and carried no information.
Nav label was 'Policies' but page header said 'Subjects & Rules' — now consistent."
```

---

### Task 5: Remove Hero Placeholder Text (QW-5)

**Files:**
- Modify: `pretzel-console/src/` (check Hero.tsx if it exists in console)
- Modify: `mykka-web/components/sections/Hero.tsx`

- [ ] Step 1: Find placeholder text.
```bash
grep -rn "placeholder\|Placeholder\|screenshot placeholder" mykka-web/components/sections/Hero.tsx pretzel-console/src/ 2>/dev/null
```

- [ ] Step 2: In `mykka-web/components/sections/Hero.tsx`, replace the placeholder image section with a styled placeholder that clearly shows a call-to-action for the real screenshot, rather than placeholder text visible to visitors. Use a dark gradient box with text "Product Demo" until a real screenshot is available:
```tsx
// Replace: <div>Extension screenshot placeholder</div>
// With:
<div style={{
  width: '100%', aspectRatio: '16/10', borderRadius: 12,
  background: 'linear-gradient(135deg, #1a1433 0%, #2d1f6e 100%)',
  border: '1px solid rgba(124, 106, 255, 0.3)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}}>
  <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 14, fontStyle: 'italic' }}>
    Product screenshot coming soon
  </span>
</div>
```

- [ ] Step 3: Commit.
```bash
git add mykka-web/components/sections/Hero.tsx
git commit -m "fix(ux): replace visible placeholder text in Hero with styled empty state

'Extension screenshot placeholder' text was visible to site visitors."
```
