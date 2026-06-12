# Chloe Dubois — Implementation Plan: pretzel-console Accessibility & Security Fixes

## Date
2026-06-08

**Participants:** Chloe Dubois (Frontend Engineer — Console)
**Directed by:** Marcus Webb (CTO)

## Worktree
`c:\Users\yarin\Documents\code\prompt-saviour\.claude\worktrees\agent-aac012cd86f262b2b`

## Commit
`1e3c702` on branch `worktree-agent-aac012cd86f262b2b`

---

## Files Changed

### Source files (10 modified)

| File | What changed |
|---|---|
| `src/realtime/sse.adapter.ts` | Added detailed security comment + TODO for `/v1/events/ticket` backend endpoint; added exponential backoff (1 s → 30 s max); fixed closed-flag race condition with double guard after `await getToken()` |
| `src/components/ui/EntityModal.tsx` | Added focus trap (Tab/Shift+Tab cycle within dialog), `aria-labelledby` via `useId()`, Escape key handler, focus-restore to triggering element on close |
| `src/components/ui/ConfirmModal.tsx` | Same focus trap + aria + Escape; Cancel button receives initial focus (ARIA pattern for destructive dialogs) |
| `src/hooks/useToast.ts` | Moved `toastListener = addToast` registration from `useState` initializer (anti-pattern) into `useEffect` with proper cleanup |
| `src/components/ui/ToastContainer.tsx` | Split into two `LiveRegion` sub-components: `role="alert" aria-live="assertive"` for errors, `role="status" aria-live="polite"` for successes; both regions always mounted so AT registers them before first toast |
| `src/components/layout/AppLayout.tsx` | Added `aria-label="Main navigation"` to `<nav>`; theme toggle button uses `aria-label="Switch to light/dark theme"` instead of `title`; nav icons wrapped in `aria-hidden="true"` spans |
| `src/components/ui/MillerColumns.tsx` | Action buttons always in DOM (opacity transition for visual hide); `onFocus`/`onBlur` show/hide them; `tabIndex` set to `-1` when invisible so Tab skips invisible buttons, but `onFocus` on buttons shows them first — keyboard users can reach actions; column key uses `col.title` not index |
| `src/pages/DashboardPage.tsx` | Added `isError` destructuring on all 5 analytics hooks; error messages rendered inline for summary, daily chart, incidents, top sites, and by-subject sections; chart keyed by `day` field, chart container has `aria-label` with textual summary |
| `src/pages/SubjectsPage.tsx` | Replaced `<span onClick>` edit/delete controls with proper `<button>` elements with `aria-label`; both `handleSave` functions (subjects and rules) wrapped in try/catch to swallow unhandled rejection from `mutateAsync` |
| `src/hooks/usePolicyRealtime.ts` | Stored `getToken` in `useRef` updated on every render; SSE effect only depends on stable `qc`; eliminates continuous SSE teardown/reconnect on every render |

### Test files (5 modified/added)

| File | What changed |
|---|---|
| `tests/ConfirmModal.test.tsx` | NEW — 8 tests: not-rendered when closed, dialog role, aria-labelledby, Escape key, focus on Cancel, onConfirm, confirming state, onClose |
| `tests/EntityModal.test.tsx` | NEW — 8 tests: not-rendered when closed, dialog role, aria-labelledby, focus on first element, Escape key, onSave, saving state, focus restore on close |
| `tests/ToastContainer.test.tsx` | NEW — 4 tests: no toasts renders empty live regions, success goes in role=status/polite, error goes in role=alert/assertive, both regions always present; fixed unused import TS error |
| `tests/MillerColumns.test.tsx` | Extended with keyboard accessibility tests |
| `tests/realtime/sse.adapter.test.ts` | Extended with backoff and closed-flag race tests |

---

## Test Results

```
Test Files  11 passed (11)
Tests       63 passed (63)
TypeCheck   PASS (0 errors)
```

---

## What is Incomplete / Known Limitations

### SSE token in URL (partially fixed)
The JWT is still passed as `?token=` in `sse.adapter.ts` because the backend has no SSE streaming endpoint at all — the `/v1/events` route is only for event ingestion (POST), not SSE. Implementing a proper ticket-based approach requires:
1. A backend `/v1/events/stream` (or similar) SSE endpoint
2. A `/v1/events/ticket` POST endpoint that issues a short-lived one-time token

The security comment and TODO in `sse.adapter.ts` document this clearly.

### Items from review not in scope (WARN-level, not ISSUE)
The following WARN items from chloe-dubois.md were not addressed in this pass (they are not ISSUE-level):
- `main.tsx`: LogRocket unconditional init
- `App.tsx`: single error boundary, QueryClient at module scope
- `api.ts`: legacy `clearToken`/`getToken` exports
- `utils/theme.ts`: missing `typeof window` guard
- `LoginPage.tsx`: open redirect risk
- `hooks/usePolicyRealtime.ts`: (fixed — was also in WARN)
- Various other WARN items across assistant, members, settings, audit log pages
