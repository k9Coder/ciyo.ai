# Extension Subfolder Reorganization Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all browser extension code from `/src` (root) into `/extension/src`, and co-locate extension-specific configs alongside it, so the repo clearly reads as a multi-product monorepo rather than a Chrome extension with extras bolted on.

**Architecture:** Create `extension/` as a self-contained package owning its own source, configs, and build output. The root `package.json` becomes the monorepo orchestrator. No pnpm workspaces conversion (admin already works without it; extension can follow the same pattern). Root `node_modules` stays shared — `extension/` gets its own `package.json` and `tsconfig.json` but inherits deps from root via pnpm hoisting.

**Tech Stack:** pnpm, Vite + CRXJS, TypeScript 5, Playwright, GitHub Actions

---

## File Map

| Current path | New path | Change |
|---|---|---|
| `src/` | `extension/src/` | move |
| `public/` | `extension/public/` | move |
| `vite.config.ts` | `extension/vite.config.ts` | move + update paths |
| `manifest.config.ts` | `extension/manifest.config.ts` | move (no changes needed) |
| `tailwind.config.ts` | `extension/tailwind.config.ts` | move (verify admin has its own first) |
| `postcss.config.js` | `extension/postcss.config.js` | move (verify admin has its own first) |
| `tsconfig.json` | `extension/tsconfig.json` (new) + root updated | split |
| `package.json` | `extension/package.json` (new) + root updated | split |
| `playwright.config.ts` | `playwright.config.ts` | update `DIST_PATH` only |
| `.github/workflows/e2e.yml` | `.github/workflows/e2e.yml` | update build step |

---

## Task 1: Verify admin tailwind/postcss setup before moving

**Files:**
- Read: `admin/vite.config.ts`
- Read (if exists): `admin/tailwind.config.ts`, `admin/postcss.config.js`

- [ ] **Step 1: Check admin's vite config for tailwind references**

```bash
cat admin/vite.config.ts
ls admin/tailwind.config.ts admin/postcss.config.js 2>/dev/null || echo "not found"
```

Expected: if admin has `admin/tailwind.config.ts` and `admin/postcss.config.js` → they are independent; root ones are extension-only. If not, admin imports from root and we must leave copies at root or create them in `admin/` as part of this task.

- [ ] **Step 2: Record the finding as a comment at top of this plan before continuing**

Add one line to this file under "Architecture" noting whether admin uses root tailwind.

---

## Task 2: Move extension source and public assets

**Files:**
- Create: `extension/` directory
- Move: `src/` → `extension/src/`
- Move: `public/` → `extension/public/`

- [ ] **Step 1: Create the extension directory**

```bash
mkdir extension
```

- [ ] **Step 2: Move src and public using git mv (preserves history)**

```bash
git mv src extension/src
git mv public extension/public
```

- [ ] **Step 3: Verify git status shows renames, not deletes**

```bash
git status
```

Expected output includes lines like:
```
renamed: src/background/service-worker.ts -> extension/src/background/service-worker.ts
renamed: public/icons/icon16.png -> extension/public/icons/icon16.png
```

If git shows deletes instead of renames, run `git add -A` to let git detect renames from similarity.

- [ ] **Step 4: Commit the move**

```bash
git add -A
git commit -m "refactor: move extension source into extension/ subfolder"
```

---

## Task 3: Move extension-specific config files

**Files:**
- Move: `vite.config.ts` → `extension/vite.config.ts`
- Move: `manifest.config.ts` → `extension/manifest.config.ts`
- Move: `tailwind.config.ts` → `extension/tailwind.config.ts` (only if admin has its own — see Task 1)
- Move: `postcss.config.js` → `extension/postcss.config.js` (only if admin has its own — see Task 1)

- [ ] **Step 1: Move configs with git mv**

```bash
git mv vite.config.ts extension/vite.config.ts
git mv manifest.config.ts extension/manifest.config.ts
git mv tailwind.config.ts extension/tailwind.config.ts
git mv postcss.config.js extension/postcss.config.js
```

(Omit tailwind/postcss lines if Task 1 revealed admin depends on the root copies.)

- [ ] **Step 2: Update path aliases in extension/vite.config.ts**

