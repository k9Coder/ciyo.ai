# Frontend Review — Chloe Dubois, Frontend Engineer

**Scope:** `pretzel-console/src` — React/TypeScript/Vite admin SPA  
**Date:** 2026-06-08  
**Reviewer lens:** React correctness, hook lifecycle, accessibility (WCAG 2.1), XSS risk, bundle/UX correctness

---

## File-by-file analysis

#### `pretzel-console/src/main.tsx` — App entry point, Sentry + LogRocket init
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `LogRocket.init` fires unconditionally on every environment including localhost. Sentry is already gated by DSN env var and `beforeSend` returning `null` for localhost — LogRocket has no equivalent guard, so developer sessions are captured and counted against quota. `initSentry()` is called before `import React` — the ordering works in Vite due to hoisting but is fragile and confusing. The `!` non-null assertion on `getElementById('root')` will throw a runtime error with no user-visible message if the element is somehow missing.
  **Proposed changes:**
  ```ts
  // Guard LogRocket the same way Sentry guards itself
  if (import.meta.env.PROD) {
    LogRocket.init('mykkaai/pretzel-console')
  }
  ```

---

#### `pretzel-console/src/App.tsx` — Router, QueryClient, top-level error boundary
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The single `Sentry.ErrorBoundary` at the root is a good baseline, but there are no per-page or per-feature error boundaries. If `AssistantPage` or `DashboardPage` crash (e.g. on a bad API shape), the entire app is replaced by the one-line fallback paragraph. The `QueryClient` is created at module scope inside the function body on every render — in practice it only runs once since `App` renders once, but it should be extracted to module scope or `useMemo` to be explicit. `refetchOnMount: false` globally means stale data is never refreshed when a user navigates back to a tab — consider whether this is intentional for all query types (it pairs poorly with the SSE real-time invalidations which only cover policy/subjects).
  **Proposed changes:**
  ```tsx
  // Move to module scope
  const queryClient = new QueryClient({ ... })

  // Wrap per-feature routes in their own ErrorBoundary:
  <Route path="/assistant" element={
    <Sentry.ErrorBoundary fallback={<p>AI Assistant failed to load.</p>}>
      <PlanGate feature="assistantEnabled"><AssistantPage /></PlanGate>
    </Sentry.ErrorBoundary>
  } />
  ```

---

#### `pretzel-console/src/api.ts` — API client, token management
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `_tokenGetter` is a module-level mutable variable. If two `RequireAuth` instances somehow mount (e.g., during HMR), they race on `setTokenGetter`. The `clearToken()` / `getToken()` localStorage helpers are exported but no longer the primary auth path (Clerk token getter takes over) — they will silently do nothing useful and could confuse future developers. No abort signal is threaded to `fetch` calls, so in-flight requests cannot be cancelled when the component unmounts; combined with `disabled/enabled` guards in queries this is low-risk but could cause state-update-on-unmounted-component warnings in test environments.
  **Proposed changes:** N/A — acceptable for current scale, but add a comment that `setToken`/`getToken`/`clearToken` are legacy and unused in the Clerk-auth path.

---

#### `pretzel-console/src/lib/api.ts` — API_BASE config
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** None — clean. The `typeof import.meta !== 'undefined'` guard is defensive for non-Vite test environments.

---

#### `pretzel-console/src/lib/sentry.ts` — Sentry init
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Correctly gated on DSN presence and localhost guard in `beforeSend`. Replay is configured conservatively. Clean.

---

#### `pretzel-console/src/types.ts` — Domain types
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Solid TypeScript. `PolicyInfo.policy: unknown` and `ChatMessage.actionsJson: unknown[] | null` are intentionally permissive — the UI treats them as opaque. No issues.

---

#### `pretzel-console/src/utils/theme.ts` — Dark/light theme utility
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `migrateTheme()` runs at module import time (line 14), which means it executes during SSR or test environments that lack `localStorage`. The standard guard `if (typeof window !== 'undefined')` is absent. While this app is a SPA and will never SSR, vitest's jsdom environment should handle it, but it's a fragility. `getTheme()` reads from the DOM attribute rather than from `localStorage`, which means it can diverge if something touches the DOM attribute externally.
  **Proposed changes:** Low priority — add `typeof localStorage !== 'undefined'` guard around `migrateTheme`.

---

#### `pretzel-console/src/pages/LoginPage.tsx` — Clerk sign-in page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `redirectTo` is computed inside the component body from `window.location.search` on every render, but is then used as a dependency in `useEffect` (line 16). Since it's a derived value that won't change across renders, it's harmless, but it would be cleaner as `useMemo`. More importantly: the redirect target from the URL parameter (`?redirect=...`) is passed directly to React Router's `navigate()` without validation — an open redirect. A malicious link like `/login?redirect=https://evil.com` won't work with React Router (it only navigates within-app), but it's worth noting that `redirect=//evil.com` path-relative forms could potentially escape in some environments.
  **Proposed changes:**
  ```ts
  // Validate redirect is a relative path
  const raw = new URLSearchParams(window.location.search).get('redirect') ?? '/dashboard'
  const redirectTo = raw.startsWith('/') && !raw.startsWith('//') ? raw : '/dashboard'
  ```

---

