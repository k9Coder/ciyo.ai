# Polyrepo Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract each major subfolder into its own GitHub repository with per-repo VSCode color identity, GitHub Actions CI, and co-located tests.

**Architecture:** Five sibling repos at the same directory level as `prompt-saviour`. Each gets a fresh `git init`, a `.vscode/settings.json` color theme, and its own test suite. The monorepo root becomes a developer workspace (`.code-workspace` file). Tests are co-located: unit tests and e2e tests live in the repo they test, except for one genuinely cross-service test that goes in a dedicated `ciyo-e2e` repo.

**Tech Stack:** git, GitHub CLI (`gh`), GitHub Actions, pnpm, VSCode workspace color customizations

---

## Test & Code Distribution Analysis

Before tasks, here is where everything lands:

| Source path | Destination repo | Reason |
|---|---|---|
| `backend/` | `ciyo-backend` | Self-contained already |
| `backend/` (vitest unit tests) | `ciyo-backend` | Already in backend/ |
| `e2e/api/` | `ciyo-backend/e2e/` | Pure API tests via `playwrightRequest`, no browser, no extension |
| `admin/` | `ciyo-admin` | Self-contained already |
| `e2e/admin/` | `ciyo-admin/e2e/` | Admin UI tests; backend is just a runtime dependency, not a co-owner |
| `src/` + root extension configs | `ciyo-extension` | Chrome extension source |
| `tests/unit/` | `ciyo-extension/tests/` | All test extension code (detection, policy, shared) |
| `e2e/extension/` (minus `ai-full-flow`) | `ciyo-extension/e2e/` | Inject policy directly into storage; no real backend involved |
| `e2e/fixtures/` + `fixtures-server.mjs` | `ciyo-extension/e2e/` | Serve mock HTML pages for extension tests |
| `e2e/extension/ai-full-flow.spec.ts` | `ciyo-e2e/` | Calls backend API + loads extension → genuinely cross-service |
| `e2e/helpers/` | `ciyo-e2e/` (canonical), copied to admin/backend as needed | Shared Clerk auth helpers used across repos |
| `e2e/global-setup.ts` + `global-teardown.ts` | `ciyo-e2e/` | Seed/teardown calls backend scripts; lives with the cross-service suite |

### Why keep ciyo-e2e at all?

`ai-full-flow.spec.ts` is the product's most important test: it proves the full
**admin publishes policy → extension enforces it** loop. It calls `POST /v1/assistant/apply`,
`POST /v1/policy/publish`, `GET /v1/policy` (all backend), then loads the built extension
and asserts the block rule fires. No single repo owns both sides. `ciyo-e2e` is slim
(one spec today) but earns its place as the "system contract" test suite.

---

## Repo Color Themes

| Repo | Sidebar / ActivityBar | TitleBar | StatusBar |
|------|----------------------|----------|-----------|
| `ciyo-backend` | Purple `#2E0057` | `#3B0764` | `#6D28D9` |
| `ciyo-admin` | Dark blue `#0F2744` | `#1E3A5F` | `#1D4ED8` |
| `ciyo-extension` | Dark orange `#7C2400` | `#9A3412` | `#EA580C` |
| `ciyo-e2e` | Dark teal `#022C22` | `#065F46` | `#059669` |

---

## Task 1: Create ciyo-backend repo

**Files:**
- Copy: all of `backend/`
- Copy: `e2e/api/` → `e2e/`
- Copy: `e2e/helpers/` → `e2e/helpers/`
- Copy: `e2e/global-setup.ts`, `e2e/global-teardown.ts` → `e2e/`
- Create: `.gitignore`
- Create: `.vscode/settings.json`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Initialize the repo**

```bash
cd ..
cp -r prompt-saviour/backend ciyo-backend
cd ciyo-backend
# Copy e2e/api tests and shared helpers
mkdir -p e2e/helpers
cp -r ../prompt-saviour/e2e/api/* e2e/
cp ../prompt-saviour/e2e/helpers/admin-headers.ts e2e/helpers/
cp ../prompt-saviour/e2e/helpers/org-headers.ts e2e/helpers/
cp ../prompt-saviour/e2e/helpers/seed-state.ts e2e/helpers/
cp ../prompt-saviour/e2e/global-setup.ts e2e/global-setup.ts
cp ../prompt-saviour/e2e/global-teardown.ts e2e/global-teardown.ts
cp ../prompt-saviour/e2e/.env.e2e.example e2e/.env.e2e.example
git init
git branch -M main
```

