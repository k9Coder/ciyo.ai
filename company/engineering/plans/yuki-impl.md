# Yuki Tanaka — Extension Fix Implementation

**Date:** 2026-06-08
**Participants:** Yuki Tanaka (Extension Engineer)
**Directed by:** Marcus Webb (CTO)
**Branch:** `worktree-agent-ad0569c8cf3a89749`
**Commit:** `edd2e47`

## Files Changed

### Source fixes (10 files)

| File | Fix |
|---|---|
| `pretzel/src/content/adapters/chatgpt.ts` | `writePromptText` now uses `execCommand("selectAll")` + `execCommand("insertText", false, text)` for contenteditable; native value setter for `<textarea>` unchanged |
| `pretzel/src/content/adapters/claude.ts` | Same `execCommand` fix for ProseMirror |
| `pretzel/src/content/adapters/gemini.ts` | Same `execCommand` fix; removed dead `.ql-editor` primary selector, `rich-textarea div[contenteditable="true"]` is now primary |
| `pretzel/src/content/overlay/overlay-root.tsx` | Shadow root changed to `mode: "closed"`; `_shadowRoot` reference held in module closure |
| `pretzel/src/audit/db.ts` | `_db` replaced with `_dbPromise` singleton pattern; `oldVersion` branching added to upgrade handler |
| `pretzel/src/content/content-script.ts` | `"sent"` audit event moved to after modal decision; `"log"` results still write immediately (no modal shown) |
| `pretzel/src/background/service-worker.ts` | Added `GET_ROLE` handler that calls `getRole()`; fixed `isAuthenticated()` priority order (MDM → local orgToken → Clerk) |
| `pretzel/src/options/pages/AboutPage.tsx` | Replaced false "no data sent to backend" privacy claim with accurate description of detection-local / events-reported-to-dashboard model |
| `pretzel/src/policy/auth.ts` | MDM `orgToken` now checked first (before local `orgToken` and Clerk JWT) to prevent personal account bypass of enterprise policy |
| `pretzel/manifest.config.ts` | `localhost:9876` gated behind `NODE_ENV !== "production"` dev check |

### New tests (3 files)

| File | Tests |
|---|---|
| `pretzel/tests/unit/adapters/write-prompt-text.test.ts` | 5 tests — verifies `execCommand` used for contenteditable, native setter used for textarea, no `innerText` assignment |
| `pretzel/tests/unit/audit/db-singleton.test.ts` | 3 tests — verifies `openDB` called exactly once on concurrent races, same instance returned on sequential calls, upgrade handler receives `oldVersion` |
| `pretzel/tests/unit/content/audit-event-ordering.test.ts` | 3 tests — log-only produces 1 "sent" event, warn+edit produces 1 "edited" event (no premature "sent"), block+send_anyway produces 1 "sent_with_reason" event |

### Pre-existing bug fix (1 file)

| File | Fix |
|---|---|
| `pretzel/tests/unit/update-check.test.ts` | Fixed `vi.fn<[], Promise<number \| null>>()` TypeScript error (vitest 2.x changed to single type-arg form `vi.fn<() => Promise<...>>()`) |

## Test Results

```
Test Files  17 passed (17)
      Tests 147 passed (147)
   TypeCheck clean (0 errors)
```

All 3 new test files pass. The pre-existing `service-worker.alarm.test.ts` timing flake (caused by global `vi.stubGlobal` pollution from other tests in the same parallel run) was confirmed to be a test ordering issue unrelated to my changes — it passes consistently when run in isolation or when the test runner assigns it to a separate worker.

## Nothing Incomplete

All 8 ISSUE-level items from `yuki-tanaka.md` are addressed:

1. `writePromptText` — execCommand fix on all three adapters
2. Shadow root — `mode: "closed"` with closure reference
3. `audit/db.ts` — `_dbPromise` singleton
4. `content-script.ts` — "sent" event after modal decision
5. `manifest.config.ts` — `localhost:9876` behind dev guard
6. `AboutPage.tsx` — accurate privacy statement
7. `service-worker.ts` — `GET_ROLE` handler added
8. `policy/auth.ts` — MDM token priority corrected
