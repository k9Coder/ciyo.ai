# ciyo Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the product from SafeInput → ciyo across the browser extension, admin console, and all string references, replacing the input-field logo with the new bracket mark.

**Architecture:** Logo geometry changes in SVG files and inline React SVG components; wordmark split changes from `safe`/`input` to `c`/`i`/`yo`; all "SafeInput"/"safeinput" strings replaced with "ciyo"/"ciyo" throughout. No color token changes — cyan `#00d4ff` stays. Storage keys prefixed with `promptshield_` are intentionally preserved to avoid wiping existing user data.

**Tech Stack:** React, TypeScript, Vite, Chrome Extension MV3, Vitest

---

## File Map

| Action | File |
|---|---|
| Modify | `public/logo-icon.svg` |
| Modify | `public/logo-dark.svg` |
| Modify | `public/logo-light.svg` |
| Modify | `src/popup/Popup.tsx` |
| Modify | `admin/src/components/layout/AppLayout.tsx` |
| Modify | `src/shared/constants.ts` |
| Modify | `src/shared/logger.ts` |
| Modify | `src/content/content-script.ts` |
| Modify | `src/content/overlay/overlay-root.tsx` |
| Modify | `src/background/service-worker.ts` |
| Modify | `src/options/index.html` |
| Modify | `src/popup/index.html` |
| Modify | `src/options/pages/AboutPage.tsx` |
| Modify | `src/options/pages/AuditPage.tsx` |
| Modify | `admin/src/pages/LoginPage.tsx` |
| Modify | `admin/src/pages/OnboardingPage.tsx` |
| Modify | `admin/src/utils/theme.ts` |
| Modify | `admin/tests/theme.test.ts` |
| Modify | `managed_schema.json` |
| Modify | `manifest.config.ts` |
| Modify | `package.json` |
| Modify | `backend/package.json` |
| Modify | `admin/package.json` |
| Modify | `admin/index.html` |
| Modify | `README.md` |
| Modify | `backend/src/billing/email.ts` |
| Modify | `tests/e2e/flow.spec.ts` |

---

## Task 1: SVG Logo Assets

**Files:**
- Modify: `public/logo-icon.svg`
- Modify: `public/logo-dark.svg`
- Modify: `public/logo-light.svg`

- [ ] **Step 1: Replace `public/logo-icon.svg`** with bracket mark (uses CSS variables for theming)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" fill="none">
  <rect width="56" height="56" rx="14"
        fill="var(--bg-surface, #0d1525)"/>
  <path d="M20 14 L14 14 L14 42 L20 42"
        stroke="var(--brand-primary, #00d4ff)" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="34" cy="28" r="5"
          fill="var(--brand-primary, #00d4ff)"/>
  <path d="M30 18 L38 18 L38 24"
        stroke="var(--brand-primary, #00d4ff)" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
</svg>
```

- [ ] **Step 2: Replace `public/logo-dark.svg`** — full lockup for dark backgrounds

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 48" fill="none">
  <rect x="4" y="4" width="40" height="40" rx="10" fill="#0d1525"/>
  <path d="M18 10 L12 10 L12 38 L18 38"
        stroke="#00d4ff" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="30" cy="24" r="4" fill="#00d4ff"/>
  <path d="M26 14 L34 14 L34 20"
        stroke="#00d4ff" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <text x="56" y="31"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5"
        fill="#ffffff">c</text>
  <text x="68" y="31"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5"
        fill="#00d4ff">i</text>
  <text x="76" y="31"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5"
        fill="#ffffff">yo</text>
</svg>
```

- [ ] **Step 3: Replace `public/logo-light.svg`** — same structure, light palette

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 48" fill="none">
  <rect x="4" y="4" width="40" height="40" rx="10" fill="#f0f4f8"/>
  <path d="M18 10 L12 10 L12 38 L18 38"
        stroke="#0077aa" stroke-width="2.5"
        stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="30" cy="24" r="4" fill="#0077aa"/>
  <path d="M26 14 L34 14 L34 20"
        stroke="#0077aa" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  <text x="56" y="31"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5"
        fill="#0a0e1a">c</text>
  <text x="68" y="31"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5"
        fill="#0077aa">i</text>
  <text x="76" y="31"
        font-family="'Segoe UI',system-ui,sans-serif"
        font-size="20" font-weight="700" letter-spacing="-0.5"
        fill="#0a0e1a">yo</text>