- [ ] **Step 2: Create playwright.config.ts for API tests**

Create `../ciyo-backend/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.join(__dirname, 'e2e/.env.e2e') })

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: process.env.E2E_BACKEND_URL ?? 'http://localhost:3000',
  },
  projects: [{ name: 'api', testMatch: 'e2e/**/*.spec.ts' }],
})
```

- [ ] **Step 3: Update global-setup.ts to reference local backend**

Edit `../ciyo-backend/e2e/global-setup.ts` — change the `BACKEND_DIR` reference since the setup now runs from inside the backend repo itself:

```typescript
import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'
import { mkdirSync } from 'fs'

config({ path: path.join(__dirname, '.env.e2e') })

export default async function globalSetup() {
  if (!process.env.E2E_DATABASE_URL) {
    throw new Error('E2E_DATABASE_URL is not set. Fill in e2e/.env.e2e.')
  }

  mkdirSync(path.join(__dirname, '.auth'), { recursive: true })

  console.log('[e2e] Seeding test database...')
  execSync('pnpm run seed:e2e', {
    cwd: path.resolve(__dirname, '..'),  // repo root = backend root
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL:         process.env.E2E_DATABASE_URL,
      E2E_CLERK_ORG_ID:     process.env.E2E_CLERK_ORG_ID!,
      E2E_CLERK_USER_ID:    process.env.E2E_CLERK_USER_ID!,
      E2E_CLERK_USER_EMAIL: process.env.E2E_CLERK_USER_EMAIL!,
    },
  })
  console.log('[e2e] Seed complete.')
}
```

Do the same for `global-teardown.ts`:

```typescript
import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '.env.e2e') })

export default async function globalTeardown() {
  console.log('[e2e] Tearing down test database...')
  execSync('pnpm run teardown:e2e', {
    cwd: path.resolve(__dirname, '..'),  // repo root = backend root
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
  })
  console.log('[e2e] Teardown complete.')
}
```

- [ ] **Step 4: Add @playwright/test to backend devDependencies**

```bash
cd ../ciyo-backend
pnpm add -D @playwright/test dotenv
```

- [ ] **Step 5: Add e2e script to package.json**

Edit `../ciyo-backend/package.json` — add under `"scripts"`:

```json
"test:e2e": "playwright test --config playwright.config.ts"
```

- [ ] **Step 6: Create .gitignore**

Create `../ciyo-backend/.gitignore`:

```
node_modules/
dist/
.env
.env.*
!.env.example
!e2e/.env.e2e.example
*.js.map
e2e/.auth/
e2e/playwright-report/
e2e/test-results/
e2e/.seed-state.json
```

- [ ] **Step 7: Add VSCode color identity (purple theme)**

Create `../ciyo-backend/.vscode/settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "activityBar.background": "#2E0057",
    "activityBar.foreground": "#E2CDFF",
    "titleBar.activeBackground": "#3B0764",
    "titleBar.activeForeground": "#F5F0FF",
    "statusBar.background": "#6D28D9",
    "statusBar.foreground": "#FFFFFF",
    "sideBarSectionHeader.background": "#4C1D95",
    "sideBarSectionHeader.foreground": "#EDE9FE"
  }
}
```

- [ ] **Step 8: Add GitHub Actions CI workflow**

Create `../ciyo-backend/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
          POSTGRES_DB: ciyo_test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Typecheck
        run: pnpm typecheck

      - name: Run migrations
        run: pnpm run db:migrate
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/ciyo_test

      - name: Run unit tests
        run: pnpm test
        env:
          DATABASE_URL: postgres://postgres:test@localhost:5432/ciyo_test
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}

      - name: Build
        run: pnpm build
```

- [ ] **Step 9: Add GitHub Actions E2E workflow**

Create `../ciyo-backend/.github/workflows/e2e.yml`:

