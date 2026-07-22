# Code Review — Yuki Tanaka (Chrome Extension Engineer)

> Lens: MV3 compliance · service worker lifecycle · content script timing · memory leaks · DOM safety · message security · selector fragility · performance · cross-browser compatibility

---

## Background

#### `pretzel/src/background/service-worker.ts` — Main MV3 service worker entry point
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Alarm re-created on every `onInstalled` only.** `chrome.alarms.create("policy-sync", ...)` fires only on install/update, which is correct for alarm registration — alarms persist across SW restarts. However there is no guard against duplicate alarm creation (`{ periodInMinutes: 2 }` will silently overwrite the existing alarm if the user reinstalls or the extension updates, which is fine, but worth a comment). This is a minor nit.
  2. **`isAuthenticated()` and `getAuthToken()` both read storage in subtly different order** (service-worker checks `clerkSessionToken` → managed `orgToken` → local `orgToken`; auth.ts checks the same three). No discrepancy in logic, but the duplication is a maintenance hazard — if one is updated the other is silently stale. Centralise to a single `isAuthenticated()` that delegates to `getAuthToken()`.
  3. **`unauthPromptCount` counter is not reset when the user signs in.** After 10 anonymous prompts, nudge #1 fires. If the user ignores it and later signs in, the counter keeps incrementing but now authentication passes, so the sign-in nudge can still show for authenticated users if they later sign out and then back in (because `signInNudge` is only attached to the `unauthResult` path). Low risk but confusing UX.
  4. **`void syncPolicy()` on `onInstalled`** — fire-and-forget means network errors on first install are silently dropped. The installed handler returns before sync completes; Chrome may idle-suspend the SW mid-flight. Alarms (which survive suspension) are the correct tool for periodic sync, but the initial sync on install should either be awaited or moved to an alarm firing at `delayInMinutes: 0`.

  **Proposed changes:**
  - Replace `void syncPolicy()` in `onInstalled` with `chrome.alarms.create("policy-sync-immediate", { delayInMinutes: 0 })` and handle it in `onAlarm`.
  - Extract a single `isAuthenticated()` that calls `getAuthToken() !== null` to remove duplication.
  - Add `await chrome.alarms.clear("policy-sync")` before `chrome.alarms.create(...)` in `onInstalled` to make re-creation explicit.

---

#### `pretzel/src/background/update-check.ts` — Lightweight timestamp-based policy freshness check
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. Single responsibility. Graceful null-check before comparing timestamps. `syncedAt` is set inside `syncPolicy` too — double-write is harmless but means the timestamp written here (the remote `remoteTs`) and the one written inside `syncPolicy` (`Date.now()`) could differ by milliseconds. Not a real bug.
  **Proposed changes:** N/A

---

## Content Scripts

#### `pretzel/src/content/content-script.ts` — Bootstrap and send-intent orchestration
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **The unsubscribe function returned by `adapter.onSendIntent()` is never stored or called.** If the page performs a client-side navigation (SPA route change) and `bootstrap()` were called again, or if the extension is reloaded, the capture-phase listeners on `document` would leak. In practice `bootstrap()` is called once per page load so leak is bounded to a page lifetime — but there is no cleanup on `chrome.runtime.onMessage` style signals or SPA nav events. For ChatGPT (which is a React SPA), navigation between conversations does not unload the content script, so the same `bootstrap()` result lives indefinitely — but it is correct because listeners are registered once. The real risk: if `bootstrap()` ever gets called again (e.g. if someone wraps it in a retry), it will double-register listeners.
  2. **`document.body.appendChild(banner)` in `showBanner()` — no guard against `document.body` being null.** The content script can be injected at `document_start` (depending on manifest config). If called before `DOMContentLoaded`, `document.body` is null and `appendChild` throws. The existing error boundary in `bootstrap()` won't catch this because the banners are called after an `await`. Should add `document.body?.appendChild` or wait for `DOMContentLoaded`.
  3. **`innerHTML` used in `showScanLimitBanner()` (line 149).** The string is a hard-coded literal with no user data, so there is no XSS vector here. However, using `innerHTML` in a content script is flagged by Chrome's CSP linting and will generate Trusted Types violations in environments that enforce them. Use `textContent` or DOM construction instead.
  4. **`writeAuditEvent` is called with `"sent"` before the modal decision is made (line 49).** If the user then clicks "Edit", a second call with `"edited"` is issued. This means every prompt that triggers a warning gets two audit events — one `"sent"` and one `"edited"`. The first call should be deferred until after the modal decision.

  **Proposed changes:**
  - Store the unsubscribe return value: `const unsub = adapter.onSendIntent(...)` and call `unsub()` on `window.addEventListener("beforeunload", ...)` or in a `chrome.runtime.onMessage` handler for extension-initiated cleanup.
  - Guard `document.body` before banner injection: `(document.body ?? document.documentElement).appendChild(banner)`.
  - Replace `span.innerHTML = "..."` with explicit DOM node construction.
  - Move the `"sent"` audit event write to after the modal resolves; only write `"sent"` if `decision === proceed`.