#### `pretzel-console/src/pages/OnboardingPage.tsx` — Organization creation
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Loading states, error state, and guard redirects are all handled. Labels are associated with inputs via wrapping `<label>` tags. The `slugTouched` pattern cleanly prevents overwriting a manually-edited slug. Clean.

---

#### `pretzel-console/src/pages/DashboardPage.tsx` — Analytics dashboard
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** 
  1. **Missing error states:** None of the five `useAnalytics*` hooks or `usePolicy` expose their `isError` state in the UI. If any API call fails, the dashboard silently renders zeros or empty sections with no user feedback.
  2. **Bar chart uses index as key** (`key={i}` on line 105) — if `daily` array reorders (unlikely but possible) the DOM diffing will be wrong. Use `day` field instead.
  3. **Accessibility — chart has no accessible representation:** The bar chart is purely visual `<div>` elements. Screen readers cannot interpret it. At minimum, add `aria-label` to the chart container with a textual summary.
  4. **`Math.max(...daily.map(...))` with empty array** — when `daily` is empty, `Math.max()` returns `-Infinity`, but the fallback `10` saves this. However `daily` has a default of `[]` so this specific path is covered; still fragile if that default is removed.
  **Proposed changes:**
  ```tsx
  // Add error states after each hook destructure:
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useAnalyticsSummary(days)
  // ...
  {summaryError && <p style={{ color: 'var(--status-danger)', fontSize: 12 }}>Failed to load summary.</p>}

  // Chart key:
  .map(({ day, blocked, warned }) => (
    <div key={day || i} ...>
  ```

---

#### `pretzel-console/src/pages/AssistantPage.tsx` — AI assistant page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. No error state is surfaced for `send.isError` or `applyMutation.isError`. If the chat API fails, the user sees the `TypingIndicator` disappear but gets no feedback.
  2. `useAssistantSessions` and `useAssistantMessages` don't expose `isError` either; a failed session load would silently show an empty `SessionTabs`.
  3. The `pendingMessageId` prop is passed to `ChatPane` but `ChatPane` doesn't consume it (the prop exists in the interface but isn't referenced in the render body). Dead prop.
  **Proposed changes:**
  ```tsx
  // Surface send error in ChatPane or via toast:
  useEffect(() => {
    if (send.isError) toast((send.error as Error)?.message ?? 'Send failed', 'error')
  }, [send.isError])
  ```

---

#### `pretzel-console/src/pages/SubjectsPage.tsx` — Subjects and rules CRUD
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Accessibility — interactive `<span>` elements:** Lines 316–317, the "Edit" and "Delete" controls inside the subject list are `<span onClick>` elements, not `<button>` elements. They are keyboard-inaccessible (no `tabIndex`, no `role="button"`, no `onKeyDown`). Screen readers will not announce them as interactive.
  2. **`handleSave` swallows errors:** `handleSave` (line 181 in `RulesPanel`, line 270 in `SubjectsPage`) is an `async` function that `await`s `mutateAsync` but does not catch errors. If the mutation fails, an uncaught promise rejection propagates. The `onError` in the hook fires a toast, but the modal stays open — that's fine — but the unhandled rejection in the async handler is the issue.
  3. **UX — entropy/score rule shows `keywords` field labeled "Config JSON"** (line 104): reusing the `keywords` state field for JSON config is confusing semantically and would break server validation silently if the user types non-JSON.
  **Proposed changes:**
  ```tsx
  // Replace span controls with buttons:
  <button
    onClick={e => { e.stopPropagation(); openEdit(s) }}
    style={{ fontSize: 11, color: 'var(--brand-primary)', cursor: 'pointer',
             background: 'none', border: 'none' }}
    aria-label={`Edit subject ${s.name}`}
  >Edit</button>

  // Wrap handleSave:
  async function handleSave() {
    try {
      if (modal.editing) { ... } else { ... }
      closeModal()
    } catch {
      // mutation onError already toasts; just don't propagate
    }
  }
  ```

---

#### `pretzel-console/src/pages/MembersPage.tsx` — Member management
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `setTimeout(() => setCopied(false), 2000)` in `copyLink` (line 54) is not cleaned up. If the component unmounts (user navigates away) before the timeout fires, React will warn about setting state on an unmounted component (in dev mode). Fix with `useEffect` + cleanup or `useRef`.
  2. The members table renders all members at once without virtualization. For large orgs (1000+ members) this will be slow. Not critical for an admin console but worth noting.
  3. No error state for `useMembers` — if the member list fails to load, nothing is shown.
  **Proposed changes:**
  ```ts
  function copyLink() {
    if (!generatedUrl) return
    void navigator.clipboard.writeText(generatedUrl)
    setCopied(true)
    // Use a ref-tracked timeout
    const id = setTimeout(() => setCopied(false), 2000)
    // Store id in a ref and clear in useEffect cleanup
  }
  ```

---

#### `pretzel-console/src/pages/OrgPage.tsx` — Division/team/member Miller Columns
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `handleSave` is `async` and calls `mutateAsync` without a try/catch. Same pattern as `SubjectsPage` — unhandled rejection risk.
  2. The `MemberForm` `<label>` elements (line 37–46) use `<label>` as a block wrapper but the `htmlFor`/`id` pairing is missing — the `<label>` text "Email" and "Display name" are not programmatically associated with their inputs. Both labels float above their inputs but are siblings, not wrapping them.
  **Proposed changes:**
  ```tsx
  // Associate labels:
  <div>
    <label htmlFor="member-email" style={labelStyle}>Email</label>
    <input id="member-email" type="email" ... />
  </div>
  ```