```yaml
name: API E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright
        run: pnpm exec playwright install chromium --with-deps

      - name: Run migrations
        run: pnpm run db:migrate
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}

      - name: Build backend
        run: pnpm build

      - name: Start backend
        run: node dist/index.js &
        env:
          DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          CLERK_WEBHOOK_SECRET: ${{ secrets.CLERK_WEBHOOK_SECRET }}
          PORT: 3000

      - name: Wait for backend
        run: npx wait-on http://localhost:3000/health --timeout 30000

      - name: Run API E2E tests
        run: pnpm test:e2e
        env:
          E2E_DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          E2E_BACKEND_URL: http://localhost:3000
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          E2E_CLERK_USER_ID: ${{ secrets.E2E_CLERK_USER_ID }}
          E2E_CLERK_ORG_ID: ${{ secrets.E2E_CLERK_ORG_ID }}
          E2E_CLERK_USER_EMAIL: testuser@gmail.com
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

- [ ] **Step 10: Initial commit and push to GitHub**

```bash
cd ../ciyo-backend
git add .
git commit -m "feat: initialize ciyo-backend as standalone repo"
gh repo create ciyo-backend --private --source=. --remote=origin --push
```

Expected: repo at `github.com/<your-username>/ciyo-backend`, initial commit pushed.

---

## Task 2: Create ciyo-admin repo

**Files:**
- Copy: all of `admin/`
- Copy: `e2e/admin/` → `e2e/`
- Copy: `e2e/helpers/` → `e2e/helpers/`
- Create: `.gitignore`, `.vscode/settings.json`, `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`

- [ ] **Step 1: Initialize the repo**

```bash
cd ..
cp -r prompt-saviour/admin ciyo-admin
cd ciyo-admin
mkdir -p e2e/helpers
cp -r ../prompt-saviour/e2e/admin/* e2e/
cp ../prompt-saviour/e2e/helpers/admin-headers.ts e2e/helpers/
cp ../prompt-saviour/e2e/helpers/org-headers.ts e2e/helpers/
cp ../prompt-saviour/e2e/helpers/seed-state.ts e2e/helpers/
cp ../prompt-saviour/e2e/.env.e2e.example e2e/.env.e2e.example
git init
git branch -M main
```

- [ ] **Step 2: Create playwright.config.ts**

Create `../ciyo-admin/playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.join(__dirname, 'e2e/.env.e2e') })

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  use: {
    baseURL: process.env.E2E_ADMIN_URL ?? 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: '**/auth.setup.ts' },
    {
      name: 'admin',
      testMatch: 'e2e/**/*.spec.ts',
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/admin.json',
      },
    },
  ],
})
```

- [ ] **Step 3: Add @playwright/test to admin devDependencies**

```bash
cd ../ciyo-admin
pnpm add -D @playwright/test @clerk/testing dotenv wait-on
```

- [ ] **Step 4: Add e2e script to package.json**

Edit `../ciyo-admin/package.json` — add under `"scripts"`:

```json
"test:e2e": "playwright test --config playwright.config.ts"
```

- [ ] **Step 5: Create .gitignore**

Create `../ciyo-admin/.gitignore`:

```
node_modules/
dist/
.env
.env.*
!.env.example
!e2e/.env.e2e.example
e2e/.auth/
e2e/playwright-report/
e2e/test-results/
e2e/.seed-state.json
```

- [ ] **Step 6: Add VSCode color identity (blue theme)**

Create `../ciyo-admin/.vscode/settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "activityBar.background": "#0F2744",
    "activityBar.foreground": "#BAD7FF",
    "titleBar.activeBackground": "#1E3A5F",
    "titleBar.activeForeground": "#EBF4FF",
    "statusBar.background": "#1D4ED8",
    "statusBar.foreground": "#FFFFFF",
    "sideBarSectionHeader.background": "#1E40AF",
    "sideBarSectionHeader.foreground": "#DBEAFE"
  }
}
```

- [ ] **Step 7: Add GitHub Actions CI workflow**

Create `../ciyo-admin/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Typecheck
        run: pnpm typecheck

      - name: Run unit tests
        run: pnpm test

      - name: Build
        run: pnpm build
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          VITE_API_BASE: ${{ secrets.VITE_API_BASE || 'http://localhost:3000' }}
```

- [ ] **Step 8: Add GitHub Actions E2E workflow**

Create `../ciyo-admin/.github/workflows/e2e.yml`:

```yaml
name: Admin E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      backend_url:
        description: 'Backend API URL to test against'
        required: false
        default: 'http://localhost:3000'

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright Chromium
        run: pnpm exec playwright install chromium --with-deps

      - name: Build admin app
        run: pnpm build
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          VITE_API_BASE: ${{ inputs.backend_url || secrets.E2E_BACKEND_URL }}

      - name: Serve admin app
        run: pnpm preview -- --port 5173 &

      - name: Wait for services
        run: npx wait-on http://localhost:5173 --timeout 30000

      - name: Run admin E2E tests
        run: pnpm test:e2e
        env:
          E2E_ADMIN_URL: http://localhost:5173
          E2E_BACKEND_URL: ${{ inputs.backend_url || secrets.E2E_BACKEND_URL }}
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
          E2E_CLERK_USER_ID: ${{ secrets.E2E_CLERK_USER_ID }}
          E2E_CLERK_ORG_ID: ${{ secrets.E2E_CLERK_ORG_ID }}
          E2E_CLERK_USER_EMAIL: testuser@gmail.com
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