---

#### `pretzel/src/content/adapters/registry.ts` — Adapter lookup by hostname
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. Falls back to generic adapter. The regex vs string dispatch is readable. No issues.
  **Proposed changes:** N/A

---

#### `pretzel/src/content/adapters/types.ts` — SiteAdapter interface definition
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Well-documented interface. The comment about MV3 async limitation on click events is accurate and helpful. The sentinel pattern is the right MV3-compliant approach.
  **Proposed changes:** N/A

---

#### `pretzel/src/content/adapters/chatgpt.ts` — ChatGPT site adapter
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Fragile selector cascade in `findComposer()`.** Primary: `#prompt-textarea` (stable, good). Fallback 1: `[contenteditable="true"][data-id]` — the `data-id` attribute is an internal React key that OpenAI has already removed in some redesigns. Fallback 2: `div[contenteditable="true"]` — this will match ANY contenteditable on the page, including inline editable elements in messages, titles, etc. This can cause a false-positive capture of non-composer editables, leading to reading back already-sent message content.
  2. **`writePromptText` for contenteditable does not use `document.execCommand` or the Input Events Level 2 API.** Directly setting `innerText` then dispatching synthetic `input`/`change` events bypasses React's internal fiber state for contenteditable elements (React tracks selection state, not just value). OpenAI's ProseMirror-like editor may not react to `innerText =` assignment even with dispatched events. The native input value setter trick (used correctly for `<textarea>`) should be replicated via `InputEvent` with `data` for contenteditable. This impacts the "Edit prompt" redaction flow.
  3. **`requestAnimationFrame` used to remove the sentinel attribute after re-firing click.** This is a one-frame window where another click event could arrive and see the sentinel and also pass through. Very unlikely in practice but the sentinel should be removed immediately after the click event is processed, not in rAF. Alternatively, use a `WeakSet<Element>` to track in-flight re-fires.
  4. **`this` context hazard in `onSendIntent`.** `onClick` references `this.findSendButton()` and `this.findComposer()` via arrow functions, but `this` inside an arrow function takes the value of the enclosing lexical context. Since `chatGPTAdapter` is a plain object literal (not a class), `this` inside arrow-function methods refers to the object at definition time. This is actually fine in JS but easy to break if the object is ever destructured. Low risk as-is.

  **Proposed changes:**
  - Tighten fallback 1 to `[contenteditable="true"][data-testid*="composer"], [contenteditable="true"][aria-label]` rather than `[data-id]`.
  - Tighten fallback 2 to scope under a known container: `main div[contenteditable="true"]` or `form div[contenteditable="true"]`.
  - For `writePromptText` contenteditable, use `document.execCommand("selectAll")` + `document.execCommand("insertText", false, text)` (deprecated but still functional in Chrome extensions) or the `InputEvent` with `inputType: "insertText"`.
  - Remove sentinel synchronously after `sendBtn.click()` resolves instead of using rAF.

---

#### `pretzel/src/content/adapters/claude.ts` — Claude.ai site adapter
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **`findComposer()` primary selector is `.ProseMirror`** — this is a CSS class from the ProseMirror library. Anthropic's Claude.ai is built on ProseMirror, so this is correct today. But `.ProseMirror` is a library class, not an Anthropic-controlled class, so any ProseMirror upgrade or CSS-module rename will break it. More concerning: `.ProseMirror` can match **multiple elements** (e.g. nested editors in code blocks), and `querySelector` returns the first in DOM order which may not be the active composer.
  2. **`writePromptText` sets `composer.innerText = text`** on ProseMirror's contenteditable. ProseMirror's internal state (its EditorState) is not updated by direct DOM mutation — it maintains its own virtual document. After `innerText =`, the editor's internal view and state will be out of sync, and on next keypress the editor will likely overwrite or corrupt the injected text. This is a real functional bug for the "Edit prompt" redaction flow.
  3. **`button[type="submit"]` as final fallback in `findSendButton()`.** Claude.ai may have other submit buttons (e.g. forms inside code runners). This could intercept the wrong submit.

  **Proposed changes:**
  - Use `.ProseMirror[contenteditable="true"]` and additionally scope to the input area container: `div[data-testid*="input"] .ProseMirror, .ProseMirror[contenteditable="true"]`.
  - Replace `innerText =` write on ProseMirror with: select all via `view.dispatch(view.state.tr.selectAll())` — but since we don't have the ProseMirror view instance, the practical fix is `document.execCommand("selectAll"); document.execCommand("insertText", false, text)` while the element is focused. This correctly drives ProseMirror's input handler.
  - Remove `button[type="submit"]` fallback or scope it: `form button[type="submit"]`.