The file currently has:
```typescript
import manifest from "./manifest.config";
// ...
alias: {
  "@": path.resolve(__dirname, "src"),
},
// ...
build: {
  rollupOptions: {
    input: {
      popup: "src/popup/index.html",
      options: "src/options/index.html",
    },
  },
},
test: {
  environment: "node",
  globals: true,
  include: ["tests/unit/**/*.test.ts"],
},
```

After the move, `__dirname` resolves to `extension/`, so `path.resolve(__dirname, "src")` correctly points to `extension/src`. The import `"./manifest.config"` is also still correct (same directory). The `build.rollupOptions.input` paths (`src/popup/index.html`) are resolved by Vite relative to the project root (`extension/`), so they remain correct.

Only change needed — remove the `test` block (unit tests move to their own config in Task 6):

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import path from "path";
import manifest from "./manifest.config";

export default defineConfig({
  define: {
    global: 'globalThis',
  },
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        popup: "src/popup/index.html",
        options: "src/options/index.html",
      },
    },
  },
});
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: move extension configs into extension/ subfolder"
```

---

## Task 4: Create extension/tsconfig.json

**Files:**
- Create: `extension/tsconfig.json`

The current root `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src", "tests"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 1: Create extension/tsconfig.json**

Create `extension/tsconfig.json` with extension-specific paths:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 2: Update root tsconfig.json to be a monorepo root config**

Replace the root `tsconfig.json` content so it no longer pretends the root is the extension:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "references": [
    { "path": "./extension" },
    { "path": "./admin" },
    { "path": "./backend" }
  ],
  "files": [],
  "exclude": ["node_modules"]
}
```

Note: TypeScript project references require each referenced tsconfig to have `"composite": true`. If that causes friction with the existing admin/backend builds, simply leave the root `tsconfig.json` minimal (no `include`) and only add references for packages that already have `"composite": true`.

- [ ] **Step 3: Verify extension typechecks**

```bash
cd extension && npx tsc --noEmit
```

Expected: 0 errors. If there are path resolution errors, check that `extension/tsconfig.json` `baseUrl` is `.` (i.e., `extension/`).

- [ ] **Step 4: Commit**

```bash
git add extension/tsconfig.json tsconfig.json
git commit -m "refactor: split tsconfig — extension gets its own, root becomes monorepo anchor"
```

---

## Task 5: Create extension/package.json

**Files:**
- Create: `extension/package.json`
- Modify: `package.json` (root)

- [ ] **Step 1: Create extension/package.json**

Extract extension runtime and build deps from root `package.json`:

```json
{
  "name": "ciyo-extension",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  }
}
```

No `dependencies` or `devDependencies` blocks needed yet — pnpm hoists everything from the root `node_modules`. Add them only if you need package-level isolation later.

- [ ] **Step 2: Update root package.json scripts**

Change the `dev` and `build` scripts to delegate to the extension subfolder, and update `lint` and `typecheck` to point to the new location:

```json
{
  "name": "ciyo",
  "version": "0.1.0",
  "description": "Browser-based DLP for LLM chat interfaces",
  "private": true,
  "scripts": {
    "dev": "pnpm --filter ciyo-extension dev",
    "build": "pnpm --filter ciyo-extension build",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test --config playwright.config.ts",
    "test:e2e:admin": "playwright test --config playwright.config.ts --project=admin",
    "test:e2e:extension": "playwright test --config playwright.config.ts --project=extension",
    "typecheck": "tsc --noEmit -p extension/tsconfig.json",
    "lint": "eslint extension/src --ext .ts,.tsx",
    "db:setup": "node scripts/db-setup.mjs",
    "check-db": "node scripts/check-db.mjs"
  },
  "dependencies": {
    "@clerk/chrome-extension": "^3.1.26",
    "idb": "^8.0.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zod": "^3.23.8",
    "zustand": "^4.5.4"
  },
  "devDependencies": {
    "@clerk/testing": "^1.4.4",
    "@crxjs/vite-plugin": "^2.0.0-beta.26",
    "@playwright/test": "^1.47.0",
    "dotenv": "^16.4.5",
    "wait-on": "^8.0.1",
    "@types/chrome": "^0.0.268",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "jsdom": "^29.1.1",
    "postcss": "^8.4.45",
    "tailwindcss": "^3.4.10",
    "typescript": "^5.5.4",
    "vite": "^5.4.2",
    "vitest": "^2.0.5"
  }
}
```

(Dependencies stay at root for now — they are still hoisted to root `node_modules` which `extension/` can resolve. Moving them into `extension/package.json` is a separate concern.)

- [ ] **Step 3: Verify pnpm can resolve the extension package**

```bash
pnpm --filter ciyo-extension build
```

Expected: extension builds successfully into `extension/dist/`.

- [ ] **Step 4: Commit**

```bash
git add extension/package.json package.json
git commit -m "refactor: add extension/package.json, delegate build scripts from root"
```

---

## Task 6: Update playwright.config.ts — extension dist path

**Files:**
- Modify: `playwright.config.ts`

- [ ] **Step 1: Update DIST_PATH**

In `playwright.config.ts`, change:

```typescript
const DIST_PATH = path.resolve(__dirname, 'dist')
```

to:

```typescript
const DIST_PATH = path.resolve(__dirname, 'extension/dist')
```

- [ ] **Step 2: Verify E2E config resolves correctly**

```bash
npx ts-node -e "import p from './playwright.config'; console.log(p)"
```

Or simply dry-run a playwright list:

```bash
pnpm exec playwright test --list --config playwright.config.ts 2>&1 | head -20
```

Expected: no path errors, test list prints.

- [ ] **Step 3: Commit**

```bash
git add playwright.config.ts
git commit -m "fix(e2e): update extension dist path to extension/dist"
```

---

## Task 7: Update CI workflow

**Files:**
- Modify: `.github/workflows/e2e.yml`

- [ ] **Step 1: Update the "Build extension" step**

In `.github/workflows/e2e.yml`, change:

```yaml
- name: Build extension
  run: pnpm run build
