# Pretzel Rebranding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every user-visible and developer-visible reference from "ciyo" (as a product name) to "Pretzel" and "Pretzel Console" — across the Chrome extension, the admin web app, and the backend — while keeping `ciyo.ai` as the company/domain brand.

**Architecture:** This is a search-and-replace + asset-replacement task across three packages (root extension, `admin/`, `backend/`). No schema migrations needed — the token prefixes (`ps_live`, `ps_adm`) stay unchanged to avoid breaking existing deployments. One task per logical surface area, with a verification run at the end.

**Tech Stack:** TypeScript, React, CSS keyframes, Chrome Manifest V3, Fastify.

**Naming convention to apply:**
- Chrome extension → **Pretzel** (manifest name, store listing)
- Admin web app → **Pretzel Console** (page title, sidebar logo, login screens)
- AI assistant in sidebar → **Pretzel AI**
- Company domain → **ciyo.ai** (unchanged — this is the company, not the product)
- Backend package name → `pretzel-api`
- Email sender name → keep `noreply@ciyo.ai` domain; update subject/body copy

---

## File Map — What Changes

| File | What changes |
|---|---|
| `manifest.config.ts` | `name: "ciyo"` → `"Pretzel"`, description update |
| `package.json` (root) | `name: "ciyo"` → `"pretzel-extension"` |
| `admin/index.html` | `<title>ciyo Admin</title>` → `<title>Pretzel Console</title>` |
| `admin/package.json` | `name: "ciyo-admin"` → `"pretzel-console"` |
| `admin/src/components/layout/AppLayout.tsx` | Wordmark "ciyo" → "Pretzel" text + new logo SVG |
| `admin/src/pages/LoginPage.tsx` | `"ciyo Admin"` → `"Pretzel Console"` |
| `admin/src/pages/OnboardingPage.tsx` | `"ciyo Admin"` → `"Pretzel Console"` |
| `admin/src/components/assistant/ChatPane.tsx` | `"ciyo policy manager"` → `"Pretzel AI"` + CSS anim rename |
| `admin/src/components/assistant/MessageBubble.tsx` | CSS animation name `ciyo-msg-in` → `pretzel-msg-in` |
| `admin/src/components/ui/Spinner.tsx` | CSS class names `ciyo-spin`, `ciyo-label` → `pretzel-*` |
| `admin/src/index.css` | All `@keyframes ciyo-*` and `.ciyo-*` → `pretzel-*` |
| `admin/src/utils/theme.ts` | `'ciyo-theme'` storage key → `'pretzel-theme'` |
| `backend/package.json` | `name: "ciyo-backend"` → `"pretzel-api"` |
| `backend/src/assistant/prompt.ts` | System prompt copy: "ciyo" → "Pretzel" / "Pretzel Console" |
| `backend/src/billing/email.ts` | Email subject + body copy: "ciyo" → "Pretzel" |
| `public/icons/` | Replace PNG icons with Pretzel-branded versions (see Task 1) |

---

## Task 1: Logo & Icon Assets

**Files:**
- Replace: `public/icons/icon16.png`
- Replace: `public/icons/icon32.png`
- Replace: `public/icons/icon48.png`
- Replace: `public/icons/icon128.png`
- Add: `admin/src/components/layout/PretzelLogo.tsx` (inline SVG logo component)

- [ ] **Step 1: Design the Pretzel logo**

Use one of these options (in order of effort):

**Option A — AI-generated (fastest):**
Generate a minimalist pretzel SVG using ChatGPT/Claude:
> "Create a minimal geometric pretzel logo SVG in a single color. Clean, modern, suitable for a browser extension icon at 16px–128px. Output SVG code only."

**Option B — Figma (most control):**
Draw a pretzel shape: two interlocking loops forming a pretzel. Use `#7c6aff` (brand purple) on a dark `#0f0f13` background for the extension icon.