---

#### `pretzel/src/content/adapters/gemini.ts` — Gemini site adapter
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **Primary selector `.ql-editor`** — Quill editor class. Gemini uses a custom rich-textarea web component, not Quill. As of mid-2025, Gemini's input is a `rich-textarea` custom element containing a `div[contenteditable="true"]`. The `.ql-editor` selector will never match; the fallback `rich-textarea div[contenteditable="true"]` is the real working path. This means `.ql-editor` is dead code that adds confusion.
  2. **`button[data-mat-icon-name="send"]`** — Angular Material internal attribute. Will work on the current Gemini build but is brittle; Angular Material upgrades regularly change these.
  3. **`writePromptText` same `innerText =` issue** as Claude adapter — Gemini's rich-textarea also does not sync from direct DOM mutation.

  **Proposed changes:**
  - Remove `.ql-editor` as primary selector; make `rich-textarea div[contenteditable="true"]` the primary.
  - Add `rich-textarea` as a scoping prefix to the generic fallback.

---

#### `pretzel/src/content/adapters/generic.ts` — Generic fallback adapter
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`getSiteConfigs()` is called as a fire-and-forget `void` inside `createGenericAdapter()`.** The adapter is returned synchronously before the promise resolves. If `findComposer()` or `findSendButton()` is called within the first few hundred milliseconds (before the storage read completes), the custom selectors won't be set yet. This is a silent race — the adapter may silently use `largestEditableElement()` even for sites that have custom selectors configured.
  2. **`largestEditableElement()` selection by `offsetHeight * offsetWidth`** — this ranks by area. A page may have a large invisible or partially-obscured textarea (e.g., a hidden input used for form data) that dominates the area metric. `el.offsetParent !== null` filters out `display:none` but not `visibility:hidden` or opacity-0 elements.
  3. **`nearestButton()` walks the entire DOM from the composer up to `document.body`** querying for all `button` elements at every ancestor level. On large pages this can be expensive — O(depth × buttons_per_level). Should add a reasonable depth cap (e.g. 5 ancestors).

  **Proposed changes:**
  - Make `createGenericAdapter` return a Promise, or make `findComposer`/`findSendButton` await a `configReady` promise internally: `await configPromise` before selector lookup.
  - Add `el.getBoundingClientRect().width > 0` check in `largestEditableElement()` for better visibility detection.
  - Cap `nearestButton()` ancestor walk at 6 levels.

---

## Overlay / UI

#### `pretzel/src/content/overlay/overlay-root.tsx` — Shadow DOM host and React root management
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`reactRoot?.render(<></>)` to "dismiss" the modal** leaves the React tree mounted with an empty fragment. The `shadowHost` remains in `document.body`. On the next `showWarningModal()` call, the existing root is reused (correct), but between calls the shadow host with its React root sits in the DOM with `pointerEvents: none` consuming nothing. This is acceptable but the `dismissModal()` function comment should clarify it doesn't unmount the tree.
  2. **`document.body.appendChild(shadowHost)` is called from `ensureShadowHost()`** which is called from `showWarningModal()`. If `document.body` doesn't exist at call time, this throws. The `showWarningModal()` is called after `await sendMessage(...)` which should be after DOMContentLoaded, so in practice this is safe.
  3. **`applyTheme()` reads `chrome.storage.sync` on every modal show.** This is a storage round-trip on the hot path. Theme should be cached in memory or read once during init.
  4. **`mode: "open"` shadow root** — the host page's JavaScript can access the shadow root internals via `shadowHost.shadowRoot`. For a DLP extension protecting sensitive detection UI, `mode: "closed"` would prevent the page's own scripts from reading or tampering with the modal. This is a security consideration, not a functional bug, but worth hardening.

  **Proposed changes:**
  - Change `attachShadow({ mode: "open" })` to `attachShadow({ mode: "closed" })` and store the shadow root reference in the module's closure (you already do this with the `shadowHost` variable).
  - Cache the theme value: read it once in `ensureShadowHost()` and update it via a `chrome.storage.onChanged` listener.

---

