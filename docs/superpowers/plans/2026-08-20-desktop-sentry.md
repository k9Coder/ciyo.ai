# Desktop Sentry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add crash/error reporting to the Electron desktop app. Currently `pretzel-desktop` has zero error tracking — main-process crashes, proxy/watchdog failures, and renderer (tray UI / decision UI) exceptions are all invisible unless a user reports them.

**Architecture:** `@sentry/electron`, free tier, same Sentry org as the other packages (new project: `pretzel-desktop`). Two init points, following the app's existing "bake at build time" pattern used for `PRETZEL_API_URL` in `electron.vite.config.ts`:
- **Main process** (`electron/main.ts`): `@sentry/electron/main`, inits first thing, before other imports. This alone auto-captures native crashes and forwards them from all renderer windows via Electron's crash reporter — the highest-value single init point.
- **Renderers** (`renderer/tray-ui/main.tsx`, `renderer/decision-ui/main.tsx`): `@sentry/electron/renderer`, optional but simple — catches unhandled JS exceptions in the React UI that aren't native crashes (e.g. a bad render in SettingsView).

**Tech Stack:** `@sentry/electron` (wraps `@sentry/node` for main, `@sentry/browser` for renderer).

**Quota note:** same shared 5,000 errors/month org-wide free-tier pool as [[2026-08-20-backend-sentry]] and the existing extension/console projects — desktop is a 4th/5th consumer of the same pool.

---

## File Map

| Action | Path | What changes |
|--------|------|---------------|
| Modify | `pretzel-desktop/.env.example` | Add `SENTRY_DSN_DESKTOP` |
| Modify | `pretzel-desktop/.env.staging` | Add DSN value |
| Modify | `pretzel-desktop/electron.vite.config.ts` | Bake DSN into main bundle |
| Create | `pretzel-desktop/electron/sentry.ts` | Main-process init |
| Modify | `pretzel-desktop/electron/main.ts` | Call init first thing |
| Modify | `pretzel-desktop/renderer/tray-ui/main.tsx` | Renderer init (optional task) |
| Modify | `pretzel-desktop/renderer/decision-ui/main.tsx` | Renderer init (optional task) |

---

## Task 1: Env var + bake into main bundle

**Files:** Modify `.env.example`, `electron.vite.config.ts`

- [ ] **Step 1:** Add to `pretzel-desktop/.env.example` (near `PRETZEL_API_URL`):

```
# SENTRY_DSN_DESKTOP is BAKED into the main-process bundle at build time,
# same as PRETZEL_API_URL above — changing it requires a rebuild.
SENTRY_DSN_DESKTOP=
```

- [ ] **Step 2:** In `pretzel-desktop/electron.vite.config.ts`, extend the existing `define` block in the `main` section:

```ts
define: {
  'process.env.PRETZEL_API_URL': baked('PRETZEL_API_URL'),
  'process.env.CLERK_PUBLISHABLE_KEY': baked('CLERK_PUBLISHABLE_KEY'),
  'process.env.SENTRY_DSN_DESKTOP': baked('SENTRY_DSN_DESKTOP'),
},
```

(no change needed elsewhere in the config — `baked()` already reads from real process env first, then `.env`/`.env.[mode]` files, exactly like the existing two vars)

---

## Task 2: Main-process init

**Files:** Create `pretzel-desktop/electron/sentry.ts`, modify `pretzel-desktop/electron/main.ts`

- [ ] **Step 1: Install**

```bash
cd pretzel-desktop && pnpm add @sentry/electron
```

- [ ] **Step 2: Create `pretzel-desktop/electron/sentry.ts`**

```ts
import * as Sentry from '@sentry/electron/main'

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN_DESKTOP
  if (!dsn) return

  Sentry.init({
    dsn,
    // No performance tracing needed for a tray app.
    tracesSampleRate: 0,
  })
}

export { Sentry }
```

- [ ] **Step 3:** In `pretzel-desktop/electron/main.ts`, init immediately after the existing EPIPE guards, before the `app`/other imports run any logic (module-level import ordering already puts imports after the EPIPE guards — add the Sentry import+call right after them, before the rest):

```ts
process.stdout.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })
process.stderr.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err })

import { initSentry } from './sentry'
initSentry()

import { app, Tray, Menu, BrowserWindow, ipcMain, Notification, shell } from 'electron'
// ...rest of existing imports unchanged
```

This alone gives crash reporting for the main process and native renderer crashes (Electron forwards those through the main process's crash reporter automatically once `@sentry/electron/main` is initialized) — no other file needs to change for that coverage.

---

## Task 3 (optional): Renderer JS-error capture

Only needed if you also want plain unhandled JS exceptions inside the tray/decision React UIs (not just native crashes) reported. Small, low-risk addition to both renderer entry points.

**Files:** Modify `pretzel-desktop/renderer/tray-ui/main.tsx`, `pretzel-desktop/renderer/decision-ui/main.tsx`

- [ ] **Step 1:** Add `VITE_SENTRY_DSN_DESKTOP=` to `.env.example`/`.env.staging` — renderer builds go through electron-vite's standard Vite env handling, which only exposes `VITE_`-prefixed vars via `import.meta.env`, so this is a **separate** var from the main-process `SENTRY_DSN_DESKTOP` above (same DSN value, two names, because the two processes bundle differently).

- [ ] **Step 2:** At the top of both `renderer/tray-ui/main.tsx` and `renderer/decision-ui/main.tsx`, before the `createRoot(...)` call:

```tsx
import * as Sentry from '@sentry/electron/renderer'

if (import.meta.env.VITE_SENTRY_DSN_DESKTOP) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN_DESKTOP })
}
```

---

## Task 4: Smoke test + commit

- [ ] **Step 1:** Create the `pretzel-desktop` project on sentry.io (free tier, same org), grab its DSN.
- [ ] **Step 2:** Set `SENTRY_DSN_DESKTOP` (and `VITE_SENTRY_DSN_DESKTOP` if Task 3 done) in `.env`, `pnpm build` (required — main-process value is baked, not live-read), run the packaged app, temporarily throw in `main.ts` to confirm an event lands in the Sentry dashboard, then revert.
- [ ] **Step 3:** Add `SENTRY_DSN_DESKTOP` (build-time secret) to the CI build pipeline / release env for whichever channel builds the installer.
- [ ] **Step 4: Commit**

```bash
git add pretzel-desktop/.env.example pretzel-desktop/.env.staging pretzel-desktop/electron.vite.config.ts pretzel-desktop/electron/sentry.ts pretzel-desktop/electron/main.ts
git commit -m "feat(observability): add Sentry crash reporting to desktop main process"
```

(commit renderer files from Task 3 separately if done, per the file map above)