</svg>
```

- [ ] **Step 4: Commit**

```bash
git add public/logo-icon.svg public/logo-dark.svg public/logo-light.svg
git commit -m "feat(brand): replace logo assets with ciyo bracket mark"
```

---

## Task 2: Extension Popup — Logo + Wordmark

**Files:**
- Modify: `src/popup/Popup.tsx`

- [ ] **Step 1: Replace the `LogoIcon` component** (lines 8–31 in current file) with the bracket mark

```tsx
function LogoIcon({ danger = false, size = 24 }: { danger?: boolean; size?: number }) {
  const color = danger ? "var(--status-danger)" : "var(--brand-primary)";
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <rect width="56" height="56" rx="14" fill="var(--bg-surface)"/>
      <path d="M20 14 L14 14 L14 42 L20 42"
            stroke={color} strokeWidth="3"
            strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="34" cy="28" r="5" fill={color}/>
      <path d="M30 18 L38 18 L38 24"
            stroke={color} strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
    </svg>
  );
}
```

- [ ] **Step 2: Replace the `Wordmark` component** (lines 33–41 in current file)

```tsx
function Wordmark({ danger = false }: { danger?: boolean }) {
  const accent = danger ? "var(--status-danger)" : "var(--brand-primary)";
  return (
    <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.5px" }}>
      <span style={{ color: "var(--text-primary)" }}>c</span>
      <span style={{ color: accent }}>i</span>
      <span style={{ color: "var(--text-primary)" }}>yo</span>
    </span>
  );
}
```

- [ ] **Step 3: Update the fallback org name in `SignedInView` footer** — find `?? "SafeInput"` (line 244) and change to `?? "ciyo"`

- [ ] **Step 4: Commit**

```bash
git add src/popup/Popup.tsx
git commit -m "feat(brand): update extension popup to ciyo bracket mark + wordmark"
```

---

## Task 3: Admin Sidebar — Logo + Wordmark

**Files:**
- Modify: `admin/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Replace the inline SVG in the sidebar logo section** (lines 49–58 in current file)

Find this block:
```tsx
<svg width="22" height="22" viewBox="0 0 80 80" fill="none">
  <rect x="8" y="24" width="64" height="32" rx="10"
        fill="var(--bg-base)" stroke="var(--brand-primary)" strokeWidth="2.5"/>
  <rect x="17" y="36" width="22" height="2" rx="1"
        fill="var(--brand-primary)" opacity="0.5"/>
  <circle cx="60" cy="40" r="10" fill="var(--brand-primary)" opacity="0.12"/>
  <circle cx="60" cy="40" r="10" stroke="var(--brand-primary)" strokeWidth="2"/>
  <path d="M56 40L59 43L65 37" stroke="var(--brand-primary)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"/>
</svg>
```

Replace with:
```tsx
<svg width="22" height="22" viewBox="0 0 56 56" fill="none">
  <rect width="56" height="56" rx="14" fill="var(--bg-base)"/>
  <path d="M20 14 L14 14 L14 42 L20 42"
        stroke="var(--brand-primary)" strokeWidth="3"
        strokeLinecap="round" strokeLinejoin="round"/>
  <circle cx="34" cy="28" r="5" fill="var(--brand-primary)"/>
  <path d="M30 18 L38 18 L38 24"
        stroke="var(--brand-primary)" strokeWidth="2.5"
        strokeLinecap="round" strokeLinejoin="round" opacity="0.5"/>
</svg>
```

- [ ] **Step 2: Replace the wordmark span** (lines 59–62 in current file)

Find:
```tsx
<span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.5px' }}>
  <span style={{ color: 'var(--text-primary)' }}>safe</span>
  <span style={{ color: 'var(--brand-primary)' }}>input</span>
</span>
```

Replace with:
```tsx
<span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.5px' }}>
  <span style={{ color: 'var(--text-primary)' }}>c</span>
  <span style={{ color: 'var(--brand-primary)' }}>i</span>
  <span style={{ color: 'var(--text-primary)' }}>yo</span>
</span>
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/layout/AppLayout.tsx
git commit -m "feat(brand): update admin sidebar to ciyo bracket mark + wordmark"
```

---

## Task 4: Source String Replacements