#### `pretzel/src/content/overlay/WarningModal.tsx` — Warning modal React component
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`window.addEventListener("keydown", onKey)` registered inside a component rendered into a shadow root.** The shadow DOM does not re-target `keydown` events on `window` — this will work because keyboard events do propagate to `window`, but it's fragile: if the host page calls `stopPropagation()` before the event reaches `window`, the Escape handler won't fire. A more robust approach is registering on the `shadowRoot` directly.
  2. **`snippet.split(/\[|\]/)` in `FindingRow` assumes the snippet format is `prefix[MATCH]suffix`.** If the match contains a literal `[` or `]` character, `parts` will have more than 3 elements and the render will silently discard parts 3+. This is a display bug for findings that match bracket-containing content (e.g., a Markdown link or a regex pattern in a prompt).
  3. **`buildSnippet` is imported from `@/detection/engine`** into a content script context. If the engine module has any heavy dependencies, this increases content script bundle size.
  4. **Focus is set on `editBtnRef` via `useEffect`** — correct for accessibility. The `role="dialog"` + `aria-modal="true"` are correct.

  **Proposed changes:**
  - Register the Escape keydown on the shadow root container element instead of `window`.
  - Fix `FindingRow` snippet rendering: join `parts.slice(2)` for the suffix instead of `parts[2]`.

---

#### `pretzel/src/content/overlay/HighlightLayer.tsx` — Highlight overlay for flagged text ranges
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Range merging logic is correct. Non-overlapping sorted ranges, correct cursor arithmetic. Tailwind classes (`bg-yellow-300`, etc.) work because this component lives in the shadow root where the compiled CSS is injected. No memory issues. The `import React` at line 1 is unnecessary in React 17+ with the new JSX transform — minor nit.
  **Proposed changes:** Remove `import React from "react"` if the project uses the automatic JSX runtime (check tsconfig `jsx: "react-jsx"`).

---

## Policy

#### `pretzel/src/policy/sync.ts` — Full policy fetch and storage
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Two-phase check (version then full fetch) is efficient. Zod validation before persisting is correct — invalid server payloads won't corrupt local state. 402 handling for subscription expiry is correct. Silent catch on network errors is appropriate. No issues.
  **Proposed changes:** N/A

---

#### `pretzel/src/policy/loader.ts` — Policy retrieval and bridging from storage
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Zod re-validates stored data on every `loadPolicy()` call — defensive against storage corruption from old extension versions. Fallback to `DEFAULT_POLICY` is safe. `getSiteConfigs()` is a clean secondary entry point.
  **Proposed changes:** N/A

---

#### `pretzel/src/policy/bridge.ts` — Backend policy shape → engine policy shape
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`toSeverity(action: "warn" | "block"): Severity`** maps `"block" → "high"` and `"warn" → "medium"`. This ignores the actual severity configured on the rule in the backend (`ResolvedRuleSchema` has no `severity` field). The engine uses severity for display/badges but the mapping is lossy — a `block` rule that was explicitly `critical` on the backend will show as `high` in the UI.
  2. **`allowSendAnywayWithReason: false`** is hardcoded in `bridgePolicy`. This overrides any backend-configured value for this field. If the backend ever sends this in `PolicyDoc`, it's silently ignored.
  3. **`auditRetentionDays: 90`** is hardcoded. Same issue — the backend value is ignored.

  **Proposed changes:**
  - Add `severity` to `ResolvedRuleSchema` and thread it through `bridgeRule`.
  - Add `allowSendAnywayWithReason` and `auditRetentionDays` to `PolicyDocSchema` (optional with defaults) and use them in `bridgePolicy`.

---

#### `pretzel/src/policy/defaults.ts` — Built-in baseline policy
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Well-maintained set of patterns. Luhn and SSN validators are called out correctly. The `.env` line pattern (`\b[A-Z][A-Z0-9_]*=\S{8,}`) with `scope: "outside_code"` is thoughtful — avoids false positives in code blocks. No issues.
  **Proposed changes:** N/A

---

#### `pretzel/src/policy/role.ts` — Role determination from storage tokens
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** Token prefix checks (`ps_adm_`, `ps_live_`) are simple substring guards, not cryptographic verification — this is fine for UI role gating (the backend does real auth), but the comment should make clear these are display-role checks only and not security boundaries.
  **Proposed changes:** Add a comment: `// Display-only role; backend authorises all API calls independently.`

---

#### `pretzel/src/policy/auth.ts` — Token retrieval for API calls
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Correct priority order (Clerk token → managed → local). `chrome.storage.managed` access is correctly wrapped in `.catch(() => ({}))` because managed storage is not always available (no enterprise policy → API throws). Clean.
  **Proposed changes:** N/A

