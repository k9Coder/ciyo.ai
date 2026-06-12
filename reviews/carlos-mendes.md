# Design & Accessibility Review — Carlos Mendes
**Date:** 2026-06-08
**Reviewer:** Carlos Mendes, Designer

---

## Extension — Overlay

#### `pretzel/src/content/overlay/WarningModal.tsx` — Security warning modal intercepting prompt submission
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. Focus management is good — `editBtnRef` focuses the primary action on mount, Escape closes the modal. That's correct.
  2. No `aria-describedby` pointing at the subtitle/findings list. The dialog has `aria-labelledby="ciyo-modal-title"` but a screen reader landing on the dialog gets no description of what the list contains.
  3. The "Looks fine, send it" ghost button has zero aria context — no `aria-label` indicating it bypasses a security warning. A screen reader user just hears "Looks fine, send it" without understanding the consequence.
  4. The warning SVG icon (`ciyo-warn-icon`) has no `aria-hidden="true"`. It is decorative (the `<h2>` already conveys the warning) but it will be read by some AT as an unlabelled image.
  5. `FindingRow` renders a `<li>` but the containing `<ul>` has `style={{ listStyle: "none" }}` — Safari VoiceOver de-lists elements with `list-style: none` unless `role="list"` is explicitly added to the `<ul>`.
  6. The `<mark>` inside FindingRow has no accessible context — a screen reader user hears the highlighted text but doesn't know it is the flagged portion.
  7. No visible focus ring is enforced on the ghost button (`ciyo-btn-ghost`). If the host page's CSS bleeds through (shadow DOM should prevent it, but the CSS is injected as a string), the focus state may be invisible.
  8. `highestAction !== "block"` controls whether "send anyway" appears but there is no live region or announcement when the modal opens — a user relying on a screen reader may not know the modal appeared at all.

  **Proposed changes:**
  - Add `aria-describedby="ciyo-modal-subtitle"` to the backdrop div; give the subtitle `<p>` `id="ciyo-modal-subtitle"`.
  - Add `aria-label="Bypass security warning and send prompt"` to the "Looks fine, send it" button.
  - Add `aria-hidden="true"` to the warning SVG.
  - Add `role="list"` to the `<ul className="ciyo-modal-body">`.
  - Wrap the `<mark>` with a visually hidden prefix: `<span className="sr-only">Flagged text: </span>`.
  - Add `aria-live="assertive"` to the backdrop on mount so AT announces the modal.

---

#### `pretzel/src/content/overlay/HighlightLayer.tsx` — Highlighted prompt text renderer
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. The component is unused in `WarningModal.tsx` — the modal uses the separate `buildSnippet`/`FindingRow` approach, not `HighlightLayer`. If this is intended to be a reusable component, it's currently dead code with no consumer. If it's meant to replace the snippet logic, it was never wired up.
  2. The `<pre>` element with `bg-yellow-300 text-gray-900` for `<mark>` uses Tailwind utility classes applied inside what becomes a Shadow DOM. These classes will only work if the Tailwind stylesheet is actually injected — which it is via `overlay.css?inline` — but the component itself has no guarantee it's only rendered inside the shadow root. If ever rendered outside, the marks will be yellow on no-background which could fail contrast (yellow `#fde047` on white is approximately 1.1:1, well below 4.5:1).
  3. The `<pre>` container has no accessible label. It presents a chunk of text with embedded highlights but screen readers will just read it as a flat block of text. There's no `aria-label` like "Prompt text with flagged sections highlighted".
  4. The `<mark>` element alone is not announced as highlighted by all screen readers — it needs a visually hidden text equivalent for each highlighted range, or an `aria-label` on the `<mark>`.
  5. No `role` or `aria-label` on the `<pre>` — a screen reader user with `<pre>` in focus just gets the raw text with no context.

  **Proposed changes:**
  - Either wire this component into `WarningModal.tsx` (replacing the inline snippet logic) or delete it to avoid dead code confusion.
  - If kept: add `aria-label="Flagged prompt content"` to the `<pre>`, and wrap each `<mark>` with a visually hidden span: `<span className="sr-only">[flagged]: </span>`.
  - Confirm contrast: swap `bg-yellow-300` for `bg-amber-200` or add `ring-2 ring-amber-500` for a pattern-agnostic highlight that doesn't rely solely on color.

---

#### `pretzel/src/content/overlay/overlay-root.tsx` — Shadow DOM mount and modal lifecycle
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The shadow host has `pointerEvents: "none"` at the container level and the inner `#ps-react-root` container overrides to `auto`. This is correct. However the shadow host is a zero-size `div` positioned at `0,0` — if the host page has a `z-index: 2147483647` element (some chat UIs do), the modal may render behind it. This is an edge-case UX risk, not a bug per se.
  2. `applyTheme()` reads from `chrome.storage.sync` and applies `data-theme` to `shadowHost` (not to `shadowHost.shadowRoot` or any inner element). The CSS custom properties defined on `:root` inside the shadow stylesheet won't inherit from `shadowHost[data-theme]` unless the shadow stylesheet specifically targets the host via `:host([data-theme="light"])`. This is likely a theming bug that would cause the wrong theme to render inside the overlay.
  3. On unmount/dismiss (`dismissModal`), the React tree is rendered to `<></>` — this removes the modal from the DOM but leaves `shadowHost` in `document.body`. If a screen reader is focused inside the modal when dismissed, focus is dropped to `<body>` without being returned to the triggering element (the send button). This is a WCAG 2.1 AA failure (Focus Management, 2.4.3).
  4. No `role="presentation"` or `aria-hidden` on the zero-size host element itself — though with `width: 0; height: 0` it may not be traversable.

  **Proposed changes:**
  - Save a reference to `document.activeElement` before `showWarningModal` is called and restore focus to it after `dismissModal` or after the promise resolves.
  - Verify the shadow stylesheet uses `:host([data-theme="light"]) { ... }` selectors rather than `[data-theme="light"] .ciyo-modal { ... }` which won't work across shadow boundaries.
  - Add `aria-hidden="true"` to `shadowHost` and flip it to `false` only while the modal is mounted, so the zero-size host is invisible to AT when no modal is shown.

