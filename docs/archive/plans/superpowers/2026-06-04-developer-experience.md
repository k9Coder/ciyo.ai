# Developer Experience Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `pnpm-workspace.yaml`, resolve the Zod v3/v4 split to a single version, create a one-command local E2E launcher, and add a Clerk test user provisioning script to eliminate the 60-minute new-dev setup friction.

**Architecture:** pnpm workspaces enable shared dependency hoisting. The Zod split is resolved by upgrading all packages to v3 (backend and pretzel-console are closest to the same major). The E2E local script uses Node child_process to start backend, pretzel-console, and seed the DB in parallel, then runs Playwright.

**Tech Stack:** pnpm workspaces, Zod v3, Node.js scripts, Clerk Node SDK.

---

### Task 1: Add pnpm-workspace.yaml

**Files:**
- Create: `pnpm-workspace.yaml`
- Modify: `package.json` (root)

- [ ] Step 1: Check the root `package.json` to see what scripts and workspaces (if any) are already defined.
```bash
cat "c:/Users/yarin/Documents/code/prompt-saviour/package.json"
```

- [ ] Step 2: Create `pnpm-workspace.yaml` in the repo root:
```yaml
packages:
  - 'backend'
  - 'pretzel'
  - 'pretzel-console'
  - 'ciyo-web'
  - 'e2e'
```

- [ ] Step 3: After adding `pnpm-workspace.yaml`, run `pnpm install` from the root to verify hoisting works and no package resolution errors occur.
```bash
cd "c:/Users/yarin/Documents/code/prompt-saviour" && pnpm install
# Expected: dependencies hoisted to root node_modules, no resolution errors
```

- [ ] Step 4: Verify each package can still build independently.
```bash
cd "c:/Users/yarin/Documents/code/prompt-saviour" && pnpm --filter backend build
# Expected: backend builds successfully
```

- [ ] Step 5: Commit.
```bash
git add pnpm-workspace.yaml
git commit -m "feat(dx): add pnpm-workspace.yaml for monorepo dependency hoisting

Enables pnpm workspaces so shared dependencies are hoisted to root
node_modules. Eliminates duplicate installs of react, drizzle, etc."
```

---

### Task 2: Resolve Zod Version Split (SF-3)

**Files:**
- Modify: `pretzel-console/package.json`

- [ ] Step 1: Check current Zod versions across packages.
```bash
grep -r '"zod"' backend/package.json pretzel/package.json pretzel-console/package.json 2>/dev/null
# Expected output:
# backend/package.json: "zod": "^3.23.8"
# pretzel/package.json: "zod": "^3.23.8"
# pretzel-console/package.json: "zod": "^4.4.3"
```

- [ ] Step 2: The split is `backend`/`pretzel` on v3 vs `pretzel-console` on v4. Zod v4 has breaking API changes (`.email()` validator changed). Downgrade `pretzel-console` to v3 to unify:
```bash
cd pretzel-console && pnpm add zod@^3.23.8
```

- [ ] Step 3: Check if `pretzel-console` uses any Zod v4-specific APIs.
```bash
grep -rn "z\." pretzel-console/src/ --include="*.ts" --include="*.tsx" | grep -v node_modules | head -30
```
If any v4-specific method is used (e.g., `z.email()` standalone, `z.pipe`, etc.), update to v3 equivalents.

- [ ] Step 4: Run `pretzel-console` tests to verify no breakage.
```bash
cd pretzel-console && pnpm test
# Expected: all tests pass
```

- [ ] Step 5: Commit.
```bash
git add pretzel-console/package.json pretzel-console/pnpm-lock.yaml
git commit -m "fix(dx): unify Zod to v3 across all packages

pretzel-console was on v4.4.3 while backend and pretzel were on v3.23.8.
Downgraded pretzel-console to v3.23.8 to prevent version split causing
type incompatibilities in the shared types package."
```

---

### Task 3: Create One-Command Local E2E Launcher (SF-2)

**Files:**
- Create: `scripts/e2e-local.mjs`
- Modify: `package.json` (root)