- [ ] **Step 9: Initial commit and push to GitHub**

```bash
cd ../ciyo-admin
git add .
git commit -m "feat: initialize ciyo-admin as standalone repo"
gh repo create ciyo-admin --private --source=. --remote=origin --push
```

Expected: repo at `github.com/<your-username>/ciyo-admin`, initial commit pushed.

---

## Task 3: Create ciyo-extension repo

**Files:**
- Copy: `src/`, `public/`, `tests/` (unit tests), root extension config files
- Copy: `e2e/extension/` minus `ai-full-flow.spec.ts` → `e2e/`
- Copy: `e2e/fixtures/`, `e2e/fixtures-server.mjs` → `e2e/`
- Create: `package.json`, `.gitignore`, `.vscode/settings.json`, `.github/workflows/ci.yml`, `.github/workflows/e2e.yml`

- [ ] **Step 1: Initialize the repo**

```bash
cd ..
mkdir ciyo-extension
cd ciyo-extension
git init
git branch -M main

# Extension source
cp -r ../prompt-saviour/src .
cp -r ../prompt-saviour/public .
cp -r ../prompt-saviour/tests .
cp ../prompt-saviour/vite.config.ts .
cp ../prompt-saviour/tsconfig.json .
cp ../prompt-saviour/manifest.config.ts .
cp ../prompt-saviour/tailwind.config.ts .
cp ../prompt-saviour/postcss.config.js .
cp ../prompt-saviour/managed_schema.json .

# Extension e2e tests (pure, no backend)
mkdir -p e2e/fixtures
cp ../prompt-saviour/e2e/extension/detection.spec.ts e2e/
cp ../prompt-saviour/e2e/extension/options.spec.ts e2e/
cp ../prompt-saviour/e2e/extension/warn.spec.ts e2e/
cp ../prompt-saviour/e2e/extension/policy-sync.spec.ts e2e/
cp -r ../prompt-saviour/e2e/fixtures/* e2e/fixtures/
cp ../prompt-saviour/e2e/fixtures-server.mjs e2e/
cp ../prompt-saviour/e2e/.env.e2e.example e2e/.env.e2e.example
```

- [ ] **Step 2: Create package.json**

Create `../ciyo-extension/package.json`:

