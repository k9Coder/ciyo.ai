# Org Structure Redesign — Design Spec

**Date:** 2026-05-16
**Subsystem:** 1 of 5 (Org Structure)
**Build order:** Org Structure → Policy Engine → Chrome Extension → Admin Web App → AI Policy Assistant

## Context

The current codebase targets law firms specifically. The `matters` table has hard-coded legal concepts (clientName, matterNumber, opposingParties). This redesign replaces it with a generic multi-tenant org hierarchy that works for any vertical: law firms, government offices, tech companies, etc.

**Approach chosen:** Clean break — delete `matters` entirely, redesign the schema fresh. No incremental migration. The codebase has no production users so the cost is low and carrying forward legal-specific assumptions would slow every future feature.

---

## Org Hierarchy

```
Tenant (company)
└── Divisions (Corporate Law, Engineering, Government Affairs…)
    └── Teams (M&A Team, Contract Review, Frontend…)
        └── Members (employees)
```

- A member can belong to **multiple teams** (many-to-many).
- A team belongs to exactly one division.
- Divisions belong to the tenant.

---

## Policy Tree

```
Policy (versioned snapshot)
└── Division scope (or Global = all divisions)
    └── Subject (named sensitive context — replaces "matter")
        └── Rules (detection logic + action)
```

- **Subject** — a named grouping of sensitive concerns. E.g. "Zuckerberg Contract", "Project Zeus", "Q3 Earnings". Replaces `matters`. `divisionId = null` means the subject is global (applies to all divisions).
- **Rule** — the actual detection + action: what to look for (keywords, regex pattern, entropy), where (destination domains), and what to do (warn or block).

### Policy inheritance

- **Most specific wins**: team-level subjects override division-level, which override global.
- **Tiebreaker at the same level** (user is on two teams, both have a subject covering the same content): most restrictive wins (block beats warn).
- Scope is determined by which field is set on the subject: `teamId` set = team-scoped; `divisionId` set, `teamId` null = division-scoped; both null = global.

---

## Admin Roles

Two tiers:

| Role | Can do |
|---|---|
| `super_admin` | Full access to all divisions, teams, members, subjects, rules. Create/delete divisions. Manage billing. |
| `division_admin` | Manage subjects, rules, teams, and members within their own division only. Cannot touch other divisions or global settings. |

`adminDivisionId` on the member record points to which division a `division_admin` manages.

---

## Database Schema

### Deleted
- `matters` table — gone entirely.

### Kept (with one addition)
- `tenants` — id, name, slug, orgTokenHash, adminTokenHash, plan, subscriptionStatus, … + `joinCode` text (generated once, regeneratable by super admin)
- `policies` — id, tenantId, version, policyJson (JSONB), publishedAt

### New tables

```sql
divisions
  id          uuid PK
  tenantId    uuid FK → tenants.id
  name        text NOT NULL
  slug        text NOT NULL
  createdAt   timestamptz

teams
  id          uuid PK
  tenantId    uuid FK → tenants.id
  divisionId  uuid FK → divisions.id
  name        text NOT NULL
  slug        text NOT NULL
  createdAt   timestamptz

members
  id              uuid PK
  tenantId        uuid FK → tenants.id
  email           text NOT NULL
  displayName     text
  role            enum(super_admin, division_admin, member)
  adminDivisionId uuid FK → divisions.id  -- nullable, only set for division_admin
  createdAt       timestamptz

member_teams
  memberId    uuid FK → members.id
  teamId      uuid FK → teams.id
  PRIMARY KEY (memberId, teamId)

subjects
  id          uuid PK
  tenantId    uuid FK → tenants.id
  divisionId  uuid FK → divisions.id  -- nullable if global or team-scoped
  teamId      uuid FK → teams.id      -- nullable; if set, applies to this team only (most specific)
  name        text NOT NULL
  description text
  active      boolean DEFAULT true
  createdAt   timestamptz
  -- scope rule: teamId set = team scope; divisionId set + teamId null = division scope; both null = global

rules
  id           uuid PK
  tenantId     uuid FK → tenants.id
  subjectId    uuid FK → subjects.id
  kind         enum(keyword, pattern, entropy, score)
  keywords     text[]          -- for kind=keyword
  pattern      text            -- for kind=pattern (regex)
  destinations text[]          -- domain patterns, empty = everywhere
  action       enum(warn, block)
  message      text            -- custom message shown to employee, optional
  active       boolean DEFAULT true
  createdAt    timestamptz
```

