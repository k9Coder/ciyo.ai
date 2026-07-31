# Manual QA Suite (qa/) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `qa/` package skeleton (env config, reporter, Playwright wiring) and one fully working reference surface (`pretzel-console`), proving the manual-QA pipeline end to end against a real deployed environment.

**Architecture:** A new standalone pnpm package `qa/`, sibling to `e2e/`, following `e2e/`'s project-per-surface Playwright pattern but pointed at externally supplied URLs (never local dev servers, never a truncatable database). A custom Playwright reporter turns scripted-journey results into the same structured QA-report shape gstack's `/qa` and `/qa-only` skills already write to `.gstack/qa-reports/`. Console is the first surface: Clerk-authenticated storageState setup, then two self-contained journeys (login smoke, member-invite). Web/extension/desktop/api surfaces are out of scope — separate follow-up plans.

**Tech Stack:** Playwright (`@playwright/test` ^1.47.0), `@clerk/testing`, `dotenv`, `zod`, TypeScript, pnpm (independent package install, no workspace hoisting).

## Global Constraints

- `qa/` targets real deployed URLs supplied via `.env.qa.<target>`, never `localhost` dev servers and never a database this suite is allowed to truncate/seed (spec: Architecture, Environment configuration).
- Every journey creates and cleans up its own data; none may depend on or mutate shared seeded state (spec: Goals, Architecture > Journeys, not clicks).
- No CI wiring — this suite is invoked manually, matching the repo-wide CI test policy in `AGENTS.md` (spec: Non-goals).
- Do not reimplement agent-driven browsing — the exploratory half is gstack's existing `/qa` / `/qa-only` skills; this plan only builds the scripted-journey half and a compatible report format (spec: Non-goals, Existing infrastructure).
- `qa/` is an independently installed pnpm package (its own `package.json`, own `pnpm install`), matching every other package in this repo — there is no workspace hoisting to rely on (`AGENTS.md` > Repository Shape).
- Never commit filled-in `.env.qa.*` files or the `.auth/` storageState directory — credentials and session tokens only.

---

### Task 1: Scaffold the `qa/` package

**Files:**
- Create: `qa/package.json`
- Create: `qa/tsconfig.json`
- Create: `qa/.env.qa.example`
- Modify: `.gitignore`

**Interfaces:**
- Produces: a `qa/` directory installable via `cd qa; pnpm install`, matching the shape later tasks build into (`support/`, `journeys/`, `playwright.config.ts`, `env.ts`).

- [ ] **Step 1: Create `qa/package.json`**

```json
{
  "name": "mykka-qa",
  "version": "0.1.0",
  "description": "Manual QA suite — scripted journeys against real deployed environments",
  "private": true,
  "scripts": {
    "test:qa": "playwright test --config playwright.config.ts",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@clerk/testing": "^1.4.4",
    "@playwright/test": "^1.47.0",
    "@types/node": "^20.0.0",
    "dotenv": "^16.4.5",
    "typescript": "^5.5.4",
    "zod": "^4.4.3"
  }
}
```

- [ ] **Step 2: Create `qa/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  },
  "include": ["."],
  "exclude": ["node_modules", "test-results"]
}
```

- [ ] **Step 3: Create `qa/.env.qa.example`**

```
# Copy this file to .env.qa.staging (or .env.qa.prod for a prod smoke run).
# Never commit the filled-in copy — it holds real credentials.
#
# Point a run at whichever file you want via QA_ENV_FILE:
#   QA_ENV_FILE=.env.qa.staging pnpm test:qa

# Console (pretzel-console) — a real deployed URL, not localhost
QA_CONSOLE_URL=https://staging-console.mykka.ai

# Clerk test account for THIS environment. Ask whoever owns the staging Clerk
# instance for a dedicated QA account — do not reuse a real customer account,
# and do not reuse the seeded e2e/.env.e2e Clerk user (that one belongs to
# the truncate-and-reseed e2e/ suite).
QA_CLERK_PUBLISHABLE_KEY=pk_test_...
QA_CLERK_USER_EMAIL=qa-tester@example.com
QA_CLERK_USER_PASSWORD=...
```