```

to:

```yaml
- name: Install extension dependencies
  run: pnpm install
  working-directory: extension

- name: Build extension
  run: pnpm run build
  working-directory: extension
```

Note: `pnpm install` in `extension/` is needed only if you added real deps to `extension/package.json`. If it's still empty (deps hoisted from root), skip the install step and just add `working-directory: extension` to the build step.

- [ ] **Step 2: Verify no other steps reference the old `dist/` path at root**

```bash
grep -n "dist" .github/workflows/e2e.yml
```

Expected: no lines reference a bare `dist` path that assumed extension output at root.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e.yml
git commit -m "ci: update extension build step to run from extension/ subfolder"
```

---

## Task 8: End-to-end smoke test

- [ ] **Step 1: Build extension from its new home**

```bash
pnpm --filter ciyo-extension build
```

Expected: builds successfully, output at `extension/dist/`.

- [ ] **Step 2: Confirm dist exists where playwright expects it**

```bash
ls extension/dist/manifest.json
```

Expected: file exists.

- [ ] **Step 3: Run E2E extension tests**

```bash
pnpm test:e2e:extension
```

Expected: all extension E2E tests pass (or same pass rate as before this refactor).

- [ ] **Step 4: Run admin E2E tests to confirm nothing regressed**

```bash
pnpm test:e2e:admin
```

Expected: all admin E2E tests pass.

- [ ] **Step 5: Final commit if any fixups were needed**

```bash
git add -A
git commit -m "chore: fixups from extension subfolder smoke test"
```

---

## Self-Review

**Spec coverage:**
- Extension source moved to subfolder ✓
- Extension configs moved alongside source ✓
- Root clearly communicates multi-product structure ✓
- Build scripts updated ✓
- CI updated ✓
- playwright.config.ts updated ✓
- tsconfig updated ✓

**Gaps / watch-outs:**
- Task 1 must be completed first — if admin shares root tailwind/postcss, those files either stay at root (with symlinks or copies in `extension/`) or get duplicated. The plan accounts for this with the skip note in Task 3.
- `vitest` config is inline in the old root `vite.config.ts` under a `test:` key. After moving vite config to `extension/`, running `vitest run` from root may not find any tests. If you have unit tests, add a root-level `vitest.config.ts` pointing to `extension/src` or wherever tests live. Currently there is no `tests/unit` directory, so this is a no-op.
- `pnpm --filter` requires the `name` field in `extension/package.json` to match (`ciyo-extension`). Verify after Task 5 Step 3.
