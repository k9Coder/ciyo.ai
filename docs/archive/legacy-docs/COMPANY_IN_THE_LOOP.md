# COMPANY_IN_THE_LOOP

> Every source file in this monorepo is assigned to the company specialist best positioned to
> review it. Each specialist has a lens — a specific set of questions they ask when reading.
>
> **How to run a review session:** Invoke the relevant worker as an agent. Give them their
> section of this file plus read access to the repo. They read each file, fill in the verdict
> block, and check the box. A ✅ verdict means the file is fine on this lens. A ⚠️ WARN or
> ❌ ISSUE verdict requires a written finding and proposed fix.
>
> **Some files appear in two sections** — once for each lens that matters (e.g. auth code is
> reviewed by the Backend Engineer for correctness AND by Security Research for attack surface).
> That is intentional.
>
> **Status key:**
> - `[ ]` — not yet reviewed  
> - `[x]` — reviewed  
> - Verdict: `PASS` | `WARN` | `ISSUE`

---

## 1. Marcus Webb — CTO

**Domain:** Architecture, shared types, cross-package contracts, build configs  
**Lens:** Does this fit the architecture? Are names clear? Is this the right abstraction? Does it introduce tech debt or cross-package contract risk? Would this survive 10× load?

---

#### `backend/src/app.ts` — Fastify app factory: plugin registration, router mounting, CORS
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/index.ts` — Server entry point: starts Fastify, binds port
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/types.ts` — Shared TypeScript request augmentations (tenant, member on `req`)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/drizzle.config.ts` — Drizzle ORM configuration for migrations
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/shared/constants.ts` — Extension-wide constants shared across background/content
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/shared/messages.ts` — Chrome extension message type definitions and helpers
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/manifest.config.ts` — Chrome extension manifest V3 configuration
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/vite.config.ts` — Vite build configuration for the extension
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/vite.config.ts` — Vite build configuration for the admin console SPA
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/types.ts` — Shared TypeScript types for the admin console
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/types/global.d.ts` — Global TypeScript type declarations for the extension
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `e2e/playwright.config.ts` — Root cross-package Playwright config (all 4 projects)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `e2e/global-setup.ts` — Cross-service E2E global setup (auth, seeding)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `e2e/global-teardown.ts` — Cross-service E2E global teardown
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/next.config.ts` — Next.js configuration for the marketing site
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `scripts/set-env.mjs` — Root-level environment variable setup script
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 2. Arjun Mehta — Backend Engineer

**Domain:** `backend/src/` — all routers, services, DB schema, policy compiler, webhooks  
**Lens:** Is the business logic correct? Are SQL queries safe and efficient? Is multi-tenant data isolation enforced on every query? Are inputs validated? Are error paths handled? Is the API contract consistent and versioned correctly? Any N+1 queries? Any missing auth guards?

---

### App

#### `backend/src/app.ts` — Fastify app factory, plugin registration
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/index.ts` — Server entry point
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Auth

#### `backend/src/auth/middleware.ts` — Clerk JWT verification middleware, tenant/member attachment to req
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/auth/tokens.ts` — Extension token generation and verification
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### DB

#### `backend/src/db/schema.ts` — Drizzle ORM schema: all tables, relations, indexes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/db/client.ts` — DB connection pool setup
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/db/migrate.ts` — Migration runner script
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Policy

#### `backend/src/policy/router.ts` — Policy REST routes (GET /v1/policy, etc.)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/policy/service.ts` — Policy CRUD: create, update, activate, fetch
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/policy/compiler.ts` — Compiles rules+subjects into a deployable policy payload
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/policy/resolver.ts` — Resolves which policy applies to a given member/team context
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Tenants

#### `backend/src/tenants/router.ts` — Tenant management routes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/tenants/service.ts` — Tenant CRUD and org provisioning logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Members

#### `backend/src/members/router.ts` — Member management routes (list, import, remove)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/members/service.ts` — Member CRUD, bulk import logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Teams

#### `backend/src/teams/router.ts` — Team management routes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/teams/service.ts` — Team CRUD and member assignment logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Divisions

#### `backend/src/divisions/router.ts` — Division hierarchy routes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/divisions/service.ts` — Division CRUD
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Subjects