- [ ] **Step 4: Add QA artifacts to `.gitignore`**

Add this block near the existing `# E2E` section in `.gitignore`:

```
# QA
qa/.auth/
qa/.env.qa.staging
qa/.env.qa.prod
qa/test-results/
qa/playwright-report/
.gstack/qa-reports/
```

- [ ] **Step 5: Commit**

```bash
git add qa/package.json qa/tsconfig.json qa/.env.qa.example .gitignore
git commit -m "chore(qa): scaffold qa/ package"
```

---

### Task 2: Env loader

**Files:**
- Create: `qa/env.ts`

**Interfaces:**
- Consumes: nothing (reads `process.env` + the file named by `QA_ENV_FILE`, default `.env.qa.staging`).
- Produces: `export const env: { QA_CONSOLE_URL?: string; QA_CLERK_PUBLISHABLE_KEY?: string; QA_CLERK_USER_EMAIL?: string; QA_CLERK_USER_PASSWORD?: string; CI?: string }` and `export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]>` — throws a descriptive error naming the missing key and the `.env.qa.example` file if unset. Later tasks (console-setup, journeys) import `requireEnv`; `qa/playwright.config.ts` imports `env` directly for values it's allowed to leave undefined (e.g. deciding retries from `env.CI`).

All fields are optional at the schema level deliberately: `qa/playwright.config.ts` loads this module to build its `projects` array even when only running the `unit` project (Task 3), which needs no console credentials at all. Validation of "is this value actually present" is deferred to the point of use via `requireEnv`, not to module load time.

- [ ] **Step 1: Write `qa/env.ts`**

```ts
import path from 'path'
import { config } from 'dotenv'
import { z } from 'zod'

config({ path: path.join(__dirname, process.env.QA_ENV_FILE ?? '.env.qa.staging') })

const schema = z.object({
  QA_CONSOLE_URL: z.string().url().optional(),
  QA_CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  QA_CLERK_USER_EMAIL: z.string().min(1).optional(),
  QA_CLERK_USER_PASSWORD: z.string().min(1).optional(),
  CI: z.string().optional(),
})

export const env = schema.parse(process.env)

export function requireEnv<K extends keyof typeof env>(key: K): NonNullable<(typeof env)[K]> {
  const value = env[key]
  if (!value) {
    throw new Error(
      `qa/${process.env.QA_ENV_FILE ?? '.env.qa.staging'} is missing ${key} — ` +
      `copy qa/.env.qa.example and fill it in.`
    )
  }
  return value as NonNullable<(typeof env)[K]>
}
```

- [ ] **Step 2: Typecheck**

Run (from `qa/`, after `pnpm install`):
```powershell
pnpm typecheck
```
Expected: no errors. (Installing dependencies happens in Task 9's verification pass; if `node_modules` doesn't exist yet, run `pnpm install` first.)

- [ ] **Step 3: Commit**

```bash
git add qa/env.ts
git commit -m "feat(qa): add env loader with deferred validation"
```

---

### Task 3: Custom QA-report reporter (pure formatter + unit tests)

**Files:**
- Create: `qa/support/reporter/build-report.ts`
- Create: `qa/support/reporter/build-report.test.ts`

**Interfaces:**
- Produces: `export type JourneyStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'`; `export interface JourneyResult { title: string; status: JourneyStatus; durationMs: number; errorMessage?: string; attachmentPaths: string[] }`; `export interface BuildReportInput { surface: string; targetUrl: string; date: string; results: JourneyResult[] }`; `export function buildReport(input: BuildReportInput): string`. Task 4's `qa-report-reporter.ts` imports all of these.

This is a pure function — no filesystem, no Playwright reporter lifecycle — so it's testable without a browser or staging credentials. That's deliberate: it's the one piece of this plan verifiable by an automated run in this environment.

- [ ] **Step 1: Write the failing tests — `qa/support/reporter/build-report.test.ts`**