---

#### `pretzel/src/policy/schema.ts` — Zod schemas for policy and backend API shapes
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Discriminated unions are used correctly. `z.default("")` and `z.default("none")` on optional fields are appropriate for forward compatibility. `PolicyDocSchema` and `PolicySchema` are cleanly separated (backend wire format vs. engine internal format). No issues.
  **Proposed changes:** N/A

---

## Realtime

#### `pretzel/src/realtime/index.ts` — Realtime checker singleton export
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Thin re-export / singleton pattern. Clean.
  **Proposed changes:** N/A

---

#### `pretzel/src/realtime/backend-rest.adapter.ts` — REST-based last-updated-at checker
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Minimal, single-purpose. Auth token fetched correctly. Network errors return `null` gracefully.
  **Proposed changes:** N/A

---

#### `pretzel/src/realtime/types.ts` — Interface for update checker
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Minimal interface. Clean.
  **Proposed changes:** N/A

---

## Audit

#### `pretzel/src/audit/db.ts` — IndexedDB setup via `idb` wrapper
- [x] Reviewed
  **Verdict:** ISSUE
  **Findings:**
  1. **Module-level `_db` singleton is shared across the content script and the popup/options page** only if they share the same module instance — but they don't. Each browsing context (content script, popup, options page) has its own JS heap, so the singleton is re-created per context. This is expected and correct. However, the singleton pattern provides no protection against **concurrent opens in the same context** — `openDB` is called only if `_db` is null, but if two callers `await getAuditDB()` simultaneously before the first resolves, `openDB` is called twice and the second result overwrites `_db`. The IDB spec handles concurrent opens gracefully, but the `_db` reference will point to the second connection. Use a promise-based singleton instead:
     ```ts
     let _dbPromise: Promise<AuditDB> | null = null;
     export function getAuditDB(): Promise<AuditDB> {
       if (!_dbPromise) _dbPromise = openDB(...);
       return _dbPromise;
     }
     ```
  2. **`AUDIT_DB_VERSION = 1` with no migration path.** If the schema needs to change (add index, rename store), a version bump without a proper `upgrade` handler branching on `oldVersion` will silently fail or corrupt the DB for existing users.

  **Proposed changes:**
  - Replace `_db` with a `_dbPromise` to prevent the concurrent-open race.
  - Add `oldVersion` branching comments in `upgrade()` for future schema migrations.

---

#### `pretzel/src/audit/log.ts` — Audit event read/write/prune/export
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`queryAuditEvents` cursor loop loads ALL matching events into memory** before slicing for `offset`/`limit` (lines 34–46). For a user with thousands of audit events, this loads the entire store into the `all` array and then `slice`s it. The IDB cursor API supports `advance(n)` for offset; use it instead of in-memory slicing.
  2. **`exportAuditCSV` uses `db.getAll(AUDIT_STORE_NAME)`** — loads every event in the entire store into memory. For users with months of history this could be hundreds of thousands of events. Should be streamed or paginated.
  3. **CSV export does not escape `hostname`, `action`, `userDecision` fields.** If any of those contain commas (unlikely for hostname, but possible), the CSV will be malformed. Use a proper CSV escaping utility or at minimum wrap all fields in quotes.

  **Proposed changes:**
  - Rewrite `queryAuditEvents` to use `cursor.advance(offset)` for skipping, then collect only `limit` items.
  - For CSV export, consider a `Blob` streaming approach or pagination, and wrap all fields in double-quote escaping.

---

#### `pretzel/src/audit/types.ts` — AuditEvent type definition
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. No full prompt text stored — only hash and length. Privacy-conscious design.
  **Proposed changes:** N/A

---

## Scans / Events

#### `pretzel/src/scans/dispatch.ts` — Scan counter dispatch to backend
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean fire-and-forget with appropriate flag management. 402 sets the limit flag; success clears it. Network errors leave the flag unchanged.
  **Proposed changes:** N/A

---