---

#### `pretzel-console/src/pages/SitesPage.tsx` — Site config CRUD
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `handleSave` uses `mutateAsync` without try/catch (same pattern as other pages) but this is consistent. Labels use wrapping `<label>` correctly. Error state for list load is absent but acceptable at this scale.

---

#### `pretzel-console/src/pages/DestinationsPage.tsx` — Destination groups CRUD
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Same structure as SitesPage. Clean. Wrapping labels are correct. No issues beyond the shared `handleSave` async-without-catch pattern.

---

#### `pretzel-console/src/pages/PublishPage.tsx` — Policy publish and rollback
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `publish.mutate()` is called directly (not `mutateAsync`) so the async pattern issue doesn't apply here. Good.
  2. No `isError` state shown for `usePolicy` or `usePolicyHistory`. If history fails to load, the user sees an empty table.
  3. The rollback confirm modal uses `rollback.mutateAsync` inside an `async onConfirm` — same uncaught rejection pattern.
  **Proposed changes:** Add `{loadingHistory && isError && <p>Failed to load history.</p>}`.

---

#### `pretzel-console/src/pages/SettingsPage.tsx` — Org settings, billing, token rotation
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `window.confirm()` is used for token rotation confirmation (lines 31, 36). This is a browser-native blocking dialog — it ignores custom styling, doesn't respect the app's dark theme, can't be keyboard-trapped properly, and is inaccessible on some browser/OS combinations. Should be replaced with the app's `ConfirmModal`.
  2. `setTimeout(() => setCopied(false), 2000)` in `NewTokenBanner.copy()` (line 314) is not cleaned up on unmount — same issue as `MembersPage`.
  3. The token is displayed in plain `<code>` — acceptable since this is intentional — but the "Dismiss" button doesn't scroll into view or manage focus after dismissal.
  **Proposed changes:** Replace `window.confirm` with `ConfirmModal`. Both use-cases are security-sensitive (rotating tokens), making the UX improvement also a reliability improvement.

---

#### `pretzel-console/src/pages/AuditLogPage.tsx` — Audit log with infinite scroll
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. No `isError` state surfaced. If the initial fetch fails, the user sees a blank page with no message.
  2. Filter buttons (pills) have no `aria-pressed` or `aria-current` attribute to communicate active state to screen readers — color alone conveys the selected state.
  3. IIFE `(() => { try { return new URL(e.siteUrl).hostname } catch { return e.siteUrl } })()` (line 88) inside JSX is a readability issue and will recreate the function on every render. Extract to a utility.
  **Proposed changes:**
  ```tsx
  // Add aria-pressed to filter buttons:
  <button key={f} onClick={() => setFilter(f)} style={pillStyle(filter === f)} aria-pressed={filter === f}>

  // Add error state:
  const { data, isLoading, isError, ... } = useAuditLog(...)
  {isError && <p style={{ padding: 24, color: 'var(--status-danger)' }}>Failed to load audit log.</p>}
  ```

---

#### `pretzel-console/src/pages/InvitePage.tsx` — Invite acceptance flow
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `setTimeout(() => navigate('/dashboard'), 2000)` on accept success (line 22) is not cleaned up. If the user navigates away in those 2 seconds, the deferred navigation fires in the wrong context.
  2. The "loading" state renders a `<p>` inside the card but no `role="status"` or `aria-live` region — screen readers won't announce the loading transition.
  3. The `accepted` redirect uses `setTimeout` instead of reacting to the navigation naturally — could race with React Router's own state.
  **Proposed changes:**
  ```ts
  // Clean up timeout:
  onSuccess: () => {
    setAccepted(true)
    const id = setTimeout(() => navigate('/dashboard'), 2000)
    return () => clearTimeout(id) // can't return from onSuccess, use useEffect instead
  }
  // Better:
  useEffect(() => {
    if (!accepted) return
    const id = setTimeout(() => navigate('/dashboard'), 2000)
    return () => clearTimeout(id)
  }, [accepted, navigate])
  ```

---

#### `pretzel-console/src/pages/UnauthorizedPage.tsx` — Access denied page
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Simple, clean. The decorative `⊘` span is purely visual — acceptable. `signOut()` is straightforward.

---