#### `backend/src/subjects/router.ts` — Subject management routes (data categories)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/subjects/service.ts` — Subject CRUD
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/subjects/snapshot.ts` — Point-in-time snapshot of subject state for policy compilation
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Rules

#### `backend/src/rules/router.ts` — Rule management routes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/rules/service.ts` — Rule CRUD (maps subjects to detection behaviors)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Site Configs

#### `backend/src/site-configs/router.ts` — Site configuration routes (per-LLM-site settings)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/site-configs/service.ts` — Site config CRUD
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Destination Groups

#### `backend/src/destination-groups/router.ts` — Destination group routes (grouping LLM sites)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/destination-groups/service.ts` — Destination group CRUD
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Invites

#### `backend/src/invites/router.ts` — Member invitation routes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/invites/service.ts` — Invite creation, acceptance, expiry logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Events

#### `backend/src/events/router.ts` — SSE event stream routes (policy updates → extension)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/events/service.ts` — Event persistence and fan-out logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/events/policy-bus.ts` — In-process pub/sub bus for policy change events
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Analytics

#### `backend/src/analytics/router.ts` — Analytics query routes (event counts, scan stats)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/analytics/service.ts` — Analytics aggregation and query logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Audit Log

#### `backend/src/audit-log/router.ts` — Audit log query routes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/audit-log/service.ts` — Audit log write and query logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Scans

#### `backend/src/scans/router.ts` — Scan event ingestion routes (extension → backend)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/scans/service.ts` — Scan persistence and deduplication logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Billing

#### `backend/src/billing/router.ts` — Billing management routes (plans, portal, upgrade)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/service.ts` — Subscription state management, plan resolution
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/limits.ts` — Feature gate checks (seat limits, feature flags by plan)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/stripe.ts` — Stripe SDK integration: checkout, portal, webhooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/paypal.ts` — PayPal SDK integration: subscription handling
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/email.ts` — Billing-triggered transactional emails (limit warnings, receipts)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Webhooks

#### `backend/src/webhooks/clerk.ts` — Clerk webhook handler: user/org sync events
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Assistant

#### `backend/src/assistant/router.ts` — AI assistant routes (chat sessions, apply actions)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/service.ts` — Assistant session management and orchestration
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/apply.ts` — Applies assistant-proposed policy changes to the DB
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/prompt.ts` — System prompt construction for the AI assistant
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/versioning.ts` — Assistant session/message versioning and history
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/llm/interface.ts` — LLM provider interface/contract
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/llm/anthropic.ts` — Anthropic Claude API adapter
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/llm/openai.ts` — OpenAI API adapter
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/llm/groq.ts` — Groq API adapter
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Users & Platform

#### `backend/src/users/service.ts` — User profile service (cross-tenant user state)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/platform/router.ts` — Internal platform/admin routes (super-admin operations)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/platform/service.ts` — Platform-level admin operations
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Logger

#### `backend/src/logger/index.ts` — Pino logger configuration and export
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/logger/request-logging.ts` — Fastify request/response logging plugin
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Scripts

