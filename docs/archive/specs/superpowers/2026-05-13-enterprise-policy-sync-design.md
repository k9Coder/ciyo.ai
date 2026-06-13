# PromptShield — Enterprise Policy Sync & Law Firm Detection Layer

**Date:** 2026-05-13  
**Status:** Approved for implementation  
**Scope:** Backend policy server, billing/token system, law firm detection rules, extension sync

---

## 1. Problem Statement

The current MVP is a single-user extension with a locally-edited policy JSON. The next customer segment is **professional firms** (initially law firms) whose risk profile is entirely different from developers: they are not leaking API keys — they are leaking **confidential client documents, privileged communications, and matter-specific information** into public LLMs.

Serving these customers requires:

1. **Domain-specific detection** tuned to legal document patterns, not credentials
2. **Centralised policy management** — IT deploys once, all lawyers receive it silently
3. **Role separation** — admin machines can edit policy, regular machines cannot
4. **Cloud sync** so policy changes propagate without manual file sharing
5. **Paid access control** so only customers with an active subscription can pull policy

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     PromptShield Cloud                       │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────────────────┐   │
│  │  Admin Console   │───▶│      Policy Server (API)     │   │
│  │  (web dashboard) │    │  • tenant management         │   │
│  └──────────────────┘    │  • policy versioning         │   │
│                           │  • client/matter roster      │   │
│  ┌──────────────────┐    │  • subscription validation   │   │
│  │  Stripe Webhook  │───▶│                              │   │
│  └──────────────────┘    └──────────────┬───────────────┘   │
│  ┌──────────────────┐                   │                    │
│  │  PayPal Webhook  │───────────────────┘                    │
│  └──────────────────┘                                        │
└──────────────────────────────────────────────────────────────┘
                               │ GET /v1/policy (org_token)
              ┌────────────────┴─────────────────┐
              │                                  │
   ┌──────────▼──────────┐          ┌────────────▼──────────┐
   │  Lawyer's Chrome    │          │   Admin's Chrome      │
   │  org_token only     │          │   org_token           │
   │  read-only UI       │          │ + admin_token         │
   └─────────────────────┘          │   full edit UI        │
                                    └───────────────────────┘
```

**Key invariants:**
- The extension **never** contacts the billing provider directly
- The extension only knows: "here is my token, give me the policy"
- All subscription logic lives server-side
- A cancelled subscription returns `402`; the extension falls back to its last cached policy and shows a badge

---

## 3. Token Architecture

### Format

```
ps_live_<tenantSlug>_<32-char random secret>

Examples:
  ps_live_acmelaw_xK8mP2nQ7vR4sT9yW1zA3bC5d   ← org token (all machines)
  ps_adm_acmelaw_yR3nW6vQ1mT8sZ2xA4bD6eF8g    ← admin token (admin machine only)
```

- `ps_live_` prefix → production org token
- `ps_adm_` prefix → admin token (elevated permissions)
- `tenantSlug` → human-readable, aids debugging without exposing UUIDs
- 32-char secret → 192 bits of entropy, stored hashed (bcrypt) in the database

### Token Deployment

| Token | Who holds it | How it gets there |
|-------|-------------|-------------------|
| `org_token` | All company machines | IT deploys via MDM/GPO into Chrome managed storage |
| `admin_token` | Admin machine only | IT drops manually or via a separate restricted MDM policy |

The extension reads both from `chrome.storage.managed` (set by MDM) then falls back to `chrome.storage.local` (set manually via options page).

---

## 4. Database Schema

```sql
-- One row per paying customer
CREATE TABLE tenants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,                        -- "Acme Law LLP"
  slug                  TEXT UNIQUE NOT NULL,                 -- "acmelaw"
  org_token_hash        TEXT NOT NULL,                        -- bcrypt hash
  admin_token_hash      TEXT NOT NULL,                        -- bcrypt hash
  payment_provider      TEXT NOT NULL,                        -- 'stripe' | 'paypal'
  external_sub_id       TEXT NOT NULL,                        -- Stripe sub ID or PayPal billing agreement ID
  subscription_status   TEXT NOT NULL DEFAULT 'active',       -- 'active' | 'past_due' | 'cancelled'
  plan                  TEXT NOT NULL DEFAULT 'pro',          -- reserved for future tiers
  grace_period_days     INTEGER NOT NULL DEFAULT 7,           -- editable per tenant in super-admin
  grace_period_ends_at  TIMESTAMPTZ,                          -- computed: first_failure_at + grace_period_days
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Versioned policy documents per tenant
CREATE TABLE policies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id),
  version      INTEGER NOT NULL,
  policy_json  JSONB NOT NULL,                                -- compiled PolicySchema document
  published_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, version)
);

