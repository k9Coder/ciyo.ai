# Extension Update + Clerk Auth Design

**Date:** 2026-05-16
**Status:** Approved for implementation

---

## Goal

Update the Chrome extension to sync policy from the new backend (subjects/rules model), authenticate individual members via Clerk SSO, and detect prompts on all major LLM platforms plus any arbitrary site via a generic fallback adapter with admin-configurable selectors.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Clerk                                    │
│  Organization = Tenant  │  User = Member  │  SSO (Google/MSFT)  │
└──────────────┬──────────────────┬──────────────────────────────┘
               │ webhooks         │ JWT
               ▼                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Backend (Fastify)                          │
│                                                                  │
│  POST /webhooks/clerk        GET /v1/policy                      │
│  ├─ organization.created  ── Clerk JWT → member-scoped policy    │
│  ├─ orgMembership.created ── Org token  → full snapshot          │
│  ├─ user.updated                                                 │
│  └─ orgMembership.deleted    requireClerkAuth middleware          │
│                                                                  │
│  members table (+ clerkId, firstName, lastName, avatarUrl)       │
└──────────────────────────────────────────────────────────────────┘
               │ policy sync (30 min poll)
               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Chrome Extension (MV3)                       │
│                                                                  │
│  Popup: Clerk login screen → session stored                      │
│  Background: policy/sync.ts → Bearer Clerk JWT                   │
│  Detection: engine.ts unchanged                                  │
│  Adapters: ChatGPT + Claude.ai + Gemini + GenericFallback        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Section 1: Firm Onboarding Model

### How a law firm gets onto the platform

1. IT admin visits the PromptShield website, clicks "Create organisation"
2. Signs up via Clerk (email/password or Google/Microsoft SSO)
3. Creates a Clerk Organization — this fires `organization.created` webhook
4. Backend creates a `tenants` row mapped to the Clerk org ID
5. Admin lands in the admin console as the org owner

### How lawyers join

**Domain verification (primary path):**
Admin verifies ownership of `@acmelawfirm.com` in Clerk. Any user who signs up or signs in with that email domain is auto-added to the org. New hire gets company email → installs extension → logs in → they're in. Zero admin action per user.

**Invitation (fallback):**
Admin invites by email explicitly. Works for any email. Covers contractors, special cases, or firms without their own domain.

Non-company-domain users (e.g. personal Gmail for work) are not a supported case — professional firms have company email.

### New employee flow

1. New hire receives company email
2. Signs into extension via Clerk → domain auto-join fires `organizationMembership.created`
3. Backend creates `members` row (tenantId, clerkId, email, role=member)
4. Member immediately gets global policy rules
5. Admin assigns to division/team in admin console for scoped rules

### Org token (shared device fallback)

Org tokens are kept for environments where individual login isn't practical (shared machines, kiosks, MDM-managed devices). Extension detects presence of `chrome.storage.managed` org token and uses that path instead of Clerk.

---

## Section 2: Database Changes

### Migration `0003_clerk_auth.sql`

```sql
-- Link Clerk org → tenant
ALTER TABLE tenants ADD COLUMN clerk_org_id text UNIQUE;

-- Extend members with Clerk identity + profile
ALTER TABLE members ADD COLUMN clerk_id    text UNIQUE;
ALTER TABLE members ADD COLUMN first_name  text;
ALTER TABLE members ADD COLUMN last_name   text;
ALTER TABLE members ADD COLUMN avatar_url  text;

-- Add siteConfigs support to policy snapshot
-- (stored as JSONB in existing policyJson column — no schema change needed)
```

### Updated `members` table shape

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| tenantId | uuid FK | |
| email | text | |
| role | enum | admin / member |
| clerkId | text UNIQUE | null until first Clerk login |
| firstName | text | synced from Clerk |
| lastName | text | synced from Clerk |
| avatarUrl | text | synced from Clerk |
| createdAt | timestamptz | |

### Schema.ts additions

```ts
export const members = pgTable('members', {
  // ... existing fields ...
  clerkId:   text('clerk_id').unique(),
  firstName: text('first_name'),
  lastName:  text('last_name'),
  avatarUrl: text('avatar_url'),
})

export const tenants = pgTable('tenants', {
  // ... existing fields ...
  clerkOrgId: text('clerk_org_id').unique(),
})
```

---

## Section 3: Backend Changes

### 3.1 Clerk webhook handler

**File:** `backend/src/webhooks/clerk.ts`
**Route:** `POST /webhooks/clerk` (no auth — Svix signature verification instead)

```
Event: organization.created
→ INSERT INTO tenants (name, clerkOrgId, plan='pro', subscriptionStatus='active')

Event: organizationMembership.created
→ Look up tenant by clerkOrgId
→ INSERT INTO members (tenantId, clerkId, email, role='member', firstName, lastName, avatarUrl)

Event: user.updated
→ UPDATE members SET firstName, lastName, avatarUrl WHERE clerkId = event.data.id

Event: organizationMembership.deleted
→ DELETE FROM members WHERE clerkId = event.data.public_user_data.user_id AND tenantId = ...
```

