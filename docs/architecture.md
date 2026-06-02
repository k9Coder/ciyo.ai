# Pretzel Architecture

## Overview

Pretzel by ciyo.ai is an AI prompt DLP (Data Loss Prevention) platform. It consists of four packages in a pnpm monorepo:

| Package | Dir | Purpose |
|---|---|---|
| **Pretzel Extension** | `extension/` | Chrome MV3 extension — intercepts AI prompts client-side |
| **Pretzel Console** | `admin/` | React admin SPA — policy management, org hierarchy, analytics |
| **Pretzel API** | `backend/` | Fastify REST API — policy serving, audit, billing, AI assistant |
| **ciyo.ai Website** | `ciyo-web/` | Next.js 16 marketing site — public-facing, statically rendered |

E2e tests live in `admin/e2e/` (Playwright, UI tests) and `backend/e2e/` (Playwright, API tests).

---

## Monorepo Structure

```
prompt-saviour/
  extension/   — Chrome extension (Vite + CRXJS)
  admin/       — Pretzel Console (Vite + React + Clerk)
  backend/     — Pretzel API (Fastify + Drizzle + PostgreSQL)
  ciyo-web/    — Marketing site (Next.js 16 + Tailwind v4)
  e2e/         — Legacy e2e root (deprecated, tests moved to admin/e2e + backend/e2e)
  docs/        — Architecture, plans, specs
  pnpm-workspace.yaml
```

---

## Pretzel Extension

```
┌────────────────────────────────────────────────────┐
│                  Chrome Extension                  │
│                                                    │
│  ┌──────────────┐  ┌─────────────────────────────┐ │
│  │   Popup UI   │  │        Options Page          │ │
│  │ (React/Zustand) │  (Policy | Audit | About)    │ │
│  └──────┬───────┘  └──────────────┬──────────────┘ │
│         │ sendMessage             │                │
│  ┌──────▼─────────────────────────▼─────────────┐  │
│  │          Background Service Worker            │  │
│  │  • Handles DETECT / GET_POLICY / TOGGLE_SITE  │  │
│  │  • Calls detection engine                     │  │
│  │  • Loads/saves policy from chrome.storage     │  │
│  └───────────────────────────────────────────────┘  │
│                       ▲                             │
│              sendMessage (DETECT)                   │
│                       │                             │
│  ┌────────────────────┴────────────────────────┐    │
│  │         Content Script (ISOLATED world)     │    │
│  │  • Finds adapter for current hostname       │    │
│  │  • Hooks send-intent (click + Enter)        │    │
│  │  • Reads prompt, calls background           │    │
│  │  • Shows Shadow-DOM warning modal           │    │
│  │  • Writes audit event to IndexedDB          │    │
│  └─────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────┘
```

### Detection Pipeline

```
promptText
    │
    ├─ normalizeText()         whitespace normalisation, lookalike reversal
    ├─ findCodeSpans()         tag markdown fenced/inline code
    │
    ├─ Layer 1: PatternRules   regex + optional Luhn/SSN validator
    ├─ Layer 1: EntropyRule    Shannon entropy on tokenised text
    ├─ Layer 3: DictionaryRule exact word-boundary + optional Levenshtein fuzzy
    │
    │  (Layer 2: ML NER — reserved for future)
    │  (Layer 4: Cloud classifier — reserved for future)
    │
    └─ aggregate → highest-severity action → DetectionResult
```

### Key Files

| File | Purpose |
|------|---------|
| `extension/src/detection/engine.ts` | Main pipeline; calls all layers; computes `highestAction` |
| `extension/src/detection/normalize.ts` | Lookalike maps, CRLF normalisation |
| `extension/src/detection/code-block.ts` | Marks code-fence spans for scope filtering |
| `extension/src/policy/schema.ts` | Zod schemas for `Rule`, `Policy` |
| `extension/src/content/adapters/chatgpt.ts` | ChatGPT DOM adapter |
| `extension/src/content/overlay/overlay-root.tsx` | Shadow DOM injection + React root |
| `extension/src/content/overlay/WarningModal.tsx` | Warning / block modal UI |
| `extension/src/audit/log.ts` | IndexedDB read/write/export |
| `extension/src/background/service-worker.ts` | MV3 service worker message dispatcher |