**Files:**
- Modify: `src/shared/constants.ts`
- Modify: `src/shared/logger.ts`
- Modify: `src/content/content-script.ts`
- Modify: `src/content/overlay/overlay-root.tsx`
- Modify: `src/background/service-worker.ts`
- Modify: `src/options/index.html`
- Modify: `src/popup/index.html`
- Modify: `src/options/pages/AboutPage.tsx`
- Modify: `src/options/pages/AuditPage.tsx`
- Modify: `admin/src/pages/LoginPage.tsx`
- Modify: `admin/src/pages/OnboardingPage.tsx`
- Modify: `managed_schema.json`

- [ ] **Step 1: Update `src/shared/constants.ts`** — replace the entire file

```ts
export const EXTENSION_NAME = "ciyo";
export const EXTENSION_VERSION = "2.0.0";

/** Backend API */
export const API_BASE = import.meta.env.VITE_API_BASE as string | undefined ?? "https://api.ciyo.ai";
export const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string;

/**
 * Chrome storage keys — intentionally kept with promptshield_ prefix
 * to preserve existing users' stored policies and audit history on upgrade.
 */
export const STORAGE_POLICY_KEY = "promptshield_policy";
export const STORAGE_SITE_OVERRIDES_KEY = "promptshield_site_overrides";

/** IndexedDB — kept as-is to preserve existing audit history on upgrades */
export const AUDIT_DB_NAME = "promptshield_audit";
export const AUDIT_DB_VERSION = 1;
export const AUDIT_STORE_NAME = "events";

/** Sentinel attribute set on programmatically re-fired events to avoid recursion */
export const SEND_SENTINEL_ATTR = "data-ciyo-approved";

/** Snippet context window (chars either side of a match) */
export const SNIPPET_CONTEXT_CHARS = 20;
```

- [ ] **Step 2: Update `src/shared/logger.ts` line 4** — change prefix

Find: `const prefix = "[SafeInput]";`
Replace: `const prefix = "[ciyo]";`

- [ ] **Step 3: Update `src/content/content-script.ts`** — update two log strings

Find: `logger.error("SafeInput bootstrap failed:", err);`
Replace: `logger.error("ciyo bootstrap failed:", err);`

Find: `logger.info("SafeInput active on", adapter.name);`
Replace: `logger.info("ciyo active on", adapter.name);`

- [ ] **Step 4: Update `src/content/overlay/overlay-root.tsx` line 19**

Find: `shadowHost.id = "safeinput-overlay-host";`
Replace: `shadowHost.id = "ciyo-overlay-host";`

- [ ] **Step 5: Update `src/background/service-worker.ts` line 13**

Find: `logger.info("SafeInput installed. Reason:", reason);`
Replace: `logger.info("ciyo installed. Reason:", reason);`

- [ ] **Step 6: Update `src/options/index.html` line 6**

Find: `<title>SafeInput Settings</title>`
Replace: `<title>ciyo Settings</title>`

- [ ] **Step 7: Update `src/popup/index.html` line 6**

Find: `<title>SafeInput</title>`
Replace: `<title>ciyo</title>`

- [ ] **Step 8: Replace `src/options/pages/AboutPage.tsx`** — update all brand text

```tsx
import { EXTENSION_NAME, EXTENSION_VERSION } from "@/shared/constants";

export function AboutPage() {
  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">About {EXTENSION_NAME}</h2>
        <p className="text-sm text-gray-500 mt-1">Version {EXTENSION_VERSION}</p>
      </div>

      <div className="prose prose-sm text-gray-700 space-y-4">
        <p>
          ciyo is a browser extension that inspects your prompts before they are sent
          to LLM chat interfaces. It detects credentials, PII, and other sensitive content
          using a configurable policy, then warns you before anything leaves your browser.
        </p>
        <p>
          All detection and storage happens locally — no data is ever sent to a backend.
        </p>
      </div>

      <div className="space-y-2 text-sm">
        <a
          href="https://github.com/your-org/ciyo"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-blue-600 hover:underline"
        >
          Documentation &amp; source code
        </a>
        <a
          href="mailto:support@ciyo.ai"
          className="flex items-center gap-2 text-blue-600 hover:underline"
        >
          support@ciyo.ai
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Update `src/options/pages/AuditPage.tsx` line 56**

Find: `a.download = \`safeinput-audit-${new Date().toISOString().slice(0, 10)}.csv\`;`
Replace: `a.download = \`ciyo-audit-${new Date().toISOString().slice(0, 10)}.csv\`;`

- [ ] **Step 10: Update `admin/src/pages/LoginPage.tsx` line 21**