Svix signature verification uses `CLERK_WEBHOOK_SECRET` env var. Return 400 if signature invalid.

### 3.2 New auth middleware

**File:** `backend/src/auth/middleware.ts` — add `requireClerkAuth`

```ts
export async function requireClerkAuth(req, reply) {
  // 1. Extract Bearer token from Authorization header
  // 2. Verify JWT with Clerk public key (using @clerk/backend SDK)
  // 3. Extract clerkOrgId and clerkUserId from JWT claims
  // 4. Look up tenant by clerkOrgId
  // 5. Look up member by clerkId + tenantId
  // 6. Attach req.tenant and req.member
  // 7. If not found → 401
}
```

`requireOrgToken` is unchanged — still used for admin endpoints and shared-device fallback.

### 3.3 Updated `GET /v1/policy`

Accepts two auth modes:

| Auth | Behaviour |
|---|---|
| Org token only | Returns full policy snapshot (existing behaviour) |
| Clerk JWT | Returns member-scoped snapshot via `resolveMemberPolicy(tenant.id, member.id, snapshot)` |

No `X-Member-Id` header needed — identity comes from the JWT.

```ts
fastify.get('/policy', { preHandler: [requireOrgTokenOrClerkAuth] }, async (req, reply) => {
  // ... subscription checks ...
  const snapshot = row.policyJson as PolicyDoc
  const policy = req.member
    ? await resolveMemberPolicy(tenant.id, req.member.id, snapshot)
    : snapshot
  return { version: row.version, policy, tenantName: tenant.name, plan: tenant.plan, ... }
})

// requireOrgTokenOrClerkAuth: tries Clerk JWT first (sets req.tenant + req.member),
// falls back to org token (sets req.tenant only, req.member undefined).
// Returns 401 if neither is valid.
```

### 3.4 siteConfigs in PolicyDoc

**File:** `backend/src/policy/compiler.ts`

```ts
export interface SiteConfig {
  inputSelector: string
  sendButtonSelector: string
}

export interface PolicyDoc {
  version: 1
  tenantId: string
  subjects: SubjectPolicy[]
  siteConfigs: Record<string, SiteConfig>  // keyed by domain e.g. "app.acme.com"
}
```

`siteConfigs` is managed via a new admin endpoint. Compiler includes it in the snapshot as-is. Not member-scoped.

### 3.5 New `siteConfigs` table + endpoints

```sql
CREATE TABLE site_configs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES tenants(id),
  domain     text NOT NULL,
  input_selector       text NOT NULL,
  send_button_selector text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, domain)
);
```

```
GET    /v1/site-configs           requireAdminToken → list
POST   /v1/site-configs           requireAdminToken → { domain, inputSelector, sendButtonSelector }
PATCH  /v1/site-configs/:domain   requireAdminToken → partial update
DELETE /v1/site-configs/:domain   requireAdminToken → 204
```

### 3.6 Environment variables added

```
CLERK_SECRET_KEY=sk_...
CLERK_WEBHOOK_SECRET=whsec_...
```

---

## Section 4: Extension Changes

### 4.1 New dependencies

```json
"@clerk/chrome-extension": "latest",
"@clerk/backend": "latest"  // backend side
```

### 4.2 Auth flow

**Popup** (`src/popup/Popup.tsx`):
- If no Clerk session: show login screen with "Sign in with Google", "Sign in with Microsoft", email+password
- Clerk handles OAuth via `chrome.identity.launchWebAuthFlow` (MV3 compatible)
- Once logged in: show existing status/audit UI
- Add "Account" section: name, avatar, email, sign-out button

**Service worker** (`src/background/service-worker.ts`):
- Initialize Clerk with `publishableKey`
- On startup: check Clerk session → if valid, use JWT for policy sync
- If no Clerk session AND org token present in `chrome.storage.managed` → use org token path (shared device)

### 4.3 Policy sync (`src/policy/sync.ts`)

Full rewrite:
- Auth: `Authorization: Bearer <clerkJwt>` (or `Bearer <orgToken>` for shared devices)
- Parse new response shape: `{ version, policy: { version, tenantId, subjects, siteConfigs } }`
- Drop old `{ baseline[], custom[], perSite, allowSendAnywayWithReason }` shape entirely
- Store `siteConfigs` separately in `chrome.storage.local` for adapter registry lookup

### 4.4 Policy schema (`src/policy/schema.ts`)

Rewrite Zod schemas to match `ResolvedPolicy`:

```ts
const RulePolicySchema = z.object({
  id: z.string(),
  kind: z.enum(['keyword', 'pattern', 'entropy', 'score']),
  keywords: z.array(z.string()).nullable(),
  pattern: z.string().nullable(),
  destinations: z.array(z.string()),
  action: z.enum(['warn', 'block']),
  message: z.string().nullable(),
})

const SubjectPolicySchema = z.object({
  id: z.string(),
  name: z.string(),
  rules: z.array(RulePolicySchema),
})

const PolicyDocSchema = z.object({
  version: z.literal(1),
  tenantId: z.string(),
  subjects: z.array(SubjectPolicySchema),
  siteConfigs: z.record(z.object({
    inputSelector: z.string(),
    sendButtonSelector: z.string(),
  })).default({}),
})
```

### 4.5 Detection engine bridge

`keyword` kind → existing exact/fuzzy dictionary matching (keywords array)
`pattern` kind → existing regex pattern matching
`entropy` kind → existing entropy scorer
`score` kind → existing paste-based score rule

The engine itself is unchanged. A thin adapter translates `SubjectPolicy.rules[]` into the engine's internal rule format.

### 4.6 Options page

- Remove `PolicyPage.tsx` (manual policy editor — policy is now server-managed)
- Keep `AuditPage.tsx` and `AboutPage.tsx`
- Add `AccountPage.tsx`: logged-in member info, sign-out, connection status

---

## Section 5: Adapters

### 5.1 Interface (unchanged)

```ts
interface SiteAdapter {
  hostname: string
  getPromptText(): string | null
  clearPrompt(): void
  interceptSend(callback: () => Promise<boolean>): () => void
}
```

### 5.2 ChatGPT adapter

Already functional. Keep as-is, minor selector verification.

### 5.3 Claude.ai adapter

Complete implementation with verified current DOM selectors (research at implementation time):
- Input: `div[contenteditable="true"]` in the composer area
- Send button: `button[aria-label*="Send"]`

### 5.4 Gemini adapter

Complete implementation with verified current DOM selectors (research at implementation time):
- Input: `div[contenteditable="true"].ql-editor` or equivalent
- Send button: `button.send-button` or equivalent

### 5.5 Generic fallback adapter

Activates on any domain not matched by a specific adapter.

**Heuristic detection:**
1. Find largest `textarea` or `contenteditable` element on page (by rendered dimensions)
2. Intercept `keydown` Enter (without Shift) on that element
3. Intercept `click` on the nearest `button[type=submit]` or `button` within 200px of the input
4. If both found → attach detection pipeline

**Admin-configurable override:**
If `siteConfigs[currentDomain]` exists in stored policy, use `inputSelector` and `sendButtonSelector` instead of heuristics.

```ts
class GenericFallbackAdapter implements SiteAdapter {
  hostname = '*'

  private resolveInput(): Element | null {
    const config = getSiteConfig(location.hostname)
    if (config?.inputSelector) return document.querySelector(config.inputSelector)
    return findLargestEditableElement()
  }

  private resolveSendButton(input: Element): Element | null {
    const config = getSiteConfig(location.hostname)
    if (config?.sendButtonSelector) return document.querySelector(config.sendButtonSelector)
    return findNearestSubmitButton(input)
  }
}
```

### 5.6 Adapter registry update

```ts
// src/content/adapters/registry.ts
const SPECIFIC_ADAPTERS = [chatgptAdapter, claudeAdapter, geminiAdapter]

export function getAdapter(): SiteAdapter {
  const hostname = location.hostname
  return SPECIFIC_ADAPTERS.find(a => hostname.includes(a.hostname))
    ?? genericFallbackAdapter
}
```

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Clerk session expired | Extension shows login screen, pauses detection |
| Policy fetch 402 (subscription) | Show subscription warning banner in popup |
| Policy fetch 404 (no policy published) | Use cached policy; show stale warning after 24h |
| Webhook signature invalid | Return 400, log error |
| `organizationMembership.created` for unknown org | Log warning, skip (org webhook may not have been processed yet — retry via idempotent upsert) |
| Generic adapter finds no input | Silently skip — don't inject on pages where no input detected |

---

## Testing

**Backend:**
- Unit: Clerk JWT verification middleware (mock Clerk SDK)
- Integration: webhook handler tests (mock Svix, real DB) for all four events
- Integration: `GET /v1/policy` with Clerk JWT → member-scoped response
- Integration: `GET /v1/policy` with org token → full snapshot

**Extension:**
- Unit: generic fallback adapter heuristics (jsdom)
- Unit: policy schema Zod parsing (new shape)
- Unit: detection engine bridge (keyword/pattern/entropy/score dispatch)
- Manual: login flow in Chrome (can't unit test `chrome.identity`)
- Manual: adapter verification on ChatGPT, Claude.ai, Gemini (DOM selectors)

---

## Out of Scope

- Admin console UI (separate subsystem)
- Layer 2 ML NER detection
- Audit log sync to backend
- Multi-org membership (one user, multiple firms)
- Clerk billing integration
