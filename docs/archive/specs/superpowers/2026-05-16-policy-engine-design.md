# Policy Engine — Design Spec

**Date:** 2026-05-16
**Subsystem:** 2 of 5 (Policy Engine)
**Build order:** Org Structure → Policy Engine → Admin Web App → Chrome Extension → AI Policy Assistant

## Goal

Make the compiled policy member-aware. Right now every employee gets the same tenant-wide policy snapshot. After this subsystem, `GET /v1/policy` accepts a member ID and returns only the rules that apply to that specific person based on their team and division memberships. Also adds destination groups — reusable named lists of domains that rules can reference instead of repeating domain arrays.

---

## What Changes

### Currently
- `GET /v1/policy` returns the full compiled snapshot — same for every employee
- Rules have a `destinations text[]` for explicit domain strings
- Policy compiler reads subjects + rules, outputs flat `subjects[]` tree

### After
- `GET /v1/policy` with `X-Member-Id` header returns scoped rules for that member only
- Rules also have `destinationGroupIds uuid[]` referencing named domain groups
- Policy resolver applies inheritance (team > division > global), conflict resolution, and group expansion at read time
- `destination_groups` table stores reusable scoped domain lists

---

## Destination Groups

### Purpose

A destination group is a named, reusable list of domains. Instead of copying `["gmail.com", "yahoo.com", "outlook.com"]` into 20 rules, you define a `"External Email"` group once and reference it by ID. Update the group, all rules pick up the change on the next publish.

### Scoping

Same scope pattern as subjects:

| divisionId | teamId | Scope |
|---|---|---|
| null | null | Global — available to all rules |
| set | null | Division-scoped — visible within that division |
| set | set | Team-scoped — visible within that team |

### Schema

```sql
destination_groups
  id          uuid PK defaultRandom()
  tenantId    uuid NOT NULL FK → tenants.id
  divisionId  uuid FK → divisions.id   -- nullable
  teamId      uuid FK → teams.id       -- nullable
  name        text NOT NULL
  domains     text[] NOT NULL
  createdAt   timestamptz NOT NULL defaultNow()
```

### Rules schema change

```sql
ALTER TABLE rules ADD COLUMN destination_group_ids uuid[] NOT NULL DEFAULT '{}';
```

A rule may have both `destinations` (explicit strings) and `destinationGroupIds`. At policy-read time these are merged into one domain list before being returned to the extension.

---

## Policy Compiler

`POST /v1/policy/publish` behaviour is unchanged from the caller's perspective. Internally the compiler now includes `destinationGroupIds` in each rule's snapshot entry alongside `destinations`. Group IDs are stored as-is — they are expanded to domain strings at `GET /v1/policy` time, not at publish time. This means:

- Rollback restores the rule content (subjects, rules, group references) to a previous state
- Group domain edits (adding/removing domains from a group) take effect on the next extension fetch without requiring a new publish

**Stored snapshot format (policies.policyJson):**

```ts
interface PolicyDoc {
  version: 1
  tenantId: string
  subjects: Array<{
    id: string
    name: string
    divisionId: string | null
    teamId: string | null
    rules: Array<{
      id: string
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords: string[] | null
      pattern: string | null
      destinations: string[]
      destinationGroupIds: string[]
      action: 'warn' | 'block'
      message: string | null
    }>
  }>
}
```

---

## Policy Resolver

New module: `src/policy/resolver.ts`

Called by `GET /v1/policy` when `X-Member-Id` header is present. Computes the member's effective ruleset from a stored snapshot.

### Input
- The stored `PolicyDoc` snapshot (from `policies` table)
- `memberId` string

### Steps

1. **Load member context (live DB)** — query `member_teams` for the member's teamIds; derive divisionIds from those teams via the `teams` table
2. **Filter subjects** — include a subject from the snapshot if:
   - `divisionId === null && teamId === null` (global)
   - `divisionId` is in the member's divisionIds and `teamId === null`
   - `teamId` is in the member's teamIds
3. **Conflict resolution** — within the filtered rules, group by detection key (`kind:keyword:${sorted keywords}` or `kind:pattern:${pattern}`). For each group keep only the rule from the most specific scope (team > division > global). Ties at the same scope: block beats warn.
4. **Expand destination groups (live DB)** — for each rule, look up its `destinationGroupIds`, fetch their `domains[]`, merge with `destinations`. Return `effectiveDestinations: string[]` only — no group IDs in the output.
5. **Return** cleaned subject list — scope metadata (`divisionId`, `teamId`) stripped from output since the extension only needs the rules, not their origin scope.

### Output

```ts
interface ResolvedPolicy {
  version: number
  tenantId: string
  subjects: Array<{
    id: string
    name: string
    rules: Array<{
      id: string
      kind: 'keyword' | 'pattern' | 'entropy' | 'score'
      keywords: string[] | null
      pattern: string | null
      destinations: string[]   // merged explicit + expanded groups
      action: 'warn' | 'block'
      message: string | null
    }>
  }>
}
```

### Backwards compatibility

If `X-Member-Id` header is absent, `GET /v1/policy` returns the full unfiltered snapshot as before. This keeps the existing extension working until Subsystem 3 (Chrome Extension) adds the header.

---

## API

### New endpoints (requireAdminToken)

```
GET    /v1/destination-groups
POST   /v1/destination-groups          body: { name, domains[], divisionId?, teamId? }
PATCH  /v1/destination-groups/:id      body: { name?, domains[], divisionId?, teamId? }
DELETE /v1/destination-groups/:id
```

### Changed endpoints

```
GET /v1/policy      optional header: X-Member-Id
                    → with header: returns ResolvedPolicy scoped to that member
                    → without header: returns full PolicyDoc snapshot (unchanged)

POST /v1/policy/publish  → snapshot now includes destinationGroupIds per rule
                           (no interface change for caller)
```

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `backend/src/db/schema.ts` | Modify | Add `destinationGroups` table, add `destinationGroupIds` to `rules` |
| `backend/drizzle/0002_policy_engine.sql` | Create | Migration: new table + new column |
| `backend/src/destination-groups/service.ts` | Create | CRUD for destination groups |
| `backend/src/destination-groups/router.ts` | Create | API routes |
| `backend/src/policy/compiler.ts` | Modify | Include `destinationGroupIds` in snapshot |
| `backend/src/policy/resolver.ts` | Create | Member scoping + conflict resolution + group expansion |
| `backend/src/policy/router.ts` | Modify | `GET /v1/policy` delegates to resolver when X-Member-Id present |
| `backend/src/app.ts` | Modify | Register destinationGroupsRouter |
| `backend/tests/destination-groups.test.ts` | Create | CRUD tests |
| `backend/tests/policy-resolver.test.ts` | Create | Resolver unit/integration tests |
| `backend/tests/policy-routes.test.ts` | Modify | Add X-Member-Id scoping tests |
| `backend/tests/policy-compiler.test.ts` | Modify | Verify destinationGroupIds in snapshot |

---

## Technical Debt

**Team reassignment sync delay** — when an admin moves a member to a new team, the member's extension sees the updated scoped policy only on its next 30-minute poll. No immediate push mechanism exists. Future work: per-member version token that bumps on team reassignment, or a `POST /v1/members/:id/force-sync` endpoint.

---

## Out of Scope

- Extension sending `X-Member-Id` header — Subsystem 3 (Chrome Extension)
- Admin UI for managing destination groups — Subsystem 4 (Admin Web App)
- Role-based access control enforcement (division admin can only see own division's groups) — Subsystem 4
- AI Policy Assistant — Subsystem 5