Find: `<h1 className="text-xl font-semibold text-gray-900">SafeInput Admin</h1>`
Replace: `<h1 className="text-xl font-semibold text-gray-900">ciyo Admin</h1>`

- [ ] **Step 11: Update `admin/src/pages/OnboardingPage.tsx` line 54**

Find: `<h1 className="text-xl font-semibold text-gray-900">SafeInput Admin</h1>`
Replace: `<h1 className="text-xl font-semibold text-gray-900">ciyo Admin</h1>`

- [ ] **Step 12: Update `managed_schema.json`**

Find: `"title": "SafeInput Policy"`
Replace: `"title": "ciyo Policy"`

- [ ] **Step 13: Commit**

```bash
git add src/shared/constants.ts src/shared/logger.ts \
        src/content/content-script.ts src/content/overlay/overlay-root.tsx \
        src/background/service-worker.ts \
        src/options/index.html src/popup/index.html \
        src/options/pages/AboutPage.tsx src/options/pages/AuditPage.tsx \
        admin/src/pages/LoginPage.tsx admin/src/pages/OnboardingPage.tsx \
        managed_schema.json
git commit -m "feat(brand): rename SafeInput → ciyo in source strings"
```

---

## Task 5: Theme Key + Test Update

**Files:**
- Modify: `admin/src/utils/theme.ts`
- Modify: `admin/tests/theme.test.ts`

- [ ] **Step 1: Update storage key in `admin/src/utils/theme.ts`**

Find: `const STORAGE_KEY = 'safeinput-theme'`
Replace: `const STORAGE_KEY = 'ciyo-theme'`

- [ ] **Step 2: Update assertions in `admin/tests/theme.test.ts`** — 3 occurrences

Find: `localStorage.getItem('safeinput-theme')` (line 17)
Replace: `localStorage.getItem('ciyo-theme')`

Find: `localStorage.getItem('safeinput-theme')` (line 24)
Replace: `localStorage.getItem('ciyo-theme')`

Find: `localStorage.setItem('safeinput-theme', 'light')` (line 28)
Replace: `localStorage.setItem('ciyo-theme', 'light')`

- [ ] **Step 3: Run admin tests to verify they pass**

```bash
cd admin && pnpm test
```

Expected: all tests pass (theme tests reference `ciyo-theme` and match the implementation).

- [ ] **Step 4: Commit**

```bash
cd ..
git add admin/src/utils/theme.ts admin/tests/theme.test.ts
git commit -m "feat(brand): rename theme storage key safeinput-theme → ciyo-theme"
```

---

## Task 6: Config + Backend String Replacements

**Files:**
- Modify: `manifest.config.ts`
- Modify: `package.json`
- Modify: `backend/package.json`
- Modify: `admin/package.json`
- Modify: `admin/index.html`
- Modify: `README.md`
- Modify: `backend/src/billing/email.ts`
- Modify: `tests/e2e/flow.spec.ts`

- [ ] **Step 1: Update `manifest.config.ts`**

Find: `name: "SafeInput",`
Replace: `name: "ciyo",`

- [ ] **Step 2: Update `package.json` (root)**

Find: `"name": "safeinput",`
Replace: `"name": "ciyo",`

- [ ] **Step 3: Update `backend/package.json`**

Find: `"name": "safeinput-backend",`
Replace: `"name": "ciyo-backend",`

- [ ] **Step 4: Update `admin/package.json`**

Find: `"name": "safeinput-admin",`
Replace: `"name": "ciyo-admin",`

- [ ] **Step 5: Update `admin/index.html`**

Find: `<title>SafeInput Admin</title>`
Replace: `<title>ciyo Admin</title>`

- [ ] **Step 6: Update `README.md`** — replace the entire file

```markdown
# ciyo

AI prompt protection — detects secrets and PII before they leave your browser. ciyo is a browser-based DLP (Data Loss Prevention) tool for LLM chat interfaces. It inspects prompts before they are sent, warns on sensitive data, and gives admins full visibility via the ciyo Admin Console.

## Supported Sites

- ChatGPT (chatgpt.com, chat.openai.com)
- Claude (claude.ai) — adapter stub, selectors require verification
- Gemini (gemini.google.com) — adapter stub, selectors require verification

## What It Detects

- API keys: OpenAI, Anthropic, AWS, GitHub, Slack, Google
- Credentials: PEM private keys, SSH private keys, JWTs, .env assignments
- PII: Credit card numbers (Luhn-validated), US SSNs
- Network: RFC 1918 internal IP addresses
- Entropy: Long high-entropy tokens (configurable threshold)
- Dictionary: Custom terms and fuzzy variants (configurable)

---

## Quick Start (Development)

### Prerequisites

- Node.js ≥ 18
- pnpm ≥ 9

```bash
pnpm install
pnpm dev
```

Then load the extension in Chrome:
1. Go to `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` directory

### Production Build

```bash
pnpm build
```

The extension is packaged to `dist/`. Load unpacked as above.

---

## Running Tests

```bash
# Unit tests (Vitest)
pnpm test