#### `backend/src/scripts/seed-e2e.ts` — Seeds test DB for E2E runs
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/scripts/seed-fintech.ts` — Seeds fintech demo tenant data
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/scripts/teardown-e2e.ts` — Cleans up E2E test DB state
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/scripts/seed-tenant.ts` — Manual tenant seeding script
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 3. Alexei Petrov — Head of Security Research

**Domain:** Auth, tokens, webhook verification, billing, extension policy auth, any code that handles secrets, credentials, or trust decisions  
**Lens:** Can an attacker bypass auth? Are tokens forgeable? Are webhooks verified? Are secrets in source? Can a tenant access another tenant's data? Can a user escalate privileges? Any prompt injection risks in the assistant? Rate limiting? Any OWASP Top 10 issues?

---

#### `backend/src/auth/middleware.ts` — Clerk JWT middleware, tenant resolution
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/auth/tokens.ts` — Extension token signing and verification
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/webhooks/clerk.ts` — Clerk webhook handler (user events)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/stripe.ts` — Stripe webhook handler and API calls
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/paypal.ts` — PayPal webhook handler and API calls
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/limits.ts` — Feature gate enforcement logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/service.ts` — Subscription state management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/prompt.ts` — System prompt for AI assistant
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/apply.ts` — Applies AI-proposed changes to production data
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/platform/router.ts` — Super-admin routes (highest privilege endpoints)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/auth.ts` — Extension-side auth token management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/loader.ts` — Policy fetch from backend (auth headers, token refresh)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/schema.ts` — Zod schema for validating policy payloads received from backend
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/audit/db.ts` — Extension-side IndexedDB for audit log storage
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/realtime/backend-rest.adapter.ts` — SSE connection to backend (auth, reconnection)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/logger/request-logging.ts` — Request logging (check: are secrets/tokens logged?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/shared/logger.ts` — Extension logger (check: is sensitive data logged to console?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `.github/workflows/backend-deploy.yml` — Backend CI/CD deploy pipeline (secrets, IAM, trust)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `.github/workflows/e2e.yml` — E2E CI pipeline (check: test credentials exposure, env vars)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 4. Isabella Torres — Threat Intelligence Analyst

**Domain:** `pretzel/src/detection/` — all detection patterns and the engine  
**Lens:** Are there real-world data exfiltration patterns this detection engine would miss? What new categories of sensitive data are employees leaking via AI that aren't covered? Are the pattern descriptions accurate? Would a moderately sophisticated user be able to bypass detection? Are the dictionary lists comprehensive?

---

#### `pretzel/src/detection/layer1-patterns/pii.ts` — PII detection patterns (SSN, passport, DOB, email, phone, etc.)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/api-keys.ts` — API key and secret detection patterns
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/credentials.ts` — Username/password/token credential patterns
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/network.ts` — Network identifiers: IPs, hostnames, internal URLs
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/entropy.ts` — High-entropy string detection (random secrets)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer3-dictionary/exact.ts` — Exact-match dictionary of sensitive terms
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer3-dictionary/fuzzy.ts` — Fuzzy-match dictionary for obfuscated sensitive terms
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/types.ts` — Detection result types and severity levels
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 5. Omar Hassan — Detection Engineer

**Domain:** `pretzel/src/detection/` — detection engine, all pattern files, normalize, code-block  
**Lens:** Are regexes safe from catastrophic backtracking? Are false positive rates acceptable? Are there bypass vectors (encoding tricks, unicode substitution, whitespace injection)? Are entropy thresholds calibrated correctly? Is the engine's scoring logic sound? Are edge cases (empty string, binary content, non-ASCII) handled?

---

#### `pretzel/src/detection/engine.ts` — Core detection engine: orchestrates all layers, scores, decides action
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/normalize.ts` — Text normalization before pattern matching
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/code-block.ts` — Code block extraction and handling within prompts
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/types.ts` — Detection types: Match, Finding, Severity, Action
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/pii.ts` — PII regex patterns
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/api-keys.ts` — API key regex patterns
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/credentials.ts` — Credential regex patterns
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/network.ts` — Network identifier regex patterns
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer1-patterns/entropy.ts` — Entropy calculation and threshold logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer3-dictionary/exact.ts` — Exact match dictionary
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/detection/layer3-dictionary/fuzzy.ts` — Fuzzy match dictionary and distance logic
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 6. Yuki Tanaka — Chrome Extension Engineer

**Domain:** `pretzel/src/` — all extension code except detection patterns  
**Lens:** MV3 compliance? Service worker lifecycle correctness? Any deprecated APIs? Content script correctness (mutation observer patterns, timing issues)? Memory leaks? DOM manipulation safe from page XSS? Message passing secure? Does the extension break when ChatGPT/Claude/Gemini update their DOM? Cross-browser (Edge, Brave) compatibility risks?

---

### Background

#### `pretzel/src/background/service-worker.ts` — MV3 service worker: alarm scheduling, message routing, policy sync triggers
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/background/update-check.ts` — Checks for extension/policy updates
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Content Scripts

#### `pretzel/src/content/content-script.ts` — Main content script entry: sets up adapter, detection, overlay
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/adapters/registry.ts` — Adapter registry: selects the right adapter per URL
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/adapters/types.ts` — Adapter interface definition
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/adapters/chatgpt.ts` — ChatGPT DOM adapter: finds textarea, submit button, intercepts
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/adapters/claude.ts` — Claude.ai DOM adapter
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/adapters/gemini.ts` — Gemini DOM adapter
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/adapters/generic.ts` — Generic fallback adapter for unknown LLM sites
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Overlay UI

#### `pretzel/src/content/overlay/overlay-root.tsx` — Shadow DOM root for the overlay, React mount point
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/overlay/WarningModal.tsx` — Warning modal shown when sensitive data detected
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/overlay/HighlightLayer.tsx` — Highlights detected text in the prompt textarea
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Policy (Extension Side)

#### `pretzel/src/policy/sync.ts` — Policy sync orchestration: when and how to pull updates
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/loader.ts` — Fetches policy from backend REST API
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/bridge.ts` — Bridges policy state between service worker and content scripts
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/defaults.ts` — Default policy used before first sync or when offline
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/role.ts` — Role resolution: determines member's effective policy role
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/auth.ts` — Auth token storage and retrieval in extension storage
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/policy/schema.ts` — Zod schema for policy payload validation
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Realtime

#### `pretzel/src/realtime/index.ts` — Realtime module entry: initialises SSE or polling
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/realtime/backend-rest.adapter.ts` — SSE adapter: connects to backend event stream, reconnects on drop
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/realtime/types.ts` — Realtime event types
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Audit

#### `pretzel/src/audit/db.ts` — IndexedDB wrapper for local audit log persistence
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/audit/log.ts` — Audit log write logic (detection events, policy actions)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/audit/types.ts` — Audit log entry types
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Scans

#### `pretzel/src/scans/dispatch.ts` — Dispatches scan results to backend REST API
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Events

#### `pretzel/src/events/dispatch.ts` — Extension-internal event dispatcher
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Options & Popup UI

#### `pretzel/src/popup/Popup.tsx` — Extension popup component (status, quick actions)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/popup/main.tsx` — Popup entry point
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/App.tsx` — Options page root component (routing)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/main.tsx` — Options page entry point
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/pages/AccountPage.tsx` — Options: account/sign-in management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/pages/AuditPage.tsx` — Options: local audit log viewer
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/pages/AboutPage.tsx` — Options: about/version info
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/components/loading/LoadingProvider.tsx` — Loading state context provider
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/components/loading/Spinner.tsx` — Loading spinner component
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/components/loading/index.ts` — Loading components barrel export
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Shared

#### `pretzel/src/shared/theme.ts` — Extension theme (dark/light mode detection and tokens)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 7. Chloe Dubois — Frontend Engineer (Console)

**Domain:** `pretzel-console/src/` — admin console SPA  
**Lens:** React correctness (unnecessary re-renders, missing memoisation, stale closures)? Missing error boundaries? Hook dependency arrays correct? Accessibility (WCAG 2.1: labels, focus management, keyboard nav)? Loading/error states handled everywhere? Any XSS risks from dangerouslySetInnerHTML? Bundle size concerns? UX correctness vs what an admin would expect?

---

### Root

#### `pretzel-console/src/main.tsx` — Console app entry point, React mount
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/App.tsx` — App router: route definitions, auth guards, layout
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/api.ts` — API base URL and auth header config (top-level)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/lib/api.ts` — Typed API client: fetch wrappers per endpoint
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/lib/sentry.ts` — Sentry error monitoring setup
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/types.ts` — Shared TypeScript types
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/utils/theme.ts` — Theme utilities (dark/light mode)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Pages

#### `pretzel-console/src/pages/LoginPage.tsx` — Auth login page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/OnboardingPage.tsx` — New org onboarding flow
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/DashboardPage.tsx` — Main analytics dashboard
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/AssistantPage.tsx` — AI assistant chat interface
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/SubjectsPage.tsx` — Data subjects/categories management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/MembersPage.tsx` — Member management (list, invite, remove)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/OrgPage.tsx` — Org hierarchy: divisions and teams
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/SitesPage.tsx` — LLM site configuration management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/DestinationsPage.tsx` — Destination group management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/PublishPage.tsx` — Policy publish workflow
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/SettingsPage.tsx` — Org settings management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/AuditLogPage.tsx` — Audit log viewer
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/InvitePage.tsx` — Member invite acceptance flow
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/UnauthorizedPage.tsx` — Access denied page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/pages/AccessibilityPage.tsx` — Accessibility statement page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Hooks

#### `pretzel-console/src/hooks/usePolicy.ts` — Policy state: fetch, update, publish
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/usePolicyRealtime.ts` — SSE subscription for live policy updates
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useAssistant.ts` — AI assistant chat state management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useMembers.ts` — Member list and mutation hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useTeams.ts` — Team management hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useDivisions.ts` — Division management hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useSubjects.ts` — Data subjects management hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useRules.ts` — Detection rules management hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useSiteConfigs.ts` — Site configuration hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useDestinationGroups.ts` — Destination group hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useBilling.ts` — Billing state and plan management hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useAnalytics.ts` — Analytics data fetching hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useAuditLog.ts` — Audit log data fetching hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useTenant.ts` — Current tenant/org state hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/hooks/useToast.ts` — Toast notification state and dispatch
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Layout Components

#### `pretzel-console/src/components/layout/AppLayout.tsx` — Top-level layout: sidebar nav, header, content area
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/layout/RequireAuth.tsx` — Auth guard component for protected routes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/layout/PretzelLogo.tsx` — Logo component
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### UI Components

#### `pretzel-console/src/components/ui/MillerColumns.tsx` — Miller columns navigation for org hierarchy
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/EntityModal.tsx` — Generic create/edit modal for entities
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/ConfirmModal.tsx` — Confirmation dialog (destructive actions)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/SplitPane.tsx` — Resizable split pane layout
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/ToastContainer.tsx` — Toast notification container and renderer
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/Toggle.tsx` — Toggle switch component
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/Badge.tsx` — Status badge component
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/EmptyState.tsx` — Empty state display component
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/PageHeader.tsx` — Page title/header component
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/Spinner.tsx` — Loading spinner
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Assistant Components

#### `pretzel-console/src/components/assistant/ChatPane.tsx` — Chat conversation UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/assistant/ChatInput.tsx` — Chat input field with send controls
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/assistant/MessageBubble.tsx` — Individual chat message renderer
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/assistant/ActionItem.tsx` — Proposed policy action item (approve/reject)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/assistant/PreviewPane.tsx` — Preview of proposed policy changes
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/assistant/SessionTabs.tsx` — Chat session tab management
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Billing Components

#### `pretzel-console/src/components/billing/PlanGate.tsx` — Renders children only if plan supports the feature
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/billing/UpgradeBanner.tsx` — Upgrade CTA banner for gated features
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Realtime (Console)

#### `pretzel-console/src/realtime/index.ts` — Console realtime module entry
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/realtime/sse.adapter.ts` — SSE adapter: connects to backend, dispatches events to hooks
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/realtime/types.ts` — Realtime event types for console
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 8. Carlos Mendes — Designer

**Domain:** All UI that users see: extension overlay, popup, options pages, console components, marketing site visuals  
**Lens:** Visual consistency with brand guidelines? ARIA attributes correct? Keyboard navigation works? Focus visible? Color contrast meets WCAG AA? Animations smooth and not jarring? Does the UI feel like mykka.ai or like a dev built it without design input?

---

#### `pretzel/src/content/overlay/WarningModal.tsx` — Warning modal UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/overlay/HighlightLayer.tsx` — Highlight overlay on detected text
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/content/overlay/overlay-root.tsx` — Shadow DOM injection root
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/popup/Popup.tsx` — Extension popup UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/App.tsx` — Options page layout and nav
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/pages/AccountPage.tsx` — Account page UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/pages/AuditPage.tsx` — Audit log page UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/options/pages/AboutPage.tsx` — About page UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/shared/theme.ts` — Extension theme tokens
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/utils/theme.ts` — Console theme utilities
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/MillerColumns.tsx` — Miller columns (complex interactive pattern)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/EntityModal.tsx` — Modal UI pattern
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/ConfirmModal.tsx` — Destructive action confirmation UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/ui/ToastContainer.tsx` — Toast notification UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/components/billing/UpgradeBanner.tsx` — Upgrade prompt UI
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/layout/Header.tsx` — Marketing site header nav
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/layout/Footer.tsx` — Marketing site footer
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/Hero.tsx` — Marketing hero section
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/FeatureGrid.tsx` — Feature comparison grid
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/CTABanner.tsx` — Call-to-action banner
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/HowItWorks.tsx` — Product explainer section
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/PricingPreview.tsx` — Pricing preview section
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/VideoDemo.tsx` — Product demo video embed section
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 9. Ryan Kowalski — DevOps / Platform Engineer

**Domain:** CI/CD pipelines, Docker, infra configs, nginx, secrets management  
**Lens:** Any secrets hardcoded or leaked via env? Docker containers running as root? Images unversioned/unpinned? CI pipelines missing secret scanning? nginx misconfigured (missing security headers, directory listing, unsafe HTTP methods)? Are images minimal (attack surface)? Are deployments repeatable and idempotent? Is monitoring wired up? Any IAM over-permissions?

---

#### `docker-compose.yml` — Local dev services: Postgres, backend, console
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/Dockerfile` — Console production Docker image
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/Dockerfile` — Marketing site production Docker image
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/nginx.conf` — nginx configuration for serving the marketing site
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/vercel.json` — Vercel deployment configuration
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `.github/workflows/backend-deploy.yml` — Backend deployment pipeline
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `.github/workflows/pretzel-console-deploy.yml` — Console deployment pipeline
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `.github/workflows/mykka-web-deploy.yml` — Marketing site deployment pipeline
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `.github/workflows/pretzel-release.yml` — Extension release pipeline (Chrome Web Store publish)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `.github/workflows/e2e.yml` — E2E test CI pipeline
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/db/client.ts` — DB connection pool (check: connection limits, SSL enforcement, timeout config)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/db/migrate.ts` — Migration runner (check: run-once safety, rollback strategy)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/logger/index.ts` — Logger config (check: log levels per env, PII redaction, log drain)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 10. Natasha Ivanova — QA Lead

**Domain:** All E2E/Playwright test suites across all four packages  
**Lens:** Do the tests actually cover the acceptance criteria? Are there missing flows (happy path untested, or only happy path and no edge cases)? Are tests flaky (relying on timing, non-deterministic selectors)? Are there gaps where a critical flow has zero automated coverage? Are cross-service tests testing the right boundary? Do tests clean up after themselves?

---

### Cross-Service E2E (`e2e/`)

#### `e2e/extension/ai-full-flow.spec.ts` — Full flow: AI rule creation → policy publish → extension enforces
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `e2e/helpers/admin-headers.ts` — Admin auth headers helper for cross-service tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `e2e/helpers/org-headers.ts` — Org-scoped auth headers helper
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `e2e/helpers/seed-state.ts` — Cross-service test DB seeding helper
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Backend E2E (`backend/e2e/`)

#### `backend/e2e/policy.spec.ts` — Policy API E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/e2e/assistant.spec.ts` — Assistant API E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/e2e/billing.spec.ts` — Billing API E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/e2e/analytics.spec.ts` — Analytics API E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/e2e/members-import.spec.ts` — Member bulk import E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/e2e/helpers/seed-state.ts` — Backend E2E seed helper
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/e2e/helpers/admin-headers.ts` — Admin auth helper for backend E2E
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/e2e/helpers/org-headers.ts` — Org auth helper for backend E2E
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Extension E2E (`pretzel/e2e/`)

#### `pretzel/e2e/detection.spec.ts` — Extension detection E2E: does detection fire correctly in browser?
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/e2e/warn.spec.ts` — Extension warning modal E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/e2e/policy-sync.spec.ts` — Extension policy sync E2E: SSE update → extension reloads policy
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/e2e/options.spec.ts` — Extension options page E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Console E2E (`pretzel-console/e2e/`)

#### `pretzel-console/e2e/dashboard.spec.ts` — Dashboard page E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/assistant.spec.ts` — AI assistant console E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/publish.spec.ts` — Policy publish flow E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/members.spec.ts` — Member management E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/billing.spec.ts` — Billing flows E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/audit.spec.ts` — Audit log E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/org.spec.ts` — Org hierarchy E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/subjects.spec.ts` — Subjects management E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/settings.spec.ts` — Settings page E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/sites.spec.ts` — Site configs E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/destinations.spec.ts` — Destination groups E2E tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/e2e/auth.setup.ts` — Auth state setup for console E2E (Clerk sign-in)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 11. Lena Hartmann — QA Analyst

**Domain:** All unit tests (`tests/` in each package) and Playwright configs  
**Lens:** Does each unit test actually test the behaviour the function is supposed to have (not just implementation details)? Are edge cases missing? Are mocks appropriate or do they hide real behaviour? Are tests readable and maintainable? Are there tests that are never going to fail (asserting `true === true` style)? Are acceptance criteria from specs covered?

---

### Backend Unit Tests (`backend/tests/`)

#### `backend/tests/policy.test.ts` — Policy unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/policy.service.test.ts` — Policy service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/policy.router.test.ts` — Policy router unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/policy-compiler.test.ts` — Policy compiler unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/policy-resolver.test.ts` — Policy resolver unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/policy-routes.test.ts` — Policy routes integration tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/assistant.test.ts` — Assistant unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/assistant-apply.test.ts` — Assistant apply action unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/assistant-prompt.test.ts` — Assistant prompt construction tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/assistant.versioning.test.ts` — Assistant versioning unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/billing-stripe.test.ts` — Stripe integration unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/billing-paypal.test.ts` — PayPal integration unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/billing/limits.test.ts` — Billing limits/gates unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/clerk-auth.test.ts` — Clerk auth middleware unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/clerk-webhook.test.ts` — Clerk webhook handler unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/tokens.test.ts` — Token generation/verification unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/members.test.ts` — Members service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/teams.test.ts` — Teams service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/divisions.test.ts` — Divisions service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/tenants.test.ts` — Tenants service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/subjects.test.ts` — Subjects service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/subjects/snapshot.test.ts` — Subjects snapshot unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/rules.test.ts` — Rules service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/scans.test.ts` — Scans service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/events.test.ts` — Events service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/events/policy-bus.test.ts` — Policy bus unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/sse-events.test.ts` — SSE event stream unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/analytics.test.ts` — Analytics service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/audit-log.test.ts` — Audit log service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/site-configs.test.ts` — Site configs unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/destination-groups.test.ts` — Destination groups unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/platform.test.ts` — Platform service unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/settings.test.ts` — Settings unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/logger/logger.test.ts` — Logger unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/logger/request-logging.test.ts` — Request logging unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/tests/helpers/db.ts` — Test DB helper utilities
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Extension Unit Tests (`pretzel/tests/unit/`)

#### `pretzel/tests/unit/detection/api-keys.test.ts` — API key pattern unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/detection/pii.test.ts` — PII pattern unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/detection/entropy.test.ts` — Entropy detection unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/detection/dictionary.test.ts` — Dictionary match unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/detection/corpus.test.ts` — Corpus-level detection tests (real-world examples)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/detection/score-rule.test.ts` — Score/rule combination logic tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/policy/bridge.test.ts` — Policy bridge unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/policy/role.test.ts` — Role resolution unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/policy/schema.test.ts` — Policy schema validation unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/policy/sync.test.ts` — Policy sync logic unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/realtime.adapter.test.ts` — Realtime SSE adapter unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/service-worker.alarm.test.ts` — Service worker alarm scheduling unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/update-check.test.ts` — Update check unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/tests/unit/shared/theme.test.ts` — Theme utility unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

### Console Unit Tests (`pretzel-console/tests/`)

#### `pretzel-console/tests/api.test.ts` — API client unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/AppLayout.staging.test.tsx` — AppLayout staging environment tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/MillerColumns.test.tsx` — MillerColumns component unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/OnboardingPage.test.tsx` — Onboarding page unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/RequireAuth.test.tsx` — RequireAuth guard unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/hooks/usePolicyRealtime.test.tsx` — usePolicyRealtime hook unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/realtime/sse.adapter.test.ts` — SSE adapter unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/theme.test.ts` — Theme utility unit tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/tests/setup.ts` — Vitest setup file for console tests
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 12. David Horowitz — General Counsel (Fractional)

**Domain:** Any code that touches data collection, storage, sharing, consent, or user rights  
**Lens:** Does the code match what our Privacy Policy and Terms of Service say we do with data? Are audit logs retained correctly per GDPR/SOC 2 requirements? Are we collecting more data than we claim to? Are third-party data transfers (Stripe, Clerk, Sentry, Groq, OpenAI) disclosed? Is there a data retention/deletion mechanism? Is PII processed lawfully?

---

#### `backend/src/audit-log/router.ts` — Audit log API (what is exposed, to whom)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/audit-log/service.ts` — Audit log write logic (what is recorded and retained)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/service.ts` — Subscription management (customer data handling with Stripe/PayPal)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/billing/email.ts` — Billing emails (consent, unsubscribe mechanisms)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/analytics/service.ts` — Analytics data collection scope and retention
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/scans/service.ts` — Scan data ingestion (prompt content stored? for how long?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/members/service.ts` — Member data handling (PII: email, name)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/users/service.ts` — User profile data scope
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/llm/anthropic.ts` — Data sent to Anthropic API (customer data in prompts?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/llm/openai.ts` — Data sent to OpenAI API
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/llm/groq.ts` — Data sent to Groq API
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `backend/src/assistant/prompt.ts` — What customer data is included in LLM prompts
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel-console/src/lib/sentry.ts` — Sentry error reporting (what user data is in error reports)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `pretzel/src/audit/db.ts` — Local IndexedDB audit log (GDPR right to erasure: can this be cleared?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/security/page.tsx` — Security claims page (do they match what we actually implement?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/accessibility/page.tsx` — Accessibility statement (is it accurate?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/robots.ts` — robots.txt (are we disclosing too much about internal paths?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## 13. Priya Nair — Head of Marketing

**Domain:** `mykka-web/` — the marketing website  
**Lens:** Are product claims accurate (not overpromising what the extension actually does)? Are SEO meta tags and Open Graph present on all pages? Is the copy sharp and on-brand? Is the pricing page up to date? Does the security page match what Engineering has actually built? Are there dead links, outdated competitor comparisons, or placeholder text still in prod?

---

#### `mykka-web/app/page.tsx` — Homepage
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/product/page.tsx` — Product feature detail page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/pricing/page.tsx` — Pricing page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/solutions/page.tsx` — Solutions landing page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/solutions/[industry]/page.tsx` — Industry-specific solutions page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/security/page.tsx` — Security/trust page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/blog/page.tsx` — Blog listing page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/blog/[slug]/page.tsx` — Individual blog post page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/about/page.tsx` — About/team page
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/layout.tsx` — Root layout: global meta tags, fonts, nav
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/sitemap.ts` — XML sitemap generation
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/app/robots.ts` — robots.txt generation
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/Hero.tsx` — Hero section copy and CTA
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/FeatureGrid.tsx` — Feature listing and copy
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/PricingPreview.tsx` — Pricing section copy
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/CTABanner.tsx` — Call-to-action copy and link
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/HowItWorks.tsx` — Product explainer copy
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/sections/VideoDemo.tsx` — Demo video (is it current/accurate?)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/layout/Header.tsx` — Site navigation links
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/components/layout/Footer.tsx` — Footer links and legal copy
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/lib/config.ts` — Site config (APP_URL, feature flags, environment vars)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

#### `mykka-web/lib/posts.ts` — Blog post loading logic (how posts are fetched/rendered)
- [ ] Reviewed  
  **Verdict:**  
  **Findings:**  
  **Proposed changes:**

---

## Summary Dashboard

> Fill this in after all reviews complete. Count verdicts per reviewer.

| Reviewer | Total Files | PASS | WARN | ISSUE | Not Started |
|---|---|---|---|---|---|
| Marcus Webb (CTO) | 17 | | | | 17 |
| Arjun Mehta (Backend) | 53 | | | | 53 |
| Alexei Petrov (Security) | 19 | | | | 19 |
| Isabella Torres (Threat Intel) | 8 | | | | 8 |
| Omar Hassan (Detection) | 11 | | | | 11 |
| Yuki Tanaka (Extension) | 38 | | | | 38 |
| Chloe Dubois (Frontend) | 46 | | | | 46 |
| Carlos Mendes (Designer) | 24 | | | | 24 |
| Ryan Kowalski (DevOps) | 13 | | | | 13 |
| Natasha Ivanova (QA Lead) | 30 | | | | 30 |
| Lena Hartmann (QA Analyst) | 45 | | | | 45 |
| David Horowitz (GC) | 17 | | | | 17 |
| Priya Nair (Marketing) | 22 | | | | 22 |
| **Total** | **343** | | | | **343** |

---

## Open Issues Log

> Populated automatically as reviews complete. Each ISSUE or WARN verdict gets an entry here.

| # | File | Reviewer | Verdict | One-line summary |
|---|---|---|---|---|
| — | — | — | — | No issues logged yet |
