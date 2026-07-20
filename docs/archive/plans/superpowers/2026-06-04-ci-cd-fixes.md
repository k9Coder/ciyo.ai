# CI/CD Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four broken/inconsistent CI issues so that E2E tests actually run on every deploy push, the pretzel release pipeline runs unit tests before shipping, and Railway uses pnpm consistently.

**Architecture:** All fixes are in `.github/workflows/` YAML files and `backend/railway.toml`. No application code changes needed.

**Tech Stack:** GitHub Actions, pnpm, railway.toml.

---

### Task 1: Fix E2E Working Directory (CI-1)

**Files:**
- Modify: `.github/workflows/e2e.yml`

- [ ] Step 1: Open `.github/workflows/e2e.yml`. The "Run E2E suite" step at line 73 has no `working-directory`. The `pnpm test:e2e` script exists in the `e2e/` sub-directory but the step runs from the repo root.

Current step:
```yaml
- name: Run E2E suite
  run: pnpm test:e2e
  env:
    E2E_DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
    ...
```

Replace with:
```yaml
- name: Run E2E suite
  run: pnpm test:e2e
  working-directory: e2e
  env:
    E2E_DATABASE_URL: ${{ secrets.E2E_DATABASE_URL }}
    E2E_ADMIN_URL: http://localhost:5173
    E2E_BACKEND_URL: http://localhost:3000
    CLERK_SECRET_KEY: ${{ secrets.CLERK_SECRET_KEY }}
    CLERK_PUBLISHABLE_KEY: ${{ secrets.VITE_CLERK_PUBLISHABLE_KEY }}
    E2E_CLERK_USER_ID: ${{ secrets.E2E_CLERK_USER_ID }}
    E2E_CLERK_ORG_ID: ${{ secrets.E2E_CLERK_ORG_ID }}
    E2E_CLERK_USER_EMAIL: testuser@gmail.com
    E2E_CLERK_USER_PASSWORD: ${{ secrets.E2E_CLERK_USER_PASSWORD }}
```

- [ ] Step 2: Also check whether `e2e/` has a `package.json` with a `test:e2e` script.
```bash
cat "c:/Users/yarin/Documents/code/prompt-saviour/e2e/package.json" 2>/dev/null | grep test:e2e
# If missing, the script needs to be added. Expected: "test:e2e": "playwright test"
```

- [ ] Step 3: Commit.
```bash
git add .github/workflows/e2e.yml
git commit -m "fix(ci): add working-directory: e2e to E2E suite step

The pnpm test:e2e script lives in e2e/ — running from repo root
caused a silent no-op because no script was found."
```

---

### Task 2: Fix Branch Name Mismatch (CI-2)

**Files:**
- Modify: `.github/workflows/e2e.yml`

- [ ] Step 1: Open `.github/workflows/e2e.yml` lines 3–8. Current trigger:
```yaml
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
```

The deploy workflows (`backend-deploy.yml`, `mykka-web-deploy.yml`, `pretzel-console-deploy.yml`) all trigger on `branches: [master]`. The default branch is `master`. E2E tests therefore never run on deploy pushes.

Replace with:
```yaml
on:
  pull_request:
    branches: [master, main]
  push:
    branches: [master, main]
```

- [ ] Step 2: Verify the deploy workflows trigger correctly.
```bash
grep -n "branches:" .github/workflows/backend-deploy.yml
# Expected: branches: [master]
grep -n "branches:" .github/workflows/e2e.yml
# Expected: branches: [master, main]
```

- [ ] Step 3: Commit.
```bash
git add .github/workflows/e2e.yml
git commit -m "fix(ci): e2e workflow triggers on master (matches deploy workflows)

Branch was [main] but all deploy workflows use [master].
E2E tests never ran on deploy pushes as a result."
```

---

### Task 3: Add Unit Tests to pretzel-release Pipeline (CI-3)