---

## Extension — Popup

#### `pretzel/src/popup/Popup.tsx` — Extension popup (signed-in and signed-out states)
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. `ThemeToggle` button: renders emoji characters `☀` and `🌙` as the button's only content. Both are invisible to screen readers (emoji are read inconsistently across AT — `☀` may read as "black sun with rays" or nothing). The `title` attribute is not a reliable accessible name on buttons — use `aria-label` instead.
  2. The site enable/disable button (`ACTIVE` / `PAUSED`) has no `aria-label`, no `role`, and no `aria-pressed`/`aria-checked`. It looks like a toggle but is a `<button>` with a textual label that changes. A screen reader user hears "ACTIVE" or "PAUSED" but doesn't know clicking it toggles the site. Add `aria-pressed={siteEnabled}` and a meaningful `aria-label`.
  3. The header logo+wordmark button (`onClick={() => chrome.runtime.openOptionsPage()}`) has no `aria-label`. A screen reader will try to compute a label from children: `<img alt="Pretzel logo">` + `<span>ciyo</span>` — the resulting label would be something like "Pretzel logo ciyo", which is workable but the action ("Opens settings") is not described.
  4. Status banner (the colored box with "All clear" / "Sensitive data detected"): uses color alone to convey status — a green dot or red dot plus text. Color-blind users (red-green in particular) may not distinguish the dot colors. The text fallback ("All clear", "Sensitive data detected") is present, which is good, but there's no ARIA live region to announce when status changes while the popup is open.
  5. Recent event items: action badge text sizes at `fontSize: 9` — that's sub-accessible, below 11px which is already borderline. WCAG SC 1.4.4 (Resize Text) requires text to scale 200% without loss of content; at 9px even 200% is only 18px, which is fine mathematically, but 9px base is genuinely illegible for users with moderate vision impairment without zooming.
  6. Footer "Settings →" link is a `<button>` with `fontSize: 10` — same issue. Also, the arrow character is read by some screen readers as "right arrow" rather than being treated as decorative.
  7. The `Wordmark` component renders the brand name as individual `<span>` elements per letter with different colors. Screen readers will concatenate these as "c i yo" with potential spacing depending on the AT. This is a cosmetic issue — the logo meaning is carried by context, but it could be improved with `aria-label="ciyo"` on the wrapper span.
  8. No `<main>` landmark or `role="main"` on the popup body — popup content is all in a flat `<div>` structure with no navigation landmarks.

  **Proposed changes:**
  - Replace `title` with `aria-label` on `ThemeToggle`: `aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}`.
  - Add `aria-pressed={siteEnabled}` and `aria-label={`${hostname} protection ${siteEnabled ? "active" : "paused"}, click to toggle`}` to the toggle button.
  - Add `aria-label="Open ciyo settings"` to the header logo button.
  - Add `aria-live="polite"` to the status banner div so status changes are announced.
  - Increase minimum font sizes: event badge text to at least 11px, footer button to 11px.
  - Add `aria-hidden="true"` to the "→" arrow character in the Settings button and use visible text only.

---

## Extension — Options Pages

#### `pretzel/src/options/App.tsx` — Options page shell with tab navigation
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. The tab bar is a row of `<button>` elements — this is not a proper ARIA tab pattern. There is no `role="tablist"` on the container, no `role="tab"` on individual buttons, no `aria-selected`, no `aria-controls` pointing at the content panel, and no `role="tabpanel"` on the content container. A screen reader user has no way to understand these are tabs or navigate them with arrow keys as expected by the ARIA authoring practices.
  2. `ThemeToggleButton` in the header has the same issue as in Popup: emoji-only content, no `aria-label`.
  3. The wordmark SVG in the header (the pretzel-bracket logo) has no `aria-label` or `aria-hidden`. It will be read as an unlabelled image by some AT.
  4. The `<header>` semantic element is used correctly. However the page `<main>` wrapping the content area is good. The tab container between them has no landmark role — it should be `<nav role="tablist">` or at minimum a `<div role="tablist">`.
  5. No `aria-selected` on active tab — keyboard users pressing Tab will cycle through all three buttons but have no way to know which page is currently shown.

  **Proposed changes:**
  - Add `role="tablist"` to the tab container `<div>`.
  - Add `role="tab"` and `aria-selected={activeTab === tab.id}` and `aria-controls={`panel-${tab.id}`}` to each tab button.
  - Add `role="tabpanel"` and `id={`panel-${activeTab}`}` to the `<main>` wrapper (or an inner div).
  - Implement arrow-key navigation between tabs per ARIA Authoring Practices.
  - Add `aria-hidden="true"` to the decorative SVG logo, or give it `aria-label="ciyo logo"` if meaningful.
  - Replace emoji in `ThemeToggleButton` with `aria-label`.

---