# E2E tests (Playwright) — requires a production build first
pnpm build && pnpm test:e2e
```

---

## Policy Format

The detection policy is a JSON document validated with Zod. You can import/export it from the Options page.

See [docs/policy-format.md](docs/policy-format.md) for the full schema reference.

Example enterprise policy: [`src/policy/examples/enterprise.json`](src/policy/examples/enterprise.json)

### Minimal custom rule example

```json
{
  "version": 1,
  "baseline": [],
  "custom": [
    {
      "id": "my-codename",
      "name": "Project Codename",
      "description": "Prevent leaking internal project name",
      "severity": "high",
      "action": "require_confirmation",
      "enabled": true,
      "tags": ["confidential"],
      "kind": "dictionary",
      "terms": ["ProjectX", "project-x"],
      "caseSensitive": false
    }
  ],
  "perSite": {
    "chatgpt.com": { "enabled": true }
  },
  "allowSendAnywayWithReason": true,
  "auditRetentionDays": 30
}
```

---

## Architecture

See [docs/architecture.md](docs/architecture.md).

## Adding a New Site Adapter

See [docs/adding-a-site-adapter.md](docs/adding-a-site-adapter.md).
```

- [ ] **Step 7: Update `backend/src/billing/email.ts`** — replace brand strings

Find: `process.env.SMTP_FROM ?? 'noreply@safeinput.ai'`
Replace: `process.env.SMTP_FROM ?? 'noreply@ciyo.ai'`

Find: `` subject: `Welcome to SafeInput — ${input.tenantName}`, ``
Replace: `` subject: `Welcome to ciyo — ${input.tenantName}`, ``

Find: `` `Welcome to SafeInput, ${input.tenantName}!`, ``
Replace: `` `Welcome to ciyo, ${input.tenantName}!`, ``

- [ ] **Step 8: Update `tests/e2e/flow.spec.ts` line 20**

Find: `test.describe("SafeInput E2E", () => {`
Replace: `test.describe("ciyo E2E", () => {`

- [ ] **Step 9: Commit**

```bash
git add manifest.config.ts package.json backend/package.json admin/package.json \
        admin/index.html README.md backend/src/billing/email.ts \
        tests/e2e/flow.spec.ts
git commit -m "feat(brand): rename SafeInput → ciyo in config, backend, and docs"
```

---

## Task 7: Grep Pass + Build Verification

- [ ] **Step 1: Run straggler grep** — should return nothing (except intentional `promptshield_` keys)

```bash
grep -rn "SafeInput\|safeinput\|safe-input\|safe_input" \
  --include="*.ts" --include="*.tsx" --include="*.html" \
  --include="*.json" --include="*.md" --include="*.svg" \
  --exclude-dir=node_modules --exclude-dir=dist \
  --exclude-dir=.superpowers \
  .
```

Expected: only the `docs/superpowers/specs/2026-05-20-safeinput-rebrand-design.md` and `docs/superpowers/plans/2026-05-20-safeinput-rebrand.md` historical docs (those are fine — don't touch them). Fix any other hits.

- [ ] **Step 2: Run extension unit tests**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 3: Build the extension**

```bash
pnpm build
```

Expected: no TypeScript errors, `dist/` updated.

- [ ] **Step 4: Run admin tests**

```bash
cd admin && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Build the admin**

```bash
pnpm build
```

Expected: no TypeScript errors, `admin/dist/` updated.

- [ ] **Step 6: Load extension and smoke test**

1. Go to `chrome://extensions`, enable Developer Mode, click "Load unpacked", select `dist/`
2. Click the ciyo extension icon — verify dark popup with bracket mark, wordmark reads `c`(white)`i`(cyan)`yo`(white)
3. Open Options page — verify title says "ciyo Settings", about page says "ciyo"
4. Toggle theme — verify light mode works

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(brand): ciyo rebrand complete"
```