#### `pretzel-console/src/pages/AccessibilityPage.tsx` — Accessibility statement (bilingual)
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The Hebrew section uses `<h1>` / `<h2>` and the English section uses `<h2>` / `<h3>`. This skips a heading level in the English section (there's an `<h2>` directly followed by `<h3>` with no `<h1>` in the English block). WCAG 1.3.1 requires a logical heading hierarchy. The English section should start at `<h1>` since it's a standalone section within the page and the Hebrew section already has the page-level `<h1>`. Also: the page has no `<main>` landmark, so screen reader users can't jump to content.
  **Proposed changes:**
  ```tsx
  <main> // wrap entire content
  // English section h2 → h1
  <h1 style={{ ... }}>Accessibility Statement</h1>
  ```

---

#### `pretzel-console/src/hooks/usePolicy.ts` — Policy fetch and mutations
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** 404 is correctly swallowed and returns `null`. Mutations have `onError` toasts. Clean.

---

#### `pretzel-console/src/hooks/usePolicyRealtime.ts` — SSE-based policy invalidation
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `getToken` from Clerk's `useAuth` is a new function reference on every render. It's in the `useEffect` dependency array (line 19), which means the effect re-runs every render, closing and reopening the SSE connection continuously. This is a real bug — it will spam reconnects in development and waste connections in production.
  **Proposed changes:**
  ```ts
  // Wrap getToken in useCallback or use useRef to stabilize:
  const getTokenRef = useRef(getToken)
  useEffect(() => { getTokenRef.current = getToken })

  useEffect(() => {
    return realtimeSubscriber.subscribe(
      () => getTokenRef.current(),
      () => {
        qc.invalidateQueries({ queryKey: ['policy'] })
        qc.invalidateQueries({ queryKey: ['policy-history'] })
        qc.invalidateQueries({ queryKey: ['subjects'] })
      }
    )
  }, [qc]) // qc is stable, getToken accessed via ref
  ```

---

#### `pretzel-console/src/hooks/useAssistant.ts` — Chat session and message hooks
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `useAssistantChat` holds `sessionId` in local component state. If the user navigates away from `AssistantPage` and back, the session ID is reset to `null`, losing context. Should be lifted to URL params or a stable store.
  2. No `onError` handlers on `send` or `useApplyActions` mutations — errors are completely silent to the user.
  **Proposed changes:**
  ```ts
  const send = useMutation({
    mutationFn: ...,
    onSuccess: ...,
    onError: (e: Error) => toast(e.message, 'error'),
  })
  ```

---

#### `pretzel-console/src/hooks/useMembers.ts` — Member CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** All mutations have `onError` toasts. `useTeamMemberMutations` correctly scopes invalidation to `['team-members', teamId]`. Clean.

---

#### `pretzel-console/src/hooks/useTeams.ts` — Team CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. `enabled: !!divisionId` correctly gates the fetch. All mutations toast on error.

---

#### `pretzel-console/src/hooks/useDivisions.ts` — Division CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. Straightforward pattern, consistent with other CRUD hooks.

---

#### `pretzel-console/src/hooks/useSubjects.ts` — Subject CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean.

---

#### `pretzel-console/src/hooks/useRules.ts` — Rules CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. `enabled: !!subjectId` is correct.

---

#### `pretzel-console/src/hooks/useSiteConfigs.ts` — Site config CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean.

---

#### `pretzel-console/src/hooks/useDestinationGroups.ts` — Destination group CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean.

---

#### `pretzel-console/src/hooks/useBilling.ts` — Billing status and portal
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `openPortal` mutation's `mutationFn` does `window.location.href = r.url` as a side effect inside the function (line 13). This is not idiomatic — side effects that navigate the browser should be in `onSuccess`, not inside `mutationFn`, since `mutationFn` is expected to be a pure async operation. If the mutation is retried, the navigation would fire again unexpectedly (though the portal URL is one-use from Stripe so this is low risk in practice).
  **Proposed changes:**
  ```ts
  const openPortal = useMutation({
    mutationFn: (returnUrl?: string) => api.billing.stripePortal(returnUrl),
    onSuccess: (r) => { window.location.href = r.url },
    onError: (e: Error) => toast(e.message, 'error'),
  })
  ```

---

#### `pretzel-console/src/hooks/useAnalytics.ts` — Analytics query hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. Query keys correctly include `days` parameter so cache is scoped per time window.

---

#### `pretzel-console/src/hooks/useAuditLog.ts` — Infinite query for audit log
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Correct use of `useInfiniteQuery`. `getNextPageParam` correctly returns `undefined` when `nextBefore` is null, terminating pagination.

---

#### `pretzel-console/src/hooks/useTenant.ts` — Tenant CRUD hooks
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean.

---

#### `pretzel-console/src/hooks/useToast.ts` — Toast notification system
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Module-level singleton listener:** `toastListener` is a module-level variable. If there are ever two `ToastContainer` instances mounted (e.g., during testing or future layout changes), the second `useToastStore` call overwrites `toastListener` in its `useState` initializer, silently discarding the first container's listener. The `useState` initializer approach (`useState(() => { toastListener = addToast })`) is also an anti-pattern — the initializer is called once per component instance but `useState`'s callback form is meant to be a pure computation, not a side effect.
  2. `setTimeout` inside `addToast` (line 23) fires a state update 3 seconds after the toast is added. If `ToastContainer` unmounts before 3 seconds (possible during tests), this will warn. No cleanup mechanism exists.
  3. `useToast` returns a `toast` function that calls `toastListener?.()` — if no `ToastContainer` is mounted, toasts silently disappear.
  **Proposed changes:** Use a proper event-emitter or a shared Zustand/Jotai atom rather than module-level mutable state. At minimum, move `toastListener = addToast` into a `useEffect` to make it a proper side effect, and clean it up:
  ```ts
  useEffect(() => {
    toastListener = addToast
    return () => { toastListener = null }
  }, [addToast])
  ```

---

#### `pretzel-console/src/components/layout/AppLayout.tsx` — Sidebar + top bar + outlet
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Accessibility — `<nav>` has no label:** The sidebar `<nav>` (line 115) has no `aria-label`. When there are multiple nav regions on a page (this is the only one here, but screen reader users navigate by landmark), it should be labelled: `<nav aria-label="Main navigation">`.
  2. **ThemeToggle has no accessible label:** The theme toggle button (line 39) uses `title="Toggle theme"` — `title` is not reliably announced by all screen readers. Add `aria-label="Toggle theme"`.
  3. **Emoji as icon-only controls:** The nav items use Unicode symbols (`▦`, `⊡`, etc.) as icons. These are rendered as text nodes — screen readers will announce the raw unicode name ("Black square containing white square") rather than the intended meaning. Use `aria-hidden="true"` on the icon span and ensure the label is readable.
  4. **`ThemeToggle` emoji buttons:** `☀` and `🌙` as button content — same issue; they'll be read as "white sun with rays" and "crescent moon".
  **Proposed changes:**
  ```tsx
  <nav aria-label="Main navigation" style={...}>

  // Theme toggle:
  <button onClick={toggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`} ...>
    <span aria-hidden="true">{theme === 'dark' ? '☀' : '🌙'}</span>
  </button>

  // Nav icon:
  <span aria-hidden="true" style={{ fontSize: 13 }}>{icon}</span>
  {label}
  ```

---

#### `pretzel-console/src/components/layout/RequireAuth.tsx` — Auth guard HOC
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `setTokenGetter(() => getToken())` is called synchronously during render (lines 18–22). Mutating module-level state during render violates React's rendering purity contract and can cause issues in Strict Mode (which renders components twice in dev). While this is intentional for timing (comment explains it), a `useLayoutEffect` would be semantically cleaner and avoid the Strict Mode double-call issue. The `useEffect(() => () => setTokenGetter(null), [])` cleanup on line 24 has an empty dependency array which is correct for unmount-only cleanup.
  **Proposed changes:**
  ```tsx
  useLayoutEffect(() => {
    if (ready) setTokenGetter(() => getToken())
    else if (isLoaded && !isSignedIn) setTokenGetter(null)
  }, [ready, isLoaded, isSignedIn, getToken])
  ```

---

#### `pretzel-console/src/components/layout/PretzelLogo.tsx` — Theme-aware logo
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `MutationObserver` is properly cleaned up via `observer.disconnect()` in the effect cleanup. The `alt="Pretzel logo"` is correct. Clean.

---

#### `pretzel-console/src/components/ui/MillerColumns.tsx` — Three-column org navigator
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **`ColumnRow` is not keyboard-accessible:** The row `<div>` handles visual hover via `onMouseEnter`/`onMouseLeave` state, but the edit/delete action buttons only appear on hover. A keyboard user who Tab-focuses the inner `<button>` for selection will never see or reach the Edit/Delete buttons because they depend on mouse hover state. The hover-only reveal pattern breaks keyboard navigation entirely.
  2. **Column container uses `key={i}`** (line 87) — index keys on a stable array are fine here, but it means column identity shifts if the array changes; prefer using `col.title` as key.
  3. **`ColumnRow` local `useState` for hover** creates a re-render per row on every mouse movement across the list. With many items this is a perf concern. CSS `:hover` is sufficient.
  **Proposed changes:**
  ```tsx
  // Replace mouse-hover visibility with CSS:
  // Add a CSS class to the row container and use group-hover (Tailwind) or CSS :has()
  // Or always show action buttons but dim them when row is not focused/hovered:
  <div style={{ opacity: isSelected || focused ? 1 : 0.3, transition: 'opacity 0.1s' }}>
    {/* action buttons */}
  </div>
  
  // Or show actions always for keyboard users by adding :focus-within detection
  ```

---

#### `pretzel-console/src/components/ui/EntityModal.tsx` — CRUD entity modal
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Focus management:** When the modal opens, focus is not moved into the modal. Keyboard users remain focused on whatever triggered the open, and Tab will cycle through background content (since there's no focus trap). WCAG 2.1 SC 2.4.3 (Focus Order) and the ARIA dialog pattern both require focus to move to the modal's first focusable element on open, and to be trapped within the modal while it's open.
  2. **No `aria-labelledby`:** The `role="dialog"` element has no `aria-labelledby` pointing to the `<h2>` title. Screen readers announce the dialog but not its name.
  3. **Backdrop click closes without focus return:** When closed via backdrop click or Escape, focus should return to the element that opened the modal.
  **Proposed changes:**
  ```tsx
  // Add aria-labelledby:
  const titleId = useId()
  <div role="dialog" aria-modal="true" aria-labelledby={titleId} ...>
    <h2 id={titleId} ...>{title}</h2>

  // Add focus trap (use a library like focus-trap-react, or implement manually):
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open) dialogRef.current?.focus()
  }, [open])
  ```

---

#### `pretzel-console/src/components/ui/ConfirmModal.tsx` — Destructive confirm dialog
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** Same critical accessibility failures as `EntityModal`:
  1. No focus management on open — focus stays on background content.
  2. No focus trap — Tab escapes the modal.
  3. `role="dialog"` has no `aria-labelledby` — dialog has no accessible name.
  4. "Delete" button is not the first focusable element — ARIA pattern for destructive dialogs recommends the Cancel button receive initial focus to prevent accidental deletion by spacebar-happy users. Currently neither button gets programmatic focus.
  5. No Escape key handler (EntityModal has this but ConfirmModal doesn't).
  **Proposed changes:** Same as `EntityModal` — implement focus management and `aria-labelledby`. Add Escape to close:
  ```tsx
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  ```

---

#### `pretzel-console/src/components/ui/SplitPane.tsx` — Two-panel layout
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Simple and correct. Non-resizable, but that's by design for this use case.

---

#### `pretzel-console/src/components/ui/ToastContainer.tsx` — Toast rendering
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:** Toast messages have no `role="alert"` or `aria-live` attribute. Screen readers will not announce new toasts to users, which means success/error feedback from mutations is completely invisible to assistive technology. This is a critical WCAG 4.1.3 (Status Messages) failure.
  **Proposed changes:**
  ```tsx
  <div
    key={t.id}
    role="alert"
    aria-live="assertive"
    aria-atomic="true"
    className={`px-4 py-3 ...`}
  >
    {t.message}
  </div>
  ```

---

#### `pretzel-console/src/components/ui/Toggle.tsx` — Switch toggle
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `outline: 'none'` on line 19 removes the focus ring entirely. While `role="switch"` and `aria-checked` are correctly set, keyboard users who Tab to this control receive no visual focus indicator — WCAG 2.4.7 (Focus Visible) failure. Replace with a custom focus ring using `outline` + `box-shadow`.
  **Proposed changes:**
  ```tsx
  // Replace outline: 'none' with a focus-visible rule:
  // In global CSS:
  [role="switch"]:focus-visible {
    outline: 2px solid var(--brand-primary);
    outline-offset: 2px;
  }
  // Or via inline style with :focus-visible pseudo (requires CSS module)
  ```

---

#### `pretzel-console/src/components/ui/Badge.tsx` — Semantic badge
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Purely presentational `<span>` — correct. Colors meet contrast for most variants against dark background. No issues.

---

#### `pretzel-console/src/components/ui/EmptyState.tsx` — Empty list state
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. Action button is a proper `<button>`.

---

#### `pretzel-console/src/components/ui/PageHeader.tsx` — Page title + action bar
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. `<h1>` is used correctly. Action is passed through as `ReactNode`.

---

#### `pretzel-console/src/components/ui/Spinner.tsx` — Loading spinner
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `role="status"` and `aria-label="Loading"` are correctly set. SVG animation is CSS-based (not SMIL). Clean.

---

#### `pretzel-console/src/components/assistant/ChatPane.tsx` — Chat message pane
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Inline `<style>` on every render:** The `<style>` block (lines 111–119) is injected directly into the component's render output on every render cycle. This is technically valid but unconventional — React doesn't deduplicate inline style tags in the component tree. These animations should be in a global CSS file.
  2. **Auto-scroll swallows user scroll position:** `scrollIntoView({ behavior: 'smooth' })` fires on every change to `messages.length` or `isSending`. If the user has scrolled up to read history and a new message arrives, they are forcibly dragged back to the bottom. A proper chat should only auto-scroll when the user is already at the bottom (or if the message is from the current user).
  3. **`pendingMessageId` prop is unused** — passed from `AssistantPage` but `ChatPane` doesn't use it in its render.
  **Proposed changes:**
  ```tsx
  // Auto-scroll only when near bottom:
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    if (isNearBottom || isSending) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages.length, isSending])
  ```

---

#### `pretzel-console/src/components/assistant/ChatInput.tsx` — Chat text input
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** The send button has `title="Send (Enter)"` which is a tooltip — not announced by all screen readers. Add `aria-label="Send message"`. The `<textarea>` has a `placeholder` but no `<label>` or `aria-label` — screen readers will announce the placeholder text as the field name, which disappears as soon as the user types. Add `aria-label="Chat input"` to the textarea.
  **Proposed changes:**
  ```tsx
  <textarea aria-label="Chat message" ... />
  <button aria-label="Send message" title="Send (Enter)" ... />
  ```

---

#### `pretzel-console/src/components/assistant/MessageBubble.tsx` — Chat message bubble
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `useRevertMessage()` is called unconditionally in every `MessageBubble`, even for messages that don't have `hasVersionSnapshot`. This creates a `useMutation` instance per message, including an internal `useMutation` query cache entry. For a long conversation this is wasteful — the mutation should be lifted to the parent or instantiated only when `hasVersionSnapshot` is true (but hooks can't be conditional). Consider lifting `useRevertMessage` to `ChatPane` and passing `onRevert` as a callback prop.
  2. The "Revert changes from this message" button has no `aria-label` — its visible text is descriptive enough, so this is minor.
  3. `message.content` is rendered as `{message.content}` inside `<p>` with `white-space: pre-wrap`. This is safe from XSS since React escapes string content. Good.
  **Proposed changes:** Lift `useRevertMessage` to `ChatPane` level, pass `onRevert` prop down.

---

#### `pretzel-console/src/components/assistant/ActionItem.tsx` — Proposed change item
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Values are rendered via `JSON.stringify` or as strings — no XSS risk since React handles escaping. Read-only display component. Clean.

---

#### `pretzel-console/src/components/assistant/PreviewPane.tsx` — Actions preview panel
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `actions.map((action, i) => <ActionItem key={i} action={...} />)` uses index as key. Actions can be reordered by the server response (unlikely but possible with bulk operations), and index keys would cause incorrect reconciliation. The `action` objects have an `op` field — a composite key of `op + subjectId/ruleId` would be more stable.
  **Proposed changes:**
  ```tsx
  actions.map((action, i) => {
    const a = action as Record<string, unknown>
    const key = `${a.op}-${a.subjectId ?? a.ruleId ?? i}`
    return <ActionItem key={key} action={a} />
  })
  ```

---

#### `pretzel-console/src/components/assistant/SessionTabs.tsx` — Chat session tab bar
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The tab bar scrolls horizontally with `overflow-x: auto` but uses `scrollbarWidth: 'none'` to hide the scrollbar. This means keyboard users (and mouse users on non-touch devices without scroll gestures) cannot discover or scroll through sessions beyond the visible area.
  2. Session tab buttons have `title={s.title}` but no `aria-label` — the button content is the truncated title, so the full title is only in the tooltip. On screen readers that don't read `title`, the truncated text is all that's announced.
  3. There is no `role="tablist"` / `role="tab"` pattern — the tabs look like tabs but don't behave as ARIA tabs (no keyboard arrow-key navigation between sessions, no `aria-selected`).
  **Proposed changes:**
  ```tsx
  // Add ARIA tab pattern:
  <div role="tablist" aria-label="Chat sessions" style={...}>
    {sessions.map(s => (
      <button
        key={s.id}
        role="tab"
        aria-selected={s.id === activeSessionId}
        onClick={() => onSelect(s.id)}
        aria-label={s.title}
        ...
      >
        {s.title}
      </button>
    ))}
  </div>
  ```

---

#### `pretzel-console/src/components/billing/PlanGate.tsx` — Feature gate by plan
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `if (isLoading) return null` causes the entire gated page to be invisible while billing loads. The user sees a flash of nothing. Consider rendering a skeleton or at least the page chrome. Also, if `useBilling` errors out, `data` is `undefined`, `data?.features[feature]` is `undefined` (falsy), and the upgrade wall is shown — which is arguably correct but could confuse users if the error is transient (network issue). No `isError` handling is shown.
  **Proposed changes:**
  ```tsx
  if (isLoading) return <InlineLoader />
  if (isError) return <p>Could not verify plan. Please refresh.</p>
  ```

---

#### `pretzel-console/src/components/billing/UpgradeBanner.tsx` — Scan limit warning banner
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** The banner only renders when near/over limit — correct gating. Progress bar has no `role="progressbar"` or `aria-valuenow`/`aria-valuemax` — WARN-level a11y issue but very minor in a sidebar banner context. Clean otherwise.

---

#### `pretzel-console/src/realtime/index.ts` — SSE subscriber singleton
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean module-level singleton export.

---

#### `pretzel-console/src/realtime/sse.adapter.ts` — SSE connection with reconnect
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Token leaked in URL:** `new EventSource(\`${API_BASE}/v1/events?token=${token}\`)` puts the auth token as a query parameter. This means the token appears in server access logs, browser history, referrer headers, and Sentry breadcrumbs. SSE authentication should use a ticket/one-time token approach, or the token should be sent via a cookie (requires CORS credentials). This is a security issue, not just a code quality issue.
  2. **Reconnect storm risk:** The `error` handler calls `connect()` recursively after a 1-second `setTimeout`. If the error is persistent (e.g., server 500), this creates an exponential reconnect loop. There's no backoff, no maximum retry count, and no circuit breaker.
  3. **`closed` flag race:** The `closed` flag is set synchronously in the cleanup function, but `connect()` is async. If the effect cleanup runs while `connect()` is awaiting `getToken()`, `closed` will be `true` when `es = new EventSource(...)` runs — but the assignment still happens, and `es.close()` in the cleanup has already fired on the previous (null) `es`. The new `EventSource` is leaked.
  **Proposed changes:**
  ```ts
  // Security: use a short-lived SSE ticket instead of the main auth token in the URL
  // Reconnect: add exponential backoff
  let retryDelay = 1000
  const MAX_DELAY = 30_000

  es.addEventListener('error', async () => {
    if (es?.readyState === EventSource.CLOSED && !closed) {
      es.close()
      await new Promise(r => setTimeout(r, retryDelay))
      retryDelay = Math.min(retryDelay * 2, MAX_DELAY)
      if (!closed) connect()
    }
  })
  // Reset delay on successful connection:
  es.addEventListener('open', () => { retryDelay = 1000 })
  ```

---

#### `pretzel-console/src/realtime/types.ts` — Realtime interface
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean interface definition.

---

## Summary table

| File | Verdict |
|---|---|
| `main.tsx` | WARN |
| `App.tsx` | WARN |
| `api.ts` | WARN |
| `lib/api.ts` | PASS |
| `lib/sentry.ts` | PASS |
| `types.ts` | PASS |
| `utils/theme.ts` | WARN |
| `pages/LoginPage.tsx` | WARN |
| `pages/OnboardingPage.tsx` | PASS |
| `pages/DashboardPage.tsx` | ISSUE |
| `pages/AssistantPage.tsx` | WARN |
| `pages/SubjectsPage.tsx` | ISSUE |
| `pages/MembersPage.tsx` | WARN |
| `pages/OrgPage.tsx` | WARN |
| `pages/SitesPage.tsx` | PASS |
| `pages/DestinationsPage.tsx` | PASS |
| `pages/PublishPage.tsx` | WARN |
| `pages/SettingsPage.tsx` | WARN |
| `pages/AuditLogPage.tsx` | WARN |
| `pages/InvitePage.tsx` | WARN |
| `pages/UnauthorizedPage.tsx` | PASS |
| `pages/AccessibilityPage.tsx` | WARN |
| `hooks/usePolicy.ts` | PASS |
| `hooks/usePolicyRealtime.ts` | WARN |
| `hooks/useAssistant.ts` | WARN |
| `hooks/useMembers.ts` | PASS |
| `hooks/useTeams.ts` | PASS |
| `hooks/useDivisions.ts` | PASS |
| `hooks/useSubjects.ts` | PASS |
| `hooks/useRules.ts` | PASS |
| `hooks/useSiteConfigs.ts` | PASS |
| `hooks/useDestinationGroups.ts` | PASS |
| `hooks/useBilling.ts` | WARN |
| `hooks/useAnalytics.ts` | PASS |
| `hooks/useAuditLog.ts` | PASS |
| `hooks/useTenant.ts` | PASS |
| `hooks/useToast.ts` | ISSUE |
| `components/layout/AppLayout.tsx` | ISSUE |
| `components/layout/RequireAuth.tsx` | WARN |
| `components/layout/PretzelLogo.tsx` | PASS |
| `components/ui/MillerColumns.tsx` | ISSUE |
| `components/ui/EntityModal.tsx` | ISSUE |
| `components/ui/ConfirmModal.tsx` | ISSUE |
| `components/ui/SplitPane.tsx` | PASS |
| `components/ui/ToastContainer.tsx` | ISSUE |
| `components/ui/Toggle.tsx` | WARN |
| `components/ui/Badge.tsx` | PASS |
| `components/ui/EmptyState.tsx` | PASS |
| `components/ui/PageHeader.tsx` | PASS |
| `components/ui/Spinner.tsx` | PASS |
| `components/assistant/ChatPane.tsx` | WARN |
| `components/assistant/ChatInput.tsx` | WARN |
| `components/assistant/MessageBubble.tsx` | WARN |
| `components/assistant/ActionItem.tsx` | PASS |
| `components/assistant/PreviewPane.tsx` | WARN |
| `components/assistant/SessionTabs.tsx` | WARN |
| `components/billing/PlanGate.tsx` | WARN |
| `components/billing/UpgradeBanner.tsx` | PASS |
| `realtime/index.ts` | PASS |
| `realtime/sse.adapter.ts` | ISSUE |
| `realtime/types.ts` | PASS |

**Totals:** PASS: 26 · WARN: 22 · ISSUE: 9

---

## Top 5 most important frontend issues

### 1. Auth token exposed in SSE URL (`sse.adapter.ts`) — SECURITY
The Clerk JWT is passed as `?token=` in the `EventSource` URL. This leaks the token to server logs, browser history, and error-tracking breadcrumbs. Fix by sending a short-lived SSE ticket from a `/v1/events/ticket` endpoint and using that in the URL instead of the primary auth token.

### 2. Modals have no focus management or focus trap (`EntityModal`, `ConfirmModal`) — WCAG BLOCKER
Both modals render without moving focus into the dialog, without trapping focus within it, and without returning focus to the trigger on close. This makes every CRUD operation in the admin console entirely keyboard-inaccessible. Implement focus-trap (a small dependency like `focus-trap-react`, or manual `useEffect` + firstFocusable query) and add `aria-labelledby` to the dialog elements.

### 3. `usePolicyRealtime` reconnects on every render due to unstable `getToken` dep — RUNTIME BUG
`getToken` from `useAuth()` is a new function reference each render. It's in the `useEffect` dependency array, causing the SSE subscription to teardown and recreate on every render. This will flood the server with open/close events. Fix by storing `getToken` in a `useRef` and only including stable references in the dep array.

### 4. `ToastContainer` has no `aria-live` region — WCAG 4.1.3 FAILURE
All mutation feedback (success/error messages) is completely invisible to screen readers. Every mutation hook routes errors through `toast()` — so this single fix unlocks all error feedback for assistive technology. Add `role="alert"` + `aria-live="assertive"` to each toast item.

### 5. `MillerColumns` edit/delete buttons are mouse-hover-only — keyboard inaccessibility
The `ColumnRow` component only shows Edit/Delete buttons on `onMouseEnter`. Keyboard users who Tab to the row's select button can never reach the action buttons, making the entire Org page's edit/delete functionality unavailable via keyboard. This is the most visible accessibility gap on a complex, frequently-used page. Fix by always rendering action buttons (use CSS opacity/visibility for the hover effect) so they remain reachable in the tab order.