#### `pretzel/src/events/dispatch.ts` — DLP event reporting to backend
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`PolicyDocSchema.safeParse(policyDoc)` is called on every invocation of `dispatchEvents`**, which fires on every DETECT call with a warning/block finding. This re-parses and re-validates the stored `policyDoc` blob on every event. The parsed result should be cached or the `reportLevel` lookup should use the already-loaded `Policy` object passed to the detection engine.
  2. **Fire-and-forget `fetch(...)` calls with `.catch(() => {})` in a loop.** In a service worker context, unbounded fire-and-forget fetches can prevent the SW from becoming idle if Chrome tracks them. Wrap the loop in `Promise.allSettled(reportable.map(...))` instead so the SW can track completion.

  **Proposed changes:**
  - Pass the already-parsed `PolicyDoc` (from `syncPolicy`'s stored result) instead of re-parsing it.
  - Replace loop of fire-and-forget with `await Promise.allSettled(reportable.map(f => fetch(...).catch(() => {})))`.

---

## Popup

#### `pretzel/src/popup/Popup.tsx` — Extension popup React component
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`chrome.tabs.query(...)` uses a callback-style API** (line 112) inside a `useEffect`. This is the MV3-compatible way (`chrome.tabs.query` does not return a Promise natively in all Chrome versions without using the `Promisify` wrapper). However, mixing callback-style API in a React `useEffect` without cleanup can cause a state update on an unmounted component if the popup is closed before the callback fires. Wrap with an `active` flag.
  2. **`getToken()` from Clerk** is called in `useEffect` and the result is written to `chrome.storage.local`. If Clerk token refresh fails (network error), `clerkSessionToken` in storage becomes stale. There is no expiry handling or token-refresh retry here. The service worker will use the stale token until the user reopens the popup.
  3. **`queryAuditEvents({ hostname: host, limit: 5 })` called in popup** — opens its own IndexedDB connection. The popup's IDB connection is separate from the content script's. This is correct and expected (different browsing contexts have independent connections to the same named DB).
  4. **`index` used as React `key` in the recent events list** (`key={i}` on line 219). If the events list updates, React may reuse DOM nodes incorrectly. Use `ev.id` as the key.

  **Proposed changes:**
  - Add `let active = true` / `return () => { active = false }` guard around `chrome.tabs.query` callback.
  - Change `key={i}` to `key={ev.id}`.

---

#### `pretzel/src/popup/main.tsx` — Popup entry point
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Standard React + ClerkProvider bootstrap. `initTheme()` called before render. `CLERK_PUBLISHABLE_KEY` sourced from constants (not hardcoded inline). No issues.
  **Proposed changes:** N/A

---

## Options Page

#### `pretzel/src/options/App.tsx` — Options page shell and tab router
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean. Client-side tab state (no router). `ThemeToggleButton` reads theme from `getTheme()` which reads `document.documentElement` — this is synchronous and correct. No issues.
  **Proposed changes:** N/A

---

#### `pretzel/src/options/main.tsx` — Options page entry point
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `afterSignOutUrl={window.location.href}` is correct for extension options pages — Clerk needs a URL to redirect back to post-sign-out, and using the current options page URL prevents a broken redirect. `initTheme()` before render. Clean.
  **Proposed changes:** N/A

---

#### `pretzel/src/options/pages/AccountPage.tsx` — Account info and sign-in/out
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `SignIn routing="hash"` is the correct Clerk routing mode for extension pages (no history API). Minimal and clean. `user.imageUrl` rendered in an `<img>` — the URL comes from Clerk CDN, which is trusted.
  **Proposed changes:** N/A

---

#### `pretzel/src/options/pages/AuditPage.tsx` — Audit log viewer
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`useEffect` for `hostnameFilter` and `useEffect` for `page` both call `load()`**, creating a double-load on filter change: the first effect calls `setPage(0)` and `load(0)`, then the second effect fires because `page` changed from whatever it was to `0` (or stays at `0` if already there, no re-render). If the user is already on page 0 and changes the filter, `load(0)` fires twice. Should merge into a single `useEffect([hostnameFilter, page])` and have `hostnameFilter` change reset page via a ref.
  2. **`load` function is defined inside the component but not memoized** (`useCallback`). It captures `hostnameFilter` in closure — this is correct, but without `useCallback`, a new function reference is created on every render, though the effects only reference `load` at effect run time (not as a dependency), so this is not a re-render loop issue. Minor nit.
  3. **CSV export with `a.click()` and no body append.** Some browsers require the `<a>` to be in the DOM before `.click()` triggers a download. Chrome extensions run in a regular page context where this typically works without appending, but adding `document.body.appendChild(a)` / `a.remove()` is safer cross-browser.

  **Proposed changes:**
  - Consolidate the two `useEffect` calls into one `useEffect([hostnameFilter, page], () => load(page))` and handle the filter-reset separately with `useEffect([hostnameFilter], () => setPage(0))` but with a `ref` guard to avoid double-load.
  - Append anchor to body before click in `handleExportCSV`.

---

#### `pretzel/src/options/pages/AboutPage.tsx` — About/version page
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `"https://github.com/your-org/mykka"` is a placeholder URL that was never replaced. This will 404 for all users. The privacy claim "no data is ever sent to a backend" contradicts the actual implementation (events, scans, and policy fetches all hit the backend API). This is marketing copy that should be removed or corrected before the extension goes to users — incorrect privacy statements in extension pages are a Chrome Web Store policy violation.
  **Proposed changes:**
  - Replace `your-org/mykka` with the real repository URL or remove the link.
  - Rewrite the privacy paragraph to accurately reflect what data is and is not sent (e.g., "Detection runs locally. Aggregate scan counts and rule-trigger events are reported to your organization's mykka dashboard.").

---

## Loading Components

#### `pretzel/src/options/components/loading/LoadingProvider.tsx` — Global loading overlay provider
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `MutationObserver` on `document.documentElement` for theme changes is cleaned up correctly in the effect return. `useCallback` on `showLoading`/`hideLoading` prevents unnecessary re-renders. Pattern is clean.
  **Proposed changes:** N/A

---

#### `pretzel/src/options/components/loading/Spinner.tsx` — Reusable spinner component
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Pure presentational component. SVG geometry is computed correctly. `role="status"` + `aria-label="Loading"` is correct.
  **Proposed changes:** N/A

---

#### `pretzel/src/options/components/loading/index.ts` — Barrel export
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** Clean barrel export. No issues.
  **Proposed changes:** N/A

---

## Shared

#### `pretzel/src/shared/theme.ts` — Theme read/write utilities
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `setTheme()` calls `chrome.storage.sync.set({ theme })` synchronously (fire-and-forget, no `.catch`). If the user is offline or storage quota is exceeded, the theme preference is silently lost. Also, `setTheme` removes the `data-theme` attribute for dark mode rather than setting it to `"dark"` — this means `getTheme()` must treat "attribute absent" as dark, which it does. But toggling from light back to dark leaves no attribute on `<html>`, which could cause a flash if the page renders before `initTheme()` runs. Consider always setting the attribute.
  **Proposed changes:**
  - Add `.catch(() => {})` to the `chrome.storage.sync.set` call.
  - Set `document.documentElement.setAttribute("data-theme", "dark")` explicitly instead of removing the attribute.

---

#### `pretzel/src/shared/constants.ts` — Shared constants
- [x] Reviewed
  **Verdict:** WARN
  **Findings:** `CLERK_PUBLISHABLE_KEY` is typed as `string` with no fallback — if the env var is not set at build time, this is `undefined` at runtime, causing a runtime crash in `ClerkProvider`. Should have a fallback or a build-time assertion. `EXTENSION_VERSION = "2.0.0"` is hardcoded and will drift from `manifest.json`'s version — should be read from `import.meta.env.npm_package_version` or injected via Vite `define`.
  **Proposed changes:**
  - Add `?? ""` fallback and a build-time `assert` for `CLERK_PUBLISHABLE_KEY`.
  - Inject version from `package.json` via Vite `define: { __VERSION__: JSON.stringify(process.env.npm_package_version) }`.

---

#### `pretzel/src/shared/messages.ts` — Typed message bus
- [x] Reviewed
  **Verdict:** WARN
  **Findings:**
  1. **`GET_ROLE` message type is defined in the `Message` union** but there is no handler for it in `service-worker.ts`'s `handleMessage` switch — the default branch returns `null` silently. This is a dead message type that would silently fail at runtime. Either add a handler or remove it from the union.
  2. **`sendMessage<T>` returns `Promise<T>` via a bare cast.** If the service worker returns `null` (from the default branch or an unhandled error), the caller gets `null` typed as `T` with no runtime error, potentially causing downstream null dereference.

  **Proposed changes:**
  - Add a `GET_ROLE` handler in `service-worker.ts` that calls `getRole()` and returns the result.
  - Add a runtime null-check in `sendMessage`: `return chrome.runtime.sendMessage(message).then(r => { if (r === null || r === undefined) throw new Error("No response"); return r as T; })`. At minimum, document that callers must handle `null`.

---

#### `pretzel/src/shared/logger.ts` — Structured logger
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `warn` and `error` surface in all builds — correct. `debug`/`info` silenced in production — correct. `IS_DEV` computed at module scope, not per call — this means tree-shaking can eliminate the dead code paths. Clean.
  **Proposed changes:** N/A

---

## Types

#### `pretzel/src/types/global.d.ts` — Global TypeScript ambient declarations
- [x] Reviewed
  **Verdict:** PASS
  **Findings:** `/// <reference types="chrome" />` is the correct way to pull in Chrome extension types. `*.css?inline` module declaration matches the Vite import usage in `overlay-root.tsx`. Clean.
  **Proposed changes:** N/A

---

## Summary Table

| File | Verdict |
|---|---|
| `background/service-worker.ts` | WARN |
| `background/update-check.ts` | PASS |
| `content/content-script.ts` | ISSUE |
| `content/adapters/registry.ts` | PASS |
| `content/adapters/types.ts` | PASS |
| `content/adapters/chatgpt.ts` | ISSUE |
| `content/adapters/claude.ts` | ISSUE |
| `content/adapters/gemini.ts` | WARN |
| `content/adapters/generic.ts` | WARN |
| `content/overlay/overlay-root.tsx` | WARN |
| `content/overlay/WarningModal.tsx` | WARN |
| `content/overlay/HighlightLayer.tsx` | PASS |
| `policy/sync.ts` | PASS |
| `policy/loader.ts` | PASS |
| `policy/bridge.ts` | WARN |
| `policy/defaults.ts` | PASS |
| `policy/role.ts` | WARN |
| `policy/auth.ts` | PASS |
| `policy/schema.ts` | PASS |
| `realtime/index.ts` | PASS |
| `realtime/backend-rest.adapter.ts` | PASS |
| `realtime/types.ts` | PASS |
| `audit/db.ts` | ISSUE |
| `audit/log.ts` | WARN |
| `audit/types.ts` | PASS |
| `scans/dispatch.ts` | PASS |
| `events/dispatch.ts` | WARN |
| `popup/Popup.tsx` | WARN |
| `popup/main.tsx` | PASS |
| `options/App.tsx` | PASS |
| `options/main.tsx` | PASS |
| `options/pages/AccountPage.tsx` | PASS |
| `options/pages/AuditPage.tsx` | WARN |
| `options/pages/AboutPage.tsx` | WARN |
| `options/components/loading/LoadingProvider.tsx` | PASS |
| `options/components/loading/Spinner.tsx` | PASS |
| `options/components/loading/index.ts` | PASS |
| `shared/theme.ts` | WARN |
| `shared/constants.ts` | WARN |
| `shared/messages.ts` | WARN |
| `shared/logger.ts` | PASS |
| `types/global.d.ts` | PASS |

**Totals: 22 PASS · 14 WARN · 4 ISSUE**

---

## Top 5 Critical Issues

### 1. `writePromptText` is broken for ProseMirror and Quill-style editors (Claude, Gemini, ChatGPT contenteditable)
**Files:** `claude.ts`, `gemini.ts`, `chatgpt.ts`
Setting `composer.innerText = text` followed by synthetic `input`/`change` events does not update the internal editor state of ProseMirror (Claude), the Gemini rich-textarea, or ChatGPT's contenteditable. The "Edit prompt" flow (intended to let users redact and re-send) will appear to work but the editor will revert or corrupt the text on next keypress. **This is a core UX feature that silently does nothing on all three named adapters.** Fix: use `document.execCommand("selectAll") + document.execCommand("insertText", false, text)` while the element is focused, which drives the editor's native input handler.

### 2. Premature audit event write before modal decision (`content-script.ts`)
`writeAuditEvent(result, promptText, hostname, "sent")` is called at line 49, before the warning modal is shown. If the user clicks "Edit prompt", a second event is written with `"edited"`. Every warned/blocked prompt produces two audit entries — the first is incorrect and inflates audit counts. The `"sent"` write must move to after the modal resolves to `{ proceed: true }`.

### 3. IDB connection race in `audit/db.ts`
Two concurrent `await getAuditDB()` calls before the first resolves will call `openDB()` twice and race on the `_db` assignment. Replace the `_db` variable with a `_dbPromise` pattern to guarantee a single underlying connection.

### 4. Shadow root is `mode: "open"` — host page can tamper with the DLP modal (`overlay-root.tsx`)
The shadow root is created with `{ mode: "open" }`, meaning the host page's scripts can access the extension's modal DOM via `document.getElementById("mykka-overlay-host").shadowRoot`. A malicious page could programmatically click "Looks fine, send it" or read finding text from the modal. For a DLP extension, the shadow root should be `{ mode: "closed" }` with the ShadowRoot reference held in the module closure.

### 5. `GET_ROLE` dead message type + `AboutPage.tsx` inaccurate privacy statement
`GET_ROLE` is declared in the `Message` union but has no handler in the service worker — silent null return to any caller. This is an extension contract integrity bug: any code path that sends `GET_ROLE` will get `null` typed as the expected return and potentially crash downstream.

The `AboutPage.tsx` states "no data is ever sent to a backend" which directly contradicts the actual codebase behaviour (events, scans, policy fetches). This is a Chrome Web Store policy risk if left unaddressed.