#### `pretzel/src/options/pages/AccountPage.tsx` — User account and sign-out
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. Avatar `<img>` uses `alt="Avatar"` — generic. Should be `alt={user.fullName ?? "User avatar"}` so the name is conveyed in image context.
  2. `SignOutButton` wraps a `<button>` with `text-red-600 border-red-200`. The contrast of `#dc2626` on `#fff` background is approximately 5.9:1 which passes AA. Good.
  3. The page has no `<h1>` — the nearest heading is inside `App.tsx` (the brand name in the header). The tab content panel should have an `<h1>` or at minimum an `<h2>` to orient screen reader users. The `AboutPage` has an `<h2>`, `AuditPage` has an `<h2>`, but `AccountPage` has none at all — it's just a card.
  4. No visible loading state beyond `<PageLoader label="Authenticating" />` — assuming `PageLoader` announces the loading state, this is fine; if it doesn't have `aria-live`, loading is invisible to AT.
  5. Hard-coded Tailwind classes (`bg-white`, `border-gray-200`) will not respect the dark theme CSS custom properties used everywhere else in the extension. Dark mode on AccountPage will show a white card.

  **Proposed changes:**
  - Change avatar `alt` to user's name.
  - Add `<h2 className="text-lg font-semibold">Account</h2>` at the top of the card content.
  - Replace `bg-white border-gray-200` with theme-aware tokens: `bg-[var(--bg-surface)] border-[var(--border)]`.

---

#### `pretzel/src/options/pages/AuditPage.tsx` — Audit log with filtering and pagination
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. The filter `<input>` has a `placeholder` but no `<label>`. Placeholders disappear on input and are not reliable accessible names. This is a clear WCAG 1.3.1 failure — form inputs must have programmatic labels. Add `<label htmlFor="audit-hostname-filter" className="sr-only">Filter by hostname</label>` and `id="audit-hostname-filter"` on the input.
  2. The data table has no `<caption>` — screen readers won't know the purpose of the table without one.
  3. `<th>` cells have no `scope="col"`. Without `scope`, some AT won't correctly associate header cells with data cells.
  4. Pagination buttons ("Previous", "Next") have `disabled={page === 0}` and `disabled={events.length < PAGE_SIZE}` — this is correct, but there's no `aria-label` distinguishing them from each other for screen readers reading button lists. Both are generic "Previous"/"Next" text — sufficient in context but could have `aria-label="Go to previous page"` / `aria-label="Go to next page"`.
  5. `title={ev.reason}` on the "(reason)" span — `title` attributes are keyboard-inaccessible (hover-only). The reason text is hidden from keyboard-only users entirely.
  6. The "Export CSV" button has no loading/success feedback — clicking it triggers a download with no visible confirmation. A success toast or `aria-live` update should confirm the export completed.
  7. The empty state `<p className="text-sm text-gray-500">No audit events found.</p>` uses hard-coded Tailwind colors, not theme tokens — will look wrong in dark mode.

  **Proposed changes:**
  - Add `<label htmlFor="audit-hostname-filter" className="sr-only">Filter by hostname</label>` and `id` on the input.
  - Add `<caption className="sr-only">Audit log events</caption>` to the `<table>`.
  - Add `scope="col"` to all `<th>` elements.
  - Replace `title={ev.reason}` with a tooltip component or an expandable row that shows the reason on click/keyboard.
  - Add a success toast after `handleExportCSV` completes.

---

#### `pretzel/src/options/pages/AboutPage.tsx` — Extension about/info page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The external link "Documentation & source code" points to `https://github.com/your-org/ciyo` — this is a placeholder URL that was never replaced. Shipping this to production would be embarrassing.
  2. External links (`target="_blank"`) have no visual indication they open in a new tab, and no `aria-label` or visually hidden text like `(opens in new tab)`. WCAG 2.4.4 / user expectation.
  3. The "support@ciyo.ai" `<a href="mailto:...">` link has no indication it opens a mail client. A visually hidden `(opens email client)` would be courteous.
  4. Both links use `className="flex items-center gap-2 text-blue-600 hover:underline"` — the gap-2 implies an icon should be present (common pattern), but there's no icon. The flex+gap is unnecessary and leaves phantom spacing.

  **Proposed changes:**
  - Replace the placeholder GitHub URL before any release.
  - Add `<span className="sr-only"> (opens in new tab)</span>` inside the `target="_blank"` link.
  - Remove `flex items-center gap-2` from links unless an icon is added (e.g. an `ExternalLink` lucide icon).

---

## Extension — Shared

#### `pretzel/src/shared/theme.ts` — Theme get/set utilities for extension
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. `setTheme('light')` adds `data-theme="light"` but `setTheme('dark')` *removes* the attribute entirely rather than setting `data-theme="dark"`. This means CSS selectors written as `[data-theme="dark"]` will never fire — dark theme CSS must be written as the default (no attribute). This is an implicit contract that is not documented anywhere in the file and will confuse any developer adding new theme-specific styles.
  2. `initTheme()` is synchronous in that it calls `chrome.storage.sync.get` (async callback) — if the component renders before the callback fires, it will briefly show the default (dark) theme even if the user has saved "light". There's no `data-theme` attribute set synchronously.
  3. No `prefers-color-scheme` media query fallback — if the user has never explicitly set a theme, the extension ignores OS-level dark/light preference.

  **Proposed changes:**
  - Rename the implicit dark-default pattern to be explicit: document at the top of the file that dark is the default and `data-theme="light"` activates light.
  - Add a synchronous `initTheme` step before React hydrates that reads `localStorage` (in options page context) or applies a sensible default to prevent the flash.
  - Respect `prefers-color-scheme` as the initial default when no stored preference exists.