**Option C — placeholder for now:**
Export a 🥨 emoji at each required size using a tool like [favicon.io](https://favicon.io/emoji-favicons/) — pick "pretzel" emoji → download. Replace with proper logo later.

- [ ] **Step 2: Export PNG icons at required sizes**

Required files — must exist at these exact paths before the extension builds:
```
public/icons/icon16.png   — 16×16px
public/icons/icon32.png   — 32×32px
public/icons/icon48.png   — 48×48px
public/icons/icon128.png  — 128×128px
```

Test icons render correctly: run `npm run build` and verify the packed extension shows the Pretzel icon in Chrome's extension toolbar.

- [ ] **Step 3: Write `admin/src/components/layout/PretzelLogo.tsx`**

This inline SVG logo replaces the hand-coded `<svg>` + character-split wordmark currently in `AppLayout.tsx`:

```tsx
export function PretzelLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" aria-label="Pretzel logo">
      <rect width="56" height="56" rx="14" fill="var(--bg-base)" />
      {/* Pretzel shape: two outer loops + bottom knot */}
      {/* Outer left loop */}
      <path d="M20 16 C14 16, 10 20, 10 26 C10 32, 14 36, 20 36"
            stroke="var(--brand-primary)" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
      {/* Outer right loop */}
      <path d="M36 16 C42 16, 46 20, 46 26 C46 32, 42 36, 36 36"
            stroke="var(--brand-primary)" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
      {/* Center cross */}
      <path d="M20 16 C24 10, 32 10, 36 16 M20 36 C24 42, 32 42, 36 36"
            stroke="var(--brand-primary)" strokeWidth="3.5"
            strokeLinecap="round" fill="none" />
      {/* Cross-over */}
      <path d="M22 28 L34 28 M28 22 L28 34"
            stroke="var(--brand-primary)" strokeWidth="2.5"
            strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}
```

> Note: this is a geometric approximation. Replace with the final logo SVG path once the design is finalized.

- [ ] **Step 4: Commit**

```bash
git add public/icons/ admin/src/components/layout/PretzelLogo.tsx
git commit -m "feat(brand): add Pretzel logo SVG component and icon assets"
```

---

## Task 2: Extension Manifest & Package Name

**Files:**
- Modify: `manifest.config.ts`
- Modify: `package.json` (root)

- [ ] **Step 1: Update `manifest.config.ts`**

Open `manifest.config.ts`. Change line `name: "ciyo"` and update the description:

```typescript
export default defineManifest({
  manifest_version: 3,
  name: "Pretzel",                                          // was: "ciyo"
  version: "2.0.0",
  description: "Pretzel by ciyo.ai — intercepts AI prompts and blocks sensitive data before it leaves your browser.",  // was: "AI prompt protection — detects secrets and PII before they leave your browser."
  // ... rest unchanged
})
```

- [ ] **Step 2: Update root `package.json`**

Change `"name": "ciyo"` to `"name": "pretzel-extension"`:

```json
{
  "name": "pretzel-extension",
  "version": "0.1.0",
  "description": "Pretzel by ciyo.ai — browser-based AI prompt DLP",
  ...
}
```

- [ ] **Step 3: Verify extension builds cleanly**

```bash
npm run build
# Expected: dist/ folder created, no TypeScript errors
```

- [ ] **Step 4: Commit**

```bash
git add manifest.config.ts package.json
git commit -m "feat(brand): rename extension to Pretzel in manifest and package.json"
```

---

## Task 3: Admin Package Name & HTML Title

**Files:**
- Modify: `admin/package.json`
- Modify: `admin/index.html`

- [ ] **Step 1: Update `admin/package.json`**

```json
{
  "name": "pretzel-console",
  "version": "0.1.0",
  ...
}
```

- [ ] **Step 2: Update `admin/index.html`**

Change the title tag:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pretzel Console</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Commit**

```bash
git add admin/package.json admin/index.html
git commit -m "feat(brand): rename admin app to Pretzel Console"
```

---

## Task 4: Admin Sidebar Logo Wordmark

**Files:**
- Modify: `admin/src/components/layout/AppLayout.tsx`

The current sidebar has a hand-crafted SVG + character-split `c·i·yo` wordmark. Replace with `PretzelLogo` component + "Pretzel Console" text.

- [ ] **Step 1: Update the Logo section in `AppLayout.tsx`**

Find the `{/* Logo */}` block (lines ~58–77) and replace it:

```tsx
import { PretzelLogo } from './PretzelLogo'

// Inside AppLayout, replace the <Link to="/dashboard"> logo block:
<Link to="/dashboard" style={{
  padding: '18px 16px',
  borderBottom: '1px solid var(--border)',
  display: 'flex', alignItems: 'center', gap: 10,
  textDecoration: 'none', cursor: 'pointer',
}}>
  <PretzelLogo size={28} />
  <div style={{ lineHeight: 1 }}>
    <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
      Pretzel
    </div>
    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, letterSpacing: '0.3px' }}>
      by ciyo.ai
    </div>
  </div>
</Link>
```

- [ ] **Step 2: Verify admin dev server renders the new logo**

```bash
cd admin && npm run dev
# Open http://localhost:5173 — sidebar should show Pretzel logo + "Pretzel / by ciyo.ai"
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/layout/AppLayout.tsx admin/src/components/layout/PretzelLogo.tsx
git commit -m "feat(brand): replace ciyo wordmark with Pretzel Console logo in sidebar"
```

---

## Task 5: Login & Onboarding Pages

**Files:**
- Modify: `admin/src/pages/LoginPage.tsx`
- Modify: `admin/src/pages/OnboardingPage.tsx`

- [ ] **Step 1: Update `LoginPage.tsx`**

Find `<h1 className="text-xl font-semibold text-gray-900">ciyo Admin</h1>` and replace:

```tsx
<h1 className="text-xl font-semibold text-gray-900">Pretzel Console</h1>
```

Also find any subtitle or description text mentioning "ciyo" and update to "Pretzel Console by ciyo.ai".

- [ ] **Step 2: Update `OnboardingPage.tsx`**

Find `<h1 className="text-xl font-semibold text-gray-900">ciyo Admin</h1>` and replace:

```tsx
<h1 className="text-xl font-semibold text-gray-900">Pretzel Console</h1>
```

- [ ] **Step 3: Run the existing onboarding test to make sure it still passes**

```bash
cd admin && npm test -- --reporter verbose
# Expected: OnboardingPage.test.tsx passes
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/LoginPage.tsx admin/src/pages/OnboardingPage.tsx
git commit -m "feat(brand): update Login and Onboarding pages to Pretzel Console"
```

---

## Task 6: AI Assistant Branding in ChatPane

**Files:**
- Modify: `admin/src/components/assistant/ChatPane.tsx`

The ChatPane currently shows `"ciyo policy manager"` as the assistant label and uses `ciyo-dot-bounce` in an inline style animation.

- [ ] **Step 1: Update the assistant label text**

Find line 140: `<div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>ciyo policy manager</div>`

Replace with:

```tsx
<div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>Pretzel AI</div>
```

- [ ] **Step 2: Rename inline animation reference**

Find `animation: \`ciyo-dot-bounce 1.3s ease-in-out ${i * 0.18}s infinite\`` and update:

```tsx
animation: `pretzel-dot-bounce 1.3s ease-in-out ${i * 0.18}s infinite`,
```

Also find the inline `@keyframes` block in the same file and rename:

```tsx
// Before:
@keyframes ciyo-msg-in { ... }
@keyframes ciyo-dot-bounce { ... }

// After:
@keyframes pretzel-msg-in { ... }
@keyframes pretzel-dot-bounce { ... }
```

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/assistant/ChatPane.tsx
git commit -m "feat(brand): rename AI assistant to Pretzel AI in ChatPane"
```

---

## Task 7: MessageBubble Animation Rename

**Files:**
- Modify: `admin/src/components/assistant/MessageBubble.tsx`

- [ ] **Step 1: Rename animation reference**

Find `animation: 'ciyo-msg-in 0.22s ease-out forwards'` and replace:

```tsx
animation: 'pretzel-msg-in 0.22s ease-out forwards',
```

The `@keyframes pretzel-msg-in` definition lives in `admin/src/index.css` (renamed in Task 8).

- [ ] **Step 2: Commit**

```bash
git add admin/src/components/assistant/MessageBubble.tsx
git commit -m "feat(brand): rename ciyo-msg-in animation to pretzel-msg-in in MessageBubble"
```

---

## Task 8: CSS Keyframe & Class Renames

**Files:**
- Modify: `admin/src/index.css`
- Modify: `admin/src/components/ui/Spinner.tsx`

This task renames all `ciyo-*` CSS identifiers to `pretzel-*`. The names are internal (not user-visible) but consistency matters for maintainability and avoids confusion for future contributors.

- [ ] **Step 1: Update `admin/src/index.css`**

Apply these renames (all occurrences):

```css
/* Before → After */
@keyframes ciyo-spin         → @keyframes pretzel-spin
@keyframes ciyo-spin-reverse → @keyframes pretzel-spin-reverse
@keyframes ciyo-pulse-glow   → @keyframes pretzel-pulse-glow
@keyframes ciyo-fade-in      → @keyframes pretzel-fade-in
@keyframes ciyo-dots         → @keyframes pretzel-dots
@keyframes ciyo-msg-in       → @keyframes pretzel-msg-in
@keyframes ciyo-dot-bounce   → @keyframes pretzel-dot-bounce
.ciyo-label                  → .pretzel-label
.ciyo-label::after           → .pretzel-label::after
animation: ciyo-dots         → animation: pretzel-dots
```

Full updated `admin/src/index.css` keyframe section:

```css
@keyframes pretzel-spin         { to { transform: rotate(360deg);  } }
@keyframes pretzel-spin-reverse  { to { transform: rotate(-360deg); } }
@keyframes pretzel-pulse-glow {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.5; }
}
@keyframes pretzel-fade-in {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pretzel-dots {
  0%   { content: ''; }
  33%  { content: '.'; }
  66%  { content: '..'; }
  100% { content: '...'; }
}
@keyframes pretzel-msg-in {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pretzel-dot-bounce {
  0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
  40%           { transform: scale(1.1); opacity: 1; }
}

.pretzel-label {
  /* existing rules unchanged */
}
.pretzel-label::after {
  animation: pretzel-dots 1.4s steps(1) infinite;
}
```

- [ ] **Step 2: Update `admin/src/components/ui/Spinner.tsx`**

Find all `ciyo-spin` and `ciyo-label` references:

```tsx
// Line with animation name:
style={{ animation: 'pretzel-spin 0.9s linear infinite' }}

// Class name:
{label && <span className="pretzel-label">{label}</span>}
```

Update the JSDoc comment:
```tsx
/** Full-page loading state — spinner only, optional context label in Pretzel style */
```

- [ ] **Step 3: Verify no remaining `ciyo-` class/keyframe references in admin/src**

```bash
grep -rn "ciyo-" admin/src/
# Expected: 0 results
```

- [ ] **Step 4: Run admin tests**

```bash
cd admin && npm test
# Expected: all tests pass
```

- [ ] **Step 5: Commit**

```bash
git add admin/src/index.css admin/src/components/ui/Spinner.tsx
git commit -m "feat(brand): rename all ciyo-* CSS keyframes and classes to pretzel-*"
```

---

## Task 9: Theme Storage Key

**Files:**
- Modify: `admin/src/utils/theme.ts`

- [ ] **Step 1: Update storage key**

Open `admin/src/utils/theme.ts`. Find `const STORAGE_KEY = 'ciyo-theme'` and change:

```typescript
const STORAGE_KEY = 'pretzel-theme'
```

- [ ] **Step 2: Handle migration for existing users** — existing users have `ciyo-theme` in localStorage. Add a one-time migration:

```typescript
const STORAGE_KEY = 'pretzel-theme'
const LEGACY_KEY  = 'ciyo-theme'

function migrateTheme() {
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy && !localStorage.getItem(STORAGE_KEY)) {
    localStorage.setItem(STORAGE_KEY, legacy)
    localStorage.removeItem(LEGACY_KEY)
  }
}

// Call at module load time — runs once per browser session
migrateTheme()
```

- [ ] **Step 3: Run theme tests**

```bash
cd admin && npm test -- theme
# Expected: theme.test.ts passes
```

- [ ] **Step 4: Commit**

```bash
git add admin/src/utils/theme.ts
git commit -m "feat(brand): rename ciyo-theme storage key to pretzel-theme with migration"
```

---

## Task 10: Backend Package Name

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Update backend package name**

```json
{
  "name": "pretzel-api",
  "version": "0.1.0",
  ...
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/package.json
git commit -m "feat(brand): rename backend package to pretzel-api"
```

---

## Task 11: Backend Assistant System Prompt

**Files:**
- Modify: `backend/src/assistant/prompt.ts`

The system prompt currently refers to "the ciyo platform" and "ciyo is a Chrome extension". Update all copy to use the new brand names.

- [ ] **Step 1: Update the system prompt string in `buildSystemPrompt`**

Replace the template string beginning with `You are the ciyo Assistant`:

```typescript
return `You are Pretzel AI — an AI assistant built into the Pretzel Console that helps administrators manage data-loss prevention policies. Pretzel is a Chrome extension (by ciyo.ai) that intercepts AI prompts (ChatGPT, Gemini, Claude, etc.) and warns or blocks users when they attempt to send sensitive data.

You help admins create, edit, and delete rules and subjects using natural language. Always confirm what you're about to do before listing actions. If the user's intent is ambiguous (e.g. "all teams" when there are many), ask a clarifying question instead of guessing. Never apply changes yourself — return them as structured actions for human review.

DATA MODEL
- Subject: a policy topic scoped to a division, team, or the whole org (global). Fields: name, description, divisionId?, teamId?
- Rule: a detection rule attached to a subject. Fields: kind (keyword|pattern|entropy|score), keywords[], pattern, action (warn|block), message, reportLevel (none|minimal|medium|rich)
- Division → Team → Subject → Rule (hierarchy)

RULE KINDS
- keyword: exact word/phrase match (e.g. ["SSN", "social security number"])
- pattern: regex match (e.g. "\\d{3}-\\d{2}-\\d{4}" for SSN format)
- entropy: flags high-entropy strings (API keys, tokens). No keywords/pattern needed.
- score: composite risk score across multiple signals.

CURRENT STATE
Divisions: ${JSON.stringify(snapshot.divisions.map(d => ({ id: d.id, name: d.name })))}
Teams: ${JSON.stringify(snapshot.teams.map(t => ({ id: t.id, name: t.name, divisionId: t.divisionId })))}
Subjects: ${JSON.stringify(subjectLines)}
Rules: ${JSON.stringify(ruleSummaries)}

RESPONSE FORMAT
Always respond with valid JSON in this exact shape:
{"reply":"A friendly explanation of what you're proposing or asking.","actions":[]}

Action types you may use:
- {"op":"create_rule","subjectId":"...","kind":"keyword","keywords":[...],"action":"block","message":"..."}
- {"op":"update_rule","ruleId":"...","patch":{...}}
- {"op":"delete_rule","ruleId":"..."}
- {"op":"create_subject","name":"...","description":"...","teamId":"..."}
- {"op":"update_subject","subjectId":"...","patch":{...}}
- {"op":"delete_subject","subjectId":"..."}

Use the exact IDs from CURRENT STATE above. Never invent IDs. Return actions:[] when asking a clarifying question or answering informational queries.

EXAMPLE
User: "Block any prompt that contains a credit card number on the Finance subject"
Response: {"reply":"I'll add a pattern rule to the Finance subject that blocks prompts matching credit card formats.","actions":[{"op":"create_rule","subjectId":"<Finance subject id>","kind":"pattern","pattern":"\\\\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\\\\b","action":"block","message":"Credit card numbers are not permitted in AI prompts."}]}`
```

- [ ] **Step 2: Run assistant tests**

```bash
cd backend && npm test -- assistant
# Expected: assistant-prompt.test.ts and assistant-apply.test.ts pass
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/assistant/prompt.ts
git commit -m "feat(brand): update assistant system prompt to Pretzel AI branding"
```

---

## Task 12: Backend Welcome Email

**Files:**
- Modify: `backend/src/billing/email.ts`

- [ ] **Step 1: Update email copy**

```typescript
export async function sendWelcomeEmail(input: WelcomeEmailInput): Promise<void> {
  const transport = createTransport()
  await transport.sendMail({
    from: process.env.SMTP_FROM ?? 'noreply@ciyo.ai',   // domain stays ciyo.ai
    to: input.to,
    subject: `Welcome to Pretzel — ${input.tenantName}`,  // was: "Welcome to ciyo"
    text: [
      `Welcome to Pretzel Console, ${input.tenantName}!`,  // was: "Welcome to ciyo"
      '',
      'Your deployment tokens are below. Keep these secure — anyone with these tokens can push policy to your team\'s browsers.',
      '',
      'ORG TOKEN (deploy to all company machines via MDM / Chrome Enterprise policy):',
      `  ${input.orgToken}`,
      '',
      'ADMIN TOKEN (your admin machine only — do not distribute):',
      `  ${input.adminToken}`,
      '',
      'Deploy via Chrome managed storage keys "orgToken" and "adminToken".',
      '',
      'Questions? Reply to this email or visit docs.ciyo.ai/getting-started',
      '',
      '— The Pretzel team at ciyo.ai',
    ].join('\n'),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/billing/email.ts
git commit -m "feat(brand): update welcome email copy to Pretzel branding"
```

---

## Task 13: Full Verification Pass

- [ ] **Step 1: Grep for any remaining product-context "ciyo" references**

```bash
# In extension source (root src/)
grep -rn "\"ciyo\"\|'ciyo'\|ciyo Admin\|ciyo platform\|ciyo is\|ciyo policy" src/ admin/src/ backend/src/
# Expected: 0 results (AppLayout.tsx link to ciyo.ai homepage is fine — that's the company domain)
```

- [ ] **Step 2: Verify ciyo.ai domain links are intentionally kept**

These should remain as `ciyo.ai` — they reference the company website, not the product name:
- `admin/src/components/layout/AppLayout.tsx` line `<a href="https://ciyo.ai"` — intentional, keep
- `backend/src/billing/email.ts` `noreply@ciyo.ai` sender address — intentional, keep

- [ ] **Step 3: Run all test suites**

```bash
# Extension tests
npm test
# Admin tests
cd admin && npm test
# Backend tests
cd ../backend && npm test
```

Expected: all tests pass.

- [ ] **Step 4: Build the extension and verify manifest**

```bash
cd .. && npm run build
cat dist/manifest.json | grep '"name"'
# Expected: "name": "Pretzel"
```

- [ ] **Step 5: Build the admin and verify page title**

```bash
cd admin && npm run build
grep -r "Pretzel Console" dist/
# Expected: found in built HTML
grep -r "ciyo Admin" dist/
# Expected: 0 results
```

- [ ] **Step 6: Run E2E tests against the rebranded app**

```bash
cd .. && npm run test:e2e
# Expected: all 34 E2E tests pass
# If any test asserts page title "ciyo Admin" — update those assertions to "Pretzel Console"
```

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat(brand): complete Pretzel rebranding — extension, console, backend"
```

---

## What Intentionally Does NOT Change

| Item | Why it stays |
|---|---|
| Token prefixes `ps_live`, `ps_adm` | Stored in DB and active installs. Changing requires a DB migration + coordinated extension update. Rename in a future minor release. |
| `noreply@ciyo.ai` email domain | ciyo.ai is the company domain. Email should come from the company, not the product. |
| `ciyo.ai` links in the footer | Correct — ciyo.ai is the company and marketing site. |
| Database table/column names | Internal implementation detail, not user-visible. No reason to rename. |
| `CLERK_ORG_ID` / Clerk configuration | Clerk org names are separate from product branding. |