```ts
import { test, expect } from '@playwright/test'
import { buildReport } from './build-report'

test.describe('buildReport', () => {
  test('computes a 100 health score when every journey passes', () => {
    const report = buildReport({
      surface: 'console',
      targetUrl: 'https://staging-console.mykka.ai',
      date: '2026-07-31',
      results: [
        { title: 'login', status: 'passed', durationMs: 1200, attachmentPaths: [] },
        { title: 'member invite', status: 'passed', durationMs: 900, attachmentPaths: [] },
      ],
    })

    expect(report).toContain('Health Score: 100/100')
    expect(report).toContain('None — all scripted journeys passed.')
  })

  test('lists each failure as a numbered issue with its error message and evidence', () => {
    const report = buildReport({
      surface: 'console',
      targetUrl: 'https://staging-console.mykka.ai',
      date: '2026-07-31',
      results: [
        { title: 'login', status: 'passed', durationMs: 1200, attachmentPaths: [] },
        {
          title: 'member invite',
          status: 'failed',
          durationMs: 500,
          errorMessage: 'Timed out waiting for locator "button[name=Invite]"',
          attachmentPaths: ['test-results/member-invite/trace.zip'],
        },
      ],
    })

    expect(report).toContain('Health Score: 50/100')
    expect(report).toContain('ISSUE-001: member invite')
    expect(report).toContain('Timed out waiting for locator')
    expect(report).toContain('test-results/member-invite/trace.zip')
  })

  test('reports a zero score with no crash when no journeys ran', () => {
    const report = buildReport({
      surface: 'console',
      targetUrl: 'https://staging-console.mykka.ai',
      date: '2026-07-31',
      results: [],
    })

    expect(report).toContain('Health Score: 0/100')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `qa/`):
```powershell
pnpm exec playwright test --config playwright.config.ts support/reporter/build-report.test.ts
```
Expected: FAIL — `build-report.ts` doesn't exist yet. (This step will actually fail earlier, at config load, since `qa/playwright.config.ts` doesn't exist until Task 4. If run before Task 4 exists, instead run `pnpm exec tsc --noEmit` and confirm it reports "Cannot find module './build-report'" — that's the equivalent "red" signal for this step at this point in the plan.)

- [ ] **Step 3: Write `qa/support/reporter/build-report.ts`**

```ts
export type JourneyStatus = 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted'

export interface JourneyResult {
  title: string
  status: JourneyStatus
  durationMs: number
  errorMessage?: string
  attachmentPaths: string[]
}

export interface BuildReportInput {
  surface: string
  targetUrl: string
  date: string
  results: JourneyResult[]
}