-- Client/matter roster — source of truth before baking into policy_json
CREATE TABLE matters (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id),
  client_name      TEXT NOT NULL,
  matter_name      TEXT,
  matter_number    TEXT,
  opposing_parties TEXT[] DEFAULT '{}',
  active           BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ON matters (tenant_id, active);
CREATE INDEX ON policies (tenant_id, version DESC);
```

---

## 5. API Surface

All endpoints are versioned under `/v1`. Auth is via `Authorization: Bearer <token>` header.

### Extension-facing (org token)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/policy/version` | Returns `{ version: number }` only — lightweight poll to check for updates |
| `GET` | `/v1/policy` | Returns full `PolicyResponse` (see type below) |

```typescript
interface PolicyResponse {
  version: number;
  policy: Policy;        // full compiled PolicySchema document
  tenantName: string;    // shown in popup: "Acme Law LLP"
  plan: "pro";           // reserved for tier-gating future features
  expiresAt: string | null; // ISO date shown as warning when < 14 days away
}
```

### Admin-facing (admin token)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/matters` | List all matters for this tenant |
| `POST` | `/v1/matters` | Add a matter |
| `PATCH` | `/v1/matters/:id` | Update a matter (rename, toggle active) |
| `DELETE` | `/v1/matters/:id` | Remove a matter |
| `POST` | `/v1/policy/publish` | Compile current matters + settings into a new policy version and set it live |
| `GET` | `/v1/policy/history` | List recent policy versions with timestamps |

### Billing webhooks (no auth token — verified by provider signature)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/webhooks/stripe` | Handles `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted` |
| `POST` | `/webhooks/paypal` | Handles `BILLING.SUBSCRIPTION.ACTIVATED`, `PAYMENT.SALE.COMPLETED`, `BILLING.SUBSCRIPTION.CANCELLED` |

Both webhook handlers converge into a single internal `updateSubscriptionStatus(tenantId, status)` function.

---

## 6. Billing Flow

```
Admin visits promptshield.dev/signup
  → fills company name + email
  → selects payment method (Stripe card or PayPal)
  → completes checkout

Stripe webhook: checkout.session.completed
  OR
PayPal webhook: BILLING.SUBSCRIPTION.ACTIVATED
  → server creates tenant row
  → generates org_token + admin_token (hashed in DB, plaintext in email only)
  → sends welcome email with both tokens + deployment instructions

Monthly renewal:
  Stripe: invoice.paid → subscription_status = 'active'
  Stripe: invoice.payment_failed → subscription_status = 'past_due', grace_period_ends_at = now() + 7 days
  Stripe: customer.subscription.deleted → subscription_status = 'cancelled'
  (same logic for PayPal equivalents)

Extension policy pull while past_due (within grace period):
  → returns policy normally + { warning: "subscription_expiring" }
  → extension shows amber badge in popup

Extension policy pull after cancellation / grace period:
  → server returns 402
  → extension falls back to last cached policy
  → popup shows "Subscription expired — contact your IT admin"
```

---

## 7. Law Firm Detection Rules

Three new categories added to the baseline policy for law firm tenants. All implemented using existing `PatternRule` and `DictionaryRule` types — no engine changes needed.

### 7.1 Confidentiality Markers

`DictionaryRule` — case-insensitive exact match, action: `require_confirmation`

```
PRIVILEGED AND CONFIDENTIAL
ATTORNEY-CLIENT PRIVILEGE
ATTORNEY WORK PRODUCT
WORK PRODUCT DOCTRINE
DO NOT DISCLOSE
CONFIDENTIAL — NOT FOR DISTRIBUTION
SUBJECT TO PROTECTIVE ORDER
```

### 7.2 Legal Document Structure — Paste-Triggered Scoring

Rather than firing individual regex rules, a **document confidence score** is computed when a large paste is detected (>200 characters inserted in a single `paste` event). This avoids false positives from lawyers quoting a statute in passing.

| Signal | Default Points | Configurable? |
|--------|---------------|---------------|
| Detected as paste (not typed) | +20 | yes |
| Text length > 400 words | +20 | yes (word threshold editable) |
| Contains WHEREAS / HEREBY / IN WITNESS WHEREOF | +25 each | yes |
| Numbered paragraphs at line start (`^\s*\d+\.`) | +15 | yes |
| Average sentence length > 25 words | +10 | yes |
| All-caps formal heading on its own line | +10 | yes |
| Looks like a block quote (`>` prefix or indented) | −15 | yes |

**Thresholds are per-tenant and editable in the admin console at any time:**
- `warnThreshold` — default 50, min 10, max 100
- `confirmThreshold` — default 80, min 10, max 100

Both live inside the `ScoreRule` definition in the tenant's policy JSON. Changing them in the admin console and publishing immediately takes effect on all machines at next sync (within 30 minutes).