```json
{
  "name": "ciyo-extension",
  "version": "2.0.0",
  "description": "Browser-based DLP for LLM chat interfaces — Chrome extension",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "test:e2e": "playwright test --config playwright.config.ts"
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
    "@crxjs/vite-plugin": "^2.0.0-beta.26",
    "@playwright/test": "^1.47.0",
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

- [ ] **Step 3: Create playwright.config.ts for extension tests**

Create `../ciyo-extension/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  use: {
    headless: false,
  },
  projects: [{ name: 'extension', testMatch: 'e2e/**/*.spec.ts' }],
})
```

- [ ] **Step 4: Create .gitignore**

Create `../ciyo-extension/.gitignore`:

```
node_modules/
dist/
.env
.env.*
!.env.example
e2e/playwright-report/
e2e/test-results/
```

- [ ] **Step 5: Add VSCode color identity (orange theme)**

Create `../ciyo-extension/.vscode/settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "activityBar.background": "#7C2400",
    "activityBar.foreground": "#FFD5B8",
    "titleBar.activeBackground": "#9A3412",
    "titleBar.activeForeground": "#FFF7ED",
    "statusBar.background": "#EA580C",
    "statusBar.foreground": "#FFFFFF",
    "sideBarSectionHeader.background": "#C2410C",
    "sideBarSectionHeader.foreground": "#FFEDD5"
  }
}
```

- [ ] **Step 6: Add GitHub Actions CI workflow**

Create `../ciyo-extension/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Typecheck
        run: pnpm typecheck

      - name: Run unit tests
        run: pnpm test

      - name: Build extension
        run: pnpm build
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
```

- [ ] **Step 7: Add GitHub Actions E2E workflow**

Create `../ciyo-extension/.github/workflows/e2e.yml`:

```yaml
name: Extension E2E Tests

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install dependencies
        run: pnpm install

      - name: Install Playwright Chromium
        run: pnpm exec playwright install chromium --with-deps

      - name: Build extension
        run: pnpm build
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}

      - name: Start fixture server
        run: node e2e/fixtures-server.mjs &

      - name: Run extension E2E tests
        run: pnpm test:e2e

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

- [ ] **Step 8: Initial commit and push to GitHub**

```bash
cd ../ciyo-extension
git add .
git commit -m "feat: initialize ciyo-extension as standalone repo"
gh repo create ciyo-extension --private --source=. --remote=origin --push
```

Expected: repo at `github.com/<your-username>/ciyo-extension`, initial commit pushed.

---

## Task 4: Create ciyo-e2e repo (cross-service tests only)

**What lives here:** `ai-full-flow.spec.ts` — the only test that spans both backend and extension.
It applies an AI-suggested rule via backend API, publishes the policy, then loads the built
extension and proves the rule fires. No single repo owns both sides.

**Files:**
- Copy: `e2e/extension/ai-full-flow.spec.ts` → `e2e/`
- Copy: `e2e/helpers/` → `e2e/helpers/`
- Copy: `e2e/global-setup.ts`, `e2e/global-teardown.ts` → `e2e/`
- Copy: `e2e/fixtures/`, `e2e/fixtures-server.mjs` → `e2e/`
- Create: `package.json`, `playwright.config.ts`, `.gitignore`, `.vscode/settings.json`, `.github/workflows/e2e.yml`

- [ ] **Step 1: Initialize the repo**

```bash
cd ..
mkdir ciyo-e2e
cd ciyo-e2e
git init
git branch -M main

mkdir -p e2e/helpers e2e/fixtures
cp ../prompt-saviour/e2e/extension/ai-full-flow.spec.ts e2e/
cp ../prompt-saviour/e2e/helpers/admin-headers.ts e2e/helpers/
cp ../prompt-saviour/e2e/helpers/org-headers.ts e2e/helpers/
cp ../prompt-saviour/e2e/helpers/seed-state.ts e2e/helpers/
cp ../prompt-saviour/e2e/global-setup.ts e2e/global-setup.ts
cp ../prompt-saviour/e2e/global-teardown.ts e2e/global-teardown.ts
cp -r ../prompt-saviour/e2e/fixtures/* e2e/fixtures/
cp ../prompt-saviour/e2e/fixtures-server.mjs e2e/
cp ../prompt-saviour/e2e/.env.e2e.example e2e/.env.e2e.example
```

- [ ] **Step 2: Update global-setup.ts to reference the ciyo-backend repo**

In a polyrepo world the seeder runs inside `ciyo-backend`. Update `e2e/global-setup.ts`:

```typescript
import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'
import { mkdirSync } from 'fs'

config({ path: path.join(__dirname, '.env.e2e') })

// In CI this env var points to the checked-out ciyo-backend repo path.
// Locally, set BACKEND_REPO_PATH in .env.e2e.
const BACKEND_DIR = process.env.BACKEND_REPO_PATH
  ?? path.resolve(__dirname, '../../ciyo-backend')

export default async function globalSetup() {
  if (!process.env.E2E_DATABASE_URL) {
    throw new Error('E2E_DATABASE_URL is not set. Fill in e2e/.env.e2e.')
  }

  mkdirSync(path.join(__dirname, '.auth'), { recursive: true })

  console.log('[e2e] Seeding test database...')
  execSync('pnpm run seed:e2e', {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL:         process.env.E2E_DATABASE_URL,
      E2E_CLERK_ORG_ID:     process.env.E2E_CLERK_ORG_ID!,
      E2E_CLERK_USER_ID:    process.env.E2E_CLERK_USER_ID!,
      E2E_CLERK_USER_EMAIL: process.env.E2E_CLERK_USER_EMAIL!,
    },
  })
  console.log('[e2e] Seed complete.')
}
```

Do the same for `e2e/global-teardown.ts`:

```typescript
import { execSync } from 'child_process'
import path from 'path'
import { config } from 'dotenv'

config({ path: path.join(__dirname, '.env.e2e') })

const BACKEND_DIR = process.env.BACKEND_REPO_PATH
  ?? path.resolve(__dirname, '../../ciyo-backend')

export default async function globalTeardown() {
  console.log('[e2e] Tearing down test database...')
  execSync('pnpm run teardown:e2e', {
    cwd: BACKEND_DIR,
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: process.env.E2E_DATABASE_URL },
  })
  console.log('[e2e] Teardown complete.')
}
```

- [ ] **Step 3: Create package.json**

Create `../ciyo-e2e/package.json`:

```json
{
  "name": "ciyo-e2e",
  "version": "0.1.0",
  "description": "Cross-service system contract tests for the ciyo platform",
  "private": true,
  "scripts": {
    "test:e2e": "playwright test --config playwright.config.ts"
  },
  "devDependencies": {
    "@playwright/test": "^1.47.0",
    "dotenv": "^16.4.5",
    "wait-on": "^8.0.1"
  }
}
```

- [ ] **Step 4: Create playwright.config.ts**

Create `../ciyo-e2e/playwright.config.ts`:

```typescript
import { defineConfig } from '@playwright/test'
import { config } from 'dotenv'
import path from 'path'

config({ path: path.join(__dirname, 'e2e/.env.e2e') })

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    headless: false,
  },
  projects: [{ name: 'cross-service', testMatch: 'e2e/**/*.spec.ts' }],
})
```

- [ ] **Step 5: Create .gitignore**

Create `../ciyo-e2e/.gitignore`:

```
node_modules/
.env
e2e/.env.e2e
!e2e/.env.e2e.example
e2e/.auth/
e2e/playwright-report/
e2e/test-results/
e2e/.seed-state.json
```

- [ ] **Step 6: Add VSCode color identity (teal theme)**

Create `../ciyo-e2e/.vscode/settings.json`:

```json
{
  "workbench.colorCustomizations": {
    "activityBar.background": "#022C22",
    "activityBar.foreground": "#A7F3D0",
    "titleBar.activeBackground": "#065F46",
    "titleBar.activeForeground": "#ECFDF5",
    "statusBar.background": "#059669",
    "statusBar.foreground": "#FFFFFF",
    "sideBarSectionHeader.background": "#047857",
    "sideBarSectionHeader.foreground": "#D1FAE5"
  }
}
```

- [ ] **Step 7: Add GitHub Actions E2E workflow**

Create `../ciyo-e2e/.github/workflows/e2e.yml`:

```yaml
name: Cross-Service E2E Tests

on:
  # Triggered manually or by deployment webhooks from ciyo-backend / ciyo-extension
  workflow_dispatch:
    inputs:
      backend_url:
        description: 'Backend API URL'
        required: false
        default: 'http://localhost:3000'
      extension_dist_path:
        description: 'Path to built extension dist/ (CI: leave empty, will build)'
        required: false

jobs:
  e2e:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Checkout ciyo-backend (for seeder)
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository_owner }}/ciyo-backend
          token: ${{ secrets.GH_PAT }}
          path: ciyo-backend

      - name: Checkout ciyo-extension (to build dist/)
        uses: actions/checkout@v4
        with:
          repository: ${{ github.repository_owner }}/ciyo-extension
          token: ${{ secrets.GH_PAT }}
          path: ciyo-extension

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - name: Install ciyo-e2e dependencies
        run: pnpm install

      - name: Install ciyo-backend dependencies (for seeder)
        run: pnpm install
        working-directory: ciyo-backend

      - name: Install ciyo-extension dependencies
        run: pnpm install
        working-directory: ciyo-extension

      - name: Build extension
        run: pnpm build
        working-directory: ciyo-extension
        env:
          VITE_CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}

      - name: Install Playwright Chromium
        run: pnpm exec playwright install chromium --with-deps

      - name: Start fixture server
        run: node e2e/fixtures-server.mjs &

      - name: Run cross-service E2E tests
        run: pnpm test:e2e
        env:
          E2E_DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
          E2E_BACKEND_URL: ${{ inputs.backend_url }}
          BACKEND_REPO_PATH: ${{ github.workspace }}/ciyo-backend
          CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
          E2E_CLERK_USER_ID: ${{ secrets.E2E_CLERK_USER_ID }}
          E2E_CLERK_ORG_ID: ${{ secrets.E2E_CLERK_ORG_ID }}
          E2E_CLERK_USER_EMAIL: testuser@gmail.com
          E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}

      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: e2e/playwright-report/
          retention-days: 7
```

> **Note:** The `GH_PAT` secret needs read access to `ciyo-backend` and `ciyo-extension` repos. Create a fine-grained PAT with `contents: read` on both.

- [ ] **Step 8: Initial commit and push to GitHub**

```bash
cd ../ciyo-e2e
git add .
git commit -m "feat: initialize ciyo-e2e cross-service test repo"
gh repo create ciyo-e2e --private --source=. --remote=origin --push
```

Expected: repo at `github.com/<your-username>/ciyo-e2e`, initial commit pushed.

---

## Task 5: Add VS Code multi-root workspace to the monorepo

- [ ] **Step 1: Create the workspace file**

Create `prompt-saviour/ciyo.code-workspace`:

```json
{
  "folders": [
    {
      "name": "backend",
      "path": "../ciyo-backend"
    },
    {
      "name": "admin",
      "path": "../ciyo-admin"
    },
    {
      "name": "extension",
      "path": "../ciyo-extension"
    },
    {
      "name": "e2e (cross-service)",
      "path": "../ciyo-e2e"
    }
  ],
  "settings": {
    "editor.formatOnSave": true
  },
  "extensions": {
    "recommendations": [
      "esbenp.prettier-vscode",
      "bradlc.vscode-tailwindcss",
      "dbaeumer.vscode-eslint",
      "ms-playwright.playwright"
    ]
  }
}
```

> Each folder's own `.vscode/settings.json` still applies per-folder, so color themes render in the Explorer sidebar. The titleBar color follows whichever folder contains the active file.

- [ ] **Step 2: Commit**

```bash
cd prompt-saviour
git add ciyo.code-workspace
git commit -m "chore: add multi-root VS Code workspace for polyrepo dev"
```

---

## Gotchas

- **pnpm lockfiles:** Each repo needs a fresh `pnpm install` to generate its own `pnpm-lock.yaml`. The root lockfile does not carry over.
- **`e2e/.env.e2e` secrets:** Gitignored. Copy `.env.e2e.example` and fill in values after repo creation.
- **`GH_PAT` for ciyo-e2e:** The cross-service workflow checks out two sibling repos. Create a fine-grained PAT with `contents: read` on `ciyo-backend` and `ciyo-extension` and add it as a repo secret on `ciyo-e2e`.
- **Git history:** This plan does a fresh `git init`. To preserve commit history per subfolder use `git filter-repo --subdirectory-filter <folder>` (install: `pip install git-filter-repo`) before copying files.
- **`e2e/helpers/` is duplicated** across backend, admin, and e2e repos. That's intentional for now — they're tiny files and DRY across repos adds coupling. If they grow, extract to a shared `@ciyo/e2e-helpers` package.