---

## API Endpoints

Permission legend: 🔴 super admin · 🟡 super admin or own division admin · 🟢 any admin

### Deleted
```
GET / POST / PATCH / DELETE  /v1/matters*   — removed
```

### Kept
```
GET   /v1/policy/version          org token — extension polls this
GET   /v1/policy                  org token — full compiled policy
POST  /v1/policy/publish          🔴 compile + version snapshot
GET   /v1/policy/history          🔴 list versions
POST  /v1/policy/rollback/:v      🔴 rollback
```

### New

**Divisions**
```
GET    /v1/divisions              🟢 list
POST   /v1/divisions              🔴 create
PATCH  /v1/divisions/:id          🟡 update name
DELETE /v1/divisions/:id          🔴 delete
```

**Teams**
```
GET    /v1/divisions/:id/teams    🟡 list teams in division
POST   /v1/divisions/:id/teams    🟡 create
PATCH  /v1/teams/:id              🟡 update
DELETE /v1/teams/:id              🟡 delete
```

**Members**
```
GET    /v1/members                🟢 list (division admins see own division only)
POST   /v1/members                🟡 add single member by email
POST   /v1/members/import         🔴 bulk CSV import (email, displayName, teamSlug columns)
PATCH  /v1/members/:id            🟡 update role / teams
DELETE /v1/members/:id            🟡 remove
POST   /v1/members/:id/teams      🟡 assign to team
DELETE /v1/members/:id/teams/:tid 🟡 remove from team
POST   /v1/auth/join              — extension join (joinCode + email → member record + org token)
GET    /v1/tenants/join-code      🔴 get current join code
POST   /v1/tenants/join-code/regenerate  🔴 regenerate join code (invalidates old one)
```

**Subjects** (replaces matters)
```
GET    /v1/subjects               🟢 list (division admins see own division + global)
POST   /v1/subjects               🟡 create
PATCH  /v1/subjects/:id           🟡 update
DELETE /v1/subjects/:id           🟡 delete
```

**Rules**
```
GET    /v1/subjects/:id/rules     🟡 list
POST   /v1/subjects/:id/rules     🟡 create
PATCH  /v1/rules/:id              🟡 update
DELETE /v1/rules/:id              🟡 delete
```

---

## Key Flows

### Employee join (extension-driven)

1. Super admin generates a **join code** for the tenant in the admin UI.
2. Employee installs extension → popup prompts for work email + join code.
3. Extension calls `POST /v1/auth/join` → backend creates a `member` record, assigns to tenant's default team, returns org token + memberId.
4. Extension stores org token, syncs compiled policy, begins enforcing rules.
5. Super admin or division admin moves the new member into the correct division/teams via admin UI.

### Policy change reaches employees

1. Admin creates or edits a Subject / Rule in the admin UI.
2. Admin clicks **Publish** → `POST /v1/policy/publish`.
3. Policy compiler reads all active `divisions`, `subjects`, and `rules` for the tenant, groups by division scope, and writes a new versioned JSONB snapshot into `policies`.
4. Every employee's extension polls `GET /v1/policy/version` every 30 min. Detects new version → fetches full policy → updates local ruleset.
5. The compiled policy embeds each member's team memberships so the extension knows exactly which rules apply to this specific user.

---

## What the Policy Compiler Changes

**Currently:** reads `matters` rows, builds fuzzy dictionary rules from opposing-party names.

**After:** reads `subjects` + `rules` rows grouped by `divisionId`, outputs the same JSONB structure the extension already understands. The extension sync mechanism is **unchanged** — it still polls `/v1/policy/version` and fetches `/v1/policy`.

---

## What Stays Unchanged

- Auth middleware (org token / admin token validation)
- Billing module (Stripe + PayPal webhooks)
- Policy versioning and rollback
- Extension sync alarm (30-min poll)
- Chrome extension detection engine
- Admin SPA shell (tabs, login, settings page) — pages for matters → subjects will be rewritten in subsystem 4

---

## Out of Scope (later subsystems)

- Admin web app UI redesign (side-panel layout, JSON editor, AI chat) — Subsystem 3 & 5
- Extension enforcement of team-scoped rules — Subsystem 2 (Policy Engine) + Subsystem 3
- Domain/website groups — Subsystem 2
- AI Policy Assistant — Subsystem 5