export function buildReport(input: BuildReportInput): string {
  const { surface, targetUrl, date, results } = input
  const total = results.length
  const passed = results.filter((r) => r.status === 'passed').length
  const failures = results.filter((r) => r.status === 'failed' || r.status === 'timedOut')
  const skipped = results.filter((r) => r.status === 'skipped' || r.status === 'interrupted').length
  const functionalScore = total > 0 ? Math.round((passed / total) * 100) : 0

  const lines: string[] = []
  lines.push(`# QA Report: ${surface}`)
  lines.push('')
  lines.push('| Field | Value |')
  lines.push('|-------|-------|')
  lines.push(`| **Date** | ${date} |`)
  lines.push(`| **Surface** | ${surface} |`)
  lines.push(`| **Target URL** | ${targetUrl} |`)
  lines.push('| **Mode** | Scripted journeys |')
  lines.push(`| **Journeys run** | ${total} |`)
  lines.push(`| **Passed** | ${passed} |`)
  lines.push(`| **Failed** | ${failures.length} |`)
  lines.push(`| **Skipped** | ${skipped} |`)
  lines.push('')
  lines.push(`## Health Score: ${functionalScore}/100`)
  lines.push('')
  lines.push('| Category | Score |')
  lines.push('|----------|-------|')
  lines.push(`| Functional | ${functionalScore} |`)
  lines.push('| Console | — (not measured by scripted journeys) |')
  lines.push('| Links | — (not measured by scripted journeys) |')
  lines.push('| Visual | — (not measured by scripted journeys) |')
  lines.push('| UX | — (not measured by scripted journeys) |')
  lines.push('| Performance | — (not measured by scripted journeys) |')
  lines.push('| Accessibility | — (not measured by scripted journeys) |')
  lines.push('')
  lines.push('Run `/qa-only` against the same target URL for exploratory coverage of the unmeasured categories.')
  lines.push('')
  lines.push('## Issues')
  lines.push('')

  if (failures.length === 0) {
    lines.push('None — all scripted journeys passed.')
  } else {
    failures.forEach((r, i) => {
      const n = String(i + 1).padStart(3, '0')
      lines.push(`### ISSUE-${n}: ${r.title}`)
      lines.push('')
      lines.push('| Field | Value |')
      lines.push('|-------|-------|')
      lines.push('| **Severity** | high |')
      lines.push('| **Category** | functional |')
      lines.push(`| **Status** | ${r.status} |`)
      lines.push(`| **Duration** | ${r.durationMs}ms |`)
      lines.push('')
      lines.push(`**Description:** ${r.errorMessage ?? 'Journey failed with no captured error message.'}`)
      lines.push('')
      if (r.attachmentPaths.length > 0) {
        lines.push('**Evidence:**')
        r.attachmentPaths.forEach((p) => lines.push(`- ${p}`))
        lines.push('')
      }
      lines.push('---')
      lines.push('')
    })
  }

  return lines.join('\n')
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `qa/`, once Task 4's config exists):
```powershell
pnpm exec playwright test --config playwright.config.ts support/reporter/build-report.test.ts
```
Expected: 3 passed. Until Task 4 lands, verify instead with:
```powershell
pnpm exec tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add qa/support/reporter/build-report.ts qa/support/reporter/build-report.test.ts
git commit -m "feat(qa): add pure QA-report formatter with unit tests"
```

---

### Task 4: Playwright config wiring (unit project + reporter)

**Files:**
- Create: `qa/support/reporter/qa-report-reporter.ts`
- Create: `qa/playwright.config.ts`

**Interfaces:**
- Consumes: `buildReport`, `JourneyResult` from Task 3's `build-report.ts`; `env` from Task 2's `env.ts`.
- Produces: a working `qa/playwright.config.ts` with a `unit` project (Task 3's tests) already runnable end to end. Task 5 and 6 add the `console-setup` and `console` projects to this same file.

- [ ] **Step 1: Write `qa/support/reporter/qa-report-reporter.ts`**

```ts
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter'
import { mkdirSync, writeFileSync } from 'fs'
import path from 'path'
import { buildReport, JourneyResult } from './build-report'

const OUTPUT_DIR = path.resolve(__dirname, '../../../.gstack/qa-reports')

export default class QaReportReporter implements Reporter {
  private resultsByProject = new Map<string, JourneyResult[]>()
  private urlsByProject = new Map<string, string>()

  onTestEnd(test: TestCase, result: TestResult): void {
    const project = test.parent.project()
    const projectName = project?.name ?? 'unknown'
    // 'unit' is the reporter's own formatter tests, not a QA journey — skip it.
    if (projectName === 'unit' || projectName.endsWith('-setup')) return

    const baseURL = project?.use.baseURL as string | undefined
    if (baseURL) this.urlsByProject.set(projectName, baseURL)

    const list = this.resultsByProject.get(projectName) ?? []
    list.push({
      title: test.parent.title ? `${test.parent.title} > ${test.title}` : test.title,
      status: result.status,
      durationMs: result.duration,
      errorMessage: result.errors[0]?.message,
      attachmentPaths: result.attachments
        .map((a) => a.path)
        .filter((p): p is string => Boolean(p)),
    })
    this.resultsByProject.set(projectName, list)
  }

  onEnd(): void {
    if (this.resultsByProject.size === 0) return
    mkdirSync(OUTPUT_DIR, { recursive: true })
    const date = new Date().toISOString().slice(0, 10)
    for (const [surface, results] of this.resultsByProject) {
      const report = buildReport({
        surface,
        targetUrl: this.urlsByProject.get(surface) ?? 'unknown',
        date,
        results,
      })
      const filePath = path.join(OUTPUT_DIR, `qa-report-${surface}-${date}.md`)
      writeFileSync(filePath, report, 'utf-8')
    }
  }
}
```

- [ ] **Step 2: Write `qa/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test'
import path from 'path'
import { env } from './env'

export default defineConfig({
  timeout: 30_000,
  expect: { timeout: 15_000 },
  retries: env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['./support/reporter/qa-report-reporter.ts'],
  ],
  outputDir: 'test-results',
  projects: [
    // ── Unit project ─────────────────────────────────────────────────────────
    // Pure-function tests for the reporter itself. No browser, no credentials.
    {
      name: 'unit',
      testDir: path.resolve(__dirname, 'support/reporter'),
      testMatch: '**/*.test.ts',
    },
  ],
})
```

- [ ] **Step 3: Run the unit project to verify it passes**

Run (from `qa/`, after `pnpm install` and `pnpm exec playwright install chromium`):
```powershell
pnpm test:qa -- --project=unit
```
Expected: 3 passed, and `.gstack/qa-reports/` is NOT created (the `unit` project is filtered out of `onEnd`'s report loop, and with zero remaining projects in `resultsByProject` the reporter returns early).

- [ ] **Step 4: Commit**

```bash
git add qa/support/reporter/qa-report-reporter.ts qa/playwright.config.ts
git commit -m "feat(qa): wire playwright config with QA-report reporter and unit project"
```

---

### Task 5: Console Clerk auth setup

**Files:**
- Create: `qa/support/auth/console-login.setup.ts`
- Modify: `qa/playwright.config.ts` (add `console-setup` project)

**Interfaces:**
- Consumes: `requireEnv` from `qa/env.ts` (Task 2).
- Produces: `qa/.auth/console.json` (Playwright storageState file, gitignored) — Task 6's `console` project depends on this file existing.

- [ ] **Step 1: Write `qa/support/auth/console-login.setup.ts`**

```ts
import { test as setup, expect } from '@playwright/test'
import { clerkSetup } from '@clerk/testing/playwright'
import path from 'path'
import { requireEnv } from '../../env'

const AUTH_FILE = path.join(__dirname, '../../.auth/console.json')

setup('authenticate to console via Clerk', async ({ page }) => {
  const consoleUrl = requireEnv('QA_CONSOLE_URL')
  const publishableKey = requireEnv('QA_CLERK_PUBLISHABLE_KEY')
  const email = requireEnv('QA_CLERK_USER_EMAIL')
  const password = requireEnv('QA_CLERK_USER_PASSWORD')

  await clerkSetup({ publishableKey })

  await page.goto(consoleUrl + '/login')
  await page.getByRole('button', { name: /sign in/i }).click()

  await page.getByLabel(/email address/i).fill(email)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await page.waitForURL('**/dashboard', { timeout: 15_000 })
  await expect(page).toHaveURL(/dashboard/)

  await page.context().storageState({ path: AUTH_FILE })
})
```

- [ ] **Step 2: Add the `console-setup` project to `qa/playwright.config.ts`**

Add this import to the top of `qa/playwright.config.ts`:
```ts
import { devices } from '@playwright/test'
```
(Change the existing `import { defineConfig } from '@playwright/test'` line to `import { defineConfig, devices } from '@playwright/test'`.)

Add this project object to the `projects` array, after the `unit` project:
```ts
    // ── Console setup (auth state) ──────────────────────────────────────────
    // Signs in through Clerk once and persists storage state so the console
    // project below can reuse the authenticated session.
    {
      name: 'console-setup',
      testDir: path.resolve(__dirname, 'support/auth'),
      testMatch: '**/console-login.setup.ts',
      use: { ...devices['Desktop Chrome'] },
    },
```

- [ ] **Step 3: Verify the file at least type-checks and is discovered**

Run (from `qa/`):
```powershell
pnpm typecheck
pnpm exec playwright test --config playwright.config.ts --project=console-setup --list
```
Expected: `typecheck` reports no errors. `--list` prints the one `authenticate to console via Clerk` test without running it (dry run — no staging credentials required to just list).

Actually running `console-setup` for real requires `qa/.env.qa.staging` filled in with a real staging console URL and Clerk test-account credentials — do that manually once those are available; it's not something this plan can execute without them. See Task 9 for the full manual verification checklist.

- [ ] **Step 4: Commit**

```bash
git add qa/support/auth/console-login.setup.ts qa/playwright.config.ts
git commit -m "feat(qa): add console Clerk auth setup project"
```

---

### Task 6: Console reference journeys

**Files:**
- Create: `qa/journeys/console/login.spec.ts`
- Create: `qa/journeys/console/member-invite.spec.ts`
- Modify: `qa/playwright.config.ts` (add `console` project)

**Interfaces:**
- Consumes: `qa/.auth/console.json` written by Task 5's setup project; `env.QA_CONSOLE_URL` as the project `baseURL`.
- Produces: nothing consumed by a later task in this plan — these are the leaf deliverable proving the pipeline end to end.

Both journeys are intentionally non-destructive: `login` only reads the dashboard, and `member-invite` generates an *open* invite link (no email), which the existing `pretzel-console/e2e/members.spec.ts` suite already establishes creates no member row until accepted — nothing to clean up.

- [ ] **Step 1: Write `qa/journeys/console/login.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Console smoke', () => {
  test('an authenticated admin can reach the dashboard with no console errors', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/dashboard/)
    await expect(page.getByRole('heading')).toBeVisible()

    expect(errors, `console.error() calls on load: ${errors.join('; ')}`).toEqual([])
  })
})
```

- [ ] **Step 2: Write `qa/journeys/console/member-invite.spec.ts`**

```ts
import { test, expect } from '@playwright/test'

test.describe('Members', () => {
  test('admin can generate an open invite link', async ({ page }) => {
    await page.goto('/members')

    await page.getByRole('button', { name: /invite member/i }).click()
    await page.locator('form').getByRole('button', { name: /generate link/i }).click()

    await expect(page.getByRole('button', { name: /copy link/i })).toBeVisible({ timeout: 15_000 })
    const urlInput = page.locator('input[readonly]')
    await expect(urlInput).toHaveValue(/\/invite\/[a-f0-9]{64}/)
    // An unaccepted open invite creates no member row — nothing to clean up.
  })
})
```

- [ ] **Step 3: Add the `console` project to `qa/playwright.config.ts`**

Add this project object to the `projects` array, after `console-setup`:
```ts
    // ── Console journeys ─────────────────────────────────────────────────────
    // Specs live in journeys/console/. Depends on console-setup for the
    // authenticated storage state.
    {
      name: 'console',
      dependencies: ['console-setup'],
      use: {
        ...devices['Desktop Chrome'],
        baseURL: env.QA_CONSOLE_URL,
        storageState: path.resolve(__dirname, '.auth/console.json'),
      },
      testDir: path.resolve(__dirname, 'journeys/console'),
      testMatch: '**/*.spec.ts',
    },
```

- [ ] **Step 4: Verify the specs type-check and are discovered**

Run (from `qa/`):
```powershell
pnpm typecheck
pnpm exec playwright test --config playwright.config.ts --project=console --list
```
Expected: `typecheck` reports no errors. `--list` prints both journey titles without running them.

Running `console` for real needs a filled-in `qa/.env.qa.staging` and a completed `console-setup` run — see Task 9.

- [ ] **Step 5: Commit**

```bash
git add qa/journeys/console/login.spec.ts qa/journeys/console/member-invite.spec.ts qa/playwright.config.ts
git commit -m "feat(qa): add console reference journeys (login smoke, member invite)"
```

---

### Task 7: `qa/README.md`

**Files:**
- Create: `qa/README.md`

**Interfaces:**
- Consumes: nothing (documentation only).

- [ ] **Step 1: Write `qa/README.md`**

```markdown
# Manual QA Suite

Scripted Playwright journeys that simulate a human QA hire exercising the
real, deployed product — not the `e2e/` suite's job. See
[`docs/superpowers/specs/2026-07-31-manual-qa-suite-design.md`](../docs/superpowers/specs/2026-07-31-manual-qa-suite-design.md)
for the full design and how this relates to `e2e/` and to gstack's `/qa` /
`/qa-only` skills.

## Current coverage

| Surface | Status |
|---|---|
| `pretzel-console` | Implemented — `journeys/console/` |
| `mykka-web` | Not yet implemented |
| `pretzel` (extension) | Not yet implemented |
| `pretzel-desktop` | Not yet implemented |
| backend API (direct) | Not yet implemented |

## What this is not

- Not a replacement for `e2e/`. `e2e/` truncates and reseeds a disposable
  database and runs against local dev servers as a pre-merge developer gate.
  This suite runs against a real deployed URL you supply, never touches a
  database directly, and is meant for pre-promotion / release-readiness
  checks.
- Not an exploratory bug-hunting agent. For that, use gstack's `/qa-only
  <url>` (report only) or `/qa <url>` (finds and fixes bugs) — both already
  installed globally and write to the same `.gstack/qa-reports/` directory
  this suite's reporter writes to.

## Setup

1. `cd qa; pnpm install; pnpm exec playwright install chromium`
2. Copy `.env.qa.example` to `.env.qa.staging` and fill in real values —
   a real staging console URL and a dedicated QA Clerk test account (ask
   whoever owns the staging Clerk instance; don't reuse a customer account
   or the seeded `e2e/.env.e2e` Clerk user).

## Run

```powershell
# Everything (auth setup, then all journeys)
pnpm test:qa

# Just the console surface
pnpm test:qa -- --project=console

# Reporter unit tests only — no staging credentials needed
pnpm test:qa -- --project=unit

# Prod smoke subset, once you have a .env.qa.prod
$env:QA_ENV_FILE = ".env.qa.prod"
pnpm test:qa
```

Reports land in `.gstack/qa-reports/qa-report-<surface>-<date>.md` — one
report per surface per run, same format whether the findings came from a
scripted journey here or an exploratory `/qa-only` run.

## Full pre-release QA cycle

1. `pnpm test:qa` against staging — fast regression baseline.
2. `/qa-only <staging-console-url>` (and other surfaces as they're added)
   for exploratory bug-hunting.
3. Promote any confirmed bug worth guarding permanently into a new spec
   under `qa/journeys/<surface>/`.
4. Re-run before promoting `staging` → `master`.

## Adding a journey

Each spec under `journeys/<surface>/` is one real, end-to-end business flow
— not an isolated click. It must create and clean up any data it needs
itself; this runs against shared staging state, not a disposable database.
Prefer read-only or self-cancelling actions (like the open-invite journey)
over anything that leaves lasting state when a full cleanup step isn't
practical.

## Known maintenance cost: extension auth (once extension coverage lands)

The extension surface (not yet implemented) will need a persistent,
manually-authenticated Chrome profile for real ChatGPT/Claude/Gemini
sessions, since automating login to those sites is fragile and risks their
terms of service. That profile needs periodic manual re-authentication —
there is no automated fix for this, it's a standing cost of testing against
real third-party sites.
```

- [ ] **Step 2: Commit**

```bash
git add qa/README.md
git commit -m "docs(qa): add qa/ README"
```

---

### Task 8: Repository-wide doc updates

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/reference/repository-topology.md`
- Modify: `docs/reference/commands.md`
- Modify: `docs/index.md`
- Modify: `docs/operations/testing.md`

**Interfaces:**
- Consumes: nothing new — records the `qa/` package created in Tasks 1–7 in the docs that already enumerate packages and commands.

- [ ] **Step 1: Update `AGENTS.md` Repository Shape**

In the "Repository Shape" section, change:
```
The repository has five independently installed pnpm projects: `backend`, `pretzel`, `pretzel-console`, `mykka-web`, and `e2e`. There is no `pnpm-workspace.yaml`.
```
to:
```
The repository has six independently installed pnpm projects: `backend`, `pretzel`, `pretzel-console`, `mykka-web`, `e2e`, and `qa`. There is no `pnpm-workspace.yaml`.
```

Add a new bullet under "Regression Rules":
```
- Pre-release / release-readiness checks: run `qa/` scripted journeys against staging (`cd qa; pnpm test:qa`), plus gstack `/qa-only` for exploratory coverage. See `qa/README.md`.
```

- [ ] **Step 2: Update `docs/reference/repository-topology.md`**

Add a row to the table, after the `e2e/` row:
```
| `qa/` | Playwright | `playwright.config.ts` | QA |
```

Add `qa/package.json` to the frontmatter `sources:` list.

- [ ] **Step 3: Update `docs/reference/commands.md`**

Add rows to the table, after the `E2E project` row:
```
| Manual QA suite (staging) | `cd qa; $env:QA_ENV_FILE=".env.qa.staging"; pnpm test:qa` |
| Manual QA project | `cd qa; pnpm test:qa -- --project=console` |
```

Add `qa/package.json` to the frontmatter `sources:` list.

- [ ] **Step 4: Update `docs/index.md`**

Under "## Packages", add after the "Cross-package E2E" line:
```
- [Manual QA suite](../qa/README.md)
```

- [ ] **Step 5: Update `docs/operations/testing.md`**

Add a new section after "## Unified E2E Projects":
```markdown
## Manual QA Suite

`qa/` runs scripted journeys against a real deployed environment (staging or
a prod smoke subset) that you point it at — never a local dev server, never
a database this suite can truncate. It's the pre-release, human-simulation
counterpart to `e2e/`'s pre-merge developer gate. See
[`qa/README.md`](../../qa/README.md) for setup and the full pre-release QA
cycle, including the hand-off to gstack's `/qa-only` for exploratory
coverage.
```

Add `qa/README.md` to the frontmatter `sources:` list.

- [ ] **Step 6: Validate docs**

Run (from repo root):
```powershell
pnpm docs:check
```
Expected: passes. Fix any link/reference issues it reports before continuing.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md docs/reference/repository-topology.md docs/reference/commands.md docs/index.md docs/operations/testing.md
git commit -m "docs: record qa/ package across repository documentation"
```

---

### Task 9: Final verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Install and verify the unit project runs for real**

```powershell
cd qa
pnpm install
pnpm exec playwright install chromium
pnpm typecheck
pnpm test:qa -- --project=unit
```
Expected: `typecheck` clean, 3 unit tests pass, no `.gstack/qa-reports/` files written (unit results are excluded from reporting — see Task 4, Step 1).

- [ ] **Step 2: Dry-run every project to catch config/import errors without needing staging credentials**

```powershell
pnpm exec playwright test --config playwright.config.ts --list
```
Expected: lists tests from all four projects (`unit`, `console-setup`, `console` x2 journeys) with no errors. This is the furthest this plan can verify the console projects without real staging credentials.

- [ ] **Step 3: Manual verification checklist (requires real staging credentials — hand off to the user)**

This step cannot be completed by an agent without staging access. Once `qa/.env.qa.staging` is filled in with a real console URL and a dedicated QA Clerk test account:

```powershell
cd qa
$env:QA_ENV_FILE = ".env.qa.staging"
pnpm test:qa -- --project=console-setup
pnpm test:qa -- --project=console
```

Expected: `console-setup` signs in and writes `qa/.auth/console.json`; `console` runs both journeys and passes; `.gstack/qa-reports/qa-report-console-<today>.md` is written with a 100/100 functional score on a healthy staging deploy. No report file is written for `console-setup` itself — the reporter skips any project named `*-setup` (Task 4, Step 1).

- [ ] **Step 4: Report status to the user**

Summarize: unit tests passing, all projects dry-run clean, and that live console verification is pending real staging credentials (not something this plan can supply). Point to `qa/README.md` for the setup steps needed to complete Step 3.