---

## Admin Console — Theme

#### `pretzel-console/src/utils/theme.ts` — Theme utilities for admin console
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. Same implicit dark-default pattern as `pretzel/src/shared/theme.ts` — `setTheme('dark')` removes `data-theme` rather than setting `data-theme="dark"`. At least here there's a legacy migration path (`LEGACY_KEY`), which is good.
  2. `migrateTheme()` runs at module load time (top-level side effect). If `localStorage` is unavailable (SSR context, strict browser extension environments), this will throw. Should be wrapped in a try/catch.
  3. No `prefers-color-scheme` fallback in `initTheme`.
  4. The console is a React SPA — there's no server-side dark-mode class or cookie-based theming, so users will always see a flash of dark theme on first load if they prefer light.

  **Proposed changes:**
  - Wrap `migrateTheme()` in a try/catch.
  - Add OS preference fallback in `initTheme`: `if (!saved) { if (window.matchMedia('(prefers-color-scheme: light)').matches) setTheme('light') }`.

---

## Admin Console — UI Components

#### `pretzel-console/src/components/ui/MillerColumns.tsx` — Three-column hierarchical selection UI
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. Edit and delete action buttons are only shown on `hovered` state. Hover-only controls are inaccessible to keyboard-only and touch users — there is no focus-visible trigger that shows these buttons. A keyboard user can tab into the select button for an item but will never reach the edit/delete buttons.
  2. The outer `<div>` for each row handles `onMouseEnter`/`onMouseLeave` — no equivalent keyboard event (`onFocus`/`onBlur`) is present.
  3. `ColumnRow` outer `<div>` has `cursor: pointer` and `onClick` behavior is handled only by the inner `<button>` — the outer div is not keyboard-focusable and clicking it does nothing (the inner button handles it). The div's pointer cursor is misleading; only the button is interactive.
  4. `col.onDelete` triggers immediately with no confirmation dialog — destructive action without confirmation is a UX anti-pattern. (Note: there IS a `ConfirmModal` component in this codebase — it's just not being used here.)
  5. Column header titles (`font-size: 10px, letterSpacing: 1.5px, textTransform: uppercase`) are very small. 10px uppercase text is a known contrast and readability challenge; WCAG SC 1.4.4 requires text to scale.
  6. `key={i}` on column renders — should use `col.title` or a stable ID, not array index.

  **Proposed changes:**
  - Show edit/delete buttons on row focus as well as hover: add `onFocus={() => setHovered(true)}` / `onBlur={() => setHovered(false)}` to the outer div, OR always render the buttons and only hide them visually (opacity 0, `group-focus-within:opacity-100`).
  - Wire `col.onDelete` to `ConfirmModal` before deleting.
  - Remove `cursor: pointer` from the outer div wrapper since it's not the interactive element.
  - Change `key={i}` to `key={col.title}`.

---

#### `pretzel-console/src/components/ui/EntityModal.tsx` — Generic create/edit modal
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. `role="dialog" aria-modal="true"` is present — good. But there is no `aria-labelledby` pointing at the `<h2>` title. Screen readers need this to announce the dialog name when focus enters it.
  2. No focus trap — when the modal opens, focus is not moved inside the dialog. Tab will cycle through all page elements including those behind the modal backdrop.
  3. On close (either via Escape or Cancel button), focus is not returned to the element that triggered the modal.
  4. The `<h2>` element for the title has no `id` — required for `aria-labelledby`.
  5. The backdrop click (`onClick={onClose}`) correctly closes the modal, but it's a raw `<div>` — it should have `role="presentation"` or at minimum not be keyboard-focusable (it currently isn't, which is correct, but could accidentally become focusable if styled differently).
  6. The Save button goes `opacity: 0.5` when `saving` but doesn't change `cursor` — add `cursor: 'not-allowed'` or rely on `disabled` (which is set, so the browser handles it). Verify the disabled state is visually distinct enough for WCAG 1.4.1 (not just opacity — consider also disabling pointer events).

  **Proposed changes:**
  - Add `id="entity-modal-title"` to the `<h2>` and `aria-labelledby="entity-modal-title"` to the dialog div.
  - Implement focus trap: on open, move focus to the first focusable element inside the modal; on Tab/Shift+Tab, cycle only within modal; on close, return focus to trigger element.
  - Use a ref on the triggering button (passed as a prop or via a focus-trap library like `focus-trap-react`) to restore focus on close.

---

#### `pretzel-console/src/components/ui/ConfirmModal.tsx` — Destructive action confirmation dialog
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. Same missing `aria-labelledby` issue as `EntityModal` — `role="dialog" aria-modal="true"` is present but there's no `aria-labelledby`. Here there's no `<h2>` at all — the dialog opens with only a `<p>` message and two buttons. A destructive confirmation dialog must have a title.
  2. No focus trap — same as `EntityModal`.
  3. No focus management on open — focus stays on whatever element triggered the confirm dialog.
  4. Escape key does NOT close this modal — `EntityModal` has an Escape handler, but `ConfirmModal` does not. This is inconsistent and a clear UX failure on a security-oriented product.
  5. The Delete button uses `background: 'var(--status-danger)'` — assuming this maps to approximately `#ef4444`. Against `color: '#fff'` that's ~4.5:1 depending on the exact value — right on the WCAG AA boundary. Verify the exact value doesn't drop below 4.5:1.
  6. When `confirming` is true, the button goes `opacity: 0.5` — but there's no spinner or "Deleting…" text visible by default. Wait — there IS `{confirming ? 'Deleting…' : 'Delete'}`. But with `disabled` and `opacity: 0.5` it looks like the button disappeared rather than being in-progress.

  **Proposed changes:**
  - Add a `<h2>` title to the dialog (e.g. "Confirm Delete") and wire `aria-labelledby` to it.
  - Add Escape key handler identical to `EntityModal`.
  - Implement focus trap and focus restoration.
  - During `confirming` state, keep the button at full opacity but show a spinner + "Deleting…" text, rather than fading the button to 50%.