This is implemented as a new `ScoreRule` kind in the detection engine (parallel to `PatternRule`, `EntropyRule`, `DictionaryRule`).

### 7.3 Client / Matter Roster

`DictionaryRule` — populated at policy publish time from the `matters` table. Includes:
- `client_name` fields from all active matters
- `matter_number` fields
- `opposing_parties` array entries

`fuzzyTerms` entries are generated automatically for names ≤ 20 chars with `maxDistance: 1` to catch typos.

Action: `block`

---

## 8. Extension Changes

### 8.1 Policy Sync

New module: `src/policy/sync.ts`

```typescript
// On startup and every 30 minutes:
async function syncPolicy(): Promise<void>
// 1. Read org_token from chrome.storage.managed or chrome.storage.local
// 2. GET /v1/policy/version — if version matches cached, skip
// 3. GET /v1/policy — validate with PolicySchema, store in chrome.storage.local
// 4. If 402 → set "subscription_expired" flag, keep last cached policy
```

### 8.2 Role Detection

```typescript
// src/policy/role.ts
async function getRole(): Promise<"admin" | "user" | "unregistered">
// Reads org_token and admin_token from storage
// Returns "admin" if admin_token present and non-empty
// Returns "user" if only org_token present
// Returns "unregistered" if neither present
```

Options page shows full editor UI only when `getRole() === "admin"`. All other roles see a read-only policy view with tenant name and version number.

### 8.3 New Rule Kind: ScoreRule

```typescript
// src/detection/types.ts addition
interface ScoreSignal {
  description: string;
  points: number;
  test: (text: string, pasteDetected: boolean) => boolean;
}

interface ScoreRule extends RuleBase {
  kind: "score";
  signals: ScoreSignal[];
  warnThreshold: number;       // default 50
  confirmThreshold: number;    // default 80
}
```

The engine runs `ScoreRule` entries only when a paste event has been flagged on the current input (tracked by the content script listening on the `paste` DOM event).

---

## 9. Admin Console

Standalone web app at `promptshield.dev/admin`. Authenticates with the `admin_token`.

**Pages:**

| Page | Purpose |
|------|---------|
| Matters | Add / edit / deactivate client matters. Name, matter number, opposing parties. Search. |
| Policy | Toggle built-in rule categories on/off. Preview compiled policy JSON. Publish button with version note. |
| History | Table of past published versions with timestamps. One-click rollback. |
| Settings | Tenant name, billing status, subscription expiry, link to Stripe/PayPal portal. |

---

## 10. Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Backend runtime | Node.js + Fastify | Fast, TypeScript-native, minimal boilerplate |
| Database | PostgreSQL | JSONB for policy documents, proper relational for billing state |
| ORM | Drizzle ORM | TypeScript-first, no magic, generates typed queries |
| Billing | Stripe SDK + PayPal REST SDK | Both support subscriptions + webhooks |
| Hosting | Railway | Zero DevOps for MVP, Postgres included, scales when needed |
| Admin console | React + Tailwind | Consistent with extension codebase |
| Tests | Vitest (unit) + supertest (API integration) | Consistent with extension test setup |

---

## 11. Documentation Standard

Every new module ships with a corresponding doc file. Structure:

```
docs/
  backend/
    api.md              — endpoint reference, request/response shapes
    auth.md             — token format, validation flow, role model
    billing.md          — Stripe + PayPal flows, webhook event handling
    database.md         — schema, indexes, migration strategy
    sync.md             — policy versioning, extension pull cadence
  detection/
    score-rule.md       — ScoreRule design, signal list, threshold tuning
    legal-layer.md      — law firm rule categories, examples, false positive guidance
  admin-console/
    overview.md         — pages, flows, admin token auth
```

Each doc answers three questions: **what does this module do**, **how do you use it**, **what does it depend on**.

---

## 12. Testing Requirements

| Layer | What to test |
|-------|-------------|
| Token validation | Valid token passes, expired/cancelled returns 402, wrong prefix rejected |
| Policy versioning | Publish increments version, version check endpoint returns correct number |
| Webhook handlers | Stripe `invoice.paid` → status active; `payment_failed` → past_due; PayPal equivalents |
| Matter compilation | Published policy contains matter names as dictionary terms with fuzzy variants |
| ScoreRule engine | Paste below threshold passes, paste above warn threshold warns, above confirm threshold blocks |
| Sync module | Polls on startup, skips download when version unchanged, handles 402 gracefully |
| Role detection | Admin token → edit UI visible; no admin token → read-only |

---

## 13. Out of Scope (This Phase)

- Per-user accounts or SSO (v2)
- CMS integrations (Clio, iManage) — hook is designed in, connector not built
- Usage analytics dashboard
- Multi-region deployment
- Self-hosted / on-premise option