- [ ] Step 1: Create `scripts/e2e-local.mjs`. This script starts backend, waits for it to be healthy, seeds the DB, starts pretzel-console, then runs Playwright:
```javascript
#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')

function log(msg) {
  console.log(`[e2e-local] ${msg}`)
}

function startProcess(cmd, args, cwd, label, env = {}) {
  log(`Starting ${label}...`)
  const proc = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  proc.on('error', (err) => { log(`${label} error: ${err.message}`); process.exit(1) })
  return proc
}

async function waitForUrl(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url)
      if (res.ok) { log(`${url} is ready`); return }
    } catch { /* not ready yet */ }
    await sleep(1000)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

const processes = []

process.on('SIGINT', () => {
  log('Shutting down...')
  processes.forEach(p => p.kill())
  process.exit(0)
})

// 1. Start backend
const backend = startProcess('node', ['dist/index.js'], path.join(ROOT, 'backend'), 'backend', {
  PORT: '3000',
  NODE_ENV: 'test',
})
processes.push(backend)

// 2. Wait for backend health
await waitForUrl('http://localhost:3000/health')

// 3. Seed the test DB
log('Seeding test DB...')
execSync('pnpm run seed:e2e', { cwd: path.join(ROOT, 'backend'), stdio: 'inherit' })
log('Seed complete.')

// 4. Start pretzel-console
const console_ = startProcess(
  'pnpm', ['run', 'preview', '--', '--port', '5173'],
  path.join(ROOT, 'pretzel-console'), 'pretzel-console'
)
processes.push(console_)
await waitForUrl('http://localhost:5173')

// 5. Run Playwright E2E
log('Running E2E suite...')
try {
  execSync('pnpm test:e2e', {
    cwd: path.join(ROOT, 'e2e'),
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_BACKEND_URL: 'http://localhost:3000',
      E2E_ADMIN_URL:   'http://localhost:5173',
    },
  })
  log('E2E suite passed.')
} catch (err) {
  log('E2E suite failed.')
  processes.forEach(p => p.kill())
  process.exit(1)
}

processes.forEach(p => p.kill())
process.exit(0)
```

- [ ] Step 2: Add a root script in `package.json`:
```json
{
  "scripts": {
    "e2e:local": "node scripts/e2e-local.mjs"
  }
}
```

- [ ] Step 3: Verify the script is executable and runs without syntax errors.
```bash
node --check "c:/Users/yarin/Documents/code/prompt-saviour/scripts/e2e-local.mjs"
# Expected: (no output = no syntax errors)
```

- [ ] Step 4: Commit.
```bash
git add scripts/e2e-local.mjs package.json
git commit -m "feat(dx): add pnpm e2e:local — one-command local E2E orchestration

Replaces the 6-step manual chain (start backend, seed DB, start console,
set env vars, run playwright) with a single command."
```

---

### Task 4: Clerk Test User Provisioning Script (SF-1)

**Files:**
- Create: `scripts/provision-e2e-clerk-user.mjs`

- [ ] Step 1: Create `scripts/provision-e2e-clerk-user.mjs`. This script creates a test Clerk user and prints the values needed for `e2e/.env.e2e`:
```javascript
#!/usr/bin/env node
/**
 * Creates a Clerk test user for E2E testing and prints the env vars
 * needed in e2e/.env.e2e.
 *
 * Usage:
 *   CLERK_SECRET_KEY=sk_test_... node scripts/provision-e2e-clerk-user.mjs
 */
import { createClerkClient } from '@clerk/backend'

const clerkSecretKey = process.env.CLERK_SECRET_KEY
if (!clerkSecretKey) {
  console.error('CLERK_SECRET_KEY environment variable is required')
  process.exit(1)
}

const clerk = createClerkClient({ secretKey: clerkSecretKey })

const TEST_EMAIL    = `e2e-test-${Date.now()}@ciyo-test.example`
const TEST_PASSWORD = `E2eTest!${Math.random().toString(36).slice(2, 10)}`

console.log('Creating Clerk test user...')

try {
  const user = await clerk.users.createUser({
    emailAddress: [TEST_EMAIL],
    password:     TEST_PASSWORD,
    firstName:    'E2E',
    lastName:     'TestUser',
  })

  console.log('\nUser created successfully. Add these to e2e/.env.e2e:\n')
  console.log(`E2E_CLERK_USER_ID=${user.id}`)
  console.log(`E2E_CLERK_USER_EMAIL=${TEST_EMAIL}`)
  console.log(`E2E_CLERK_USER_PASSWORD=${TEST_PASSWORD}`)
  console.log(`\nNote: This user will be charged to your Clerk MAU count.`)
  console.log(`Delete it after E2E testing with:`)
  console.log(`  node scripts/provision-e2e-clerk-user.mjs --delete ${user.id}`)
} catch (err) {
  console.error('Failed to create Clerk user:', err.message)
  process.exit(1)
}
```

- [ ] Step 2: Add a script entry in root `package.json`:
```json
{
  "scripts": {
    "e2e:provision-clerk": "node scripts/provision-e2e-clerk-user.mjs"
  }
}
```

- [ ] Step 3: Document the script in the root `CLAUDE.md` prerequisites section.

- [ ] Step 4: Test the script against the staging Clerk instance.
```bash
CLERK_SECRET_KEY=sk_test_... node scripts/provision-e2e-clerk-user.mjs
# Expected output:
# User created successfully. Add these to e2e/.env.e2e:
#
# E2E_CLERK_USER_ID=user_2xxxxxxxxxxxxxxxxxxxxxxxx
# E2E_CLERK_USER_EMAIL=e2e-test-1234567890@ciyo-test.example
# E2E_CLERK_USER_PASSWORD=E2eTest!abc123
```

- [ ] Step 5: Commit.
```bash
git add scripts/provision-e2e-clerk-user.mjs package.json
git commit -m "feat(dx): Clerk test user provisioning script for E2E setup

New devs previously had to manually create a Clerk test user in the
dashboard (30-60 min friction). This script does it in under 30 seconds."
```