---

#### `pretzel-console/src/components/ui/ToastContainer.tsx` — Toast notification container
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. The toast container has no `role="status"` or `aria-live` region. Toasts will be completely invisible to screen reader users — they won't hear success or error feedback.
  2. Toasts are not dismissible (no close button). If a toast persists for any duration, keyboard-only and AT users are stuck waiting for it to auto-dismiss with no way to dismiss it manually.
  3. No `aria-atomic="true"` — without this, a screen reader might read partial toast content if multiple toasts arrive in quick succession.
  4. Color-only status differentiation: green for success, red for error. Both have white text — `bg-green-600` (#16a34a) on white text: ~6.9:1 (passes). `bg-red-600` (#dc2626) on white: ~5.9:1 (passes). Contrast is fine, but the variant information (success vs error) is conveyed only by background color — there's no icon or label distinguishing them for color-blind users.
  5. No animation — toasts just appear/disappear with no transition, which can feel jarring and makes it easy to miss a toast entirely.

  **Proposed changes:**
  - Add `role="status"` and `aria-live="polite"` (or `aria-live="assertive"` for errors) to the container. Better: use two separate containers — one `polite` for success, one `assertive` for errors.
  - Add `aria-atomic="true"` to each toast div.
  - Add a close/dismiss button on each toast with `aria-label="Dismiss notification"`.
  - Add a success/error icon (checkmark / X) alongside text so variant is not color-only.
  - Add a CSS transition for entry/exit (translate-y + opacity).

---

#### `pretzel-console/src/components/ui/Toggle.tsx` — On/off toggle switch
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `role="switch"`, `aria-checked`, `aria-label`, and `disabled` are all present. The transition on the thumb is smooth. The only minor note: `outline: 'none'` removes the default focus ring — a custom focus ring should be visible. Without it, keyboard users can't tell the toggle is focused. Add `':focus-visible': { outline: '2px solid var(--brand-primary)', outlineOffset: 2 }`.
  **Proposed changes:** Add a `:focus-visible` outline style (either via a className or additional inline style approach for pseudo-selectors — use a CSS class for this).

---

#### `pretzel-console/src/components/ui/Badge.tsx` — Semantic badge/pill component
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. Several badge color combinations need contrast verification against the dark background (`var(--bg-surface)`). Specifically:
     - `warn`: `#eab308` (yellow) on dark surface — yellow text on near-black is typically fine but needs verification against the actual `--bg-surface` value.
     - `keyword`: `#f59e0b` on `rgba(245,158,11,0.15)` background — amber on very-light-amber: contrast depends on the surface underneath bleeding through. On a pure white surface this would be approximately 2.8:1 — failing AA.
  2. Badges convey semantic meaning (block, warn, entropy, etc.) but have no accessible context when used standalone. A badge reading "block" next to a rule name is fine in context; a badge in a truncated list cell may not be.
  3. No `title` or `aria-label` on the badge to provide full context when the containing text is truncated.

  **Proposed changes:**
  - Audit contrast ratios for all badge variants against the actual rendered background color (not just the badge's own `bg` — the `rgba` backgrounds blend with whatever is behind them).
  - For `keyword` and `pattern` variants, consider adding a `border` of the same color at 30% opacity to visually define the badge without relying on the translucent background alone.

---

#### `pretzel-console/src/components/ui/EmptyState.tsx` — Empty state placeholder component
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean component. `title`, `description`, and optional `action` button are all present. The action button is a plain `<button>` with no `aria-label` — when the label is inherited from `action.label` it's fine, but callers should ensure the label is descriptive enough in context (e.g. "Add rule" rather than just "Add"). No loading state confusion. Typography hierarchy is clear (500 weight title, muted description).
  **Proposed changes:** Add a note in the component's JSDoc that `action.label` should be a descriptive CTA (not just "Add" or "Create") for accessibility.

---

#### `pretzel-console/src/components/billing/UpgradeBanner.tsx` — Usage limit warning and upgrade CTA
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The progress bar (`<div style={{ height: 4 ... }}>`) has no ARIA. Screen readers see a decorative div with no label. It should be a `<progress>` element or a `<div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Scan usage">`.
  2. The "Approaching scan limit" / "Scan limit reached" label is `fontSize: 9` — the smallest text on any surface in this codebase. This is below any reasonable legibility floor.
  3. The "Upgrade plan" button uses `color-mix()` for background and border — `color-mix(in srgb, ...)` has good browser support but may render incorrectly in older Chromium versions still in enterprise. No fallback is provided.
  4. The external link (`<a href="https://ciyo.ai/pricing" target="_blank">`) has no `rel="noreferrer"` — wait, it does have `rel="noreferrer"`. Good. But it has no `aria-label` indicating it opens a new tab.
  5. The `PlanBadge` sub-component uses `fontSize: 9` as well.
  6. `color-mix` is used for the `PlanBadge` background too — `color-mix(in srgb, ${color} 12%, transparent)` — the `transparent` keyword in `color-mix` is not universally supported and the result may differ per browser.

  **Proposed changes:**
  - Replace the progress bar div with `<progress value={pct} max={100} aria-label="Monthly scan usage" />` styled via CSS, or add `role="progressbar"` with aria attributes.
  - Increase minimum font sizes to 11px throughout the banner.
  - Add `aria-label="Upgrade your plan (opens in new tab)"` to the external link.

---

## Marketing Site — Layout

#### `ciyo-web/components/layout/Header.tsx` — Site header with responsive navigation
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The `<nav>` element (desktop nav) has no `aria-label`. When a page has multiple navigation landmarks (header nav + footer nav + potentially breadcrumbs), WCAG requires each `<nav>` to have a distinct label. Add `aria-label="Main navigation"`.
  2. Mobile menu toggle button has `aria-label="Toggle menu"` — good, but it's missing `aria-expanded={open}` to communicate the state to screen readers.
  3. The mobile menu dropdown (`{open && <div ...>}`) is not a proper ARIA navigation list and lacks `aria-label`. When opened, screen readers won't know this is the mobile nav equivalent of the desktop nav.
  4. The wordmark SVG has `aria-label="ciyo.ai logo"` directly on the SVG — good. However the `<Link>` wrapping it also produces a label computed from its children (the SVG label + the wordmark spans). The screen reader may read: "ciyo.ai logo c i yo .ai link" — redundant and confusing. The outer `<Link>` should have `aria-label="ciyo.ai home"` and the SVG should have `aria-hidden="true"` since the Link's label covers it.
  5. `process.env.NEXT_PUBLIC_ENV === 'staging'` renders a STAGING badge — fine for staging, but confirm there's no scenario where this leaks to production (env check relies on a build-time env var, which is correct).
  6. "Sign in" link has no visual distinction from nav items — same text color, no icon. In a marketing header, the hierarchy between nav links and CTAs should be clearer. "Start Free" is visually distinct (filled button), but "Sign in" blends into the nav.

  **Proposed changes:**
  - Add `aria-label="Main navigation"` to the `<nav>`.
  - Add `aria-expanded={open}` to the mobile menu toggle button.
  - Add `aria-label="Mobile navigation"` to the mobile menu div.
  - Set `aria-label="ciyo.ai home"` on the header `<Link>` and `aria-hidden="true"` on the child SVG.
  - Give "Sign in" a subtle border or underline to visually separate it from plain nav links.

---

#### `ciyo-web/components/layout/Footer.tsx` — Site footer with link groups
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. The footer link groups are rendered as `<p>` (group title) + raw `<Link>` elements — no `<nav>`, no `<ul>`, no semantic grouping. Screen reader users browsing by landmark or list will not be able to navigate these link groups efficiently. Each group should be a `<nav aria-label="{group}">` with a `<ul>` and `<li>` per link.
  2. The accessibility page link reads `נגישות` (Hebrew: "Accessibility") — this is the only RTL text on an otherwise LTR page. Without `dir="rtl"` on the span/link, the Hebrew characters may render incorrectly in some AT. Also, mixing script directions without a `lang` attribute change could confuse screen readers that don't auto-detect script direction.
  3. `© {new Date().getFullYear()}` produces the current year — fine. But it's rendered as a `<span>` rather than plain text, which is unnecessary DOM complexity.
  4. External documentation links (`https://docs.ciyo.ai`) open in the same tab per the current implementation (no `target="_blank"`) — inconsistent with typical docs link behavior. Minor UX issue.
  5. The pretzel emoji `🥨` in the copyright line is decorative — add `aria-hidden="true"` to the emoji span or wrap it: `<span aria-hidden="true">🥨</span>`.

  **Proposed changes:**
  - Restructure each footer column: `<nav aria-label="{group}"><ul><li><Link>...</Link></li></ul></nav>`.
  - Add `lang="he" dir="rtl"` to the `<Link>` for `נגישות`.
  - Wrap `🥨` with `aria-hidden="true"`.
  - Consider `target="_blank" rel="noreferrer"` for docs links.

---

## Marketing Site — Sections

#### `ciyo-web/components/sections/Hero.tsx` — Homepage hero section
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. The "Extension screenshot placeholder" placeholder is shipping to production. The `<div>` with aspect-ratio `16/10` contains only a `<p>` that reads "Extension screenshot placeholder". This is a dead zone in the most prominent visual slot on the homepage. For a B2B security product, first impressions matter — a blank grey box with placeholder text is worse than no image at all.
  2. The hero section has no `aria-label` or ARIA landmark role. `<section>` without an accessible name is treated as a generic region. Add `aria-label="Hero"` or `aria-labelledby` pointing at the `<h1>`.
  3. The pulsing green dot (`<span className="size-1.5 rounded-full bg-[#34d399]">`) is purely visual — it's inside a badge with visible text ("Now protecting teams at 200+ companies") so the dot is decorative. Add `aria-hidden="true"` to it.
  4. The badge text "Now protecting teams at 200+ companies" is inside a `<div>` with no `role` — acceptable as it's purely informational body text, not a navigation item.
  5. Both CTAs ("Start Free" and "See How It Works →") use `<Link>` — correct. But the "→" arrow in the second CTA should be `aria-hidden="true"` since it's decorative.
  6. Color contrast: `text-[#94a3b8]` on `#0f0f13` background — `#94a3b8` is approximately 6.4:1 against `#0f0f13`. Passes AA.
  7. The bottom social proof text ("Trusted by security teams at healthcare, legal, and fintech companies") is `text-[#64748b]` on `#0f0f13` — `#64748b` is approximately 3.7:1. This FAILS WCAG AA (4.5:1 required for normal text at this size).

  **Proposed changes:**
  - Replace the placeholder immediately with either the real screenshot or a designed mock/animation. This is blocking for any public launch.
  - Add `aria-label="Hero section"` (or `aria-labelledby` pointing at the `h1`) to the `<section>`.
  - Add `aria-hidden="true"` to the green dot span and to the "→" character in "See How It Works →".
  - Lighten `#64748b` to at least `#94a3b8` (which is already used for body text) for the social proof line.

---

#### `ciyo-web/components/sections/FeatureGrid.tsx` — Feature cards grid
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The section has no `aria-label` or `aria-labelledby`. Add `aria-labelledby` pointing at the `<h2>`.
  2. The "Features" eyebrow label (`<p className="mb-3 text-center...">Features</p>`) is a `<p>`, not a `<span>` or a semantic grouping element. This is fine visually, but the `<h2>` below it is the actual heading — the `<p>` is decorative. No ARIA issue here, but the DOM order (p before h2) is correct for visual display.
  3. Each feature card `<div>` has an icon (`<Icon>`), a title (`<h3>`), and description. The icon is a Lucide SVG — Lucide icons are `aria-hidden` by default in recent versions, but verify the version used here does so. If not, each icon will be announced by AT with its component name.
  4. The icon background divs (`<div className="mb-4 flex size-10 ...">`) have no `aria-hidden` — if the icon inside is not `aria-hidden`, the unlabelled icon div will produce noise.
  5. Card hover state (`hover:border-white/[0.14]`) is purely visual — fine. Cards are not interactive (no link, no button), which is correct for a feature description grid.

  **Proposed changes:**
  - Add `aria-labelledby` on `<section>` pointing at the `<h2>` id.
  - Verify Lucide `<Icon>` renders with `aria-hidden="true"` in the version used. If not, add `aria-hidden="true"` to each `<Icon>` usage.

---

#### `ciyo-web/components/sections/CTABanner.tsx` — Bottom CTA section
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean section. Both CTAs are `<Link>` elements with clear descriptive text. The "Talk to Sales" mailto link works correctly. No ARIA issues beyond the section lacking `aria-labelledby` (consistent issue across all sections). The gradient background and box-shadow are purely decorative. Color contrast: `text-[#94a3b8]` on the gradient dark background — passes.
  **Proposed changes:** Add `aria-labelledby` on the `<section>` pointing at the `<h2>` id. Minor polish only.

---

#### `ciyo-web/components/sections/HowItWorks.tsx` — Three-step onboarding explainer
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. Emoji used as step icons (`🧩`, `⚙️`, `🛡️`) — these are read by screen readers with their full emoji name ("puzzle piece", "gear", "shield"). In this context they're decorative (the title and description carry the meaning). Add `aria-hidden="true"` to each emoji span.
  2. The step number span (`<span className="text-[11px] font-bold uppercase...">01</span>`) is purely visual sequence info — fine.
  3. No `aria-labelledby` on the `<section>`.
  4. `text-[#64748b]` for the `detail` paragraph — same contrast issue as in Hero: approximately 3.7:1 on `#17171e` background. Fails AA.
  5. The step cards are non-interactive divs with hover effects — hover styling on non-interactive elements (`hover:border-[#7c6aff]/30`) sets user expectations of interactivity. Consider removing hover effects from static content cards, or making them genuinely interactive (e.g. linking to the relevant docs page).

  **Proposed changes:**
  - Add `aria-hidden="true"` to each emoji icon span.
  - Add `aria-labelledby` to the `<section>`.
  - Increase `text-[#64748b]` to `text-[#94a3b8]` for the `detail` text to pass AA contrast.
  - Remove hover border effects from static cards unless they link somewhere.

---

#### `ciyo-web/components/sections/PricingPreview.tsx` — Pricing tier cards
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. The "Most Popular" badge is positioned with `-mt-10` which pulls it outside the card boundary. If the card above has a background, the badge will overlap it. This is visually fragile and depends on section-level padding being sufficient.
  2. The "Most Popular" badge is inside the featured `<div>` but visually appears to float above — it has no `aria-label` or `role`. Screen readers will read "Most Popular" as inline text within the Business card, which is acceptable.
  3. Feature list checkmarks (`<span className="text-[#34d399]">✓</span>`) are decorative — but `✓` (U+2713) is read by some screen readers as "check mark". Add `aria-hidden="true"` to each checkmark span and rely on the text content of each `<li>` for the accessible name.
  4. CTA links all go to hardcoded `https://app.ciyo.ai/onboarding...` URLs — not using `APP_URL` from config, unlike `Hero.tsx` and `CTABanner.tsx`. This is inconsistent and will point to the wrong URL in staging environments.
  5. No `aria-labelledby` on the `<section>`.
  6. `text-[#64748b]` for plan descriptions — same contrast failure as Hero and HowItWorks (3.7:1 on `#17171e`).

  **Proposed changes:**
  - Add `aria-hidden="true"` to each `✓` checkmark span.
  - Replace hardcoded `https://app.ciyo.ai/...` href values with `${APP_URL}/...` for environment consistency.
  - Add `aria-labelledby` to the `<section>`.
  - Upgrade `text-[#64748b]` to `text-[#94a3b8]` throughout.

---

#### `ciyo-web/components/sections/VideoDemo.tsx` — Video placeholder section
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. The entire video section is a placeholder — "90-second explainer — coming soon". This is public-facing content that should either be live video or not rendered at all. A placeholder section with a play-button chrome and "coming soon" copy looks unfinished on a B2B product landing page.
  2. The play button SVG (`<path d="M7 4L16 10L7 16V4Z" fill="#a78bfa"/>`) has no `aria-label` or `aria-hidden`. If a user clicks/activates this area, nothing happens. The div container is not interactive (no `onClick`, no `<button>` wrapper). The play icon implies interactivity but delivers none — this is an anti-pattern. Either make it interactive or remove the icon.
  3. The section has no `aria-labelledby`.
  4. The `aspect-video` container has no accessible description — when a real video is added, it must have `<track>` for captions.

  **Proposed changes:**
  - Either replace with a real embedded video (with a `<track kind="captions">`) or remove this section from the production build entirely until the video is ready.
  - If keeping the placeholder: remove the play icon (it implies interactivity), or wrap the entire preview in a `<button>` that opens a modal/lightbox when clicked, even if the video isn't ready.
  - Add `aria-labelledby` to the `<section>` and `aria-hidden="true"` to the decorative play icon SVG.

---

## Summary Table

| File | Verdict |
|---|---|
| `pretzel/src/content/overlay/WarningModal.tsx` | WARN |
| `pretzel/src/content/overlay/HighlightLayer.tsx` | ISSUE |
| `pretzel/src/content/overlay/overlay-root.tsx` | WARN |
| `pretzel/src/popup/Popup.tsx` | ISSUE |
| `pretzel/src/options/App.tsx` | ISSUE |
| `pretzel/src/options/pages/AccountPage.tsx` | WARN |
| `pretzel/src/options/pages/AuditPage.tsx` | ISSUE |
| `pretzel/src/options/pages/AboutPage.tsx` | WARN |
| `pretzel/src/shared/theme.ts` | WARN |
| `pretzel-console/src/utils/theme.ts` | WARN |
| `pretzel-console/src/components/ui/MillerColumns.tsx` | ISSUE |
| `pretzel-console/src/components/ui/EntityModal.tsx` | ISSUE |
| `pretzel-console/src/components/ui/ConfirmModal.tsx` | ISSUE |
| `pretzel-console/src/components/ui/ToastContainer.tsx` | ISSUE |
| `pretzel-console/src/components/ui/Toggle.tsx` | PASS |
| `pretzel-console/src/components/ui/Badge.tsx` | WARN |
| `pretzel-console/src/components/ui/EmptyState.tsx` | PASS |
| `pretzel-console/src/components/billing/UpgradeBanner.tsx` | WARN |
| `ciyo-web/components/layout/Header.tsx` | WARN |
| `ciyo-web/components/layout/Footer.tsx` | ISSUE |
| `ciyo-web/components/sections/Hero.tsx` | ISSUE |
| `ciyo-web/components/sections/FeatureGrid.tsx` | WARN |
| `ciyo-web/components/sections/CTABanner.tsx` | PASS |
| `ciyo-web/components/sections/HowItWorks.tsx` | WARN |
| `ciyo-web/components/sections/PricingPreview.tsx` | WARN |
| `ciyo-web/components/sections/VideoDemo.tsx` | ISSUE |

**PASS: 3 | WARN: 12 | ISSUE: 11**

---

## Top 5 Most Important Issues

### 1. No focus traps on any modal — `EntityModal`, `ConfirmModal`, `WarningModal`
All three modal implementations are missing focus traps. When a modal opens, tab key cycles through the entire page — users can reach content behind the modal backdrop. This is a WCAG 2.4.3 failure and a keyboard-only usability disaster. The `WarningModal` does correctly auto-focus the primary button on mount, but after that first focus, tabbing goes nowhere controlled. Fix all three with a focus-trap implementation (e.g. `focus-trap-react`) and add focus restoration on close.

### 2. Hover-only controls in `MillerColumns` are completely keyboard-inaccessible
The edit and delete buttons on each row only appear on mouse hover. A keyboard-only user can never reach these buttons — they do not appear on focus. For an admin console managing security policies, this means the entire CRUD workflow is broken for keyboard users. Fix: render the buttons always and show them on `:focus-within` in addition to hover.

### 3. `ToastContainer` has no ARIA live region — feedback is silent for AT users
Every success and error notification in the admin console is invisible to screen reader users. `role="status"` and `aria-live` are both missing. This means a user who publishes a policy, deletes a rule, or gets an error will hear nothing from the system. Fix: add `role="status" aria-live="polite"` for success toasts and `role="alert" aria-live="assertive"` for errors. This is a 5-minute fix with significant accessibility impact.

### 4. Two placeholder sections are shipping publicly — `Hero` screenshot and `VideoDemo`
The hero section shows "Extension screenshot placeholder" and the video section shows "90-second explainer — coming soon". These are the highest-visibility areas of the marketing site. A B2B security product with placeholder content looks unfinished and undermines credibility with the enterprise security buyers we're targeting. The video section also has a non-functional play button that implies interactivity. Both sections need either real content or graceful removal from the production build.

### 5. `text-[#64748b]` fails WCAG AA contrast throughout the marketing site
The color `#64748b` is used for supporting text in `Hero`, `HowItWorks`, `PricingPreview`, and potentially elsewhere. Against the `#17171e` dark background used on section cards, this yields approximately 3.7:1 — below the 4.5:1 AA threshold for normal-weight text. This is a systemic issue affecting multiple sections. The fix is a single token change: replace `text-[#64748b]` with `text-[#94a3b8]` (already used for primary body text, which does pass contrast). This should be done at the Tailwind config level to prevent recurrence.