### Extension Storage

- `chrome.storage.local` — active policy JSON (synced from backend via polling)
- `chrome.storage.sync` — optional cross-device policy sync
- `IndexedDB` (`promptshield_audit`) — append-only audit log

### Security Properties

- Full prompt text is **never** stored — only SHA-256 hash and character count
- All processing is local; policy sync calls the backend but prompt content never leaves the browser
- Shadow DOM modal is isolated from host-page styles and scripts
- Content script errors are caught and never propagate to the host page

---

## Pretzel Console (Admin)

React SPA (Vite) served at `app.ciyo.ai`. Uses Clerk for auth (org-based).

**Key directories:**
- `admin/src/pages/` — route-level page components
- `admin/src/components/layout/` — AppLayout, Header, PretzelLogo
- `admin/src/components/assistant/` — AI assistant chat UI
- `admin/src/components/billing/` — PlanGate, UpgradeBanner
- `admin/src/utils/theme.ts` — dark/light theme, localStorage key `pretzel-theme`

---

## Pretzel API (Backend)

Fastify REST API. PostgreSQL + Drizzle ORM. Clerk JWT verification on all protected routes.

**Key domains:**
- `/v1/policy` — policy CRUD + publish + rollback
- `/v1/subjects`, `/v1/rules` — policy entities
- `/v1/org`, `/v1/teams`, `/v1/divisions` — org hierarchy
- `/v1/members` — member management
- `/v1/assistant` — AI policy assistant (proxies Anthropic API)
- `/v1/billing` — Stripe + PayPal billing, plan enforcement
- `/v1/audit` — audit log entries
- `/v1/scans` — scan event ingestion (enforced against billing limits)

**Billing tiers:** `free`, `starter`, `business`. Enforced via middleware on scan and assistant endpoints.

---

## ciyo.ai Marketing Website

Next.js 16 static site (`ciyo-web/`). Deployed to Vercel at `ciyo.ai`.

**Pages:**
- `/` — Homepage (Hero, HowItWorks, FeatureGrid, VideoDemo, PricingPreview, CTABanner)
- `/product` — Deep-dive on extension + console + AI assistant
- `/pricing` — Full pricing comparison with annual/monthly toggle
- `/solutions/[industry]` — Healthcare, Legal, Fintech, Engineering verticals
- `/security` — Trust & security page
- `/about` — Company story
- `/blog` + `/blog/[slug]` — Blog posts (static, data in `lib/posts.ts`)
- `/sitemap.xml`, `/robots.txt` — SEO

---

## Auth Flow

1. User installs extension → authenticates with Clerk (Chrome extension OAuth)
2. Extension stores Clerk JWT in `chrome.storage.local`
3. On each scan, extension attaches JWT as `Authorization: Bearer` header to backend
4. Backend validates JWT via Clerk SDK, resolves `orgId`, enforces billing limits
5. Admin SPA authenticates via Clerk hosted UI, uses the same org JWT

---

## Data Flow — Policy Sync

```
Admin edits policy in Console
  → PUT /v1/subjects | /v1/rules
  → POST /v1/policy/publish → creates new policy version
  → Extension polls GET /v1/policy/version every 30min
  → On version change, fetches GET /v1/policy
  → Stores compiled policy in chrome.storage.local
```

**Known limitation:** 30-minute poll interval is the only sync mechanism. A push/force-sync is on the roadmap (see `future_plans/`).

---

## Tech Stack Summary

| Layer | Stack |
|---|---|
| Extension | TypeScript, React 18, Zustand, Vite + CRXJS, Chrome MV3 |
| Admin SPA | TypeScript, React 18, React Router, Clerk, Tailwind CSS |
| API | TypeScript, Fastify, Drizzle ORM, PostgreSQL, Clerk SDK |
| Marketing | TypeScript, Next.js 16, Tailwind CSS v4, React 19 |
| Auth | Clerk (org-based, JWT) |
| Billing | Stripe + PayPal |
| AI | Anthropic Claude (assistant feature) |
| Infra | Vercel (ciyo-web), custom hosting (backend + admin) |
| Package mgr | pnpm workspaces |