**Files:**
- Modify: `.github/workflows/pretzel-release.yml`

- [ ] Step 1: Open `.github/workflows/pretzel-release.yml`. After the "Install dependencies" step (line 29) and before "Build extension" (line 33), add a unit test step:

Current steps order:
```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
  working-directory: pretzel

- name: Build extension
  run: pnpm build:prod
  working-directory: pretzel
```

Replace with:
```yaml
- name: Install dependencies
  run: pnpm install --frozen-lockfile
  working-directory: pretzel

- name: Run unit tests
  run: pnpm test --run
  working-directory: pretzel

- name: Build extension
  run: pnpm build:prod
  working-directory: pretzel
```

The `--run` flag runs vitest in non-watch mode (required for CI).

- [ ] Step 2: Verify that `pretzel/package.json` has a `test` script.
```bash
cat "c:/Users/yarin/Documents/code/prompt-saviour/pretzel/package.json" | grep '"test"'
# Expected: "test": "vitest" or similar
```

- [ ] Step 3: Commit.
```bash
git add .github/workflows/pretzel-release.yml
git commit -m "fix(ci): run pretzel unit tests before building release zip

Detection logic was shipping without a CI test gate. A broken
policy evaluation could reach production undetected."
```

---

### Task 4: Fix railway.toml to Use pnpm (CI-4)

**Files:**
- Modify: `backend/railway.toml`

- [ ] Step 1: Open `backend/railway.toml`. Current content:
```toml
[build]
builder = "nixpacks"
buildCommand = "npm ci && npm run build && npm run db:migrate"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

`npm ci` is inconsistent with the rest of the stack which uses pnpm. Replace:
```toml
[build]
builder = "nixpacks"
buildCommand = "npm install -g pnpm && pnpm install --frozen-lockfile && pnpm run build && pnpm run db:migrate"

[deploy]
startCommand = "node dist/index.js"
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

Note: Railway's nixpacks base image includes npm but not pnpm. The `npm install -g pnpm` step bootstraps pnpm in the build container. An alternative is to add a `nixpacks.toml` to pin pnpm as a provider.

- [ ] Step 2: (Alternative, cleaner) Create `backend/nixpacks.toml` to declare pnpm as the package manager:
```toml
[phases.setup]
nixPkgs = ["nodejs_20"]

[phases.install]
cmds = ["npm install -g pnpm@9", "pnpm install --frozen-lockfile"]

[phases.build]
cmds = ["pnpm run build", "pnpm run db:migrate"]

[start]
cmd = "node dist/index.js"
```

And simplify `railway.toml` back to:
```toml
[build]
builder = "nixpacks"

[deploy]
healthcheckPath = "/health"
restartPolicyType = "on_failure"
```

- [ ] Step 3: Commit.
```bash
git add backend/railway.toml backend/nixpacks.toml
git commit -m "fix(ci): use pnpm in Railway build — replace npm ci with pnpm install

rest of stack uses pnpm. Railway was using npm ci which ignores the
pnpm-lock.yaml and produces non-reproducible builds."
```

---

### Task 5: Track BEFORE_DEPLOY_PROD.md in Git

**Files:**
- Modify: `.gitignore` (verify file is not excluded)
- Add: `BEFORE_DEPLOY_PROD.md` (already exists untracked)

- [ ] Step 1: Check whether the file is in `.gitignore`.
```bash
git check-ignore -v BEFORE_DEPLOY_PROD.md
# Expected: (empty — not ignored)
```

- [ ] Step 2: Add and commit the file.
```bash
git add BEFORE_DEPLOY_PROD.md
git commit -m "docs: track BEFORE_DEPLOY_PROD.md in git

File was untracked and would have been lost on next clean checkout."
```

- [ ] Step 3: Verify the file appears in the next `git status` as clean.
```bash
git status BEFORE_DEPLOY_PROD.md
# Expected: nothing to commit, working tree clean
```
